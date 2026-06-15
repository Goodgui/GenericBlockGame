(function () {
// Every available piece is defined here as [x, y] cells.
// Weight controls how often a shape appears: larger numbers appear more often.
// Add a new object to this array to add a new piece to the game.
const SHAPES = [
  { id: "single", weight: 5, cells: [[0,0]] },
  { id: "line2", weight: 5, cells: [[0,0],[1,0]] },
  { id: "diagonal2", weight: 5, cells: [[0,0],[1,1]] },
  { id: "line3", weight: 5, cells: [[0,0],[1,0],[2,0]] },
  { id: "diagonal3", weight: 5, cells: [[0,0],[1,1],[2,2]] },
  { id: "line4", weight: 5, cells: [[0,0],[1,0],[2,0],[3,0]] },
  { id: "line5", weight: 5, cells: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { id: "square2", weight: 5, cells: [[0,0],[1,0],[0,1],[1,1]] },
  { id: "corner3", weight: 5, cells: [[0,0],[0,1],[1,1]] },
  { id: "corner5", weight: 5, cells: [[0,0],[0,1],[0,2],[1,2],[2,2]] },
  { id: "t4", weight: 5, cells: [[0,0],[1,0],[2,0],[1,1]] },
  { id: "s4", weight: 5, cells: [[1,0],[2,0],[0,1],[1,1]] },
  { id: "z4", weight: 5, cells: [[0,0],[1,0],[1,1],[2,1]] },
  { id: "plus5", weight: 5, cells: [[1,0],[0,1],[1,1],[2,1],[1,2]] },
  { id: "u5", weight: 5, cells: [[0,0],[2,0],[0,1],[1,1],[2,1]] },
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

// Finds the rectangular space occupied by a shape.
function shapeDimensions(shape) {
  return {
    width: Math.max(...shape.cells.map(([x]) => x)) + 1,
    height: Math.max(...shape.cells.map(([, y]) => y)) + 1,
  };
}

// Rotates clockwise in 90-degree steps and normalizes back to the top-left.
function rotateShape(shape, turns = 0) {
  let cells = shape.cells.map(([x, y]) => [x, y]);
  const rotations = ((turns % 4) + 4) % 4;
  for (let turn = 0; turn < rotations; turn += 1) {
    cells = cells.map(([x, y]) => [-y, x]);
  }
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return { ...shape, cells: cells.map(([x, y]) => [x - minX, y - minY]) };
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
