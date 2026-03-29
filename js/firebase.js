// firebase.js — Auth + Firestore sync

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // Standalone PWA: use popup (redirect breaks out of the app)
  // Mobile browser: use redirect (popup gets blocked)
  // Desktop: use popup
  if (isMobile && !isStandalone) {
    await signInWithRedirect(auth, provider);
  } else {
    await signInWithPopup(auth, provider);
  }
}

// Call on app init to handle the redirect result after returning from Google
export async function handleRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch (e) {
    console.warn('Redirect sign-in error:', e);
  }
}

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
    const [profileSnap, goalsSnap, weightSnap, favSnap] = await Promise.all([
      getDoc(userDoc('data/profile')),
      getDoc(userDoc('data/goals')),
      getDoc(userDoc('data/weight')),
      getDoc(userDoc('data/favorites')),
    ]);

    if (profileSnap.exists()) store.saveProfile(profileSnap.data());
    if (goalsSnap.exists()) store.saveGoals(goalsSnap.data());
    if (weightSnap.exists()) {
      const entries = weightSnap.data();
      for (const [date, weight] of Object.entries(entries)) {
        store.saveWeight(date, weight);
      }
    }
    if (favSnap.exists()) {
      const { items } = favSnap.data();
      if (items) store.replaceFavorites(items);
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
  setDoc(userDoc('data/profile'), data).catch(() => {});
}

export function pushGoals(data) {
  if (!currentUser) return;
  setDoc(userDoc('data/goals'), data).catch(() => {});
}

export function pushWeight(allEntries) {
  if (!currentUser) return;
  setDoc(userDoc('data/weight'), allEntries).catch(() => {});
}

export function pushFavorites(items) {
  if (!currentUser) return;
  setDoc(userDoc('data/favorites'), { items }).catch(() => {});
}

export function pushDay(date, dayData) {
  if (!currentUser) return;
  setDoc(doc(db, 'users', currentUser.uid, 'days', date), dayData).catch(() => {});
}
