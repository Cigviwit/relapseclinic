import { EmailAuthProvider, TotpMultiFactorGenerator, getMultiFactorResolver, multiFactor, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, setPersistence, browserLocalPersistence, browserSessionPersistence, type MultiFactorError, type MultiFactorResolver, type TotpSecret, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "./firebase";
import { clearActivity, markActive } from "./idle";
import type { Role } from "./permissions";

export type Account = { user: User; role: Role; clinicId: string | null; name: string; doctorId: string };
export type SignInParams = { email: string; password: string; rememberMe: boolean };

/** Thrown when the password was right and a two-step code is still needed. */
export class TwoStepRequired extends Error {
  resolver: MultiFactorResolver;
  constructor(resolver: MultiFactorResolver) { super("Enter the code from your authenticator app."); this.resolver = resolver; }
}

export async function getAccount(user: User): Promise<Account> {
  const { claims } = await user.getIdTokenResult();
  if (claims.platformAdmin === true) return { user, role: "platform", clinicId: null, name: "Platform administrator", doctorId: "" };
  const profile = await getDoc(doc(firestore, "users", user.uid));
  const data = profile.data();
  if (!profile.exists() || typeof data?.clinicId !== "string" || !data.clinicId) throw new Error("This account is not linked to a clinic. Contact your clinic owner.");
  if (data.active === false) throw new Error("This login has been deactivated. Contact your clinic owner.");
  // Accounts made before staff logins existed count as the clinic owner.
  return { user, role: (data.role || "owner") as Role, clinicId: data.clinicId, name: data.name || data.email, doctorId: data.doctorId || "" };
}

function signInMessage(error: unknown) {
  const code = (error as { code?: string }).code;
  if (code === "auth/user-disabled") return "This login has been deactivated. Contact your clinic owner.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "Could not reach the server. Check the internet connection and try again.";
  return "Invalid email or password.";
}
const asTwoStep = (error: unknown) => {
  if ((error as { code?: string }).code !== "auth/multi-factor-auth-required") return null;
  return new TwoStepRequired(getMultiFactorResolver(auth, error as MultiFactorError));
};
function twoStepMessage(error: unknown) {
  const code = (error as { code?: string }).code;
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") return "Two-step login is not switched on for this RelapseClinic project yet.";
  if (code === "auth/requires-recent-login") return "For safety, sign out and sign in again, then turn on two-step login.";
  if (code === "auth/invalid-verification-code" || code === "auth/invalid-mfa-code") return "That code did not match. Check the app and try again.";
  return (error as Error).message;
}

export const authService = {
  async signIn(params: SignInParams): Promise<void> {
    await setPersistence(auth, params.rememberMe ? browserLocalPersistence : browserSessionPersistence);
    // Before signing in, because the workspace can appear before this call returns.
    markActive();
    try {
      await signInWithEmailAndPassword(auth, params.email.trim(), params.password);
    } catch (error) {
      throw asTwoStep(error) || new Error(signInMessage(error));
    }
  },
  async finishTwoStep(resolver: MultiFactorResolver, code: string): Promise<void> {
    const hint = resolver.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!hint) throw new Error("This login has no authenticator app set up. Contact your clinic owner.");
    markActive();
    try { await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s/g, ""))); }
    catch (error) { throw new Error(twoStepMessage(error)); }
  },
  /** Confirms the password of whoever is signed in, for unlocking the screen. */
  async confirmPassword(password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user?.email) throw new Error("Sign in again to continue.");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } catch (error) {
      throw asTwoStep(error) || new Error(signInMessage(error) === "Invalid email or password." ? "That password is not right." : signInMessage(error));
    }
  },
  sendPasswordReset: (email: string) => sendPasswordResetEmail(auth, email.trim()),
  twoStepEnabled: () => !!auth.currentUser && multiFactor(auth.currentUser).enrolledFactors.length > 0,
  async startTwoStep(): Promise<{ secret: TotpSecret; uri: string; key: string }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in again to continue.");
    try {
      const secret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
      return { secret, uri: secret.generateQrCodeUrl(user.email || "RelapseClinic", "RelapseClinic"), key: secret.secretKey };
    } catch (error) { throw new Error(twoStepMessage(error)); }
  },
  async confirmTwoStep(secret: TotpSecret, code: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in again to continue.");
    try { await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s/g, "")), "Authenticator app"); }
    catch (error) { throw new Error(twoStepMessage(error)); }
  },
  async turnOffTwoStep(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in again to continue.");
    try { for (const factor of multiFactor(user).enrolledFactors) await multiFactor(user).unenroll(factor); }
    catch (error) { throw new Error(twoStepMessage(error)); }
  },
  signOut: () => { clearActivity(); return firebaseSignOut(auth); },
  subscribeAuthState: (callback: (user: User | null) => void) => onAuthStateChanged(auth, callback),
};
