/**
 * auth.js — Login / logout for the Horror Archive admin
 *
 * How it works:
 *   - Your password is stored as a SHA-256 hash in localStorage.
 *   - The first time you click LOGIN you will be prompted to CREATE a password.
 *   - After that, LOGIN checks your entry against the stored hash.
 *   - The active session lives in sessionStorage (cleared when you close the tab).
 *
 * To reset your password: open the browser console and run:
 *   localStorage.removeItem('horror_archive_auth')
 *   Then click LOGIN to set a new one.
 */

const AUTH_HASH_KEY    = 'horror_archive_auth';
const SESSION_KEY      = 'horror_archive_session';
const SESSION_TOKEN    = 'authenticated';

// ─── Public API ───────────────────────────────────────────────────────────────

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === SESSION_TOKEN;
}

function isPasswordSet() {
  return !!localStorage.getItem(AUTH_HASH_KEY);
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  updateAuthUI();
  renderGrid();   // re-render to hide admin controls
}

// Called by the login form. On first use (no password stored) the entered
// password silently becomes the admin password — visitors can't sign up
// because they don't know what to type.
async function attemptLogin(password) {
  if (!password) return { ok: false, error: 'Enter your password.' };

  const hash   = await sha256(password);
  const stored = localStorage.getItem(AUTH_HASH_KEY);

  if (!stored) {
    // First-time: set this as the admin password
    if (password.length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };
    localStorage.setItem(AUTH_HASH_KEY, hash);
  } else if (hash !== stored) {
    return { ok: false, error: 'Incorrect password.' };
  }

  sessionStorage.setItem(SESSION_KEY, SESSION_TOKEN);
  updateAuthUI();
  renderGrid();
  return { ok: true };
}

// ─── UI sync ──────────────────────────────────────────────────────────────────

function updateAuthUI() {
  const loginBtn  = document.getElementById('login-btn');
  const saveBtn   = document.getElementById('save-btn');
  const addBtn    = document.getElementById('add-movie-btn');
  const adminBtns = document.querySelectorAll('.card-admin');

  if (!loginBtn) return;

  if (isLoggedIn()) {
    loginBtn.textContent = 'LOGOUT';
    loginBtn.hidden = false;
    if (saveBtn) saveBtn.hidden = false;
    if (addBtn)  addBtn.hidden  = false;
    adminBtns.forEach(el => el.hidden = false);
  } else {
    loginBtn.textContent = 'LOGIN';
    loginBtn.hidden = false;
    if (saveBtn) saveBtn.hidden = true;
    if (addBtn)  addBtn.hidden  = true;
    adminBtns.forEach(el => el.hidden = true);
  }
}

// ─── SHA-256 via Web Crypto (no dependencies) ─────────────────────────────────

async function sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
