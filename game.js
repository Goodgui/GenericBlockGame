"use strict";

(function () {
const {
  CONFIG,
  cloneBoard,
  getBoardMode,
  setBoardMode,
  getBoardSide,
  getBoardDimensions,
  boardPoint,
  boardCellAt,
  placementDistance,
  rotationCount,
  resetAllScores,
  resetSavedGames,
  randomShape,
  getConfiguredShapes,
  shapeById,
  shapeDimensions,
  rotateShape,
  canPlace,
  canPlaceAnywhere,
  clearCells,
  createEmptyBoard,
  createMatch,
  cloneMatch,
  recordMatchPlacement,
  endMatchTurn,
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
  hideModal: hideModalView,
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

let activeTimed = loadPreferences().timeTrialEnabled && !loadPreferences().twoPlayerEnabled;
let state = createInitialState(activeTimed);
let bestScore = loadBestScore();
let modifiedBestScore = loadModifiedBestScore();
let timedBestScore = loadTimedBestScore(false);
let timedModifiedBestScore = loadTimedBestScore(true);
let drag = null;
let timerInterval = null;
let lastTimerTick = 0;
let pendingClearCells = null;
let placementPending = false;
let boardChangeId = 0;
let modalAction = startNewGame;

function hideModal() {
  hideModalView();
  modalAction = startNewGame;
}

// Creates all mutable values for a completely new game.
function createInitialState(timed = activeTimed) {
  const preferences = loadPreferences();
  const size = preferences.boardSide;
  return {
    board: createEmptyBoard(size),
    score: 0,
    streak: 0,
    scoringVersion: 2,
    tray: [],
    history: [],
    gameOver: false,
    match: preferences.twoPlayerEnabled ? createMatch() : null,
    timedMode: timed,
    timerStarted: false,
    timeRemainingMs: timed ? preferences.timeTrialSeconds * 1000 : null,
  };
}

// Supplies renderGame with the current board-aware placement check.
function isShapePlaceable(shape) {
  if (!pendingClearCells) {
    return canPlaceAnywhere(state.board, shape);
  }

  // During a clear animation, tray availability should reflect the board
  // after those cells disappear, avoiding a brief incorrect gray state.
  const projectedBoard = cloneBoard(state.board);
  clearCells(projectedBoard, pendingClearCells);
  return canPlaceAnywhere(projectedBoard, shape);
}

function getPreviewClearCells(shape, originQ, originR) {
  const previewBoard = cloneBoard(state.board);
  fillShape(previewBoard, shape, originQ, originR);
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
  document.documentElement.style.setProperty("--piece-hue",
    state.match ? (state.match.player === 0 ? 0 : 212) : preferences.pieceHue);
  elements.passButton.hidden = !state.match;
  elements.passButton.disabled = placementPending || Boolean(drag) || state.gameOver;
}

// Any setting change begins a clean run under the newly selected rules.
function restartForSettingsChange() {
  const preferences = loadPreferences();
  cleanupDrag();
  boardChangeId += 1;
  placementPending = false;
  pendingClearCells = null;
  stopTimer();
  activeTimed = preferences.timeTrialEnabled && !preferences.twoPlayerEnabled;
  state = createInitialState(activeTimed);
  hideModal();
  buildBoard(preferences.boardSide);
  deliverTray();
}

function refreshBestScores() {
  bestScore = loadBestScore();
  modifiedBestScore = loadModifiedBestScore();
  timedBestScore = loadTimedBestScore(false);
  timedModifiedBestScore = loadTimedBestScore(true);
}

function switchBoardMode(mode) {
  if (mode === getBoardMode()) return;
  cleanupDrag();
  stopTimer();
  boardChangeId += 1;
  if (pendingClearCells) clearCells(state.board, pendingClearCells);
  pendingClearCells = null;
  placementPending = false;
  if (state.tray.length) saveGame(state);
  setBoardMode(mode);
  refreshBestScores();
  const preferences = loadPreferences();
  activeTimed = preferences.timeTrialEnabled && !preferences.twoPlayerEnabled;
  state = createInitialState(activeTimed);
  restoreCurrentGame(false);
}

// A new tray also becomes the earliest point that Undo may return to.
function deliverTray() {
  const traySize = loadPreferences().traySize;
  state.tray = Array.from({ length: traySize }, (_, index) => ({
    uid: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    shapeId: randomShape().id,
    rotation: Math.floor(Math.random() * rotationCount()),
    used: false,
  }));
  ensureTrayHasPlaceablePiece();
  state.history = [];
  state.restoredTrayItemUid = null;
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
    for (let rotation = 0; rotation < rotationCount(); rotation += 1) {
      const rotatedShape = rotateShape(shape, rotation);
      if (canPlaceAnywhere(state.board, rotatedShape)) {
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
    return canPlaceAnywhere(state.board, shape);
  });
  if (hasPlaceablePiece) return;

  const placeableItem = getPlaceableTrayItem(0);
  if (placeableItem) state.tray[0] = placeableItem;
}

// Stores the exact state before a move so Undo can restore it.
function snapshot() {
  return {
    board: cloneBoard(state.board),
    score: state.score,
    streak: state.streak,
    tray: state.tray.map(item => ({ ...item })),
    match: cloneMatch(state.match),
  };
}

function placePiece(item, shape, originQ, originR) {
  placementPending = true;
  const changeId = boardChangeId;
  if (activeTimed && !state.timerStarted) {
    state.timerStarted = true;
    startTimer();
  }
  state.history.push(snapshot());
  fillShape(state.board, shape, originQ, originR, state.match ? state.match.player + 1 : 1);
  item.used = true;

  const completed = findCompletedCells(state.board);
  const matchPoints = state.match ? recordMatchPlacement(state.match, completed) : 0;
  if (completed.zoneCount) {
    state.streak += 1;

    // Each line or chunk is worth one point per cell. Multiple clears multiply
    // the clear, while consecutive scoring moves increase the streak.
    const gained = state.match ? matchPoints : completed.pointValue * completed.zoneCount * state.streak;
    state.score += gained;
    // Show the entire newly placed shape before its completed cells animate out.
    pendingClearCells = completed.cells;
    render();
    animateClear(completed.cells, gained);
    // Keep filled cells visible until their removal animation completes.
    window.setTimeout(() => {
      if (changeId !== boardChangeId) return;
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
  if (state.gameOver) { placementPending = false; return; }
  if (state.tray.every(piece => piece.used)) {
    const changeId = boardChangeId;
    window.setTimeout(() => {
      if (changeId !== boardChangeId) return;
      placementPending = false;
      if (state.match) endMatchTurn(state.match);
      deliverTray();
    }, 80);
  } else {
    placementPending = false;
    applyPreferences();
    checkGameOver();
  }
}

// Undo history is discarded whenever a new tray is delivered.
function undo() {
  if (placementPending || drag) return;
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
  state.match = cloneMatch(previous.match);
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
  if (state.match) return;
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
  if (state.match) return;
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

function showMatchResult() {
  const [red, blue] = state.match.scores;
  const result = red === blue ? "It's a draw" : red > blue ? "Red wins" : "Blue wins";
  modalAction = startNewGame;
  showModal(result, `Red: ${red.toLocaleString()} points. Blue: ${blue.toLocaleString()} points.`,
    "Play again", { gameOver: true, match: true });
}

function passTurn() {
  if (!state.match || state.gameOver || placementPending || drag) return;
  hideModal();
  state.gameOver = endMatchTurn(state.match, true);
  state.history = [];
  if (state.gameOver) {
    render();
    showMatchResult();
    saveGame(state);
  } else {
    deliverTray();
  }
}

function requestPass() {
  if (!state.match || state.gameOver || placementPending || drag) return;
  const canStillPlace = state.tray.some(item => !item.used
    && isShapePlaceable(rotateShape(shapeById(item.shapeId), item.rotation || 0)));
  if (!canStillPlace) {
    passTurn();
    return;
  }
  const player = state.match.player === 0 ? "Red" : "Blue";
  modalAction = passTurn;
  const endsMatch = state.match.consecutivePasses === 1;
  showModal(`${player}, pass?`,
    `You can still place a piece. Discard the rest of this tray and end your turn?${endsMatch ? " This pass will end the game." : ""}`,
    "Pass", { showCancel: true });
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
  if (state.gameOver || placementPending) return;
  if (drag || event.isPrimary === false) return;
  if (event.button !== undefined && event.button !== 0) return;
  if (elements.modal.classList.contains("is-open")) return;

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
  const boardSize = getBoardDimensions(state.board);
  const cellSize = boardRect.width / boardSize.width;
  const piece = makePiece(shape, cellSize);
  const { width, height, minX, minY } = shapeDimensions(shape);
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
    anchorX: -minX * cellSize,
    anchorY: -minY * cellSize,
    startX: event.clientX,
    startY: event.clientY,
    grabRatioX: trayPieceRect.width ? grabX / trayPieceRect.width : 0.5,
    grabRatioY: trayPieceRect.height ? grabY / trayPieceRect.height : 0.5,
    trayPieceRect,
    layerWidth: width * cellSize,
    layerHeight: height * cellSize,
    layerLeft: 0,
    layerTop: 0,
    originQ: null,
    originR: null,
    valid: false,
  };

  applyPreferences();

  updateDrag(event);
  window.addEventListener("pointermove", updateDrag, { passive: false });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", cancelDrag);
}

// The lift grows smoothly from baseLiftPx to baseLiftPx + maxExtraLiftPx.
function liftForPointer(pointerY) {
  const movedUp = Math.max(0, drag.startY - pointerY);
  const progress = Math.min(1, movedUp / CONFIG.drag.extraLiftDistancePx);
  const lift = CONFIG.drag.baseLiftPx + progress * CONFIG.drag.maxExtraLiftPx;
  // Keep the bottom of the board within reach on a short landscape screen.
  const roomBelowBoard = document.documentElement.clientHeight - elements.board.getBoundingClientRect().bottom - 4;
  return window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches
    ? Math.min(lift, 24, Math.max(0, roomBelowBoard))
    : lift;
}

function snapDragToCell(boardRect) {
  const point = boardPoint(state.board, drag.originQ, drag.originR, drag.cellSize);
  const left = boardRect.left + boardRect.width / 2 + point.x - drag.anchorX;
  const top = boardRect.top + boardRect.height / 2 + point.y - drag.anchorY;
  elements.dragLayer.style.transform = `translate3d(${left}px, ${top}px, 0)`;
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

  // Snap the anchor to a cell center in the current grid.
  const boardRect = elements.board.getBoundingClientRect();
  const anchorX = left + drag.anchorX - boardRect.left - boardRect.width / 2;
  const anchorY = top + drag.anchorY - boardRect.top - boardRect.height / 2;
  const candidate = boardCellAt(state.board, anchorX, anchorY, drag.cellSize);
  const candidateIsValid = canPlace(
    state.board,
    drag.shape,
    candidate.q,
    candidate.r,
  );

  // Hold the previous valid origin when the nearest snap point is invalid.
  // Normal snapping changes at half a cell; resistance extends that boundary.
  if (drag.valid && !candidateIsValid) {
    const resistance = Math.max(0, CONFIG.drag.invalidMoveResistance);
    const distance = placementDistance(state.board, candidate.rawQ - drag.originQ, candidate.rawR - drag.originR);
    const releaseDistance = 0.5 + resistance;

    if (distance < releaseDistance) {
      snapDragToCell(boardRect);
      drag.previewClearCells = getPreviewClearCells(drag.shape, drag.originQ, drag.originR);
      elements.dragLayer.classList.remove("invalid");
      renderPreview(drag);
      return;
    }
  }

  drag.originQ = candidate.q;
  drag.originR = candidate.r;
  drag.valid = candidateIsValid;
  drag.previewClearCells = drag.valid
    ? getPreviewClearCells(drag.shape, drag.originQ, drag.originR)
    : null;

  elements.dragLayer.classList.toggle("invalid", !drag.valid);
  if (drag.valid) {
    snapDragToCell(boardRect);
  }
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
      completedDrag.originQ,
      completedDrag.originR,
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
  applyPreferences();
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
  if (placementPending || drag) return;
  modalAction = startNewGame;
  showModal(
    activeTimed ? "Restart time trial?" : "Restart game?",
    activeTimed
      ? "Your timed board, score, and countdown will restart."
      : state.match ? "Restart the board and both scores? Red will start."
        : "Your current board and score will be replaced with a fresh game.",
    "Restart",
    { showCancel: true },
  );
}

function startNewGame() {
  if (placementPending) return;
  cleanupDrag();
  stopTimer();
  hideModal();
  const cells = new Set(Object.keys(state.board.cells).filter(key => state.board.cells[key]));
  const hasFilledCells = cells.size > 0;
  if (hasFilledCells) {
    placementPending = true;
    const changeId = boardChangeId;
    animateClear(cells, 0);
    window.setTimeout(() => { if (changeId === boardChangeId) resetGameState(); }, 280);
  } else {
    resetGameState();
  }
}

function resetGameState() {
  placementPending = false;
  pendingClearCells = null;
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
elements.passButton.addEventListener("click", requestPass);
elements.resetButton.addEventListener("click", openResetModal);
elements.settingsButton.addEventListener("click", openSettings);
elements.modalButton.addEventListener("click", () => modalAction());
elements.modalCancelButton.addEventListener("click", () => {
  hideModal();
  elements.passButton.focus();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.modalCancelButton.hidden) hideModal();
});
elements.modalUndoButton.addEventListener("click", undo);
elements.fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
window.addEventListener("blur", cancelDrag);
window.addEventListener("resize", () => {
  cleanupDrag();
  if (!placementPending) render();
});
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
  onBoardChange: switchBoardMode,
  onClose: () => { if (state.gameOver) showCurrentResult(); },
  onResetSettings: () => {
    resetSavedGames();
    restartForSettingsChange();
  },
  onAccessibilityChange: applyPreferences,
  onResetBest: () => {
    resetAllScores();
    refreshBestScores();
    elements.bestScore.textContent = "0";
  },
});

function showCurrentResult() {
  if (state.match) {
    showMatchResult();
    return;
  }
  showModal(
    activeTimed && state.timeRemainingMs <= 0 ? "Time's up" : "No more moves",
    `${activeBestScoreLabel()}: ${activeBestScore().toLocaleString()}`,
    "Play again",
    { gameOver: true, score: state.score, showUndo: loadPreferences().undoEnabled && state.history.length > 0 },
  );
}

// Each board restores its own saved game when its tab becomes active.
function restoreCurrentGame(showWelcome) {
  const preferences = loadPreferences();
  const savedState = loadGame(Boolean(preferences.twoPlayerEnabled));
  if (savedState?.tray?.length && savedState.timedMode === activeTimed
    && getBoardSide(savedState.board) === preferences.boardSide) {
    state = { ...createInitialState(activeTimed), ...savedState };
    if (savedState.scoringVersion !== 2) {
      state.streak = 0;
      state.scoringVersion = 2;
      saveGame(state);
    }
    buildBoard(getBoardSide(state.board));
    render();
    if (state.gameOver) {
      if (showWelcome) showCurrentResult();
      else hideModal();
    } else {
      hideModal();
      if (state.tray.every(item => item.used)) {
        placementPending = true;
        finishPlacement();
      }
      if (state.timerStarted) startTimer();
    }
  } else {
    buildBoard(getBoardSide(state.board));
    if (showWelcome) render();
    else {
      hideModal();
      deliverTray();
    }
  }
}

restoreCurrentGame(true);
}());
