/**
 * main.js — Grid page: rendering, filtering, tabs, login wiring, add/edit form
 */

// ─── State ────────────────────────────────────────────────────────────────────
let activeGenre     = 'all';
let activeStatus    = 'all';        // 'all' | 'watched' | 'watchlist'
let activeRatingKey = 'all';        // 'all' | 'low' | 'mid' | 'high'
let searchQuery     = '';
const RETURN_STATE_KEY = 'horror_return_state';

// Rating ranges — inclusive on both ends
const RATING_RANGES = {
  all:  null,
  low:  { min: 0,   max: 5.5 },
  mid:  { min: 6,   max: 7.5 },
  high: { min: 8,   max: 10  },
};

// ─── Entry point ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupViewTabs();
  setupGenreFilters();
  setupRatingFilters();
  setupSearch();
  setupLoginButton();
  setupHiddenLoginTrigger();
  setupLoginModal();
  setupFilmModal();
  setupSaveButton();
  setupSyncModal();

  document.addEventListener('film-saved', () => {
    renderGrid();
    autoPush(result => {
      if (!result.ok) console.warn('[sync] Push failed:', result.error);
    });
  });

  document.addEventListener('film-deleted', () => {
    renderGrid();
    autoPush();
  });

  updateAuthUI();   // from auth.js — sync login state on load
  toggleRatingRow();

  // Render immediately from localStorage — page appears instantly
  if (!restoreReturnState()) renderGrid();

  // Visitors fetch the latest data from GitHub on every load.
  // Admins skip this — their localStorage IS the source of truth and
  // fetching remote would overwrite unsynchronised local edits.
  if (!isLoggedIn()) {
    loadRemoteMovies().then(changed => {
      if (changed) renderGrid();
    });
  }
});

// Save scroll + filter state whenever we leave this page
window.addEventListener('pagehide', () => {
  sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify({
    genre:      activeGenre,
    status:     activeStatus,
    ratingKey:  activeRatingKey,
    scrollY:    window.scrollY,
  }));
});

// ─── Return state restore ─────────────────────────────────────────────────────
function restoreReturnState() {
  const raw = sessionStorage.getItem(RETURN_STATE_KEY);
  if (!raw) return false;
  sessionStorage.removeItem(RETURN_STATE_KEY);
  try {
    const s = JSON.parse(raw);
    activeGenre     = s.genre     || 'all';
    activeStatus    = s.status    || 'all';
    activeRatingKey = s.ratingKey || 'all';
    syncFilterUI();
    toggleRatingRow();
    renderGrid();
    requestAnimationFrame(() => window.scrollTo(0, s.scrollY || 0));
    return true;
  } catch (e) { return false; }
}

// ─── Scroll to top of grid ────────────────────────────────────────────────────
function scrollToGrid() {
  const grid = document.querySelector('.main-content');
  if (!grid) return;
  grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncFilterUI() {
  document.querySelectorAll('.filter-btn:not(.rating-filter)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.genre === activeGenre);
  });
  document.querySelectorAll('.rating-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratingKey === activeRatingKey);
  });
  document.querySelectorAll('.view-tab').forEach(btn => {
    const on = btn.dataset.status === activeStatus;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
}

// ─── View Tabs ────────────────────────────────────────────────────────────────
function setupViewTabs() {
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      activeStatus = btn.dataset.status;

      // Hide rating filters on Watchlist (no ratings to filter by)
      if (activeStatus === 'watchlist') {
        activeRatingKey = 'all';
        syncFilterUI();
      }
      toggleRatingRow();
      renderGrid();
    });
  });
}

function toggleRatingRow() {
  const row = document.querySelector('.filters-row--ratings');
  if (row) row.hidden = activeStatus === 'watchlist';
}

// ─── Genre filters ────────────────────────────────────────────────────────────
function setupGenreFilters() {
  document.querySelectorAll('.filter-btn:not(.rating-filter)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn:not(.rating-filter)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGenre = btn.dataset.genre;
      renderGrid();
      scrollToGrid();
    });
  });
}

// ─── Rating filters ───────────────────────────────────────────────────────────
function setupRatingFilters() {
  document.querySelectorAll('.rating-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rating-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRatingKey = btn.dataset.ratingKey || 'all';
      renderGrid();
      scrollToGrid();
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      searchQuery = input.value.trim().toLowerCase();
      renderGrid();
      scrollToGrid();
    }, 200);
  });
}

// ─── Save / Sync button ───────────────────────────────────────────────────────
function setupSaveButton() {
  document.getElementById('save-btn')?.addEventListener('click', openSyncModal);
}

// ─── Sync modal ───────────────────────────────────────────────────────────────
function openSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (!modal) return;
  // Pre-fill PAT if already saved (masked)
  const patInput = document.getElementById('sync-pat');
  if (patInput) patInput.value = getSyncPAT() ? '••••••••' : '';
  clearSyncStatus();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  if (!getSyncPAT()) setTimeout(() => patInput?.focus(), 50);
}

function closeSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function clearSyncStatus() {
  const err = document.getElementById('sync-error');
  const sta = document.getElementById('sync-status');
  if (err) { err.hidden = true; err.textContent = ''; }
  if (sta) sta.textContent = '';
}

function setupSyncModal() {
  document.getElementById('sync-modal-close')?.addEventListener('click', closeSyncModal);
  document.getElementById('sync-cancel')?.addEventListener('click', closeSyncModal);
  document.getElementById('sync-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSyncModal();
  });

  document.getElementById('sync-now-btn')?.addEventListener('click', async () => {
    const patInput  = document.getElementById('sync-pat');
    const statusEl  = document.getElementById('sync-status');
    const errorEl   = document.getElementById('sync-error');
    const btn       = document.getElementById('sync-now-btn');

    // If the user typed a new token (not the placeholder), save it
    const typed = patInput?.value.trim() || '';
    if (typed && typed !== '••••••••') {
      setSyncPAT(typed);
    }

    if (!isSyncConfigured()) {
      if (errorEl) { errorEl.textContent = 'Paste your GitHub token first.'; errorEl.hidden = false; }
      return;
    }

    btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Syncing…';
    if (errorEl)  errorEl.hidden = true;

    const result = await pushMoviesToGitHub();

    btn.disabled = false;
    if (result.ok) {
      if (statusEl) statusEl.textContent = '✓ Synced — visitors will now see your changes.';
    } else {
      if (errorEl)  { errorEl.textContent = result.error; errorEl.hidden = false; }
      if (statusEl) statusEl.textContent = '';
    }
  });

  document.getElementById('sync-clear-pat')?.addEventListener('click', () => {
    if (confirm('Remove the saved GitHub token?')) {
      setSyncPAT('');
      const patInput = document.getElementById('sync-pat');
      if (patInput) patInput.value = '';
      const statusEl = document.getElementById('sync-status');
      if (statusEl) statusEl.textContent = 'Token removed.';
    }
  });
}

// ─── Login / Logout button ────────────────────────────────────────────────────
function setupLoginButton() {
  document.getElementById('login-btn')?.addEventListener('click', () => {
    if (isLoggedIn()) logout();
    else openLoginModal();
  });
}

// ─── Hidden login trigger — triple-click the site title ───────────────────────
function setupHiddenLoginTrigger() {
  let clicks = 0, timer;
  document.querySelector('.site-title')?.addEventListener('click', () => {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 700);
    if (clicks >= 3 && !isLoggedIn()) {
      clicks = 0;
      openLoginModal();
    }
  });
}

// ─── LOGIN MODAL ──────────────────────────────────────────────────────────────
function openLoginModal() {
  const modal = document.getElementById('login-modal');
  clearLoginErrors();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('login-password')?.focus(), 50);
}

function closeLoginModal() {
  document.getElementById('login-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

function setupLoginModal() {
  // Close button
  document.getElementById('login-modal-close')?.addEventListener('click', closeLoginModal);

  // Overlay click to close
  document.getElementById('login-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // Login submit
  document.getElementById('login-submit')?.addEventListener('click', async () => {
    const pwd    = document.getElementById('login-password').value;
    const result = await attemptLogin(pwd);
    if (result.ok) {
      closeLoginModal();
    } else {
      showError('login-error', result.error);
    }
  });

  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-submit')?.click();
  });
}

function clearLoginErrors() {
  const err = document.getElementById('login-error');
  if (err) { err.hidden = true; err.textContent = ''; }
  const pwd = document.getElementById('login-password');
  if (pwd) pwd.value = '';
}


// ─── GRID RENDER ─────────────────────────────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById('movie-grid');
  const emptyMsg = document.getElementById('empty-state');
  const countEl  = document.getElementById('movie-count');
  const all      = getMovies();   // from data.js
  const filtered = applyFilters(all);

  // Update tab counts
  updateTabCounts(all);

  // Stats line
  if (countEl) {
    const watched   = all.filter(m => m.status === 'watched').length;
    const watchlist = all.filter(m => m.status === 'watchlist').length;
    if (filtered.length === all.length) {
      countEl.textContent = `${watched} watched · ${watchlist} on watchlist`;
    } else {
      countEl.textContent = `Showing ${filtered.length} of ${all.length} films`;
    }
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;
  grid.innerHTML  = filtered.map(buildCardHTML).join('');

  // Wire up edit / delete buttons
  grid.querySelectorAll('.card-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const id    = parseInt(btn.dataset.id, 10);
      const movie = getMovies().find(m => m.id === id);
      if (movie) openFilmModal(movie);
    });
  });

  grid.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const id = parseInt(btn.dataset.id, 10);
      if (confirm('Remove this film from the archive?')) {
        deleteMovie(id);   // from data.js
        renderGrid();
        autoPush();
      }
    });
  });

  // Sync admin visibility with current login state
  updateAuthUI();
}

function updateTabCounts(movies) {
  document.getElementById('count-all')?.replaceChildren(
    Object.assign(document.createElement('span'), { textContent: movies.length })
  );
  document.getElementById('count-watched')?.replaceChildren(
    Object.assign(document.createElement('span'), {
      textContent: movies.filter(m => m.status === 'watched').length
    })
  );
  document.getElementById('count-watchlist')?.replaceChildren(
    Object.assign(document.createElement('span'), {
      textContent: movies.filter(m => m.status === 'watchlist').length
    })
  );
}

// ─── Filtering ────────────────────────────────────────────────────────────────
function applyFilters(movies) {
  return movies
    .filter(m => {
      const genreOk  = activeGenre === 'all' || (m.genres || []).includes(activeGenre);
      const statusOk = activeStatus === 'all' || m.status === activeStatus;
      const searchOk = !searchQuery ||
        (m.title  || '').toLowerCase().includes(searchQuery) ||
        (m.director || '').toLowerCase().includes(searchQuery) ||
        (m.genres || []).some(g => g.toLowerCase().includes(searchQuery));
      // Rating filter: range-based, only applies to watched films with a rating
      const range    = RATING_RANGES[activeRatingKey];
      const ratingOk = !range ||
        (m.status === 'watched' && m.rating != null && m.rating >= range.min && m.rating <= range.max);
      return genreOk && statusOk && searchOk && ratingOk;
    })
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

// ─── Card HTML ────────────────────────────────────────────────────────────────
function buildCardHTML(movie) {
  const genre  = (movie.genres || [])[0] || '';
  const label  = movie.status === 'watched' ? 'Seen' : 'Want to Watch';
  const cls    = movie.status;

  const ratingBadge = (movie.status === 'watched' && movie.rating != null)
    ? `<span class="card-rating" aria-label="${movie.rating} out of 10">${movie.rating}/10</span>`
    : '';

  const poster = movie.posterUrl
    ? `<img src="${esc(movie.posterUrl)}" alt="${esc(movie.title)} poster" class="movie-poster" loading="lazy" onerror="handleImageError(this)">`
    : buildPlaceholder(movie.title);

  const adminBtns = `
    <div class="card-admin" hidden>
      <button class="card-edit-btn"   data-id="${movie.id}" title="Edit film"   aria-label="Edit ${esc(movie.title)}">✎</button>
      <button class="card-delete-btn" data-id="${movie.id}" title="Delete film" aria-label="Delete ${esc(movie.title)}">✕</button>
    </div>`;

  return `
    <a href="movie.html#${movie.id}" class="movie-card" data-genres="${esc((movie.genres||[]).join(','))}" data-status="${cls}" role="listitem">
      ${poster}
      <div class="card-badges">
        <span class="genre-badge">${esc(genre)}</span>
        <span class="status-badge ${cls}">${label}</span>
      </div>
      <div class="card-info">
        <div class="card-meta-top">
          <h2 class="card-title">${esc(movie.title)}</h2>
          ${ratingBadge}
        </div>
        <div class="card-meta"></div>
      </div>
      ${adminBtns}
    </a>`;
}

function buildPlaceholder(title) {
  return `
    <div class="poster-placeholder">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c9150e" stroke-width="1">
        <rect x="2" y="2" width="20" height="20" rx="2"/>
        <circle cx="8" cy="8" r="2"/>
        <path d="M2 18l6-6 4 4 3-3 7 7"/>
      </svg>
      <span>${esc(title)}</span>
    </div>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str ?? '')));
  return d.innerHTML;
}

function handleImageError(img) {
  const title = img.alt.replace(' poster', '');
  img.replaceWith(createFromHTML(buildPlaceholder(title)));
}

function createFromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

