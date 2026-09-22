import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const firestore = getFirestore(app);
export const auth = getAuth(app);

