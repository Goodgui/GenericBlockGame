(function () {
const { CONFIG, storageKeys, getBoardMode, createEmptyBoard, isValidMatch,
  findCompletedCells, clearCells, scorePlacement } = window.GenericBlockGame;
const SAVE_VERSION = 1;

// Reads the saved top score. Missing or invalid values become zero.
function loadBestScore(mode = getBoardMode()) {
  return Number(localStorage.getItem(storageKeys(mode).bestScoreKey)) || 0;
}

function saveBestScore(score, mode = getBoardMode()) {
  localStorage.setItem(storageKeys(mode).bestScoreKey, String(score));
  window.GenericBlockGame.notifyProfileChanged?.();
}

function loadModifiedBestScore(mode = getBoardMode()) {
  return Number(localStorage.getItem(storageKeys(mode).modifiedBestScoreKey)) || 0;
}

function saveModifiedBestScore(score, mode = getBoardMode()) {
  localStorage.setItem(storageKeys(mode).modifiedBestScoreKey, String(score));
  window.GenericBlockGame.notifyProfileChanged?.();
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
  window.GenericBlockGame.notifyProfileChanged?.();
}

// Save the game and recent moves for reload and Undo.
function saveGame(state) {
  const saved = {
    ...state,
    saveVersion: SAVE_VERSION,
    history: state.history.slice(-8),
  };

  const keys = storageKeys(state.board.type || "hex");
  const key = state.match ? (state.aiOpponent ? CONFIG.aiStorageKey : CONFIG.twoPlayerStorageKey) : keys.storageKey;
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

// Old timer saves could include cells whose points were already awarded.
// Repair only when the last move's score confirms that clear.
function finishSavedClear(saved) {
  if (saved.saveVersion !== undefined) return false;
  const previous = saved.history?.at(-1);
  const completed = findCompletedCells(saved.board);
  const streak = saved.match ? saved.match.streaks[saved.match.player] : saved.streak;
  if (!previous || !completed.zoneCount || !(streak > 0)) return false;
  const scored = scorePlacement(streak - 1, completed);
  if (!(scored.points > 0) || saved.score - previous.score !== scored.points) return false;
  clearCells(saved.board, completed.cells);
  return true;
}

// Restore each board's own game. Square mode never loads a match.
function loadGame(matchMode = false, mode = getBoardMode()) {
  const twoPlayer = Boolean(matchMode);
  const aiOpponent = matchMode === "ai";
  if (twoPlayer && mode !== "hex") return null;
  try {
    const key = twoPlayer ? (aiOpponent ? CONFIG.aiStorageKey : CONFIG.twoPlayerStorageKey) : storageKeys(mode).storageKey;
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.saveVersion > SAVE_VERSION) return null;
    if (Boolean(saved?.aiOpponent) !== aiOpponent) return null;

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
    if (finishSavedClear(saved)) {
      saved.saveVersion = SAVE_VERSION;
      saveGame(saved);
    }
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
  for (const key of [storageKeys("hex").storageKey, storageKeys("square").storageKey,
    CONFIG.twoPlayerStorageKey, CONFIG.aiStorageKey]) {
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
