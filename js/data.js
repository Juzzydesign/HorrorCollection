/**
 * data.js — Movie collection storage via localStorage
 *
 * On first load the collection is seeded from movies.js (your static file).
 * After that, localStorage is the live source of truth — add, edit, and
 * delete operations all persist across page refreshes.
 *
 * To reset the collection back to the movies.js defaults, open the console and run:
 *   localStorage.removeItem('horror_archive_movies')
 *   location.reload()
 */

const MOVIES_KEY         = 'horror_archive_movies';
const DATA_VERSION_KEY   = 'horror_archive_data_version';

// ─── Init ─────────────────────────────────────────────────────────────────────
// Seed localStorage from movies.js on first visit, or whenever DATA_VERSION changes.
function initData() {
  const storedVersion = localStorage.getItem(DATA_VERSION_KEY);
  if (!localStorage.getItem(MOVIES_KEY) || storedVersion !== DATA_VERSION) {
    localStorage.setItem(MOVIES_KEY, JSON.stringify(MOVIES));
    localStorage.setItem(DATA_VERSION_KEY, DATA_VERSION);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────
function getMovies() {
  initData();
  try {
    return JSON.parse(localStorage.getItem(MOVIES_KEY)) || [];
  } catch {
    return [];
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────
function _saveMovies(movies) {
  localStorage.setItem(MOVIES_KEY, JSON.stringify(movies));
}

// Add a new movie. Returns the saved movie object (with its assigned id).
function addMovie(movieData) {
  const movies = getMovies();
  const maxId  = movies.reduce((max, m) => Math.max(max, m.id || 0), 0);
  const movie  = { ...movieData, id: maxId + 1 };
  movies.push(movie);
  _saveMovies(movies);
  return movie;
}

// Update an existing movie by id. Returns the updated object, or null if not found.
function updateMovie(id, changes) {
  const movies = getMovies();
  const idx    = movies.findIndex(m => m.id === id);
  if (idx === -1) return null;
  movies[idx] = { ...movies[idx], ...changes };
  _saveMovies(movies);
  return movies[idx];
}

// Delete a movie by id.
function deleteMovie(id) {
  _saveMovies(getMovies().filter(m => m.id !== id));
}
