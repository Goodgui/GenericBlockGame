(function () {
const { CONFIG, createEmptyBoard } = window.GenericBlockGame;

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

// Save the game and recent moves for reload and Undo.
function saveGame(state) {
  const saved = {
    ...state,
    history: state.history.slice(-8),
  };

  localStorage.setItem(CONFIG.storageKey, JSON.stringify(saved));
}

// Hex saves use their own key, leaving square games intact.
function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));

    const radius = saved?.board?.radius;
    if (![3, 4, 5].includes(radius)) return null;
    const expectedCells = Object.keys(createEmptyBoard(radius + 1).cells);
    const cells = saved.board.cells;
    if (!cells || Object.keys(cells).length !== expectedCells.length
      || !expectedCells.every(key => cells[key] === 0 || cells[key] === 1)) return null;

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
