// Staff accounts. Only these functions write users/{uid}, so a browser can never give itself a role.
const { randomBytes } = require('node:crypto');
const { ServiceError, resolveActor, CLINIC_ROLES } = require('./access');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const managers = ['owner', 'platform'];

function cleanRole(input, clinic) {
  if (!CLINIC_ROLES.includes(input.role)) throw new ServiceError('invalid-argument', 'Choose a role.');
  const doctorId = typeof input.doctorId === 'string' ? input.doctorId : '';
  if (doctorId && !clinic.doctors.some((d) => d.id === doctorId)) throw new ServiceError('invalid-argument', 'Choose a doctor from this clinic.');
  if (input.role === 'doctor' && !doctorId) throw new ServiceError('invalid-argument', 'Choose which doctor this login belongs to.');
  return { role: input.role, doctorId: input.role === 'doctor' || input.role === 'owner' ? doctorId : '' };
}

function cleanStaff(input, clinic) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || name.length > 100) throw new ServiceError('invalid-argument', 'Enter the staff member’s name.');
  if (!EMAIL.test(email) || email.length > 254) throw new ServiceError('invalid-argument', 'Enter a valid email address.');
  return { name, email, ...cleanRole(input, clinic) };
}

/** A clinic must always keep one working owner, and nobody may lock themselves out. */
function changeError(actor, target, next, activeOwners) {
  const losesOwner = (target.role || 'owner') === 'owner' && target.active !== false && (next.role !== 'owner' || next.active === false);
  if (losesOwner && activeOwners <= 1) return 'This clinic needs at least one active owner. Make someone else an owner first.';
  if (actor.uid === target.uid && next.active === false) return 'You cannot deactivate your own login.';
  return null;
}

async function loadClinic(db, clinicId) {
  if (typeof clinicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinicId)) throw new ServiceError('invalid-argument', 'A valid clinic is required.');
  const snap = await db.doc(`clinics/${clinicId}`).get();
  if (!snap.exists) throw new ServiceError('not-found', 'Clinic not found.');
  return snap.data();
}

/** A new login with a random password nobody knows. The person sets their own through the returned link. */
async function createLogin(db, auth, clinicId, staff, actorUid) {
  let user;
  try { user = await auth.createUser({ email: staff.email, displayName: staff.name, password: randomBytes(24).toString('base64url') }); }
  catch (error) {
    if (error.code === 'auth/email-already-exists') throw new ServiceError('already-exists', 'A login with that email already exists. Each person needs their own email.');
    throw error;
  }
  try {
    await db.doc(`users/${user.uid}`).set({ uid: user.uid, clinicId, ...staff, active: true, createdAt: new Date().toISOString(), updatedBy: actorUid });
    return { uid: user.uid, setupLink: await auth.generatePasswordResetLink(staff.email) };
  } catch (error) {
    await db.doc(`users/${user.uid}`).delete().catch(() => {});
    await auth.deleteUser(user.uid).catch(() => {});
    throw error;
  }
}

async function createStaff(db, auth, caller, input) {
  const { clinicId } = input || {};
  const actor = await resolveActor(db, caller, clinicId, managers, 'manage staff');
  const clinic = await loadClinic(db, clinicId);
  return createLogin(db, auth, clinicId, cleanStaff(input, clinic), actor.uid);
}

async function updateStaff(db, auth, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to manage staff.');
  const { uid } = input || {};
  if (typeof uid !== 'string' || !uid) throw new ServiceError('invalid-argument', 'A staff member is required.');
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new ServiceError('not-found', 'Staff member not found.');
  const target = snap.data();
  const clinic = await loadClinic(db, target.clinicId);
  const actor = await resolveActor(db, caller, target.clinicId, managers, 'manage staff');
  const name = input.name === undefined ? target.name : String(input.name).trim();
  if (!name || name.length > 100) throw new ServiceError('invalid-argument', 'Enter the staff member’s name.');
  const next = { name, active: input.active === undefined ? target.active !== false : input.active === true, ...cleanRole({ role: input.role || target.role || 'owner', doctorId: input.doctorId === undefined ? target.doctorId : input.doctorId }, clinic) };
  const staff = await db.collection('users').where('clinicId', '==', target.clinicId).get();
  const activeOwners = staff.docs.filter((d) => (d.data().role || 'owner') === 'owner' && d.data().active !== false).length;
  const error = changeError(actor, { ...target, uid }, next, activeOwners);
  if (error) throw new ServiceError('failed-precondition', error);
  await ref.update({ ...next, updatedBy: actor.uid });
  // The rules refuse a deactivated person at once; disabling the login also stops them signing in again.
  await auth.updateUser(uid, { disabled: !next.active, displayName: next.name });
  if (!next.active) await auth.revokeRefreshTokens(uid);
  return { uid };
}

async function staffSetupLink(db, auth, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to manage staff.');
  const snap = await db.doc(`users/${typeof input?.uid === 'string' && input.uid ? input.uid : '-'}`).get();
  if (!snap.exists) throw new ServiceError('not-found', 'Staff member not found.');
  await resolveActor(db, caller, snap.data().clinicId, managers, 'manage staff');
  return { setupLink: await auth.generatePasswordResetLink(snap.data().email) };
}

/** Platform administrator only: a new clinic and its first owner. */
async function createClinic(db, auth, caller, input) {
  if (caller?.token?.platformAdmin !== true) throw new ServiceError('permission-denied', 'Only the platform administrator can create a clinic.');
  const clinic = input?.clinic;
  if (!clinic || typeof clinic.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinic.id) || !Array.isArray(clinic.doctors) || !clinic.doctors.length) throw new ServiceError('invalid-argument', 'Enter the clinic details.');
  const staff = cleanStaff({ name: input.ownerName, email: input.ownerEmail, role: 'owner' }, clinic);
  const ref = db.doc(`clinics/${clinic.id}`);
  if ((await ref.get()).exists) throw new ServiceError('already-exists', 'That clinic already exists.');
  await ref.set({ ...clinic, updatedBy: caller.uid });
  try { return { clinicId: clinic.id, ...(await createLogin(db, auth, clinic.id, staff, caller.uid)) }; }
  catch (error) { await ref.delete().catch(() => {}); throw error; }
}

module.exports = { cleanStaff, changeError, createStaff, updateStaff, staffSetupLink, createClinic };
