(function () {
const { hexKey, hexDistance } = window.GenericBlockGame;

// Store only cells that belong to the hexagon.
function createEmptyBoard(side = 5) {
  const radius = side - 1;
  const cells = {};
  for (let r = -radius; r <= radius; r += 1) {
    for (let q = -radius; q <= radius; q += 1) {
      if (hexDistance(q, r) <= radius) cells[hexKey(q, r)] = 0;
    }
  }
  return { radius, cells };
}

function cloneBoard(board) {
  return { radius: board.radius, cells: { ...board.cells } };
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

function fillShape(board, shape, originQ, originR) {
  for (const [q, r] of shape.cells) board.cells[hexKey(originQ + q, originR + r)] = 1;
}

// These centers tile the grid with separate seven-cell hexagons.
function boardChunks(board) {
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
    for (const [axis, value] of [["q", q], ["r", r], ["s", -q - r]]) {
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
    pointValue += 7;
    for (const key of chunk.cells) completed.add(key);
  }
  return { cells: completed, zoneCount, pointValue };
}

function clearCells(board, completed) {
  for (const key of completed) board.cells[key] = 0;
}

Object.assign(window.GenericBlockGame, {
  createEmptyBoard, cloneBoard, boardChunks, canPlace, canPlaceAnywhere, fillShape, findCompletedCells, clearCells,
});
}());
