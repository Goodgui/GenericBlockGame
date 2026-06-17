"use strict";

(function () {
const {
  CONFIG,
  randomShape,
  getConfiguredShapes,
  shapeById,
  shapeDimensions,
  rotateShape,
  canPlace,
  canPlaceAnywhere,
  clearCells,
  createEmptyBoard,
  fillShape,
  findCompletedCells,
  loadBestScore,
  loadModifiedBestScore,
  loadTimedBestScore,
  loadGame,
  saveBestScore,
  saveModifiedBestScore,
  saveTimedBestScore,
  saveGame,
  animateClear,
  buildBoard,
  clearPreview,
  elements,
  hideModal,
  makePiece,
  renderGame,
  renderPreview,
  showModal,
  initSettings,
  openSettings,
  loadPreferences,
  isDefaultPreferences,
  isDefaultTimedPreferences,
} = window.GenericBlockGame;

let activeTimed = loadPreferences().timeTrialEnabled;
let state = createInitialState(activeTimed);
let bestScore = loadBestScore();
let modifiedBestScore = loadModifiedBestScore();
let timedBestScore = loadTimedBestScore(false);
let timedModifiedBestScore = loadTimedBestScore(true);
let drag = null;
let timerInterval = null;
let lastTimerTick = 0;
let pendingClearCells = null;

function cellKey(row, col) {
  return `${row},${col}`;
}

// Creates all mutable values for a completely new game.
function createInitialState(timed = activeTimed) {
  const preferences = loadPreferences();
  const size = preferences.boardWidth;
  return {
    board: createEmptyBoard(size),
    score: 0,
    streak: 0,
    scoringVersion: 2,
    tray: [],
    history: [],
    gameOver: false,
    timedMode: timed,
    timerStarted: false,
    timeRemainingMs: timed ? preferences.timeTrialSeconds * 1000 : null,
  };
}

// Supplies renderGame with the current board-aware placement check.
function isShapePlaceable(shape) {
  if (!pendingClearCells) {
    return canPlaceAnywhere(state.board, shape, shapeDimensions(shape));
  }

  // During a clear animation, tray availability should reflect the board
  // after those cells disappear, avoiding a brief incorrect gray state.
  const projectedBoard = state.board.map(row => [...row]);
  clearCells(projectedBoard, pendingClearCells);
  return canPlaceAnywhere(projectedBoard, shape, shapeDimensions(shape));
}

function getPreviewClearCells(shape, originCol, originRow) {
  const previewBoard = state.board.map(row => [...row]);
  fillShape(previewBoard, shape, originCol, originRow);
  const completed = findCompletedCells(previewBoard);
  return completed.zoneCount ? completed.cells : null;
}

function render() {
  renderGame(state, activeBestScore(), activeBestScoreLabel(), isShapePlaceable, beginDrag);
  applyPreferences();
  renderTimer();
}

function settingsAreModified() {
  const preferences = loadPreferences();
  return activeTimed
    ? !isDefaultTimedPreferences(preferences)
    : !isDefaultPreferences(preferences);
}

function activeBestScore() {
  if (activeTimed) {
    return settingsAreModified() ? timedModifiedBestScore : timedBestScore;
  }
  return settingsAreModified() ? modifiedBestScore : bestScore;
}

function activeBestScoreLabel() {
  if (activeTimed) {
    return settingsAreModified() ? "Best timed score (modified)" : "Best timed score";
  }
  return settingsAreModified() ? "Best score (modified)" : "Best score";
}

// Settings affect controls immediately without resetting the current board.
function applyPreferences() {
  const preferences = loadPreferences();
  elements.undoButton.classList.toggle("setting-hidden", !preferences.undoEnabled);
  CONFIG.drag.baseLiftPx = preferences.dragInitialOffset;
  CONFIG.drag.maxExtraLiftPx = preferences.dragMovingOffset;
  CONFIG.drag.maxHorizontalOffsetPx = preferences.dragHorizontalOffset;
  CONFIG.drag.invalidMoveResistance = Math.max(0, preferences.snapOverlapMultiplier - 1);
  document.documentElement.style.setProperty("--piece-hue", preferences.pieceHue);
}

// Any setting change begins a clean run under the newly selected rules.
function restartForSettingsChange() {
  const preferences = loadPreferences();
  stopTimer();
  activeTimed = preferences.timeTrialEnabled;
  state = createInitialState(activeTimed);
  buildBoard(preferences.boardWidth);
  deliverTray();
}

// A new tray also becomes the earliest point that Undo may return to.
function deliverTray() {
  const traySize = loadPreferences().traySize;
  state.tray = Array.from({ length: traySize }, (_, index) => ({
    uid: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    shapeId: randomShape().id,
    rotation: Math.floor(Math.random() * 4),
    used: false,
  }));
  ensureTrayHasPlaceablePiece();
  state.history = [];
  render();
  elements.tray.classList.add("new-tray");
  window.setTimeout(() => elements.tray.classList.remove("new-tray"), 360);
  saveGame(state);
  checkGameOver();
}

function getPlaceableTrayItem(index) {
  const configuredShapes = getConfiguredShapes();
  const enabledShapes = configuredShapes.filter(shape => shape.enabled && shape.weight > 0);
  const pool = enabledShapes.length ? enabledShapes : configuredShapes;

  for (const shape of pool) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const rotatedShape = rotateShape(shape, rotation);
      if (canPlaceAnywhere(state.board, rotatedShape, shapeDimensions(rotatedShape))) {
        return {
          uid: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
          shapeId: shape.id,
          rotation,
          used: false,
        };
      }
    }
  }

  return null;
}

function ensureTrayHasPlaceablePiece() {
  const hasPlaceablePiece = state.tray.some(item => {
    const shape = rotateShape(shapeById(item.shapeId), item.rotation || 0);
    return canPlaceAnywhere(state.board, shape, shapeDimensions(shape));
  });
  if (hasPlaceablePiece) return;

  const placeableItem = getPlaceableTrayItem(0);
  if (placeableItem) state.tray[0] = placeableItem;
}

// Stores the exact state before a move so Undo can restore it.
function snapshot() {
  return {
    board: state.board.map(row => [...row]),
    score: state.score,
    streak: state.streak,
    tray: state.tray.map(item => ({ ...item })),
  };
}

function placePiece(item, shape, originCol, originRow) {
  if (activeTimed && !state.timerStarted) {
    state.timerStarted = true;
    startTimer();
  }
  state.history.push(snapshot());
  fillShape(state.board, shape, originCol, originRow);
  item.used = true;

  const completed = findCompletedCells(state.board);
  if (completed.zoneCount) {
    state.streak += 1;

    // Each zone is worth one point per square. Multiple zones also multiply
    // the clear, while consecutive scoring moves increase the streak.
    const gained = completed.pointValue * completed.zoneCount * state.streak;
    state.score += gained;
    // Show the entire newly placed shape before its completed cells animate out.
    pendingClearCells = completed.cells;
    render();
    animateClear(completed.cells, gained, state.board[0].length);
    // Keep filled cells visible until their removal animation completes.
    window.setTimeout(() => {
      clearCells(state.board, completed.cells);
      pendingClearCells = null;
      finishPlacement();
    }, 280);
  } else {
    state.streak = 0;
    finishPlacement();
  }

  updateBestScore();
  elements.score.textContent = state.score.toLocaleString();
  elements.bestScore.textContent = activeBestScore().toLocaleString();
  elements.bestScoreLabel.textContent = activeBestScoreLabel();
}

// Refresh placement checks only after any clear animation has completed.
function finishPlacement() {
  render();
  saveGame(state);
  if (state.gameOver) return;
  if (state.tray.every(piece => piece.used)) {
    window.setTimeout(deliverTray, 80);
  } else {
    checkGameOver();
  }
}

// Undo history is discarded whenever a new tray is delivered.
function undo() {
  const previous = state.history.pop();
  if (!previous) return;

  const remainingHistory = state.history;
  const restoredItem = previous.tray.find((item, index) => {
    const currentItem = state.tray[index];
    return !item.used && currentItem?.used;
  });
  state.board = previous.board;
  state.score = previous.score;
  state.streak = previous.streak;
  state.tray = previous.tray;
  state.history = remainingHistory;
  state.restoredTrayItemUid = restoredItem?.uid || null;
  state.gameOver = false;
  hideModal();
  render();
  elements.undoButton.classList.add("rewinding");
  window.setTimeout(() => {
    elements.undoButton.classList.remove("rewinding");
  }, 240);
  saveGame(state);
  startTimer();
}

function updateBestScore() {
  if (activeTimed && settingsAreModified()) {
    if (state.score > timedModifiedBestScore) {
      timedModifiedBestScore = state.score;
      saveTimedBestScore(timedModifiedBestScore, true);
    }
  } else if (activeTimed) {
    if (state.score > timedBestScore) {
      timedBestScore = state.score;
      saveTimedBestScore(timedBestScore, false);
    }
  } else if (settingsAreModified()) {
    if (state.score > modifiedBestScore) {
      modifiedBestScore = state.score;
      saveModifiedBestScore(modifiedBestScore);
    }
  } else if (state.score > bestScore) {
    bestScore = state.score;
    saveBestScore(bestScore);
  }
}

function checkGameOver() {
  const remaining = state.tray.filter(item => !item.used);
  const noMovesRemain = remaining.length
    && remaining.every(item => {
      const shape = rotateShape(shapeById(item.shapeId), item.rotation || 0);
      return !isShapePlaceable(shape);
    });

  if (!noMovesRemain) return;

  state.gameOver = true;
  stopTimer();
  showModal(
    "No more moves",
    `${activeBestScoreLabel()}: ${activeBestScore().toLocaleString()}`,
    "Play again",
    {
      gameOver: true,
      score: state.score,
      showUndo: loadPreferences().undoEnabled && state.history.length > 0,
    },
  );
  saveGame(state);
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderTimer() {
  elements.timerDisplay.hidden = !activeTimed;
  if (!activeTimed) return;
  elements.timerDisplay.textContent = formatTime(state.timeRemainingMs || 0);
  elements.timerDisplay.classList.toggle("ending", state.timeRemainingMs <= 30000);
}

function startTimer() {
  stopTimer();
  if (!activeTimed || !state.timerStarted || state.gameOver) {
    renderTimer();
    return;
  }

  lastTimerTick = Date.now();
  timerInterval = window.setInterval(() => {
    const now = Date.now();
    state.timeRemainingMs = Math.max(0, state.timeRemainingMs - (now - lastTimerTick));
    lastTimerTick = now;
    renderTimer();

    if (state.timeRemainingMs <= 0) {
      finishTimeTrial();
    } else if (Math.ceil(state.timeRemainingMs / 1000) % 5 === 0) {
      saveGame(state);
    }
  }, 250);
}

function stopTimer() {
  if (timerInterval) {
    state.timeRemainingMs = Math.max(
      0,
      state.timeRemainingMs - (Date.now() - lastTimerTick),
    );
    window.clearInterval(timerInterval);
  }
  timerInterval = null;
  renderTimer();
}

function finishTimeTrial() {
  stopTimer();
  cleanupDrag();
  state.timeRemainingMs = 0;
  state.gameOver = true;
  updateBestScore();
  render();
  showModal(
    "Time's up",
    `${activeBestScoreLabel()}: ${activeBestScore().toLocaleString()}`,
    "Play again",
    { gameOver: true, score: state.score, showUndo: false },
  );
  saveGame(state);
}

// Starts a drag from the entire large tray slot, not just the colored cells.
function beginDrag(event) {
  if (state.gameOver) return;
  if (drag || event.isPrimary === false) return;
  if (event.button !== undefined && event.button !== 0) return;

  const slot = event.currentTarget;
  const item = state.tray.find(piece => piece.uid === slot.dataset.uid);
  if (!item || item.used || slot.classList.contains("disabled")) return;

  event.preventDefault();
  try {
    slot.setPointerCapture(event.pointerId);
  } catch {
    // Window-level listeners below still keep the drag working if capture fails.
  }
  slot.classList.add("dragging");

  const shape = rotateShape(shapeById(item.shapeId), item.rotation || 0);
  const boardRect = elements.board.getBoundingClientRect();
  const boardSize = state.board.length;
  const cellSize = boardRect.width / boardSize;
  const piece = makePiece(shape, cellSize);
  const { width, height } = shapeDimensions(shape);
  const trayPiece = slot.querySelector(".piece");
  const trayPieceRect = trayPiece.getBoundingClientRect();
  const grabX = Math.max(
    0,
    Math.min(trayPieceRect.width, event.clientX - trayPieceRect.left),
  );
  const grabY = Math.max(
    0,
    Math.min(trayPieceRect.height, event.clientY - trayPieceRect.top),
  );

  elements.dragLayer.replaceChildren(...piece.childNodes);
  elements.dragLayer.style.width = `${width * cellSize}px`;
  elements.dragLayer.style.height = `${height * cellSize}px`;
  elements.dragLayer.classList.add("active");

  drag = {
    pointerId: event.pointerId,
    item,
    shape,
    slot,
    cellSize,
    startX: event.clientX,
    startY: event.clientY,
    grabRatioX: trayPieceRect.width ? grabX / trayPieceRect.width : 0.5,
    grabRatioY: trayPieceRect.height ? grabY / trayPieceRect.height : 0.5,
    trayPieceRect,
    layerWidth: width * cellSize,
    layerHeight: height * cellSize,
    layerLeft: 0,
    layerTop: 0,
    originCol: null,
    originRow: null,
    valid: false,
    boardSize,
  };

  updateDrag(event);
  window.addEventListener("pointermove", updateDrag, { passive: false });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", cancelDrag);
}

// The lift grows smoothly from baseLiftPx to baseLiftPx + maxExtraLiftPx.
function liftForPointer(pointerY) {
  const movedUp = Math.max(0, drag.startY - pointerY);
  const progress = Math.min(1, movedUp / CONFIG.drag.extraLiftDistancePx);
  return CONFIG.drag.baseLiftPx + progress * CONFIG.drag.maxExtraLiftPx;
}

function updateDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();

  const { width, height } = shapeDimensions(drag.shape);
  const lift = liftForPointer(event.clientY);
  const movedX = event.clientX - drag.startX;
  const horizontalProgress = Math.min(
    1,
    Math.abs(movedX) / CONFIG.drag.extraLiftDistancePx,
  );
  const horizontalOffset = Math.sign(movedX)
    * CONFIG.drag.maxHorizontalOffsetPx
    * horizontalProgress;
  const pieceWidth = width * drag.cellSize;
  const pieceHeight = height * drag.cellSize;
  const left = event.clientX + horizontalOffset - pieceWidth * drag.grabRatioX;
  const top = event.clientY - lift - pieceHeight * drag.grabRatioY;
  drag.layerLeft = left;
  drag.layerTop = top;
  elements.dragLayer.style.transform = `translate3d(${left}px, ${top}px, 0)`;

  // Snap the lifted piece's center to the nearest board-cell origin.
  const boardRect = elements.board.getBoundingClientRect();
  const centerX = left + (width * drag.cellSize) / 2;
  const centerY = top + (height * drag.cellSize) / 2;
  const rawCol = (centerX - boardRect.left) / drag.cellSize - width / 2;
  const rawRow = (centerY - boardRect.top) / drag.cellSize - height / 2;
  const candidateCol = Math.round(rawCol);
  const candidateRow = Math.round(rawRow);
  const candidateIsValid = canPlace(
    state.board,
    drag.shape,
    candidateCol,
    candidateRow,
  );

  // Hold the previous valid origin when the nearest snap point is invalid.
  // Normal snapping changes at half a cell; resistance extends that boundary.
  if (drag.valid && !candidateIsValid) {
    const resistance = Math.max(0, CONFIG.drag.invalidMoveResistance);
    const colDistance = Math.abs(rawCol - drag.originCol);
    const rowDistance = Math.abs(rawRow - drag.originRow);
    const releaseDistance = 0.5 + resistance;

    if (colDistance < releaseDistance && rowDistance < releaseDistance) {
      drag.previewClearCells = getPreviewClearCells(drag.shape, drag.originCol, drag.originRow);
      elements.dragLayer.classList.remove("invalid");
      renderPreview(drag);
      return;
    }
  }

  drag.originCol = candidateCol;
  drag.originRow = candidateRow;
  drag.valid = candidateIsValid;
  drag.previewClearCells = drag.valid
    ? getPreviewClearCells(drag.shape, drag.originCol, drag.originRow)
    : null;

  elements.dragLayer.classList.toggle("invalid", !drag.valid);
  renderPreview(drag);
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  const completedDrag = drag;
  if (completedDrag.valid) {
    cleanupDrag();
    placePiece(
      completedDrag.item,
      completedDrag.shape,
      completedDrag.originCol,
      completedDrag.originRow,
    );
  } else {
    returnDragToTray();
  }
}

function cancelDrag(event) {
  if (event?.pointerId !== undefined && drag && event.pointerId !== drag.pointerId) return;
  returnDragToTray();
}

function detachDragListeners() {
  if (!drag) return;
  window.removeEventListener("pointermove", updateDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", cancelDrag);
}

function cleanupDrag() {
  if (!drag) return;
  detachDragListeners();
  drag.slot.classList.remove("dragging");
  elements.dragLayer.classList.remove("active", "invalid");
  elements.dragLayer.classList.remove("returning");
  elements.dragLayer.style.transformOrigin = "";
  elements.dragLayer.replaceChildren();
  clearPreview();
  drag = null;
}

function returnDragToTray() {
  if (!drag) return;
  const returningDrag = drag;
  detachDragListeners();
  clearPreview();
  elements.dragLayer.classList.remove("invalid");
  elements.dragLayer.classList.add("returning");

  const targetLeft = returningDrag.trayPieceRect.left;
  const targetTop = returningDrag.trayPieceRect.top;
  const scaleX = returningDrag.trayPieceRect.width / returningDrag.layerWidth;
  const scaleY = returningDrag.trayPieceRect.height / returningDrag.layerHeight;
  elements.dragLayer.style.transformOrigin = "top left";
  elements.dragLayer.style.transform = `translate3d(${targetLeft}px, ${targetTop}px, 0) scale(${scaleX}, ${scaleY})`;

  window.setTimeout(() => {
    if (drag !== returningDrag) return;
    cleanupDrag();
  }, 50);
}

function openResetModal() {
  showModal(
    activeTimed ? "Restart time trial?" : "Restart game?",
    activeTimed
      ? "Your timed board, score, and countdown will restart."
      : "Your current board and score will be replaced with a fresh game.",
    "Restart",
  );
}

function startNewGame() {
  stopTimer();
  hideModal();
  const hasFilledCells = state.board.some(row => row.some(Boolean));
  if (hasFilledCells) {
    const cells = new Set();
    state.board.forEach((row, rowIndex) => {
      row.forEach((filled, colIndex) => {
        if (filled) cells.add(cellKey(rowIndex, colIndex));
      });
    });
    animateClear(cells, 0, state.board.length);
    window.setTimeout(resetGameState, 280);
  } else {
    resetGameState();
  }
}

function resetGameState() {
  state = createInitialState(activeTimed);
  deliverTray();
}

// Fullscreen must be started from a direct button interaction in most browsers.
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Some embedded and mobile browsers expose the API but reject the request.
  }
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  elements.fullscreenButton.classList.toggle("is-fullscreen", isFullscreen);
  elements.fullscreenButton.setAttribute(
    "aria-label",
    isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
  );
  elements.fullscreenButton.title = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
}

elements.undoButton.addEventListener("click", undo);
elements.resetButton.addEventListener("click", openResetModal);
elements.settingsButton.addEventListener("click", openSettings);
elements.modalButton.addEventListener("click", startNewGame);
elements.modalUndoButton.addEventListener("click", undo);
elements.fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
window.addEventListener("blur", cancelDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelDrag();
});

// Prevent browser selection, native dragging, long-press menus, and right click.
document.addEventListener("contextmenu", event => event.preventDefault());
document.addEventListener("selectstart", event => event.preventDefault());
document.addEventListener("dragstart", event => event.preventDefault());

if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
  elements.fullscreenButton.classList.add("unsupported");
}

initSettings({
  onChange: restartForSettingsChange,
  onAccessibilityChange: applyPreferences,
  onResetBest: () => {
    bestScore = 0;
    modifiedBestScore = 0;
    timedBestScore = 0;
    timedModifiedBestScore = 0;
    saveBestScore(0);
    saveModifiedBestScore(0);
    saveTimedBestScore(0, false);
    saveTimedBestScore(0, true);
    elements.bestScore.textContent = "0";
  },
});

// A saved board is restored only when it belongs to the selected mode.
const savedState = loadGame();
if (savedState?.tray?.length && savedState.timedMode === activeTimed) {
  state = { ...createInitialState(activeTimed), ...savedState };
  if (savedState.scoringVersion !== 2) {
    state.streak = 0;
    state.scoringVersion = 2;
    saveGame(state);
  }
  buildBoard(state.board.length);
  render();
  if (state.gameOver) {
    showModal(
      activeTimed && state.timeRemainingMs <= 0 ? "Time's up" : "No more moves",
      `${activeBestScoreLabel()}: ${activeBestScore().toLocaleString()}`,
      "Play again",
      { gameOver: true, score: state.score, showUndo: false },
    );
  } else {
    hideModal();
    if (state.timerStarted) startTimer();
  }
} else {
  buildBoard(state.board.length);
  render();
}
}());
