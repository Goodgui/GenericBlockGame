const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const saved = new Map();
const context = vm.createContext({
  window: {},
  localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  },
});
for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "storage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
}
const game = context.window.GenericBlockGame;
const neighbors = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];

test("hex boards have the right cells, six neighbors, and no square corners", () => {
  for (const [side, count] of [[4,37],[5,61],[6,91]]) {
    const board = game.createEmptyBoard(side);
    assert.equal(Object.keys(board.cells).length, count);
    assert.equal(board.cells[`${side - 1},${side - 1}`], undefined);
    for (const [q, r] of neighbors) assert.equal(board.cells[game.hexKey(q, r)], 0);
  }
});

test("pixel snapping returns every hex center and chooses the closest neighbor", () => {
  for (const key of Object.keys(game.createEmptyBoard(6).cells)) {
    const [q, r] = key.split(",").map(Number);
    for (const size of [13, 37, 64]) {
      const pixel = game.hexToPixel(q, r, size);
      const snapped = game.pixelToHex(pixel.x, pixel.y, size);
      assert.equal(snapped.q + 0, q + 0);
      assert.equal(snapped.r + 0, r + 0);
    }
  }
  for (const [q, r] of neighbors) {
    const pixel = game.hexToPixel(q, r, 40);
    const snapped = game.pixelToHex(pixel.x * 0.6, pixel.y * 0.6, 40);
    assert.equal(snapped.q + 0, q + 0);
    assert.equal(snapped.r + 0, r + 0);
  }
});

test("six turns restore each piece, keep its anchor, and fit its drawn bounds", () => {
  const board = game.createEmptyBoard();
  for (const shape of game.SHAPES) {
    assert.deepEqual(game.rotateShape(shape, 6).cells, shape.cells);
    for (let turn = 0; turn < 6; turn += 1) {
      const rotated = game.rotateShape(shape, turn);
      assert.ok(rotated.cells.some(([q, r]) => q === 0 && r === 0));
      assert.ok(game.canPlaceAnywhere(board, rotated));
      const bounds = game.shapeDimensions(rotated);
      for (const [q, r] of rotated.cells) {
        const point = game.hexToPixel(q, r);
        assert.ok(point.x - 0.5 >= bounds.minX - 1e-9);
        assert.ok(point.x + 0.5 <= bounds.minX + bounds.width + 1e-9);
        assert.ok(point.y - game.HEX_HEIGHT / 2 >= bounds.minY - 1e-9);
        assert.ok(point.y + game.HEX_HEIGHT / 2 <= bounds.minY + bounds.height + 1e-9);
      }
    }
  }
});

test("placement rejects filled cells and hex edges, including turned pieces", () => {
  const board = game.createEmptyBoard();
  const line = game.shapeById("line2");
  assert.ok(game.canPlace(board, line, 3, 0));
  assert.equal(game.canPlace(board, line, 4, 0), false);
  assert.equal(game.canPlace(board, line, 4, 1), false);
  game.fillShape(board, line, 0, 0);
  assert.equal(game.canPlace(board, line, 0, 0), false);
  const copy = game.cloneBoard(board);
  copy.cells["0,0"] = 0;
  assert.equal(board.cells["0,0"], 1);
  for (const key of Object.keys(board.cells)) board.cells[key] = 1;
  assert.equal(game.canPlaceAnywhere(board, game.shapeById("single")), false);
});

test("all three line directions clear, including shorter edge lines", () => {
  for (const axis of ["q", "r", "s"]) {
    for (const offset of [-4, 0, 4]) {
      const board = game.createEmptyBoard();
      for (const key of Object.keys(board.cells)) {
        const [q, r] = key.split(",").map(Number);
        if ({ q, r, s: -q - r }[axis] === offset) board.cells[key] = 1;
      }
      const result = game.findCompletedCells(board);
      assert.equal(result.zoneCount, 1);
      assert.equal(result.pointValue, 9 - Math.abs(offset));
      assert.equal(result.cells.size, result.pointValue);
      game.clearCells(board, result.cells);
      assert.ok(Object.values(board.cells).every(value => value === 0));
    }
  }
});

test("fixed seven-cell groups never overlap and only those groups clear", () => {
  const board = game.createEmptyBoard();
  const chunks = game.boardChunks(board);
  assert.equal(chunks.length, 7);
  assert.equal(new Set(chunks.flatMap(chunk => chunk.cells)).size, 49);
  for (const chunk of chunks) {
    const trial = game.cloneBoard(board);
    assert.equal(chunk.cells.length, 7);
    for (const key of chunk.cells) trial.cells[key] = 1;
    const result = game.findCompletedCells(trial);
    assert.equal(result.zoneCount, 1);
    assert.equal(result.pointValue, 7);
    assert.equal(result.cells.size, 7);
  }
  const offGroup = game.cloneBoard(board);
  for (const [q, r] of [[0,0], ...neighbors]) offGroup.cells[game.hexKey(q + 1, r)] = 1;
  assert.equal(game.findCompletedCells(offGroup).zoneCount, 0);
});

for (const [side, outerSize, innerCount, covered] of [[4, 5, 1, 37], [6, 6, 7, 85]]) {
  test(`size ${side} has six separate outer groups of ${outerSize}`, () => {
    const board = game.createEmptyBoard(side);
    const chunks = game.boardChunks(board);
    const outer = chunks.filter(chunk => chunk.cells.length === outerSize);
    assert.equal(outer.length, 6);
    assert.equal(chunks.filter(chunk => chunk.cells.length === 7).length, innerCount);
    const allCells = chunks.flatMap(chunk => chunk.cells);
    assert.equal(allCells.length, covered);
    assert.equal(new Set(allCells).size, covered, "Groups overlap");
    for (const chunk of chunks) {
      assert.ok(chunk.cells.every(key => Object.hasOwn(board.cells, key)));
    }
    for (const chunk of outer) {
      assert.ok(chunk.cells.every(key => game.hexDistance(...key.split(",").map(Number)) >= side - 2));
      assert.ok(chunk.cells.some(key => game.hexDistance(...key.split(",").map(Number)) === side - 1));
      const trial = game.cloneBoard(board);
      for (const key of chunk.cells) trial.cells[key] = 1;
      const completed = game.findCompletedCells(trial);
      assert.equal(completed.zoneCount, 1);
      assert.equal(completed.pointValue, outerSize);
      assert.equal(game.scorePlacement(0, completed).points, outerSize);
      assert.deepEqual([...completed.cells].sort(), [...chunk.cells].sort());
      game.clearCells(trial, completed.cells);
      assert.ok(Object.values(trial.cells).every(value => value === 0));
      const rotated = chunk.cells.map(key => {
        const [q, r] = key.split(",").map(Number);
        return game.hexKey(-r, q + r);
      }).sort().join("|");
      assert.ok(outer.some(other => [...other.cells].sort().join("|") === rotated), "Outer groups lack six-way symmetry");
    }
  });

  test(`size ${side} only clears a full outlined outer group`, () => {
    const board = game.createEmptyBoard(side);
    const outer = game.boardChunks(board).find(chunk => chunk.cells.length === outerSize);
    assert.ok(outer, "Missing outer group");
    for (const missing of outer.cells) {
      const trial = game.cloneBoard(board);
      for (const key of outer.cells) if (key !== missing) trial.cells[key] = 1;
      assert.equal(game.findCompletedCells(trial).zoneCount, 0);
    }
  });
}

test("a line and a group count together and clear shared cells once", () => {
  const board = game.createEmptyBoard();
  for (const key of game.boardChunks(board).find(chunk => chunk.center === "0,0").cells) board.cells[key] = 1;
  for (let q = -4; q <= 4; q += 1) board.cells[game.hexKey(q, 0)] = 1;
  const result = game.findCompletedCells(board);
  assert.equal(result.zoneCount, 2);
  assert.equal(result.pointValue, 16);
  assert.equal(result.cells.size, 13);
  game.clearCells(board, result.cells);
  assert.ok(Object.values(board.cells).every(value => value === 0));
});

test("hex saves reload, reject bad boards, and leave square saves alone", () => {
  const squareKey = "generic-block-game-state-v1";
  saved.set(squareKey, "square-save");
  const state = { board: game.createEmptyBoard(), history: [], tray: [] };
  state.board.cells["0,0"] = 1;
  game.saveGame(state);
  assert.equal(game.loadGame().board.cells["0,0"], 1);
  assert.equal(saved.get(squareKey), "square-save");
  state.board.cells["4,4"] = 0;
  game.saveGame(state);
  assert.equal(game.loadGame(), null);
});
