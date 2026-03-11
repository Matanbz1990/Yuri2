import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isEnabled = config.apiKey && config.apiKey.length > 5;

let app, auth, db, provider;
if (isEnabled) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  provider = new GoogleAuthProvider();
}

export const firebaseEnabled = isEnabled;

export async function fbSignIn() {
  if (!isEnabled) return null;
  return signInWithPopup(auth, provider);
}

export async function fbSignOut() {
  if (!isEnabled) return;
  return signOut(auth);
}

export function fbOnAuth(callback) {
  if (!isEnabled) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

export async function fbLoadHistory(uid) {
  if (!isEnabled || !uid) return [];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) return snap.data().history || [];
  } catch (e) { console.error("Load history error:", e); }
  return [];
}

export async function fbSaveHistory(uid, history) {
  if (!isEnabled || !uid) return;
  try {
    const lite = history.slice(0, 50).map(h => ({
      ...h,
      messages: (h.messages || []).slice(-10)
    }));
    await setDoc(doc(db, "users", uid), { history: lite }, { merge: true });
  } catch (e) { console.error("Save history error:", e); }
}
