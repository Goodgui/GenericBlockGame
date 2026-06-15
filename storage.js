(function () {
const { CONFIG } = window.GenericBlockGame;

// Reads the saved top score. Missing or invalid values become zero.
function loadBestScore() {
  return Number(localStorage.getItem(CONFIG.bestScoreKey)) || 0;
}

function saveBestScore(score) {
  localStorage.setItem(CONFIG.bestScoreKey, String(score));
}

function loadModifiedBestScore() {
  return Number(localStorage.getItem(CONFIG.modifiedBestScoreKey)) || 0;
}

function saveModifiedBestScore(score) {
  localStorage.setItem(CONFIG.modifiedBestScoreKey, String(score));
}

function loadTimedBestScore(modified = false) {
  const key = modified ? CONFIG.timedModifiedBestScoreKey : CONFIG.timedBestScoreKey;
  return Number(localStorage.getItem(key)) || 0;
}

function saveTimedBestScore(score, modified = false) {
  const key = modified ? CONFIG.timedModifiedBestScoreKey : CONFIG.timedBestScoreKey;
  localStorage.setItem(key, String(score));
}

// Saves both to localStorage and the current browser history entry.
function saveGame(state) {
  const saved = {
    ...state,
    history: state.history.slice(-8),
  };

  localStorage.setItem(CONFIG.storageKey, JSON.stringify(saved));
}

// Browser history is preferred, with localStorage as a reload fallback.
function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));

    const height = saved?.board?.length || 0;
    const width = saved?.board?.[0]?.length || 0;
    const validBoard = Array.isArray(saved?.board)
      && [6, 9, 12].includes(height)
      && width === height
      && saved.board.every(row => Array.isArray(row) && row.length === width);
    if (!validBoard) {
      return null;
    }

    return saved;
  } catch {
    return null;
  }
}

Object.assign(window.GenericBlockGame, {
  loadBestScore,
  saveBestScore,
  loadModifiedBestScore,
  saveModifiedBestScore,
  loadTimedBestScore,
  saveTimedBestScore,
  saveGame,
  loadGame,
});
}());
