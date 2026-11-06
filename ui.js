(function () {
const {
  CONFIG, shapeById, shapeDimensions, rotateShape, createEmptyBoard, boardChunks,
  hexKey, hexToPixel, boardDimensions, HEX_HEIGHT,
  getBoardMode, getBoardDimensions, shapePoint, cellHeight,
} = window.GenericBlockGame;
const boardCells = new Map();

// Shared DOM references are kept together so game logic stays readable.
const elements = {
  board: document.querySelector("#board"),
  boardLabel: document.querySelector("#boardLabel"),
  tray: document.querySelector("#tray"),
  score: document.querySelector("#score"),
  timerDisplay: document.querySelector("#timerDisplay"),
  bestScore: document.querySelector("#bestScore"),
  bestScoreLabel: document.querySelector("#bestScoreLabel"),
  undoButton: document.querySelector("#undoButton"),
  passButton: document.querySelector("#passButton"),
  soloScore: document.querySelector("#soloScore"),
  bestScorePanel: document.querySelector("#bestScorePanel"),
  matchScoreboard: document.querySelector("#matchScoreboard"),
  redScore: document.querySelector("#redScore"),
  blueScore: document.querySelector("#blueScore"),
  redPlayer: document.querySelector("#redPlayer"),
  bluePlayer: document.querySelector("#bluePlayer"),
  turnStatus: document.querySelector("#turnStatus"),
  resetButton: document.querySelector("#resetButton"),
  settingsButton: document.querySelector("#settingsButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modalTitle"),
  modalText: document.querySelector("#modalText"),
  modalScore: document.querySelector("#modalScore"),
  modalButton: document.querySelector("#modalButton"),
  modalUndoButton: document.querySelector("#modalUndoButton"),
  modalCancelButton: document.querySelector("#modalCancelButton"),
  dragLayer: document.querySelector("#dragLayer"),
  scoreBurst: document.querySelector("#scoreBurst"),
};

// Place cell centers on the hex grid, with no square cells behind the board.
function buildHexGrid(container, side, makeCell) {
  const board = createEmptyBoard(side, "hex");
  const { width, height } = boardDimensions(side);
  const fragment = document.createDocumentFragment();
  container.style.aspectRatio = `${width} / ${height}`;
  for (const key of Object.keys(board.cells)) {
    const [q, r] = key.split(",").map(Number);
    const center = hexToPixel(q, r);
    const cell = makeCell(q, r, key);
    cell.style.left = `${(center.x + (width - 1) / 2) / width * 100}%`;
    cell.style.top = `${(center.y + (height - HEX_HEIGHT) / 2) / height * 100}%`;
    cell.style.width = `${100 / width}%`;
    cell.style.height = `${HEX_HEIGHT / height * 100}%`;
    fragment.append(cell);
  }
  container.replaceChildren(fragment);
}

function buildSquareGrid(container, size, makeCell) {
  const fragment = document.createDocumentFragment();
  container.style.aspectRatio = "1";
  for (let r = 0; r < size; r += 1) {
    for (let q = 0; q < size; q += 1) {
      const cell = makeCell(q, r, hexKey(q, r));
      cell.style.left = `${q / size * 100}%`;
      cell.style.top = `${r / size * 100}%`;
      cell.style.width = `${100 / size}%`;
      cell.style.height = `${100 / size}%`;
      fragment.append(cell);
    }
  }
  container.replaceChildren(fragment);
}

function buildBoard(side) {
  boardCells.clear();
  const board = createEmptyBoard(side);
  const square = board.type === "square";
  document.body.classList.toggle("square-mode", square);
  elements.boardLabel.textContent = square ? "Square" : "Hex";
  document.querySelector(".game-shell").setAttribute("aria-label", `${square ? "Square" : "Hex"} block puzzle game`);
  elements.modalText.textContent = square
    ? "Fit square pieces. Clear full rows, columns, or outlined 3 by 3 groups."
    : "Fit hex pieces. Clear full lines in three directions or an outlined seven-hex group. Edge cells outside the groups clear through lines.";
  const build = square ? buildSquareGrid : buildHexGrid;
  build(elements.board, side, (q, r, key) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.q = q;
    cell.dataset.r = r;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${square ? "Square" : "Hex"} ${q}, ${r}`);
    boardCells.set(key, cell);
    return cell;
  });
  elements.board.setAttribute("aria-label", square ? `Square board, ${side} by ${side}, ${boardCells.size} cells`
    : `Hexagon board, ${side} cells per edge, ${boardCells.size} cells`);
  drawChunkOutlines(board, side);
}

// Draw only the outside edges of each fixed group, above the cell fills.
function drawChunkOutlines(board, side) {
  const svgNS = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(svgNS, "svg");
  const { width, height } = getBoardDimensions(board);
  overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  overlay.setAttribute("class", "chunk-outlines");
  overlay.setAttribute("aria-hidden", "true");
  const directions = [[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]];
  const chunks = boardChunks(board);
  chunks.forEach((chunk, index) => {
    const members = new Set(chunk.cells);
    if (board.type === "square") {
      for (const key of chunk.cells) {
        boardCells.get(key).dataset.chunk = chunk.center;
        boardCells.get(key).classList.add(index % 2 ? "chunk-tint-a" : "chunk-tint-b");
      }
      const [q, r] = chunk.center.split(",").map(Number);
      const outline = document.createElementNS(svgNS, "path");
      outline.dataset.center = chunk.center;
      outline.setAttribute("d", `M${q - 1},${r - 1}h3v3h-3Z`);
      overlay.append(outline);
      return;
    }
    let path = "";
    for (const key of chunk.cells) {
      boardCells.get(key).dataset.chunk = chunk.center;
      boardCells.get(key).classList.add(index % 2 ? "chunk-tint-a" : "chunk-tint-b");
      const [q, r] = key.split(",").map(Number);
      const center = hexToPixel(q, r);
      for (let edge = 0; edge < 6; edge += 1) {
        const [dq, dr] = directions[edge];
        if (members.has(hexKey(q + dq, r + dr))) continue;
        const points = [edge, edge + 1].map(corner => {
          const angle = (corner * 60 - 90) * Math.PI / 180;
          const x = center.x + width / 2 + Math.cos(angle) / Math.sqrt(3);
          const y = center.y + height / 2 + Math.sin(angle) / Math.sqrt(3);
          return `${x},${y}`;
        });
        path += `M${points[0]}L${points[1]}`;
      }
    }
    const outline = document.createElementNS(svgNS, "path");
    outline.dataset.center = chunk.center;
    outline.setAttribute("d", path);
    overlay.append(outline);
  });
  elements.board.append(overlay);
}

// Creates a visual piece at either tray size or full board-cell size.
function makePiece(shape, cellSize) {
  const { width, height, minX, minY } = shapeDimensions(shape);
  const tileHeight = cellHeight();
  const piece = document.createElement("div");
  piece.className = "piece";
  piece.style.width = `${width * cellSize}px`;
  piece.style.height = `${height * cellSize}px`;

  for (const [q, r] of shape.cells) {
    const center = shapePoint(q, r);
    const cell = document.createElement("i");
    cell.className = "piece-cell";
    cell.dataset.shapeQ = q;
    cell.dataset.shapeR = r;
    cell.style.left = `${(center.x - minX - 0.5) * cellSize}px`;
    cell.style.top = `${(center.y - minY - tileHeight / 2) * cellSize}px`;
    cell.style.width = `${cellSize}px`;
    cell.style.height = `${tileHeight * cellSize}px`;
    piece.append(cell);
  }

  return piece;
}

// Redraws scores, occupied cells, and the current tray.
// The callback lets the controller attach pointer behavior to each tray slot.
function renderGame(state, bestScore, bestScoreLabel, isShapePlaceable, onPointerDown) {
  boardCells.forEach((cell, key) => {
    cell.classList.toggle("filled", Boolean(state.board.cells[key]));
    cell.dataset.player = state.match && state.board.cells[key]
      ? (state.board.cells[key] === 1 ? "red" : "blue") : "";
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
    if (!item.used) {
      const { width, height } = shapeDimensions(shape);
      const slotWidth = (elements.tray.clientWidth || 300) / Math.max(1, trayColumns);
      const cellSize = Math.min(CONFIG.trayCellSize, (slotWidth - 12) / width, 82 / height);
      slot.append(makePiece(shape, cellSize));
    }

    slot.addEventListener("pointerdown", onPointerDown);
    elements.tray.append(slot);
  }

  elements.score.textContent = state.score.toLocaleString();
  elements.bestScore.textContent = bestScore.toLocaleString();
  elements.bestScoreLabel.textContent = bestScoreLabel;
  elements.undoButton.disabled = state.history.length === 0;
  elements.soloScore.hidden = Boolean(state.match);
  elements.bestScorePanel.hidden = Boolean(state.match);
  elements.matchScoreboard.hidden = !state.match;
  if (state.match) {
    elements.redScore.textContent = state.match.scores[0].toLocaleString();
    elements.blueScore.textContent = state.match.scores[1].toLocaleString();
    elements.redPlayer.classList.toggle("active-player", state.match.player === 0 && !state.gameOver);
    elements.bluePlayer.classList.toggle("active-player", state.match.player === 1 && !state.gameOver);
    const player = state.match.player === 0 ? "Red" : "Blue";
    const noMoves = state.tray.some(item => !item.used)
      && !state.tray.some(item => !item.used && isShapePlaceable(rotateShape(shapeById(item.shapeId), item.rotation || 0)));
    elements.turnStatus.textContent = state.gameOver ? "Both players passed in a row."
      : `${player}'s turn${noMoves ? ". No pieces fit. Pass to end your turn." : ""}`;
  }
  delete state.restoredTrayItemUid;
}

// Shows green or red board cells beneath the currently dragged shape.
function renderPreview(drag) {
  clearPreview();
  if (!drag) return;
  for (const [q, r] of drag.shape.cells) {
    const cell = boardCells.get(hexKey(drag.originQ + q, drag.originR + r));
    cell?.classList.add(drag.valid ? "preview-valid" : "preview-invalid");
  }

  if (!drag.previewClearCells) return;
  for (const key of drag.previewClearCells) {
    const cell = boardCells.get(key);
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
    const q = drag.originQ + Number(cell.dataset.shapeQ);
    const r = drag.originR + Number(cell.dataset.shapeR);
    if (clearKeys.has(hexKey(q, r))) cell.classList.add("drag-preview-clear");
  });
}

// Runs the board clear and floating score effects.
function animateClear(completed, gained) {
  for (const key of completed) {
    boardCells.get(key)?.classList.add("clearing");
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
  elements.modalScore.hidden = !options.gameOver || Boolean(options.match);
  elements.modalScore.textContent = Number(options.score || 0).toLocaleString();
  elements.modalUndoButton.hidden = !options.showUndo;
  elements.modalCancelButton.hidden = !options.showCancel;
  elements.modal.classList.add("is-open");
  if (options.showCancel) elements.modalCancelButton.focus();
}

function hideModal() {
  elements.modal.classList.remove("is-open");
  elements.modal.classList.remove("game-over-modal");
  elements.modalUndoButton.hidden = true;
  elements.modalCancelButton.hidden = true;
}

Object.assign(window.GenericBlockGame, {
  elements,
  buildBoard,
  buildHexGrid,
  buildSquareGrid,
  makePiece,
  renderGame,
  renderPreview,
  clearPreview,
  animateClear,
  showModal,
  hideModal,
});
}());
