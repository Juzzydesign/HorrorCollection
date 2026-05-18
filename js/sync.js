/**
 * sync.js — GitHub-backed sync for The Obscure Collective
 *
 * On every page load, all visitors fetch the latest movie data from
 * movies-live.json in the GitHub repo. When the admin makes changes,
 * those changes are pushed back via the GitHub Contents API.
 *
 * Setup (admin only):
 *   1. Go to github.com/settings/tokens → Generate new token (classic)
 *   2. Tick: repo → Contents (read + write)
 *   3. Click SAVE on the main page and paste the token in.
 */

const SYNC_PAT_KEY = 'horror_sync_pat';
const SYNC_RAW_URL = 'https://raw.githubusercontent.com/Juzzydesign/HorrorCollection/main/movies-live.json';
const SYNC_API_URL = 'https://api.github.com/repos/Juzzydesign/HorrorCollection/contents/movies-live.json';
const SYNC_TIMEOUT = 8000; // ms before giving up on the background fetch

// ─── PAT helpers ─────────────────────────────────────────────────────────────
function getSyncPAT()        { return localStorage.getItem(SYNC_PAT_KEY) || ''; }
function setSyncPAT(token)   {
  if (token) localStorage.setItem(SYNC_PAT_KEY, token.trim());
  else       localStorage.removeItem(SYNC_PAT_KEY);
}
function isSyncConfigured()  { return !!getSyncPAT(); }

// ─── Fetch remote movies (all visitors) ──────────────────────────────────────
/**
 * Fetches movies-live.json from GitHub.
 * Returns an array on success, or null on failure / empty file.
 */
async function fetchRemoteMovies() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT);
    const res = await fetch(`${SYNC_RAW_URL}?_=${Date.now()}`, {
      signal: controller.signal,
      cache:  'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetches remote movies in the background and updates localStorage if the
 * data has changed. Returns true if localStorage was updated (caller can
 * re-render), false if nothing changed or the fetch failed.
 *
 * IMPORTANT: do NOT await this before rendering — render immediately from
 * localStorage first, then call this and re-render only if it returns true.
 */
async function loadRemoteMovies() {
  const movies = await fetchRemoteMovies();
  // Empty array means the file was never synced — keep whatever is local.
  if (!movies || movies.length === 0) return false;

  const incoming = JSON.stringify(movies);
  if (localStorage.getItem(MOVIES_KEY) === incoming) return false; // no change

  localStorage.setItem(MOVIES_KEY, incoming);
  return true; // data updated — caller should re-render
}

// ─── Push movies to GitHub (admin only) ──────────────────────────────────────
/**
 * Pushes the current movie list (from getMovies()) to movies-live.json.
 * Base64 poster images are stripped before pushing to keep the file small.
 * Returns { ok: true } or { ok: false, error: string }.
 */
async function pushMoviesToGitHub() {
  const pat = getSyncPAT();
  if (!pat) return { ok: false, error: 'No sync token configured.' };

  // Strip locally-uploaded (base64) posters — only keep external URLs
  const moviesForSync = getMovies().map(m => ({
    ...m,
    posterUrl: m.posterUrl && m.posterUrl.startsWith('data:') ? null : m.posterUrl,
  }));

  const content = JSON.stringify(moviesForSync, null, 2);
  // GitHub API requires base64-encoded content (handle Unicode properly)
  const encoded = btoa(unescape(encodeURIComponent(content)));

  // Step 1: get the current file SHA (required for updates)
  let sha = null;
  try {
    const metaRes = await fetch(SYNC_API_URL, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept:        'application/vnd.github.v3+json',
      },
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
    }
  } catch { /* network blip — try the push anyway */ }

  // Step 2: PUT new content
  try {
    const body = {
      message: `Update collection — ${new Date().toISOString()}`,
      content: encoded,
    };
    if (sha) body.sha = sha;

    const res = await fetch(SYNC_API_URL, {
      method:  'PUT',
      headers: {
        Authorization:  `token ${pat}`,
        Accept:         'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    const msg = err.message || `GitHub error ${res.status}`;
    // Friendly hints for the most common failures
    if (res.status === 401) return { ok: false, error: 'Token rejected — check it was copied in full.' };
    if (res.status === 403) return { ok: false, error: 'Permission denied — make sure the token has repo → Contents (write) access.' };
    if (res.status === 404) return { ok: false, error: 'Not found — make sure the token belongs to the Juzzydesign GitHub account and has repo → Contents access.' };
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' };
  }
}

// ─── Silent auto-push (fire-and-forget with optional UI feedback) ─────────────
/**
 * Auto-push after any admin change.
 * @param {Function} [onDone]  Called with { ok, error } when complete
 */
function autoPush(onDone) {
  if (!isSyncConfigured()) return;
  pushMoviesToGitHub().then(result => {
    if (onDone) onDone(result);
  });
}
