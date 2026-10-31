(function () {
const { hexToPixel, HEX_HEIGHT } = window.GenericBlockGame;
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

// Looks up a shape stored in the tray by its short ID.
function shapeById(id) {
  // Fall back safely if a saved tray references a custom piece later deleted.
  return getAllShapes().find(shape => shape.id === id) || SHAPES[0];
}

// Combines built-in pieces with pieces created in the settings editor.
function getAllShapes() {
  const preferences = window.GenericBlockGame.loadPreferences();
  return [...SHAPES, ...preferences.customPieces];
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
  const centers = shape.cells.map(([q, r]) => hexToPixel(q, r));
  const minX = Math.min(...centers.map(cell => cell.x)) - 0.5;
  const minY = Math.min(...centers.map(cell => cell.y)) - HEX_HEIGHT / 2;
  return {
    minX,
    minY,
    width: Math.max(...centers.map(cell => cell.x)) + 0.5 - minX,
    height: Math.max(...centers.map(cell => cell.y)) + HEX_HEIGHT / 2 - minY,
  };
}

// Rotate clockwise by 60 degrees around the anchor cell.
function rotateShape(shape, turns = 0) {
  let cells = shape.cells.map(([x, y]) => [x, y]);
  const rotations = ((turns % 6) + 6) % 6;
  for (let turn = 0; turn < rotations; turn += 1) {
    cells = cells.map(([q, r]) => [-r, q + r]);
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
  getAllShapes,
  getConfiguredShapes,
  shapeById,
  shapeDimensions,
  rotateShape,
  randomShape,
});
}());
