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
  try {
    localStorage.setItem(key, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function restoreBoard(board, mode, twoPlayer) {
  if (mode === "square" && Array.isArray(board)) {
    if (![6, 9, 12].includes(board.length)
      || !board.every(row => Array.isArray(row) && row.length === board.length)) return null;
    const converted = createEmptyBoard(board.length, "square");
    for (const [r, row] of board.entries()) {
      for (const [q, value] of row.entries()) converted.cells[`${q},${r}`] = value;
    }
    board = converted;
  }
  if (!isRecord(board)) return null;
  board = { ...board, type: board.type === undefined ? mode : board.type };
  if (board.type !== mode) return null;
  const size = mode === "hex" ? board.radius + 1 : board.size;
  if (!(mode === "hex" ? [4, 5, 6] : [6, 9, 12]).includes(size)) return null;
  const expectedCells = Object.keys(createEmptyBoard(size, mode).cells);
  if (!isRecord(board.cells) || Object.keys(board.cells).length !== expectedCells.length
    || !expectedCells.every(key => board.cells[key] === 0 || board.cells[key] === 1
      || (twoPlayer && board.cells[key] === 2))) return null;
  return board;
}

function restoreTray(tray, mode) {
  if (!Array.isArray(tray)) return null;
  const ids = new Set();
  const restored = [];
  for (const item of tray) {
    if (!isRecord(item) || typeof item.uid !== "string" || !item.uid || ids.has(item.uid)
      || typeof item.shapeId !== "string" || !item.shapeId || typeof item.used !== "boolean") return null;
    const rotation = item.rotation === undefined ? 0 : item.rotation;
    if (!isCount(rotation) || rotation >= (mode === "hex" ? 6 : 4)) return null;
    ids.add(item.uid);
    restored.push({ ...item, rotation });
  }
  return restored;
}

// Current positions and Undo entries must both be safe to render and play.
function restorePosition(entry, mode, twoPlayer) {
  if (!isRecord(entry)) return null;
  const board = restoreBoard(entry.board, mode, twoPlayer);
  const tray = restoreTray(entry.tray, mode);
  const score = entry.score === undefined ? 0 : entry.score;
  const streak = entry.streak === undefined ? 0 : entry.streak;
  const match = entry.match === undefined ? null : entry.match;
  if (twoPlayer && isRecord(match) && match.consecutivePasses === undefined) {
    match.consecutivePasses = match.emptyPasses;
    delete match.emptyPasses;
  }
  if (!board || !tray || !isCount(score) || !isCount(streak)
    || (twoPlayer ? !isValidMatch(match) : match !== null)) return null;
  return { board, tray, score, streak, match };
}

// Bad run metadata cannot grant score eligibility, but need not erase a game.
function restoreScoreRun(run, saved) {
  if (!isRecord(run) || run.version !== 1 || run.rulesVersion !== 2
    || typeof run.id !== "string" || !run.id || typeof run.defaultRules !== "boolean"
    || run.board !== saved.board.type || run.mode !== (saved.timedMode ? "time-trial" : "solo")
    || run.match !== (saved.aiOpponent ? "ai" : saved.match ? "two-player" : "solo")
    || !Number.isSafeInteger(run.finishedScore) || run.finishedScore < -1) return null;
  return run;
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
    if (!isRecord(saved)) return null;
    if (saved.saveVersion !== undefined && (!isCount(saved.saveVersion) || saved.saveVersion > SAVE_VERSION)) return null;
    if (saved.scoringVersion !== undefined && (!isCount(saved.scoringVersion) || saved.scoringVersion > 2)) return null;
    for (const field of ["gameOver", "aiOpponent", "timedMode", "timerStarted"]) {
      if (saved[field] === undefined) saved[field] = false;
      if (typeof saved[field] !== "boolean") return null;
    }
    if (saved.aiOpponent !== aiOpponent || (twoPlayer && saved.timedMode)
      || (saved.timerStarted && !saved.timedMode)) return null;
    if (saved.timeRemainingMs === undefined && !saved.timedMode) saved.timeRemainingMs = null;
    if ((saved.timedMode || saved.timeRemainingMs !== null)
      && (!Number.isFinite(saved.timeRemainingMs) || saved.timeRemainingMs < 0)) return null;
    if (saved.restoredTrayItemUid != null && typeof saved.restoredTrayItemUid !== "string") return null;
    const position = restorePosition(saved, mode, twoPlayer);
    if (!position) return null;
    Object.assign(saved, position);
    if (saved.history === undefined) saved.history = [];
    if (!Array.isArray(saved.history)) return null;
    const history = [];
    for (const entry of saved.history) {
      const previous = restorePosition(entry, mode, twoPlayer);
      if (!previous || previous.board.radius !== saved.board.radius || previous.board.size !== saved.board.size) return null;
      history.push(previous);
    }
    saved.history = history;
    saved.scoreRun = restoreScoreRun(saved.scoreRun, saved);
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
