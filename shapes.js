(function () {
const { hexToPixel, HEX_HEIGHT, getBoardMode } = window.GenericBlockGame;
// Each piece uses [q, r] hex cells and includes the [0, 0] anchor.
// Weight controls how often a shape appears: larger numbers appear more often.
// Add a new object to this array to add a new piece to the game.
const SHAPES = [
  { id: "single", weight: 5, cells: [[0,0]] },
  { id: "line2", weight: 5, cells: [[0,0],[1,0]] },
  { id: "line3", weight: 5, cells: [[0,0],[1,0],[2,0]] },
  { id: "line4", weight: 5, cells: [[0,0],[1,0],[2,0],[3,0]] },
  { id: "line5", weight: 5, cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { id: "bend3", weight: 5, cells: [[0,0],[1,0],[1,1]] },
  { id: "triangle3", weight: 5, cells: [[0,0],[1,0],[0,1]] },
  { id: "diamond4", weight: 5, cells: [[0,0],[1,0],[0,1],[1,1]] },
  { id: "fork4", weight: 5, cells: [[0,0],[1,0],[-1,1],[0,-1]] },
  { id: "zigzag4", weight: 5, cells: [[0,0],[1,0],[1,1],[2,1]] },
  { id: "hook4", weight: 5, cells: [[0,0],[1,0],[2,0],[2,-1]] },
  { id: "arc4", weight: 5, cells: [[0,0],[1,0],[1,1],[0,2]] },
];

const SQUARE_SHAPES = [
  { id: "single", cells: [[0,0]] },
  { id: "line2", cells: [[0,0],[1,0]] },
  { id: "diagonal2", cells: [[0,0],[1,1]] },
  { id: "line3", cells: [[0,0],[1,0],[2,0]] },
  { id: "diagonal3", cells: [[0,0],[1,1],[2,2]] },
  { id: "line4", cells: [[0,0],[1,0],[2,0],[3,0]] },
  { id: "line5", cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { id: "square2", cells: [[0,0],[1,0],[0,1],[1,1]] },
  { id: "corner3", cells: [[0,0],[0,1],[1,1]] },
  { id: "corner5", cells: [[0,0],[0,1],[0,2],[1,2],[2,2]] },
  { id: "t4", cells: [[0,0],[1,0],[2,0],[1,1]] },
  { id: "s4", cells: [[1,0],[2,0],[0,1],[1,1]] },
  { id: "z4", cells: [[0,0],[1,0],[1,1],[2,1]] },
  { id: "plus5", cells: [[1,0],[0,1],[1,1],[2,1],[1,2]] },
  { id: "u5", cells: [[0,0],[2,0],[0,1],[1,1],[2,1]] },
].map(shape => {
  const [anchorQ, anchorR] = shape.cells[0];
  return { ...shape, weight: 5, cells: shape.cells.map(([q, r]) => [q - anchorQ, r - anchorR]) };
});

function rotationCount(mode = getBoardMode()) {
  return mode === "hex" ? 6 : 4;
}

function shapePoint(q, r, mode = getBoardMode()) {
  return mode === "hex" ? hexToPixel(q, r) : { x: q, y: r };
}

function cellHeight(mode = getBoardMode()) {
  return mode === "hex" ? HEX_HEIGHT : 1;
}

// Looks up a shape stored in the tray by its short ID.
function shapeById(id) {
  // Fall back safely if a saved tray references a custom piece later deleted.
  const shapes = getAllShapes();
  return shapes.find(shape => shape.id === id) || shapes[0];
}

// Combines built-in pieces with pieces created in the settings editor.
function getAllShapes() {
  const preferences = window.GenericBlockGame.loadPreferences();
  const shapes = getBoardMode() === "hex" ? SHAPES : SQUARE_SHAPES;
  return [...shapes, ...preferences.customPieces.map(shape => {
    const [anchorQ, anchorR] = shape.cells[0];
    return { ...shape, cells: shape.cells.map(([q, r]) => [q - anchorQ, r - anchorR]) };
  })];
}

// Applies each piece's enabled state and user-selected frequency.
function getConfiguredShapes() {
  const preferences = window.GenericBlockGame.loadPreferences();
  return getAllShapes().map(shape => {
    const override = preferences.pieces[shape.id] || {};
    return {
      ...shape,
      enabled: override.enabled !== false,
      weight: Math.max(0, Number(override.weight ?? shape.weight) || 0),
    };
  });
}

// Bounds include the whole hex tile, even when a turn gives negative offsets.
function shapeDimensions(shape) {
  const tileHeight = cellHeight();
  const centers = shape.cells.map(([q, r]) => shapePoint(q, r));
  const minX = Math.min(...centers.map(cell => cell.x)) - 0.5;
  const minY = Math.min(...centers.map(cell => cell.y)) - tileHeight / 2;
  return {
    minX,
    minY,
    width: Math.max(...centers.map(cell => cell.x)) + 0.5 - minX,
    height: Math.max(...centers.map(cell => cell.y)) + tileHeight / 2 - minY,
  };
}

// Rotate around the anchor by one turn of the current grid.
function rotateShape(shape, turns = 0) {
  let cells = shape.cells.map(([x, y]) => [x, y]);
  const count = rotationCount();
  const rotations = ((turns % count) + count) % count;
  for (let turn = 0; turn < rotations; turn += 1) {
    cells = cells.map(([q, r]) => count === 6 ? [-r, q + r] : [-r, q]);
  }
  return { ...shape, cells };
}

// Picks a random shape while respecting each shape's frequency weight.
function randomShape() {
  const availableShapes = getConfiguredShapes().filter(shape => shape.enabled && shape.weight > 0);
  const pool = availableShapes.length ? availableShapes : getAllShapes();
  const totalWeight = pool.reduce((sum, shape) => sum + shape.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const shape of pool) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }

  return pool.at(-1);
}

Object.assign(window.GenericBlockGame, {
  SHAPES,
  SQUARE_SHAPES,
  rotationCount,
  shapePoint,
  cellHeight,
  getAllShapes,
  getConfiguredShapes,
  shapeById,
  shapeDimensions,
  rotateShape,
  randomShape,
});
}());
