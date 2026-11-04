// Who is calling, and may they do this? Used by every callable function.
class ServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const CLINIC_ROLES = ['owner', 'doctor', 'frontdesk', 'billing'];

/**
 * Returns { uid, name, role, clinicId } for a signed-in caller allowed to act on this clinic.
 * `roles` lists who may do this; include 'platform' to let the platform administrator through.
 * Accounts made before roles existed have no role and count as the clinic owner.
 */
async function resolveActor(db, auth, clinicId, roles, action) {
  if (!auth?.uid) throw new ServiceError('unauthenticated', `Sign in to ${action}.`);
  if (auth.token?.platformAdmin === true) {
    if (!roles.includes('platform')) throw new ServiceError('permission-denied', `The platform administrator cannot ${action}.`);
    return { uid: auth.uid, name: 'Platform administrator', role: 'platform', clinicId };
  }
  const snap = await db.doc(`users/${auth.uid}`).get();
  const profile = snap.data();
  if (!snap.exists || profile.clinicId !== clinicId || profile.active === false) {
    throw new ServiceError('permission-denied', `You cannot ${action} for this clinic.`);
  }
  const role = profile.role || 'owner';
  if (!roles.includes(role)) throw new ServiceError('permission-denied', `Your role does not allow you to ${action}.`);
  return { uid: auth.uid, name: profile.name || profile.email, role, clinicId, doctorId: profile.doctorId || '' };
}

module.exports = { ServiceError, CLINIC_ROLES, resolveActor };
