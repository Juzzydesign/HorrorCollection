/**
 * detail.js — Powers the individual movie detail page (movie.html)
 * Reads the ?id= URL parameter and renders the full movie entry.
 */

const TMDB_API_KEY  = '41089d29cdd93cab75f143d7d95d23ce';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

function isAdminLoggedIn() {
  return sessionStorage.getItem('horror_archive_session') === 'authenticated';
}

document.addEventListener('DOMContentLoaded', () => {
  // Use history.back() so the browser restores scroll + filter state
  document.getElementById('back-btn')?.addEventListener('click', e => {
    if (history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });

  const movieId = getMovieIdFromURL();

  // Render immediately from localStorage — page appears instantly
  const movie = getMovies ? getMovies().find(m => m.id === movieId)
                           : MOVIES.find(m => m.id === movieId);

  if (!movie) {
    showNotFound();
    return;
  }

  document.title = `${movie.title} (${movie.year}) — The Obscure Collective`;
  renderDetail(movie);

  if (isAdminLoggedIn()) {
    injectAdminPanel(movie);
    injectPosterUpload(movie);
    setupFilmModal();
    document.addEventListener('film-saved', () => {
      autoPush();
      location.reload();
    });

    document.addEventListener('film-deleted', () => {
      autoPush();
      history.back();
    });
  }

  // Visitors fetch the latest data from GitHub on every load.
  // Admins skip this — their localStorage IS the source of truth.
  if (!isAdminLoggedIn()) {
    loadRemoteMovies().then(changed => {
      if (!changed) return;
      const refreshed = (getMovies ? getMovies() : MOVIES).find(m => m.id === movieId);
      if (refreshed) renderDetail(refreshed);
    });
  }
});

// ─── Get movie ID from URL query param ───────────────────────────────────────
function getMovieIdFromURL() {
  // Hash-based routing: movie.html#5 → id 5
  return parseInt(window.location.hash.replace('#', ''), 10);
}

// ─── Main render function ─────────────────────────────────────────────────────
function renderDetail(movie) {
  renderHero(movie);
  renderBody(movie);
}

// ─── Hero section (poster + info panel) ──────────────────────────────────────
function renderHero(movie) {
  const hero = document.getElementById('detail-hero');
  if (!hero) return;

  const statusLabel = movie.status === 'watched' ? 'Watched' : 'On Watchlist';
  const statusClass = movie.status;

  const posterHTML = movie.posterUrl
    ? `<img src="${escapeHTML(movie.posterUrl)}"
            alt="${escapeHTML(movie.title)} poster"
            class="detail-poster"
            onerror="this.parentElement.innerHTML = '<div class=\'detail-poster-placeholder\'></div>'">`
    : `<div class="detail-poster-placeholder"></div>`;

  const genreTags = movie.genres
    .map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`)
    .join('');

  const ratingHTML = (movie.status === 'watched' && movie.rating != null)
    ? `<div class="detail-rating-block">
         <div class="blood-drops" aria-label="${movie.rating} out of 10">${buildBloodDrops(movie.rating)}</div>
         <span class="detail-rating-number">${movie.rating} / 10</span>
       </div>`
    : '';

  const synopsisHTML = movie.description
    ? `<div class="detail-synopsis">
         <p>${escapeHTML(movie.description)}</p>
       </div>`
    : '';

  const runtimeText = movie.runtime
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : '';

  hero.innerHTML = `
    <div class="detail-poster-wrap">
      ${posterHTML}
    </div>

    <div class="detail-info">
      <div class="detail-status-row">
        <span class="detail-status-badge ${statusClass}">${statusLabel}</span>
      </div>

      <h1 class="detail-title">${escapeHTML(movie.title)}</h1>

      <div class="detail-genres">
        ${genreTags}
      </div>

      ${ratingHTML}

      <div class="detail-divider"></div>

      <div class="detail-meta-row">
        <span>${movie.year}</span>
        ${movie.director ? `<span>${escapeHTML(movie.director)}</span>` : ''}
        ${runtimeText ? `<span>${runtimeText}</span>` : ''}
      </div>

      ${synopsisHTML}
    </div>
  `;
}

// ─── Body sections (synopsis + review) ───────────────────────────────────────
function renderBody(movie) {
  const body = document.getElementById('detail-body');
  if (!body) return;

  const streamingHTML = buildStreamingHTML(movie.streaming);

  if (!streamingHTML) {
    body.hidden = true;
    return;
  }

  body.innerHTML = `
    <div class="detail-body-spacer"></div>
    <div class="detail-sections">
      <div class="detail-section">${streamingHTML}</div>
    </div>
  `;
}

// ─── Streaming platform badges ────────────────────────────────────────────────
function buildStreamingHTML(platforms) {
  if (!platforms || platforms.length === 0) return '';

  // Map platform names to CSS class slugs and display labels
  const PLATFORM_MAP = {
    'Netflix':  'netflix',
    'Shudder':  'shudder',
    'Tubi':     'tubi',
    'Prime':    'prime',
    'Hulu':     'hulu',
    'Peacock':  'peacock',
    'Max':      'max',
    'Kanopy':   'kanopy',
    'Mubi':     'mubi',
  };

  const badges = platforms.map(name => {
    const slug = PLATFORM_MAP[name] || 'other';
    return `<span class="platform-badge ${slug}">${escapeHTML(name)}</span>`;
  }).join('');

  return `
    <div class="detail-streaming-section">
      <p class="detail-section-label">Where to Watch</p>
      <div class="streaming-platforms">${badges}</div>
    </div>
  `;
}

// ─── Not-found state ──────────────────────────────────────────────────────────
function showNotFound() {
  const hero = document.getElementById('detail-hero');
  if (hero) {
    hero.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 80px 24px; color: var(--text-dim); font-family: var(--font-heading); letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.8rem;">
        Film not found in the archive.
      </div>
    `;
  }
}

// ─── Blood drop rating ───────────────────────────────────────────────────────
function buildBloodDrops(rating) {
  const DROP = `<svg viewBox="0 0 12 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 0 C6 0 0.5 7 0.5 10.5 A5.5 5.5 0 0 0 11.5 10.5 C11.5 7 6 0 6 0Z"/>
  </svg>`;

  let html = '';
  for (let i = 1; i <= 10; i++) {
    const filled = i <= Math.floor(rating);
    const half   = !filled && i === Math.ceil(rating) && rating % 1 >= 0.5;
    html += `<span class="drop${filled ? ' drop--full' : half ? ' drop--half' : ''}">${DROP}</span>`;
  }
  return html;
}

// ─── Admin fix panel ──────────────────────────────────────────────────────────
function injectAdminPanel(movie) {
  const panel = document.createElement('div');
  panel.className = 'admin-fix-panel';
  panel.innerHTML = `
    <span class="admin-fix-label">Fix movie data</span>
    <input class="admin-fix-input" id="tmdb-url-input"
           type="text" placeholder="Paste TMDB URL — movie/228274 or tv/1399"
           spellcheck="false" autocomplete="off">
    <button class="admin-fix-btn" id="tmdb-fetch-btn">FETCH</button>
    <button class="admin-fix-btn admin-clear-btn" id="tmdb-clear-btn">CLEAR</button>
    <span class="admin-fix-status" id="admin-fix-status"></span>
    <button class="admin-fix-btn admin-edit-btn" id="detail-edit-btn">EDIT FILM</button>
  `;

  const hero = document.getElementById('detail-hero');
  hero.parentNode.insertBefore(panel, hero);

  document.getElementById('tmdb-fetch-btn').addEventListener('click', () => handleTmdbFix(movie));
  document.getElementById('tmdb-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleTmdbFix(movie);
  });
  document.getElementById('tmdb-clear-btn').addEventListener('click', () => {
    if (confirm('Clear poster and description for this film?')) {
      updateMovie(movie.id, { posterUrl: null, description: null, tmdbId: null });
      autoPush();
      location.reload();
    }
  });
  document.getElementById('detail-edit-btn').addEventListener('click', () => openFilmModal(movie));
}

async function handleTmdbFix(movie) {
  const input  = document.getElementById('tmdb-url-input');
  const status = document.getElementById('admin-fix-status');
  const btn    = document.getElementById('tmdb-fetch-btn');

  const parsed = extractTmdbId(input.value.trim());
  if (!parsed) {
    setStatus(status, 'Could not parse a TMDB ID from that.', 'error');
    return;
  }

  btn.disabled = true;
  setStatus(status, 'Fetching…', '');

  try {
    // Fetch movie details and streaming providers in parallel
    const [data, streaming] = await Promise.all([
      fetchTmdb(parsed.id, parsed.type),
      fetchTmdbProviders(parsed.id, parsed.type),
    ]);

    if (data.status_message) {
      setStatus(status, `TMDB error: ${data.status_message}`, 'error');
      return;
    }

    const changes = {
      tmdbId:      parsed.id,
      posterUrl:   data.poster_path ? TMDB_IMG_BASE + data.poster_path : movie.posterUrl,
      description: data.overview    || null,
      streaming:   streaming.length  ? streaming : movie.streaming,
    };

    updateMovie(movie.id, changes);
    setStatus(status, 'Updated! Syncing…', 'ok');
    autoPush(result => {
      setStatus(status, result.ok ? 'Synced! Reloading…' : 'Saved locally. Reloading…', result.ok ? 'ok' : '');
    });
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    setStatus(status, `Request failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

function fetchTmdb(id, type = 'movie') {
  return fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`)
    .then(r => r.json());
}

// Map TMDB provider names → our platform labels
const TMDB_PROVIDER_MAP = {
  'Netflix':                'Netflix',
  'Amazon Prime Video':     'Prime',
  'Hulu':                   'Hulu',
  'Max':                    'Max',
  'HBO Max':                'Max',
  'Peacock Premium':        'Peacock',
  'Peacock Premium Plus':   'Peacock',
  'Shudder':                'Shudder',
  'Tubi TV':                'Tubi',
  'Kanopy':                 'Kanopy',
  'MUBI':                   'Mubi',
  'MUBI Amazon Channel':    'Mubi',
};

async function fetchTmdbProviders(id, type = 'movie') {
  try {
    const res  = await fetch(`https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${TMDB_API_KEY}`);
    const data = await res.json();
    // Use US flatrate (subscription) providers; fall back to an empty list
    const flatrate = data.results?.US?.flatrate || [];
    return flatrate
      .map(p => TMDB_PROVIDER_MAP[p.provider_name])
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
  } catch {
    return [];
  }
}

// Returns { id, type } or null. Supports movie and TV series URLs.
function extractTmdbId(raw) {
  const tvMatch    = raw.match(/themoviedb\.org\/tv\/(\d+)/);
  if (tvMatch) return { id: parseInt(tvMatch[1], 10), type: 'tv' };

  const movieMatch = raw.match(/themoviedb\.org\/movie\/(\d+)/);
  if (movieMatch) return { id: parseInt(movieMatch[1], 10), type: 'movie' };

  // Plain number — default to movie
  const num = parseInt(raw, 10);
  return isNaN(num) ? null : { id: num, type: 'movie' };
}

function setStatus(el, msg, type) {
  el.textContent  = msg;
  el.dataset.type = type;
}

// ─── Poster drag-and-drop upload (admin only) ────────────────────────────────
function injectPosterUpload(movie) {
  const wrap = document.querySelector('.detail-poster-wrap');
  if (!wrap) return;

  wrap.classList.add('upload-enabled');
  wrap.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.className = 'poster-upload-overlay';
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <span>Drop image<br>or click to browse</span>`;
  wrap.appendChild(overlay);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  wrap.appendChild(fileInput);

  function applyImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        // Compress via canvas (~30–60 KB)
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);

        if (isSyncConfigured()) {
          // Push the image to GitHub so all visitors can see it
          const publicUrl = await pushPosterToGitHub(movie.id, compressed);
          if (publicUrl) {
            updateMovie(movie.id, { posterUrl: publicUrl });
            autoPush(); // also update movies-live.json with the new URL
          } else {
            // GitHub push failed — save locally as base64 fallback
            updateMovie(movie.id, { posterUrl: compressed });
          }
        } else {
          // No sync configured — save locally only
          updateMovie(movie.id, { posterUrl: compressed });
        }
        location.reload();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  wrap.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => applyImage(fileInput.files[0]));

  wrap.addEventListener('dragover', e => {
    e.preventDefault();
    wrap.classList.add('drag-over');
  });
  wrap.addEventListener('dragleave', e => {
    if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-over');
  });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.classList.remove('drag-over');
    applyImage(e.dataTransfer.files[0]);
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}
