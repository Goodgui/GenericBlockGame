(function () {
const {
  CONFIG, shapeById, shapeDimensions, rotateShape, createEmptyBoard, boardChunks,
  hexKey, hexToPixel, boardDimensions, HEX_HEIGHT,
  getBoardMode, getBoardDimensions, shapePoint, cellHeight,
  matchPlayerColor,
} = window.GenericBlockGame;
const boardCells = new Map();
const sectionEdges = [];
let trayUids = [];
let trayBatchUids = [];
let trayOffset = 0;
let trayVertical = false;
const trayMotions = new Map();
const trayFixedColumns = new Map();
const HEX_DIRECTIONS = [[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]];
const SQUARE_DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]];

// Shared DOM references are kept together so game logic stays readable.
const elements = {
  board: document.querySelector("#board"),
  tray: document.querySelector("#tray"),
  trayPreviousButton: document.querySelector("#trayPreviousButton"),
  trayNextButton: document.querySelector("#trayNextButton"),
  score: document.querySelector("#score"),
  timerDisplay: document.querySelector("#timerDisplay"),
  bestScore: document.querySelector("#bestScore"),
  bestScoreLabel: document.querySelector("#bestScoreLabel"),
  saveStatus: document.querySelector("#saveStatus"),
  undoButton: document.querySelector("#undoButton"),
  passButton: document.querySelector("#passButton"),
  continueButton: document.querySelector("#continueButton"),
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
  settingsPanel: document.querySelector("#settingsPanel"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  modal: document.querySelector("#modal"),
  changelogModal: document.querySelector("#changelogModal"),
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
  sectionEdges.length = 0;
  const board = createEmptyBoard(side);
  const square = board.type === "square";
  const { width, height } = getBoardDimensions(board);
  document.querySelector(".game-shell").style.setProperty("--board-aspect", width / height);
  document.body.classList.toggle("square-mode", square);
  document.querySelector(".game-shell").setAttribute("aria-label", `${square ? "Square" : "Hex"} block puzzle game`);
  elements.modalText.textContent = square
    ? "Fit square pieces. Clear full rows, columns, or outlined 3 by 3 groups."
    : `Fit hex pieces. Clear full lines in three directions or an outlined group.${side === 4
      ? " Outer groups have five cells. The center group has seven."
      : side === 6 ? " Outer groups have six cells. Inner groups have seven. Other edge cells clear through lines."
        : " Groups have seven cells. Other edge cells clear through lines."}`;
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
  drawBoardFrame(board);
  drawChunkOutlines(board);
}

function hexCorners(board, key) {
  const { width, height } = getBoardDimensions(board);
  const [q, r] = key.split(",").map(Number);
  const center = hexToPixel(q, r);
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (corner * 60 - 90) * Math.PI / 180;
    const x = center.x + width / 2 + Math.cos(angle) / Math.sqrt(3);
    const y = center.y + height / 2 + Math.sin(angle) / Math.sqrt(3);
    return `${Number(x.toFixed(6))},${Number(y.toFixed(6))}`;
  });
}

function hexBoundary(board, members) {
  const edges = new Map();
  for (const key of members) {
    const [q, r] = key.split(",").map(Number);
    const points = hexCorners(board, key);
    for (const [edge, [dq, dr]] of HEX_DIRECTIONS.entries()) {
      if (!members.has(hexKey(q + dq, r + dr))) edges.set(points[edge], points[(edge + 1) % 6]);
    }
  }
  let path = "";
  while (edges.size) {
    const start = edges.keys().next().value;
    let current = start;
    path += `M${start}`;
    do {
      const next = edges.get(current);
      edges.delete(current);
      if (next === start) path += "Z";
      else path += `L${next}`;
      current = next;
    } while (current !== start && edges.has(current));
  }
  return path;
}

function boardOverlay(board, className) {
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const { width, height } = getBoardDimensions(board);
  overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  overlay.setAttribute("class", className);
  overlay.setAttribute("aria-hidden", "true");
  return overlay;
}

function drawBoardFrame(board) {
  const overlay = boardOverlay(board, "board-frame");
  const square = board.type === "square";
  const border = square ? `M0,0H${board.size}V${board.size}H0Z` : hexBoundary(board, new Set(Object.keys(board.cells)));
  const surface = square ? border : Object.keys(board.cells).map(key => `M${hexCorners(board, key).join("L")}Z`).join("");
  for (const [className, path] of [["frame-edge", border], ["frame-rim", border], ["frame-grid", surface]]) {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute("class", className);
    shape.setAttribute("d", path);
    overlay.append(shape);
  }
  elements.board.append(overlay);
}

// Reserve a wider gap at group edges. Borders stay below the cell fills.
function insetHexCell(key, members) {
  const [q, r] = key.split(",").map(Number);
  const gaps = HEX_DIRECTIONS.map(([dq, dr]) => !members.has(hexKey(q + dq, r + dr)) ? 1.5 : 0.5);
  const [a, b, c, d, e, f] = gaps;
  const root = Math.sqrt(3);
  const corners = [[50, 0, f - a, (f + a) / root], [100, 25, -b, (2 * a - b) / root],
    [100, 75, -b, (b - 2 * c) / root], [50, 100, d - c, -(c + d) / root],
    [0, 75, e, (e - 2 * d) / root], [0, 25, e, (2 * f - e) / root]];
  const points = corners.map(([x, y, dx, dy]) => `calc(${x}% + ${dx}px) calc(${y}% + ${dy}px)`);
  boardCells.get(key).style.setProperty("--cell-fill-points", `polygon(${points.join(",")})`);
}

function sectionShades(chunks, directions, shadeCount) {
  const sections = chunks.map(chunk => chunk.cells);
  const owners = new Map(sections.flatMap((cells, index) => cells.map(key => [key, index])));
  // Give each connected patch outside the clear groups its own shade.
  for (const start of boardCells.keys()) {
    if (owners.has(start)) continue;
    const index = sections.length;
    const cells = [start];
    owners.set(start, index);
    for (let cursor = 0; cursor < cells.length; cursor += 1) {
      const [q, r] = cells[cursor].split(",").map(Number);
      for (const [dq, dr] of directions) {
        const key = hexKey(q + dq, r + dr);
        if (!boardCells.has(key) || owners.has(key)) continue;
        owners.set(key, index);
        cells.push(key);
      }
    }
    sections.push(cells);
  }
  const neighbors = sections.map(() => new Set());
  sections.forEach((cells, index) => {
    for (const key of cells) {
      const [q, r] = key.split(",").map(Number);
      for (const [dq, dr] of directions) {
        const other = owners.get(hexKey(q + dq, r + dr));
        if (other !== undefined && other !== index) neighbors[index].add(other);
      }
    }
  });
  const order = sections.map((_, index) => index).sort((a, b) => neighbors[b].size - neighbors[a].size || a - b);
  const shades = sections.map(() => -1);
  function assign(position) {
    if (position === order.length) return true;
    const index = order[position];
    const used = new Set([...neighbors[index]].map(other => shades[other]));
    for (let choice = 0; choice < shadeCount; choice += 1) {
      const shade = (index + choice) % shadeCount;
      if (used.has(shade)) continue;
      shades[index] = shade;
      if (assign(position + 1)) return true;
    }
    shades[index] = -1;
    return false;
  }
  if (!assign(0)) throw new Error(`Board sections need more than ${shadeCount} background shades`);
  return new Map(sections.flatMap((cells, index) => cells.map(key => [key, shades[index]])));
}

function insetSquareCell(key, members) {
  const [q, r] = key.split(",").map(Number);
  for (const [index, side] of ["top", "right", "bottom", "left"].entries()) {
    const [dq, dr] = SQUARE_DIRECTIONS[index];
    boardCells.get(key).style.setProperty(`--cell-inset-${side}`, members.has(hexKey(q + dq, r + dr)) ? "0.5px" : "1.5px");
  }
}

function updateSectionOutlines(board) {
  for (const edge of sectionEdges) {
    edge.path.dataset.filled = String(Boolean(board.cells[edge.cell] && board.cells[edge.neighbor]));
  }
}

// Draw the clear groups between the cells, below both empty and placed fills.
function drawChunkOutlines(board) {
  const svgNS = "http://www.w3.org/2000/svg";
  const overlay = boardOverlay(board, "chunk-outlines");
  const chunks = boardChunks(board);
  if (board.type !== "square") {
    const ungrouped = new Set(boardCells.keys());
    for (const chunk of chunks) for (const key of chunk.cells) ungrouped.delete(key);
    for (const key of ungrouped) insetHexCell(key, ungrouped);
  }
  const directions = board.type === "square" ? SQUARE_DIRECTIONS : HEX_DIRECTIONS;
  const shades = sectionShades(chunks, directions, board.type === "square" ? 2 : 3);
  for (const [key, shade] of shades) boardCells.get(key).dataset.sectionShade = String(shade);
  const drawn = new Set();
  chunks.forEach(chunk => {
    const members = new Set(chunk.cells);
    for (const key of chunk.cells) {
      const cell = boardCells.get(key);
      cell.dataset.chunk = chunk.center;
      if (board.type === "square") insetSquareCell(key, members);
      else insetHexCell(key, members);
      const [q, r] = key.split(",").map(Number);
      const points = board.type === "square" ? [`${q},${r}`, `${q + 1},${r}`, `${q + 1},${r + 1}`, `${q},${r + 1}`]
        : hexCorners(board, key);
      for (const [edge, [dq, dr]] of directions.entries()) {
        const neighbor = hexKey(q + dq, r + dr);
        if (members.has(neighbor)) continue;
        const pair = [key, neighbor].sort().join("|");
        if (drawn.has(pair)) continue;
        drawn.add(pair);
        const outline = document.createElementNS(svgNS, "path");
        outline.dataset.cell = key;
        outline.dataset.neighbor = neighbor;
        outline.dataset.filled = "false";
        outline.setAttribute("d", `M${points[edge]}L${points[(edge + 1) % points.length]}`);
        overlay.append(outline);
        sectionEdges.push({ cell: key, neighbor, path: outline });
      }
    }
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

function shiftTray(steps, animate = true) {
  const columns = 3;
  const limit = Math.max(0, trayUids.length - columns);
  trayOffset = Math.max(0, Math.min(limit, trayOffset + steps));
  if (!animate) elements.tray.classList.add("tray-still");
  elements.tray.dataset.offset = trayOffset;
  elements.tray.dataset.limit = limit;
  elements.tray.style.transform = `translate${trayVertical ? "Y" : "X"}(calc(${-trayOffset * 100 / columns}% - ${trayOffset * 3 / columns}px))`;
  elements.trayPreviousButton.setAttribute("aria-label", `Shift tray ${trayVertical ? "up" : "left"} one piece`);
  elements.trayNextButton.setAttribute("aria-label", `Shift tray ${trayVertical ? "down" : "right"} one piece`);
  elements.trayPreviousButton.hidden = trayOffset === 0;
  elements.trayNextButton.hidden = trayOffset === limit;
  elements.trayPreviousButton.disabled = trayOffset === 0;
  elements.trayNextButton.disabled = trayOffset === limit;
  if (!animate) {
    void elements.tray.offsetWidth;
    elements.tray.classList.remove("tray-still");
  }
}

function revealTrayItem(uid, animate = true) {
  const index = trayUids.indexOf(uid);
  if (index < 0) return;
  if (index < trayOffset) shiftTray(index - trayOffset, animate);
  else if (index >= trayOffset + 3) shiftTray(index - trayOffset - 2, animate);
}

function renderTray(state, aiTurn, isShapePlaceable, onPointerDown) {
  const vertical = Boolean(window.matchMedia?.("(orientation: landscape) and (max-height: 500px)").matches);
  const batchUids = state.tray.map(item => item.uid);
  const sameTray = batchUids.length === trayBatchUids.length
    && batchUids.every((uid, index) => uid === trayBatchUids[index]);
  const slots = new Map([...elements.tray.children].map(slot => [slot.dataset.uid, slot]));
  const previousCenters = new Map();
  if (sameTray && vertical === trayVertical) {
    for (const [uid, slot] of slots) {
      const piece = slot.querySelector(".piece");
      if (!piece) continue;
      const bounds = piece.getBoundingClientRect();
      previousCenters.set(uid, vertical ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2);
    }
  }
  for (const motion of trayMotions.values()) motion.cancel();
  trayMotions.clear();
  trayVertical = vertical;
  if (!sameTray) {
    trayOffset = 0;
    trayFixedColumns.clear();
  }
  trayBatchUids = batchUids;
  const remaining = state.tray.filter(item => !item.used);
  trayUids = remaining.map(item => item.uid);
  const trayColumns = 3;
  if (remaining.length > 3) trayFixedColumns.clear();
  else if (!trayFixedColumns.size) {
    // Keep the last three positions through placements, Undo, and reload.
    let fixedRow = remaining;
    for (const previous of state.history) {
      const row = previous.tray?.filter(item => !item.used) || [];
      if (row.length <= 3 && row.length > fixedRow.length) fixedRow = row;
    }
    const columns = fixedRow.length === 1 ? [2] : fixedRow.length === 2 ? [1, 3] : [1, 2, 3];
    fixedRow.forEach((item, index) => trayFixedColumns.set(item.uid, columns[index]));
  }
  elements.tray.style.setProperty("--tray-columns", trayColumns);
  for (const [uid, slot] of slots) {
    if (!trayUids.includes(uid)) slot.remove();
  }
  remaining.forEach((item, index) => {
    const slot = slots.get(item.uid) || document.createElement("div");
    const shape = rotateShape(shapeById(item.shapeId), item.rotation || 0);
    slot.className = "tray-slot";
    slot.dataset.uid = item.uid;
    const placeable = isShapePlaceable(shape);
    slot.setAttribute("aria-disabled", String(aiTurn || !placeable));
    slot.classList.toggle("disabled", !placeable);
    slot.classList.toggle("restored-piece", item.uid === state.restoredTrayItemUid);
    slot.style.padding = `${CONFIG.pickupAreaPadding}px`;
    const position = remaining.length <= 3 ? String(trayFixedColumns.get(item.uid)) : "auto";
    slot.style.gridColumn = vertical ? "1" : position;
    slot.style.gridRow = vertical ? position : "auto";
    const { width, height } = shapeDimensions(shape);
    const slotWidth = (elements.tray.clientWidth || 300) / (vertical ? 1 : trayColumns);
    const pieceHeight = vertical ? ((elements.tray.clientHeight || 300) - 6) / trayColumns - 12 : 82;
    const cellSize = Math.max(1, Math.min(CONFIG.trayCellSize, (slotWidth - 12) / width, pieceHeight / height));
    const shapeKey = `${item.shapeId}:${item.rotation || 0}`;
    if (!slots.has(item.uid) || slot.dataset.shape !== shapeKey || Number(slot.dataset.cellSize) !== cellSize) {
      slot.replaceChildren(makePiece(shape, cellSize));
      slot.dataset.shape = shapeKey;
      slot.dataset.cellSize = cellSize;
    }
    if (!slots.has(item.uid)) slot.addEventListener("pointerdown", onPointerDown);
    if (elements.tray.children[index] !== slot) elements.tray.insertBefore(slot, elements.tray.children[index] || null);
  });
  // Place the slots first, then slide each piece from its old spot.
  shiftTray(0, false);
  revealTrayItem(state.restoredTrayItemUid, false);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  for (const slot of elements.tray.children) {
    const before = previousCenters.get(slot.dataset.uid);
    const piece = slot.querySelector(".piece");
    if (before === undefined || !piece?.animate) continue;
    const bounds = piece.getBoundingClientRect();
    const distance = before - (vertical ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2);
    if (Math.abs(distance) < 0.5) continue;
    const axis = vertical ? "Y" : "X";
    const motion = piece.animate([{ transform: `translate${axis}(${distance}px)` }, { transform: `translate${axis}(0)` }],
      { duration: 220, easing: "ease-out" });
    trayMotions.set(slot.dataset.uid, motion);
    motion.onfinish = () => { if (trayMotions.get(slot.dataset.uid) === motion) trayMotions.delete(slot.dataset.uid); };
  }
}

// Redraws scores, occupied cells, and the current tray.
// The callback lets the controller attach pointer behavior to each tray slot.
function renderGame(state, bestScore, bestScoreLabel, isShapePlaceable, onPointerDown) {
  const aiTurn = Boolean(state.aiOpponent && state.match?.player === 1 && !state.gameOver);
  elements.tray.setAttribute("aria-busy", String(aiTurn));
  boardCells.forEach((cell, key) => {
    cell.classList.toggle("filled", Boolean(state.board.cells[key]));
    cell.dataset.player = state.match && state.board.cells[key]
      ? matchPlayerColor(state, state.board.cells[key] - 1) : "";
    cell.classList.remove("preview-valid", "preview-invalid", "preview-clear", "clearing");
  });
  updateSectionOutlines(state.board);

  renderTray(state, aiTurn, isShapePlaceable, onPointerDown);

  elements.score.textContent = state.score.toLocaleString();
  elements.bestScore.textContent = bestScore.toLocaleString();
  elements.bestScoreLabel.textContent = bestScoreLabel;
  elements.undoButton.disabled = state.history.length === 0;
  elements.soloScore.hidden = Boolean(state.match);
  elements.bestScorePanel.hidden = Boolean(state.match);
  elements.matchScoreboard.hidden = !state.match;
  if (state.match) {
    const redPlayer = state.aiOpponent ? 1 : 0;
    const bluePlayer = 1 - redPlayer;
    elements.redPlayer.querySelector(".score-label").textContent = state.aiOpponent ? "AI (Red)" : "Red";
    elements.bluePlayer.querySelector(".score-label").textContent = state.aiOpponent ? "You (Blue)" : "Blue";
    elements.redScore.textContent = state.match.scores[redPlayer].toLocaleString();
    elements.blueScore.textContent = state.match.scores[bluePlayer].toLocaleString();
    elements.redPlayer.classList.toggle("active-player", state.match.player === redPlayer && !state.gameOver);
    elements.bluePlayer.classList.toggle("active-player", state.match.player === bluePlayer && !state.gameOver);
    const player = state.match.player === 0 ? "Red" : "Blue";
    const noMoves = state.tray.some(item => !item.used)
      && !state.tray.some(item => !item.used && isShapePlaceable(rotateShape(shapeById(item.shapeId), item.rotation || 0)));
    const trayFinished = state.tray.length > 0 && state.tray.every(item => item.used);
    elements.turnStatus.textContent = state.gameOver ? "Both players passed in a row."
      : trayFinished ? "Tray complete. Continue to the next turn."
        : aiTurn ? "AI is choosing a move."
        : `${state.aiOpponent ? "Your turn (Blue)" : `${player}'s turn`}${noMoves ? ". No pieces fit. Pass to end your turn." : ""}`;
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
  const cleared = new Set(completed);
  for (const key of cleared) {
    boardCells.get(key)?.classList.add("clearing");
  }
  // Outlines fade lighter once the cleared board renders.
  for (const edge of sectionEdges) {
    if (!cleared.has(edge.cell) && !cleared.has(edge.neighbor)) continue;
    window.clearTimeout(edge.fadeTimeout);
    edge.path.classList.add("clear-fade");
    edge.fadeTimeout = window.setTimeout(() => edge.path.classList.remove("clear-fade"), 2600);
  }

  if (gained > 0) {
    elements.scoreBurst.textContent = `+${gained}`;
    elements.scoreBurst.classList.remove("show");
    void elements.scoreBurst.offsetWidth;
    elements.scoreBurst.classList.add("show");
  }
}

// Moves a tray piece to its board cells while growing it to board size.
// Returns a function that stops the motion without calling onDone.
function animateAiMove(item, shape, originQ, originR, onDone) {
  const trayPiece = elements.tray.querySelector(`[data-uid="${item.uid}"] .piece`);
  const [q, r] = shape.cells[0];
  const target = boardCells.get(hexKey(originQ + q, originR + r));
  if (!trayPiece || !target) {
    onDone();
    return () => {};
  }
  const layer = elements.dragLayer;
  const from = trayPiece.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const piece = makePiece(shape, to.width);
  const width = parseFloat(piece.style.width);
  const height = parseFloat(piece.style.height);
  const cellLeft = parseFloat(piece.firstChild.style.left);
  const cellTop = parseFloat(piece.firstChild.style.top);
  const slot = trayPiece.parentElement;
  let timeout;
  layer.replaceChildren(...piece.childNodes);
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  layer.style.transformOrigin = "top left";
  layer.style.transform = `translate3d(${from.left}px, ${from.top}px, 0) scale(${from.width / width}, ${from.height / height})`;
  layer.classList.add("active");
  slot.classList.add("dragging");
  void layer.offsetWidth;
  layer.classList.add("ai-moving");

  function moveToTarget() {
    const bounds = target.getBoundingClientRect();
    const scale = bounds.width / to.width;
    const left = bounds.left - cellLeft * scale;
    const top = bounds.top - cellTop * scale;
    layer.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    // A new target starts a new CSS transition, so wait for that motion to finish.
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      stop();
      onDone();
    }, 440);
  }

  function stop() {
    window.clearTimeout(timeout);
    window.removeEventListener("resize", moveToTarget);
    slot.classList.remove("dragging");
    layer.classList.remove("active", "ai-moving");
    layer.style.transformOrigin = "";
    layer.replaceChildren();
  }
  window.addEventListener("resize", moveToTarget);
  moveToTarget();
  return stop;
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
  shiftTray,
  revealTrayItem,
  elements,
  buildBoard,
  buildHexGrid,
  buildSquareGrid,
  makePiece,
  renderGame,
  renderPreview,
  clearPreview,
  animateClear,
  animateAiMove,
  showModal,
  hideModal,
});
}());
