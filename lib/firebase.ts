import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  projectId: "relapse-clinic-db",
  appId: "1:321362413920:web:1b5d48771d9e36f433b605",
  storageBucket: "relapse-clinic-db.firebasestorage.app",
  apiKey: "AIzaSyDSb_ZpWETP9-DXsVFLGz2f_Nyu3ME8qq0",
  authDomain: "relapse-clinic-db.firebaseapp.com",
  messagingSenderId: "321362413920",
  measurementId: "G-JMMN8TRPG4",
};

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
