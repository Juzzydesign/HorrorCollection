/**
 * film-form.js — Shared film add/edit modal logic.
 * Works on both index.html (grid) and movie.html (detail).
 * After a successful save, dispatches a 'film-saved' CustomEvent on document
 * so each page can react (re-render grid or reload detail).
 */

const TMDB_KEY      = '41089d29cdd93cab75f143d7d95d23ce';
const TMDB_IMG      = 'https://image.tmdb.org/t/p/w500';

// Provider name → our platform label
const FORM_PROVIDER_MAP = {
  'Netflix': 'Netflix', 'Amazon Prime Video': 'Prime',
  'Hulu': 'Hulu', 'Max': 'Max', 'HBO Max': 'Max',
  'Peacock Premium': 'Peacock', 'Peacock Premium Plus': 'Peacock',
  'Shudder': 'Shudder', 'Tubi TV': 'Tubi',
  'Kanopy': 'Kanopy', 'MUBI': 'Mubi', 'MUBI Amazon Channel': 'Mubi',
};

let editingId = null;

// ─── Open / Close ─────────────────────────────────────────────────────────────
function openFilmModal(movie = null) {
  editingId = movie ? movie.id : null;
  const modal     = document.getElementById('film-modal');
  const titleEl   = document.getElementById('film-modal-title');
  const submitBtn = document.getElementById('film-submit');

  titleEl.textContent   = movie ? 'Edit Film' : 'Add to the Archive';
  submitBtn.textContent = movie ? 'SAVE CHANGES' : 'ADD TO ARCHIVE';

  const deleteBtn = document.getElementById('film-delete-btn');
  if (deleteBtn) deleteBtn.hidden = !movie;

  resetFilmForm();
  if (movie) populateFilmForm(movie);
  toggleWatchedFields();
  clearError('film-error');
  modal.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('film-title')?.focus(), 50);
}

function closeFilmModal() {
  document.getElementById('film-modal').hidden = true;
  document.body.classList.remove('modal-open');
  editingId = null;
}

// ─── Setup (call once on DOMContentLoaded) ────────────────────────────────────
function setupFilmModal() {
  document.getElementById('add-movie-btn')?.addEventListener('click', () => openFilmModal());
  document.getElementById('film-modal-close')?.addEventListener('click', closeFilmModal);
  document.getElementById('film-cancel')?.addEventListener('click', closeFilmModal);
  document.getElementById('film-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeFilmModal();
  });

  document.querySelectorAll('input[name="status"]').forEach(r =>
    r.addEventListener('change', toggleWatchedFields)
  );

  const slider  = document.getElementById('film-rating');
  const display = document.getElementById('rating-display');
  slider?.addEventListener('input', () => {
    display.textContent = `${slider.value} / 10`;
  });

  const posterInput = document.getElementById('film-poster');
  posterInput?.addEventListener('input', () => {
    const url  = posterInput.value.trim();
    const wrap = document.getElementById('poster-preview-wrap');
    const img  = document.getElementById('poster-preview');
    if (url) {
      img.src     = url;
      wrap.hidden = false;
      img.onerror = () => { wrap.hidden = true; };
      img.onload  = () => { wrap.hidden = false; };
    } else {
      wrap.hidden = true;
    }
  });

  document.getElementById('film-form')?.addEventListener('submit', e => {
    e.preventDefault();
    handleFilmSubmit();
  });

  document.getElementById('film-delete-btn')?.addEventListener('click', handleFilmDelete);
  setupTmdbLookup();
}

// ─── TMDB auto-fill ───────────────────────────────────────────────────────────
function setupTmdbLookup() {
  const btn   = document.getElementById('tmdb-lookup-btn');
  const input = document.getElementById('tmdb-lookup-input');
  if (!btn || !input) return;

  btn.addEventListener('click', handleTmdbLookup);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleTmdbLookup(); }
  });
}

async function handleTmdbLookup() {
  const input  = document.getElementById('tmdb-lookup-input');
  const status = document.getElementById('tmdb-lookup-status');
  const btn    = document.getElementById('tmdb-lookup-btn');

  const parsed = parseTmdbUrl(input.value.trim());
  if (!parsed) {
    setLookupStatus(status, 'Could not find a TMDB ID in that URL.', 'error');
    return;
  }

  btn.disabled = true;
  setLookupStatus(status, 'Fetching…', '');

  try {
    const [data, providers] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${parsed.type}/${parsed.id}?api_key=${TMDB_KEY}&append_to_response=credits`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/${parsed.type}/${parsed.id}/watch/providers?api_key=${TMDB_KEY}`).then(r => r.json()),
    ]);

    if (data.status_message) {
      setLookupStatus(status, `TMDB: ${data.status_message}`, 'error');
      return;
    }

    // Title
    const title = data.title || data.name || '';
    if (title) document.getElementById('film-title').value = title;

    // Year
    const dateStr = data.release_date || data.first_air_date || '';
    const year    = dateStr ? parseInt(dateStr.split('-')[0], 10) : null;
    if (year) document.getElementById('film-year').value = year;

    // Director (movies only; TV shows use series creators)
    const crew      = data.credits?.crew || [];
    const creators  = data.created_by   || [];
    const director  = crew.find(p => p.job === 'Director')?.name
                   || creators[0]?.name || '';
    if (director) document.getElementById('film-director').value = director;

    // Overview
    if (data.overview) document.getElementById('film-overview').value = data.overview;

    // Poster
    if (data.poster_path) {
      const posterUrl  = TMDB_IMG + data.poster_path;
      const posterInput = document.getElementById('film-poster');
      const wrap        = document.getElementById('poster-preview-wrap');
      const preview     = document.getElementById('poster-preview');
      posterInput.value = posterUrl;
      preview.src       = posterUrl;
      wrap.hidden       = false;
    }

    // Streaming (US flatrate)
    const flatrate = providers.results?.US?.flatrate || [];
    const platforms = flatrate
      .map(p => FORM_PROVIDER_MAP[p.provider_name])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
    document.querySelectorAll('input[name="streaming"]').forEach(cb => {
      cb.checked = platforms.includes(cb.value);
    });

    setLookupStatus(status, `✓ Filled in from TMDB — check genres and rating.`, 'ok');
  } catch (e) {
    setLookupStatus(status, `Request failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

function parseTmdbUrl(raw) {
  const tv    = raw.match(/themoviedb\.org\/tv\/(\d+)/);
  if (tv) return { id: parseInt(tv[1], 10), type: 'tv' };
  const movie = raw.match(/themoviedb\.org\/movie\/(\d+)/);
  if (movie) return { id: parseInt(movie[1], 10), type: 'movie' };
  const num   = parseInt(raw, 10);
  return isNaN(num) ? null : { id: num, type: 'movie' };
}

function setLookupStatus(el, msg, type) {
  if (!el) return;
  el.textContent  = msg;
  el.dataset.type = type;
}

function toggleWatchedFields() {
  const isWatched = document.querySelector('input[name="status"]:checked')?.value === 'watched';
  document.getElementById('rating-section').hidden = !isWatched;
}

function resetFilmForm() {
  document.getElementById('film-id').value          = '';
  document.getElementById('film-title').value       = '';
  document.getElementById('film-year').value        = '';
  document.getElementById('film-director').value    = '';
  document.getElementById('film-overview').value    = '';
  document.getElementById('film-poster').value      = '';
  document.getElementById('film-rating').value      = '7';
  document.getElementById('rating-display').textContent = '7 / 10';
  document.getElementById('poster-preview-wrap').hidden = true;

  const lookupInput  = document.getElementById('tmdb-lookup-input');
  const lookupStatus = document.getElementById('tmdb-lookup-status');
  if (lookupInput)  lookupInput.value   = '';
  if (lookupStatus) { lookupStatus.textContent = ''; delete lookupStatus.dataset.type; }

  document.querySelectorAll('input[name="status"]').forEach(r => {
    r.checked = r.value === 'watched';
  });
  document.querySelectorAll('input[name="genre"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="streaming"]').forEach(cb => cb.checked = false);
}

function populateFilmForm(movie) {
  document.getElementById('film-id').value          = movie.id;
  document.getElementById('film-title').value       = movie.title       || '';
  document.getElementById('film-year').value        = movie.year        || '';
  document.getElementById('film-director').value    = movie.director    || '';
  document.getElementById('film-overview').value    = movie.description || '';
  document.getElementById('film-poster').value      = movie.posterUrl   || '';

  if (movie.rating != null) {
    document.getElementById('film-rating').value = movie.rating;
    document.getElementById('rating-display').textContent = `${movie.rating} / 10`;
  }

  document.querySelectorAll('input[name="status"]').forEach(r => {
    r.checked = r.value === movie.status;
  });
  (movie.genres    || []).forEach(g => {
    const cb = document.querySelector(`input[name="genre"][value="${g}"]`);
    if (cb) cb.checked = true;
  });
  (movie.streaming || []).forEach(s => {
    const cb = document.querySelector(`input[name="streaming"][value="${s}"]`);
    if (cb) cb.checked = true;
  });

  if (movie.posterUrl) {
    document.getElementById('poster-preview').src = movie.posterUrl;
    document.getElementById('poster-preview-wrap').hidden = false;
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────
function handleFilmSubmit() {
  const title = document.getElementById('film-title').value.trim();
  const year  = parseInt(document.getElementById('film-year').value, 10);

  if (!title) return showError('film-error', 'Title is required.');
  if (!year || year < 1888 || year > 2099) return showError('film-error', 'Please enter a valid year.');

  const genres = [...document.querySelectorAll('input[name="genre"]:checked')].map(cb => cb.value);
  if (genres.length === 0) return showError('film-error', 'Select at least one genre.');

  const status    = document.querySelector('input[name="status"]:checked')?.value || 'watchlist';
  const isWatched = status === 'watched';
  const streaming = [...document.querySelectorAll('input[name="streaming"]:checked')].map(cb => cb.value);

  const movieData = {
    title,
    year,
    genres,
    status,
    rating:      isWatched ? parseFloat(document.getElementById('film-rating').value) : null,
    description: document.getElementById('film-overview').value.trim() || null,
    director:    document.getElementById('film-director').value.trim() || null,
    streaming,
    posterUrl: document.getElementById('film-poster').value.trim() || null,
    tmdbId:    null,
  };

  if (editingId) {
    updateMovie(editingId, movieData);
  } else {
    addMovie(movieData);
  }

  closeFilmModal();
  document.dispatchEvent(new CustomEvent('film-saved', { detail: { id: editingId } }));
}

function handleFilmDelete() {
  if (!editingId) return;
  const title = document.getElementById('film-title').value.trim() || 'this film';
  if (!confirm(`Remove "${title}" from the archive?`)) return;
  deleteMovie(editingId);
  closeFilmModal();
  document.dispatchEvent(new CustomEvent('film-deleted', { detail: { id: editingId } }));
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearError(id) {
  const el = document.getElementById(id);
  if (el) { el.hidden = true; el.textContent = ''; }
}
