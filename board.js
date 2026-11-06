(function () {
const { hexKey, hexDistance, hexToPixel, pixelToHex, boardDimensions, getBoardMode } = window.GenericBlockGame;

// Store only cells that belong to the hexagon.
function createEmptyBoard(side, mode = getBoardMode()) {
  side ??= mode === "hex" ? 5 : 9;
  if (mode === "square") {
    const cells = {};
    for (let r = 0; r < side; r += 1) {
      for (let q = 0; q < side; q += 1) cells[hexKey(q, r)] = 0;
    }
    return { type: "square", size: side, cells };
  }
  const radius = side - 1;
  const cells = {};
  for (let r = -radius; r <= radius; r += 1) {
    for (let q = -radius; q <= radius; q += 1) {
      if (hexDistance(q, r) <= radius) cells[hexKey(q, r)] = 0;
    }
  }
  return { type: "hex", radius, cells };
}

function cloneBoard(board) {
  return { ...board, cells: { ...board.cells } };
}

function getBoardSide(board) {
  return board.type === "square" ? board.size : board.radius + 1;
}

function getBoardDimensions(board) {
  return board.type === "square" ? { width: board.size, height: board.size } : boardDimensions(board.radius + 1);
}

function boardPoint(board, q, r, cellSize = 1) {
  if (board.type !== "square") return hexToPixel(q, r, cellSize);
  const center = (board.size - 1) / 2;
  return { x: (q - center) * cellSize, y: (r - center) * cellSize };
}

function boardCellAt(board, x, y, cellSize = 1) {
  if (board.type !== "square") return pixelToHex(x, y, cellSize);
  const center = (board.size - 1) / 2;
  const rawQ = x / cellSize + center;
  const rawR = y / cellSize + center;
  return { q: Math.round(rawQ), r: Math.round(rawR), rawQ, rawR };
}

function placementDistance(board, q, r) {
  return board.type === "square" ? Math.max(Math.abs(q), Math.abs(r)) : hexDistance(q, r);
}

function canPlace(board, shape, originQ, originR) {
  return shape.cells.every(([q, r]) => board.cells[hexKey(originQ + q, originR + r)] === 0);
}

// Every piece includes its anchor cell, so each board cell is a possible origin.
function canPlaceAnywhere(board, shape) {
  return Object.keys(board.cells).some(key => {
    const [q, r] = key.split(",").map(Number);
    return canPlace(board, shape, q, r);
  });
}

function fillShape(board, shape, originQ, originR, value = 1) {
  for (const [q, r] of shape.cells) board.cells[hexKey(originQ + q, originR + r)] = value;
}

// These centers tile the grid with separate seven-cell hexagons.
function boardChunks(board) {
  if (board.type === "square") {
    const chunks = [];
    for (let row = 0; row < board.size; row += 3) {
      for (let col = 0; col < board.size; col += 3) {
        const cells = [];
        for (let r = row; r < row + 3; r += 1) {
          for (let q = col; q < col + 3; q += 1) cells.push(hexKey(q, r));
        }
        chunks.push({ center: hexKey(col + 1, row + 1), cells });
      }
    }
    return chunks;
  }
  const neighbors = [[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  return Object.keys(board.cells).flatMap(key => {
    const [q, r] = key.split(",").map(Number);
    if (((q - 2 * r) % 7 + 7) % 7 !== 0) return [];
    const cells = neighbors.map(([dq, dr]) => hexKey(q + dq, r + dr));
    return cells.every(cell => Object.hasOwn(board.cells, cell)) ? [{ center: key, cells }] : [];
  });
}

// Lines follow constant q, r, or s. Count shared cells once when clearing.
function findCompletedCells(board) {
  const lines = new Map();
  for (const key of Object.keys(board.cells)) {
    const [q, r] = key.split(",").map(Number);
    const axes = board.type === "square" ? [["q", q], ["r", r]] : [["q", q], ["r", r], ["s", -q - r]];
    for (const [axis, value] of axes) {
      const lineKey = `${axis}:${value}`;
      if (!lines.has(lineKey)) lines.set(lineKey, []);
      lines.get(lineKey).push(key);
    }
  }
  const completed = new Set();
  let zoneCount = 0;
  let pointValue = 0;
  for (const line of lines.values()) {
    if (!line.every(key => board.cells[key])) continue;
    zoneCount += 1;
    pointValue += line.length;
    for (const key of line) completed.add(key);
  }
  for (const chunk of boardChunks(board)) {
    if (!chunk.cells.every(key => board.cells[key])) continue;
    zoneCount += 1;
    pointValue += chunk.cells.length;
    for (const key of chunk.cells) completed.add(key);
  }
  return { cells: completed, zoneCount, pointValue };
}

function clearCells(board, completed) {
  for (const key of completed) board.cells[key] = 0;
}

Object.assign(window.GenericBlockGame, {
  createEmptyBoard, cloneBoard, boardChunks, canPlace, canPlaceAnywhere, fillShape, findCompletedCells, clearCells,
  getBoardSide, getBoardDimensions, boardPoint, boardCellAt, placementDistance,
});
}());
