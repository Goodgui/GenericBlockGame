(function () {
const { CONFIG, storageKeys, getBoardMode, createEmptyBoard, isValidMatch } = window.GenericBlockGame;

// Reads the saved top score. Missing or invalid values become zero.
function loadBestScore(mode = getBoardMode()) {
  return Number(localStorage.getItem(storageKeys(mode).bestScoreKey)) || 0;
}

function saveBestScore(score, mode = getBoardMode()) {
  localStorage.setItem(storageKeys(mode).bestScoreKey, String(score));
}

function loadModifiedBestScore(mode = getBoardMode()) {
  return Number(localStorage.getItem(storageKeys(mode).modifiedBestScoreKey)) || 0;
}

function saveModifiedBestScore(score, mode = getBoardMode()) {
  localStorage.setItem(storageKeys(mode).modifiedBestScoreKey, String(score));
}

function loadTimedBestScore(modified = false, mode = getBoardMode()) {
  const keys = storageKeys(mode);
  const key = modified ? keys.timedModifiedBestScoreKey : keys.timedBestScoreKey;
  return Number(localStorage.getItem(key)) || 0;
}

function saveTimedBestScore(score, modified = false, mode = getBoardMode()) {
  const keys = storageKeys(mode);
  const key = modified ? keys.timedModifiedBestScoreKey : keys.timedBestScoreKey;
  localStorage.setItem(key, String(score));
}

// Save the game and recent moves for reload and Undo.
function saveGame(state) {
  const saved = {
    ...state,
    history: state.history.slice(-8),
  };

  const keys = storageKeys(state.board.type || "hex");
  const key = state.match ? CONFIG.twoPlayerStorageKey : keys.storageKey;
  localStorage.setItem(key, JSON.stringify(saved));
}

function restoreBoard(board, mode) {
  if (mode === "square" && Array.isArray(board)) {
    const converted = createEmptyBoard(board.length, "square");
    if (!board.every(row => Array.isArray(row) && row.length === board.length)) return null;
    for (const [r, row] of board.entries()) {
      for (const [q, value] of row.entries()) converted.cells[`${q},${r}`] = value;
    }
    return converted;
  }
  return board ? { ...board, type: board.type || mode } : null;
}

// Restore each board's own game. Square mode never loads a match.
function loadGame(twoPlayer = false, mode = getBoardMode()) {
  if (twoPlayer && mode !== "hex") return null;
  try {
    const key = twoPlayer ? CONFIG.twoPlayerStorageKey : storageKeys(mode).storageKey;
    const saved = JSON.parse(localStorage.getItem(key));

    // Keep games and Undo states saved before the pass rule changed.
    if (twoPlayer) {
      for (const entry of [saved, ...(saved?.history || [])]) {
        if (entry?.match && entry.match.consecutivePasses === undefined) {
          entry.match.consecutivePasses = entry.match.emptyPasses;
          delete entry.match.emptyPasses;
        }
      }
    }
    if (twoPlayer ? !isValidMatch(saved?.match) : saved?.match) return null;

    const board = restoreBoard(saved?.board, mode);
    if (!board || board.type !== mode) return null;
    const size = mode === "hex" ? board.radius + 1 : board.size;
    if (!(mode === "hex" ? [4, 5, 6] : [6, 9, 12]).includes(size)) return null;
    const expectedCells = Object.keys(createEmptyBoard(size, mode).cells);
    const cells = board.cells;
    if (!cells || Object.keys(cells).length !== expectedCells.length
      || !expectedCells.every(key => cells[key] === 0 || cells[key] === 1
        || (twoPlayer && cells[key] === 2))) return null;

    saved.board = board;
    for (const entry of saved.history || []) entry.board = restoreBoard(entry.board, mode);
    return saved;
  } catch {
    return null;
  }
}

function resetAllScores() {
  for (const mode of ["hex", "square"]) {
    saveBestScore(0, mode);
    saveModifiedBestScore(0, mode);
    saveTimedBestScore(0, false, mode);
    saveTimedBestScore(0, true, mode);
  }
}

function resetSavedGames() {
  for (const key of [storageKeys("hex").storageKey, storageKeys("square").storageKey, CONFIG.twoPlayerStorageKey]) {
    localStorage.setItem(key, "null");
  }
}

Object.assign(window.GenericBlockGame, {
  resetAllScores,
  resetSavedGames,
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
