/**
 * Aentho — auth.js  (v2 — real Firebase config)
 * Handles: email/password login, Google Sign-In, email verification,
 * password reset, session persistence, profile CRUD, route protection.
 */

// ── Firebase Config ────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCcNnJ48LeqIrYKaoqRcGzHDYBDRBHqHSw",
  authDomain:        "aentho-abed4.firebaseapp.com",
  projectId:         "aentho-abed4",
  storageBucket:     "aentho-abed4.firebasestorage.app",
  messagingSenderId: "730680182825",
  appId:             "1:730680182825:web:66ced2475e3d43b6a13438",
  measurementId:     "G-0E8CSLCSWK"
};

// ── Constants ─────────────────────────────────────────────────────
const SESSION_KEY = 'aentho_session';
const PROFILE_KEY = 'aentho_profile';
const FB_VER      = '10.7.1';
const FB_BASE     = `https://www.gstatic.com/firebasejs/${FB_VER}`;

// ── Module-level state ────────────────────────────────────────────
let _app      = null;
let _auth     = null;
let _db       = null;
let _fbReady  = false;
let _initProm = null;

// ── Init Firebase (idempotent, promise-cached) ─────────────────────
function initFirebase() {
  if (_initProm) return _initProm;
  _initProm = (async () => {
    try {
      const [{ initializeApp },
             { getAuth, onAuthStateChanged },
             { getFirestore }] = await Promise.all([
        import(`${FB_BASE}/firebase-app.js`),
        import(`${FB_BASE}/firebase-auth.js`),
        import(`${FB_BASE}/firebase-firestore.js`)
      ]);

      _app  = initializeApp(FIREBASE_CONFIG);
      _auth = getAuth(_app);
      _db   = getFirestore(_app);
      window._aenthoFirestoreDB = _db;   // expose for sync.js
      _fbReady = true;

      // Keep local session mirrored to Firebase auth state
      onAuthStateChanged(_auth, user => {
        if (user) _persistSession(user);
        else {
          // Only redirect if we're NOT on login/signup pages
          const currentPage = window.location.pathname.split('/').pop() || 'index.html';
          if (currentPage === 'dashboard.html' && !_getLocalSession()) {
            window.location.href = './index.html';
          }
        }
      });

      return true;
    } catch (err) {
      console.warn('[Auth] Firebase init failed:', err.message);
      _fbReady = false;
      return false;
    }
  })();
  return _initProm;
}

// ── Session helpers ────────────────────────────────────────────────
function _persistSession(user) {
  const s = {
    uid:         user.uid,
    email:       user.email || '',
    displayName: user.displayName || '',
    photoURL:    user.photoURL || '',
    emailVerified: user.emailVerified,
    savedAt:     Date.now()
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}

function _getLocalSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch {}
}

// ── Profile helpers ────────────────────────────────────────────────
function saveProfile(data) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(data)); } catch {}
}

function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
    const sess = _getLocalSession();
    return sess ? {
      businessName: '',
      ownerName:    sess.displayName,
      email:        sess.email,
      uid:          sess.uid,
      photoURL:     sess.photoURL || ''
    } : null;
  } catch { return null; }
}

// ── Sanitize input ────────────────────────────────────────────────
function _sanitize(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// Validate email
function _validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── SIGN UP ────────────────────────────────────────────────────────
async function signUp({ businessName, ownerName, email, password }) {
  // Input validation
  if (!businessName?.trim()) return { success: false, error: 'Business name is required.' };
  if (!ownerName?.trim())    return { success: false, error: 'Owner name is required.' };
  if (!_validEmail(email))   return { success: false, error: 'Enter a valid email address.' };
  if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };

  const ok = await initFirebase();

  // ── Offline fallback ──
  if (!ok || !navigator.onLine) {
    const uid = `offline_${Date.now()}`;
    _persistSession({ uid, email, displayName: ownerName, photoURL: '', emailVerified: false });
    saveProfile({
      businessName: _sanitize(businessName),
      ownerName:    _sanitize(ownerName),
      email, uid, offlineOnly: true
    });
    return { success: true, offline: true };
  }

  try {
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } =
      await import(`${FB_BASE}/firebase-auth.js`);
    const { doc, setDoc } =
      await import(`${FB_BASE}/firebase-firestore.js`);

    const cred = await createUserWithEmailAndPassword(_auth, email, password);

    await updateProfile(cred.user, { displayName: _sanitize(ownerName) });
    await sendEmailVerification(cred.user);

    const profileData = {
      businessName: _sanitize(businessName),
      ownerName:    _sanitize(ownerName),
      email,
      uid:          cred.user.uid,
      createdAt:    new Date().toISOString()
    };
    await setDoc(doc(_db, 'users', cred.user.uid), profileData);
    saveProfile(profileData);
    _persistSession(cred.user);

    return { success: true, emailVerification: true };
  } catch (err) {
    return { success: false, error: _parseError(err.code) };
  }
}

// ── LOGIN (Email/Password) ─────────────────────────────────────────
async function login({ email, password }) {
  if (!_validEmail(email)) return { success: false, error: 'Enter a valid email address.' };
  if (!password)           return { success: false, error: 'Password is required.' };

  const ok = await initFirebase();

  // ── Offline fallback ──
  if (!ok || !navigator.onLine) {
    const sess = _getLocalSession();
    if (sess && sess.email === email) return { success: true, offline: true };
    return { success: false, error: 'You are offline. Please connect to the internet to log in for the first time.' };
  }

  try {
    const { signInWithEmailAndPassword } =
      await import(`${FB_BASE}/firebase-auth.js`);
    const { doc, getDoc } =
      await import(`${FB_BASE}/firebase-firestore.js`);

    const cred = await signInWithEmailAndPassword(_auth, email, password);
    _persistSession(cred.user);

    // Fetch profile from Firestore
    try {
      const snap = await getDoc(doc(_db, 'users', cred.user.uid));
      if (snap.exists()) saveProfile({ ...snap.data(), uid: cred.user.uid });
    } catch {}

    return { success: true };
  } catch (err) {
    return { success: false, error: _parseError(err.code) };
  }
}

// ── GOOGLE SIGN-IN ─────────────────────────────────────────────────
async function loginWithGoogle() {
  const ok = await initFirebase();
  if (!ok) return { success: false, error: 'Firebase not available. Check your connection.' };

  try {
    const { GoogleAuthProvider, signInWithPopup } =
      await import(`${FB_BASE}/firebase-auth.js`);
    const { doc, getDoc, setDoc } =
      await import(`${FB_BASE}/firebase-firestore.js`);

    const provider = new GoogleAuthProvider();
    const cred     = await signInWithPopup(_auth, provider);
    _persistSession(cred.user);

    // Create Firestore profile if first time
    const ref  = doc(_db, 'users', cred.user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profileData = {
        businessName: '',
        ownerName:    cred.user.displayName || '',
        email:        cred.user.email || '',
        uid:          cred.user.uid,
        createdAt:    new Date().toISOString()
      };
      await setDoc(ref, profileData);
      saveProfile(profileData);
    } else {
      saveProfile({ ...snap.data(), uid: cred.user.uid });
    }

    return { success: true };
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') return { success: false, error: null };
    return { success: false, error: _parseError(err.code) };
  }
}

// ── PASSWORD RESET ─────────────────────────────────────────────────
async function resetPassword(email) {
  if (!_validEmail(email)) return { success: false, error: 'Enter a valid email address.' };
  const ok = await initFirebase();
  if (!ok) return { success: false, error: 'No internet connection.' };

  try {
    const { sendPasswordResetEmail } = await import(`${FB_BASE}/firebase-auth.js`);
    await sendPasswordResetEmail(_auth, email);
    return { success: true };
  } catch (err) {
    return { success: false, error: _parseError(err.code) };
  }
}

// ── CHANGE PASSWORD ────────────────────────────────────────────────
async function changePassword(newPassword) {
  if (!newPassword || newPassword.length < 6)
    return { success: false, error: 'Password must be at least 6 characters.' };
  if (!_auth?.currentUser)
    return { success: false, error: 'Not authenticated. Please log in again.' };
  try {
    const { updatePassword } = await import(`${FB_BASE}/firebase-auth.js`);
    await updatePassword(_auth.currentUser, newPassword);
    return { success: true };
  } catch (err) {
    return { success: false, error: _parseError(err.code) };
  }
}

// ── UPDATE PROFILE ─────────────────────────────────────────────────
async function updateUserProfile({ businessName, ownerName, email, photoURL }) {
  const profile = getProfile() || {};
  const updated = {
    ...profile,
    businessName: _sanitize(businessName || profile.businessName || ''),
    ownerName:    _sanitize(ownerName    || profile.ownerName    || ''),
    email:        email  || profile.email  || '',
    photoURL:     photoURL !== undefined ? photoURL : (profile.photoURL || '')
  };
  saveProfile(updated);

  if (_db && navigator.onLine && updated.uid) {
    try {
      const { doc, updateDoc } = await import(`${FB_BASE}/firebase-firestore.js`);
      await updateDoc(doc(_db, 'users', updated.uid), {
        businessName: updated.businessName,
        ownerName:    updated.ownerName,
        email:        updated.email
      });
    } catch {}
  }
  return { success: true };
}

// ── LOGOUT ─────────────────────────────────────────────────────────
async function logout() {
  try {
    if (_auth) {
      const { signOut } = await import(`${FB_BASE}/firebase-auth.js`);
      await signOut(_auth);
    }
  } catch {}
  _clearSession();
  window.location.href = './index.html';
}

// ── ROUTE GUARD ────────────────────────────────────────────────────
function requireAuth() {
  const sess = _getLocalSession();
  if (!sess) { window.location.href = './index.html'; return null; }
  return sess;
}

// ── Error parser ───────────────────────────────────────────────────
function _parseError(code = '') {
  const map = {
    'auth/email-already-in-use':   'This email is already registered. Try logging in.',
    'auth/invalid-email':          'Invalid email address.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Invalid email or password.',
    'auth/too-many-requests':      'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/requires-recent-login':  'Please log out and log in again to do this.',
    'auth/popup-blocked':          'Popup blocked. Allow popups for this site.',
    'auth/cancelled-popup-request':'Sign-in cancelled.',
    'auth/user-disabled':          'This account has been disabled.'
  };
  return map[code] || 'An error occurred. Please try again.';
}

// ── Export ─────────────────────────────────────────────────────────
window.AAuth = {
  initFirebase, signUp, login, loginWithGoogle,
  resetPassword, changePassword,
  updateUserProfile, logout,
  requireAuth,
  getLocalSession: _getLocalSession,
  getProfile, saveProfile
};
