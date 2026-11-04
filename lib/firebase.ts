import { initializeApp, getApps, getApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const env = import.meta.env;
// Production values are the defaults. A staging build sets VITE_FIREBASE_* in its environment (see .env.example).
export const firebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || "relapse-clinic-db",
  appId: env.VITE_FIREBASE_APP_ID || "1:321362413920:web:1b5d48771d9e36f433b605",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "relapse-clinic-db.firebasestorage.app",
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDSb_ZpWETP9-DXsVFLGz2f_Nyu3ME8qq0",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "relapse-clinic-db.firebaseapp.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "321362413920",
};
export const usingEmulators = env.VITE_USE_EMULATORS === "1";

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Cache Firestore data in IndexedDB so the workspace opens instantly from the
// last snapshot and keeps working through brief network drops.
function createFirestore(): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app); // already initialised (hot reload)
  }
}
export const firestore = createFirestore();
export const auth = getAuth(app);
if (usingEmulators) {
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

/** The call may or may not have taken effect on the server. */
export class ServerUnreachable extends Error {}

/** Loaded on first use, so the first paint stays small. */
export async function callFunction<In, Out>(name: string, data: In, timeout = 70000): Promise<Out> {
  const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(app, "asia-south1");
  if (usingEmulators && !functionsConnected) { connectFunctionsEmulator(functions, "127.0.0.1", 5001); functionsConnected = true; }
  try {
    return (await httpsCallable<In, Out>(functions, name, { timeout })(data)).data;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (!navigator.onLine || code === "functions/unavailable" || code === "functions/deadline-exceeded") throw new ServerUnreachable("Could not reach the server. Check the internet connection and try again.");
    if (code === "functions/internal") throw new ServerUnreachable("Something went wrong on the server. Try again in a moment.");
    throw error;
  }
}
let functionsConnected = false;
