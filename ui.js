(function () {
const { CONFIG, shapeById, shapeDimensions, rotateShape } = window.GenericBlockGame;

// Shared DOM references are kept together so game logic stays readable.
const elements = {
  board: document.querySelector("#board"),
  tray: document.querySelector("#tray"),
  score: document.querySelector("#score"),
  timerDisplay: document.querySelector("#timerDisplay"),
  bestScore: document.querySelector("#bestScore"),
  bestScoreLabel: document.querySelector("#bestScoreLabel"),
  undoButton: document.querySelector("#undoButton"),
  resetButton: document.querySelector("#resetButton"),
  settingsButton: document.querySelector("#settingsButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalText: document.querySelector("#modalText"),
  modalScore: document.querySelector("#modalScore"),
  modalButton: document.querySelector("#modalButton"),
  modalUndoButton: document.querySelector("#modalUndoButton"),
  dragLayer: document.querySelector("#dragLayer"),
  scoreBurst: document.querySelector("#scoreBurst"),
};

// Builds the board once. Later renders only toggle cell classes.
function buildBoard(size) {
  const fragment = document.createDocumentFragment();
  elements.board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  elements.board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  elements.board.setAttribute("aria-label", `${size} by ${size} game board`);

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("role", "gridcell");

      if ((col + 1) % 3 === 0 && col < size - 1) {
        cell.classList.add("block-right");
      }
      if (col % 3 === 0 && col > 0) {
        cell.classList.add("block-left");
      }
      if ((row + 1) % 3 === 0 && row < size - 1) {
        cell.classList.add("block-bottom");
      }
      if (row % 3 === 0 && row > 0) {
        cell.classList.add("block-top");
      }
      if ((Math.floor(row / 3) + Math.floor(col / 3)) % 2 === 0) {
        cell.classList.add("box-tint");
      }

      fragment.append(cell);
    }
  }

  elements.board.replaceChildren(fragment);
}

// Creates a visual piece at either tray size or full board-cell size.
function makePiece(shape, cellSize) {
  const { width, height } = shapeDimensions(shape);
  const piece = document.createElement("div");
  piece.className = "piece";
  piece.style.width = `${width * cellSize}px`;
  piece.style.height = `${height * cellSize}px`;

  for (const [x, y] of shape.cells) {
    const cell = document.createElement("i");
    cell.className = "piece-cell";
    cell.dataset.shapeX = x;
    cell.dataset.shapeY = y;
    cell.style.left = `${x * cellSize}px`;
    cell.style.top = `${y * cellSize}px`;
    cell.style.width = `${cellSize}px`;
    cell.style.height = `${cellSize}px`;
    piece.append(cell);
  }

  return piece;
}

// Redraws scores, occupied cells, and the current tray.
// The callback lets the controller attach pointer behavior to each tray slot.
function renderGame(state, bestScore, bestScoreLabel, isShapePlaceable, onPointerDown) {
  const height = state.board.length;
  const width = state.board[0]?.length || 0;
  [...elements.board.children].forEach((cell, index) => {
    const row = Math.floor(index / width);
    const col = index % width;
    cell.classList.toggle("filled", Boolean(state.board[row][col]));
    cell.classList.remove("preview-valid", "preview-invalid", "preview-clear", "clearing");
  });

  elements.tray.replaceChildren();
  const trayColumns = Math.min(state.tray.length, 4);
  elements.tray.style.gridTemplateColumns = `repeat(${Math.max(1, trayColumns)}, 1fr)`;
  elements.tray.classList.toggle("dense-tray", state.tray.length > 3);
  for (const item of state.tray) {
    const slot = document.createElement("div");
    const shape = rotateShape(shapeById(item.shapeId), item.rotation || 0);
    const placeable = !item.used && isShapePlaceable(shape);
    slot.className = "tray-slot";
    slot.dataset.uid = item.uid;
    slot.style.padding = `${CONFIG.pickupAreaPadding}px`;
    if (item.uid === state.restoredTrayItemUid) slot.classList.add("restored-piece");

    if (item.used) slot.classList.add("used");
    if (!item.used && !placeable) slot.classList.add("disabled");
    if (!item.used) slot.append(makePiece(shape, CONFIG.trayCellSize));

    slot.addEventListener("pointerdown", onPointerDown);
    elements.tray.append(slot);
  }

  elements.score.textContent = state.score.toLocaleString();
  elements.bestScore.textContent = bestScore.toLocaleString();
  elements.bestScoreLabel.textContent = bestScoreLabel;
  elements.undoButton.disabled = state.history.length === 0;
  delete state.restoredTrayItemUid;
}

// Shows green or red board cells beneath the currently dragged shape.
function renderPreview(drag) {
  clearPreview();
  if (!drag) return;
  for (const [x, y] of drag.shape.cells) {
    const col = drag.originCol + x;
    const row = drag.originRow + y;
    if (row < 0 || row >= drag.boardSize || col < 0 || col >= drag.boardSize) continue;

    const cell = elements.board.children[row * drag.boardSize + col];
    cell.classList.add(drag.valid ? "preview-valid" : "preview-invalid");
  }

  if (!drag.previewClearCells) return;
  for (const key of drag.previewClearCells) {
    const [row, col] = key.split(",").map(Number);
    const cell = elements.board.children[row * drag.boardSize + col];
    if (cell?.classList.contains("filled") || cell?.classList.contains("preview-valid")) {
      cell.classList.add("preview-clear");
    }
  }
  renderDragLayerClearPreview(drag);
}

function clearPreview() {
  document.querySelectorAll(".preview-valid,.preview-invalid,.preview-clear").forEach(cell => {
    cell.classList.remove("preview-valid", "preview-invalid", "preview-clear");
  });
  elements.dragLayer.querySelectorAll(".drag-preview-clear").forEach(cell => {
    cell.classList.remove("drag-preview-clear");
  });
}

function renderDragLayerClearPreview(drag) {
  const clearCells = drag.previewClearCells;
  if (!clearCells) return;
  const clearKeys = new Set(clearCells);
  elements.dragLayer.querySelectorAll(".piece-cell").forEach(cell => {
    const row = drag.originRow + Number(cell.dataset.shapeY);
    const col = drag.originCol + Number(cell.dataset.shapeX);
    if (clearKeys.has(`${row},${col}`)) cell.classList.add("drag-preview-clear");
  });
}

// Runs the board clear and floating score effects.
function animateClear(completed, gained, boardWidth) {
  for (const key of completed) {
    const [row, col] = key.split(",").map(Number);
    elements.board.children[row * boardWidth + col].classList.add("clearing");
  }

  if (gained > 0) {
    elements.scoreBurst.textContent = `+${gained}`;
    elements.scoreBurst.classList.remove("show");
    void elements.scoreBurst.offsetWidth;
    elements.scoreBurst.classList.add("show");
  }
}

function showModal(title, text, buttonText, options = {}) {
  elements.modalTitle.textContent = title;
  elements.modalText.textContent = text;
  elements.modalButton.textContent = buttonText;
  elements.modal.classList.toggle("game-over-modal", Boolean(options.gameOver));
  elements.modalScore.hidden = !options.gameOver;
  elements.modalScore.textContent = Number(options.score || 0).toLocaleString();
  elements.modalUndoButton.hidden = !options.showUndo;
  elements.modal.classList.add("is-open");
}

function hideModal() {
  elements.modal.classList.remove("is-open");
  elements.modal.classList.remove("game-over-modal");
  elements.modalUndoButton.hidden = true;
}

Object.assign(window.GenericBlockGame, {
  elements,
  buildBoard,
  makePiece,
  renderGame,
  renderPreview,
  clearPreview,
  animateClear,
  showModal,
  hideModal,
});
}());
