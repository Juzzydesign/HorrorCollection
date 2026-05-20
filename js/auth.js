/**
 * auth.js — Login / logout for the Horror Archive admin
 *
 * Security model:
 *   - Admin access requires a password hash to already be stored in
 *     localStorage on the device. Visitors on their own browsers have no
 *     hash, so they cannot log in at all.
 *   - The hash is created once per device by running setupAdmin() in the
 *     browser console. After that, only the correct password grants access.
 *   - The active session lives in sessionStorage (cleared on tab close).
 *
 * ── First-time setup on a new device ──────────────────────────────────────
 *   Open the browser console (F12 → Console) and run:
 *     setupAdmin()
 *   Enter your password when prompted. Do this once per device/browser.
 *
 * ── Reset password ─────────────────────────────────────────────────────────
 *   Open the console and run:
 *     localStorage.removeItem('horror_archive_auth')
 *   Then run setupAdmin() again to set a new password.
 */

const AUTH_HASH_KEY = 'horror_archive_auth';
const SESSION_KEY   = 'horror_archive_session';
const SESSION_TOKEN = 'authenticated';

// ─── Public API ───────────────────────────────────────────────────────────────

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === SESSION_TOKEN;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  updateAuthUI();
  renderGrid();
}

// Login — only succeeds if a hash is already stored on this device.
// Visitors on their own browsers have no hash → always blocked.
async function attemptLogin(password) {
  if (!password) return { ok: false, error: 'Enter your password.' };

  const stored = localStorage.getItem(AUTH_HASH_KEY);
  if (!stored) {
    return { ok: false, error: 'Admin access not set up on this device.' };
  }

  const hash = await sha256(password);
  if (hash !== stored) {
    return { ok: false, error: 'Incorrect password.' };
  }

  sessionStorage.setItem(SESSION_KEY, SESSION_TOKEN);
  updateAuthUI();
  renderGrid();
  return { ok: true };
}

// ─── First-time device setup (console only) ───────────────────────────────────
// Run setupAdmin() in the browser console to register this device.
async function setupAdmin() {
  const pwd = prompt('Set admin password (min 6 characters):');
  if (!pwd) return console.log('[auth] Cancelled.');
  if (pwd.length < 6) return console.log('[auth] Password too short — minimum 6 characters.');
  const hash = await sha256(pwd);
  localStorage.setItem(AUTH_HASH_KEY, hash);
  console.log('[auth] ✓ Admin password set. You can now log in normally.');
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
    loginBtn.textContent = 'ADMIN LOGIN';
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
