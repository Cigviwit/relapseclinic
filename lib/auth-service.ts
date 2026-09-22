import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence, deleteUser, getAuth, type User } from "firebase/auth";
import { deleteApp, initializeApp } from "firebase/app";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, firebaseConfig, firestore } from "./firebase";
import { type Clinic } from "./clinic";

export const ADMIN_EMAIL = "cigviwit0@gmail.com";
export type Account = { user: User; role: "admin" | "clinic"; clinicId: string | null };
export type SignInParams = { email: string; password: string; rememberMe: boolean; role: "admin" | "clinic" };

export async function getAccount(user: User): Promise<Account> {
  if (user.email?.toLowerCase() === ADMIN_EMAIL) return { user, role: "admin", clinicId: null };
  const profile = await getDoc(doc(firestore, "users", user.uid));
  const clinicId = profile.data()?.clinicId;
  if (!profile.exists() || typeof clinicId !== "string" || !clinicId) throw new Error("This account is not linked to a clinic. Contact the administrator.");
  return { user, role: "clinic", clinicId };
}

export const authService = {
  async signIn(params: SignInParams): Promise<Account> {
    await setPersistence(auth, params.rememberMe ? browserLocalPersistence : browserSessionPersistence);
    let credential;
    try {
      credential = await signInWithEmailAndPassword(auth, params.email.trim(), params.password);
    } catch {
      throw new Error("Invalid email or password.");
    }
    try {
      const account = await getAccount(credential.user);
      if (account.role !== params.role) throw new Error(`Use the ${account.role} login option for this account.`);
      return account;
    } catch (error) {
      await firebaseSignOut(auth);
      throw error;
    }
  },

  async createClinicAccount(clinic: Clinic, email: string, password: string): Promise<void> {
    if (auth.currentUser?.email?.toLowerCase() !== ADMIN_EMAIL) throw new Error("Only the administrator can create a clinic.");
    if (email.trim().toLowerCase() === ADMIN_EMAIL) throw new Error("Use a separate email for each clinic.");
    if (password.length < 6) throw new Error("Clinic password must have at least 6 characters.");
    const secondaryApp = initializeApp(firebaseConfig, `clinic-create-${crypto.randomUUID()}`);
    const secondaryAuth = getAuth(secondaryApp);
    let newUser: User | null = null;
    try {
      newUser = (await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password)).user;
      await setDoc(doc(firestore, "clinics", clinic.id), clinic);
      await setDoc(doc(firestore, "users", newUser.uid), {
        uid: newUser.uid, email: email.trim().toLowerCase(), clinicId: clinic.id, createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (newUser) await deleteUser(newUser).catch(() => {});
      throw error;
    } finally {
      await firebaseSignOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp);
    }
  },
  signOut: () => firebaseSignOut(auth),
  subscribeAuthState: (callback: (user: User | null) => void) => onAuthStateChanged(auth, callback),
};
