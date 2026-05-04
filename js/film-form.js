/**
 * film-form.js — Shared film add/edit modal logic.
 * Works on both index.html (grid) and movie.html (detail).
 * After a successful save, dispatches a 'film-saved' CustomEvent on document
 * so each page can react (re-render grid or reload detail).
 */

let editingId = null;

// ─── Open / Close ─────────────────────────────────────────────────────────────
function openFilmModal(movie = null) {
  editingId = movie ? movie.id : null;
  const modal     = document.getElementById('film-modal');
  const titleEl   = document.getElementById('film-modal-title');
  const submitBtn = document.getElementById('film-submit');

  titleEl.textContent   = movie ? 'Edit Film' : 'Add to the Archive';
  submitBtn.textContent = movie ? 'SAVE CHANGES' : 'ADD TO ARCHIVE';

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
}

function toggleWatchedFields() {
  const isWatched = document.querySelector('input[name="status"]:checked')?.value === 'watched';
  document.getElementById('rating-section').hidden = !isWatched;
  document.getElementById('review-section').hidden = !isWatched;
}

function resetFilmForm() {
  document.getElementById('film-id').value       = '';
  document.getElementById('film-title').value    = '';
  document.getElementById('film-year').value     = '';
  document.getElementById('film-director').value = '';
  document.getElementById('film-review').value   = '';
  document.getElementById('film-poster').value   = '';
  document.getElementById('film-rating').value   = '7';
  document.getElementById('rating-display').textContent = '7 / 10';
  document.getElementById('poster-preview-wrap').hidden = true;

  document.querySelectorAll('input[name="status"]').forEach(r => {
    r.checked = r.value === 'watched';
  });
  document.querySelectorAll('input[name="genre"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="streaming"]').forEach(cb => cb.checked = false);
}

function populateFilmForm(movie) {
  document.getElementById('film-id').value       = movie.id;
  document.getElementById('film-title').value    = movie.title    || '';
  document.getElementById('film-year').value     = movie.year     || '';
  document.getElementById('film-director').value = movie.director || '';
  document.getElementById('film-review').value   = movie.review   || '';
  document.getElementById('film-poster').value   = movie.posterUrl || '';

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
    rating:    isWatched ? parseFloat(document.getElementById('film-rating').value) : null,
    review:    isWatched ? document.getElementById('film-review').value.trim() || null : null,
    director:  document.getElementById('film-director').value.trim() || null,
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
