// firebase.js — Auth + Firestore sync

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { DEFAULT_GOALS } from './store.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA3xKNq1RpiH_ALRFceNxBdwV1VxLVseYE',
  authDomain: 'meal-tracker-f3bea.firebaseapp.com',
  projectId: 'meal-tracker-f3bea',
  storageBucket: 'meal-tracker-f3bea.firebasestorage.app',
  messagingSenderId: '823103948352',
  appId: '1:823103948352:web:ad6f5f3d792ad14dd041a5',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// ── Auth ──

export function getCurrentUser() {
  return currentUser;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    // Popup works in browser and iOS 16.4+ standalone PWAs.
    // signInWithRedirect is NOT used — it breaks on iOS Safari due to
    // storage partitioning (ITP), producing a "missing initial state" error.
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') {
      // Popup was blocked by the browser — surface a clear message rather
      // than falling back to redirect (which fails on iOS Safari).
      throw Object.assign(new Error('Please allow popups for this site, then try again.'), { code: 'auth/popup-blocked' });
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

// No-op kept for API compatibility — redirect flow removed
export async function handleRedirectResult() {}

export async function signOutUser() {
  await signOut(auth);
}

export function onUserChange(callback) {
  return onAuthStateChanged(auth, user => {
    currentUser = user;
    callback(user);
  });
}

// ── Firestore paths ──

function userDoc(path) {
  return doc(db, 'users', currentUser.uid, ...path.split('/'));
}

// ── Pull from Firestore → localStorage ──

export async function pullFromCloud(store) {
  if (!currentUser) return;
  try {
    const [profileSnap, goalsSnap, weightSnap, favSnap, myFoodsSnap] = await Promise.all([
      getDoc(userDoc('data/profile')),
      getDoc(userDoc('data/goals')),
      getDoc(userDoc('data/weight')),
      getDoc(userDoc('data/favorites')),
      getDoc(userDoc('data/myfoods')),
    ]);

    if (profileSnap.exists()) store.saveProfile(profileSnap.data());
    // Merge cloud goals with defaults to fill in any missing fields (e.g., addedSugars)
    if (goalsSnap.exists()) {
      const cloudGoals = goalsSnap.data();
      store.saveGoals({ ...DEFAULT_GOALS, ...cloudGoals });
    }
    if (weightSnap.exists()) {
      store.replaceWeight(weightSnap.data());
    }
    if (favSnap.exists()) {
      const { items } = favSnap.data();
      if (items) store.replaceFavorites(items);
    }
    if (myFoodsSnap.exists()) {
      const { items } = myFoodsSnap.data();
      if (items) store.replaceMyFoods(items);
    }

    // Pull days
    const daysSnap = await getDocs(collection(db, 'users', currentUser.uid, 'days'));
    daysSnap.forEach(d => store.saveDay(d.id, d.data()));
  } catch (e) {
    console.warn('Cloud pull failed:', e);
  }
}

// ── Push localStorage → Firestore (fire & forget) ──

export function pushProfile(data) {
  if (!currentUser) return;
  setDoc(userDoc('data/profile'), data).catch(e => console.warn('Push profile failed:', e));
}

export function pushGoals(data) {
  if (!currentUser) return;
  setDoc(userDoc('data/goals'), data).catch(e => console.warn('Push goals failed:', e));
}

export function pushWeight(allEntries) {
  if (!currentUser) return;
  setDoc(userDoc('data/weight'), allEntries).catch(e => console.warn('Push weight failed:', e));
}

export function pushFavorites(items) {
  if (!currentUser) return;
  setDoc(userDoc('data/favorites'), { items }).catch(e => console.warn('Push favorites failed:', e));
}

export function pushMyFoods(items) {
  if (!currentUser) return;
  setDoc(userDoc('data/myfoods'), { items }).catch(e => console.warn('Push myfoods failed:', e));
}

export function pushDay(date, dayData) {
  if (!currentUser) return;
  setDoc(doc(db, 'users', currentUser.uid, 'days', date), dayData).catch(e => console.warn(`Push day ${date} failed:`, e));
}
