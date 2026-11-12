const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const saved = new Map();
  const context = vm.createContext({
    window: {},
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
  });
  for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "two-player.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return { game: context.window.GenericBlockGame, saved };
}

test("red starts, each completed tray switches players, and turn counts reset", () => {
  const { game } = setup();
  const match = game.createMatch();
  assert.equal(match.player, 0);
  for (let turn = 0; turn < 4; turn += 1) {
    for (let piece = 0; piece < 3; piece += 1) {
      game.recordMatchPlacement(match, { pointValue: 0, zoneCount: 0 });
      assert.equal(match.player, turn % 2);
    }
    assert.equal(match.placed, 3);
    assert.equal(game.endMatchTurn(match), false);
    assert.equal(match.player, (turn + 1) % 2);
    assert.equal(match.placed, 0);
  }
});

test("a mixed red and blue clear pays the player who completes it", () => {
  const { game } = setup();
  const board = game.createEmptyBoard();
  const match = game.createMatch();
  for (let q = -4; q <= 4; q += 1) {
    if (q !== 0) board.cells[`${q},0`] = 1;
  }
  game.endMatchTurn(match);
  game.fillShape(board, game.shapeById("single"), 0, 0, 2);
  assert.equal(board.cells["0,0"], 2);
  const completed = game.findCompletedCells(board);
  assert.equal(game.recordMatchPlacement(match, completed), 9);
  assert.equal(match.scores[0], 0);
  assert.equal(match.scores[1], 9);
  game.clearCells(board, completed.cells);
  assert.ok(Object.values(board.cells).every(value => value === 0));
});

test("players keep their own scoring streaks", () => {
  const { game } = setup();
  const match = game.createMatch();
  const clear = { pointValue: 7, zoneCount: 1 };
  assert.equal(game.recordMatchPlacement(match, clear), 7);
  game.endMatchTurn(match);
  assert.equal(game.recordMatchPlacement(match, clear), 7);
  game.endMatchTurn(match);
  assert.equal(game.recordMatchPlacement(match, clear), 14);
  assert.equal(match.scores[0], 21);
  assert.equal(match.scores[1], 7);
});

test("two consecutive passes end the game, including voluntary passes", () => {
  const { game } = setup();
  const match = game.createMatch();
  assert.equal(game.endMatchTurn(match, true), false);
  assert.equal(match.consecutivePasses, 1);
  assert.equal(match.player, 1);
  assert.equal(game.endMatchTurn(match, true), true);
  assert.equal(match.consecutivePasses, 2);
});

test("two consecutive passes end the game even after both players place pieces", () => {
  const { game } = setup();
  const match = game.createMatch();
  game.recordMatchPlacement(match, { pointValue: 0, zoneCount: 0 });
  assert.equal(game.endMatchTurn(match, true), false);
  assert.equal(match.consecutivePasses, 1);
  game.recordMatchPlacement(match, { pointValue: 7, zoneCount: 1 });
  assert.equal(match.consecutivePasses, 1);
  assert.equal(game.endMatchTurn(match, true), true);
});

test("completing a tray resets consecutive passes", () => {
  const { game } = setup();
  const match = game.createMatch();
  game.endMatchTurn(match, true);
  for (let piece = 0; piece < 3; piece += 1) {
    game.recordMatchPlacement(match, { pointValue: 0, zoneCount: 0 });
    assert.equal(match.consecutivePasses, 1);
  }
  assert.equal(game.endMatchTurn(match), false);
  assert.equal(match.consecutivePasses, 0);
  assert.equal(game.endMatchTurn(match, true), false);
  assert.equal(match.consecutivePasses, 1);
});

test("snapshots restore scores, streaks, and the pass count without sharing arrays", () => {
  const { game } = setup();
  const match = game.createMatch();
  game.endMatchTurn(match, true);
  const before = game.cloneMatch(match);
  game.recordMatchPlacement(match, { pointValue: 7, zoneCount: 1 });
  assert.equal(before.consecutivePasses, 1);
  assert.equal(before.placed, 0);
  assert.equal(before.scores[1], 0);
  assert.equal(before.streaks[1], 0);
  assert.equal(match.scores[1], 7);
});

test("match saves keep both colors and turn state, apart from single player saves", () => {
  const { game, saved } = setup();
  const solo = { board: game.createEmptyBoard(), history: [], tray: [], score: 17 };
  game.saveGame(solo);
  const match = game.createMatch();
  game.endMatchTurn(match, true);
  const state = { board: game.createEmptyBoard(), history: [], tray: [], match };
  state.board.cells["0,0"] = 1;
  state.board.cells["1,0"] = 2;
  game.saveGame(state);
  const restored = game.loadGame(true);
  assert.equal(restored.board.cells["0,0"], 1);
  assert.equal(restored.board.cells["1,0"], 2);
  assert.equal(restored.match.player, 1);
  assert.equal(restored.match.consecutivePasses, 1);
  assert.equal(game.loadGame().score, 17);
  state.match.scores[1] = -1;
  game.saveGame(state);
  assert.equal(game.loadGame(true), null);
  assert.ok(saved.has(game.CONFIG.storageKey));
});

test("old match saves and Undo states keep their pass count", () => {
  const { game, saved } = setup();
  const match = game.createMatch();
  delete match.consecutivePasses;
  match.emptyPasses = 1;
  const state = { board: game.createEmptyBoard(), history: [{ match: game.cloneMatch(match) }], tray: [], match };
  saved.set(game.CONFIG.twoPlayerStorageKey, JSON.stringify(state));
  const restored = game.loadGame(true);
  assert.equal(restored.match.consecutivePasses, 1);
  assert.equal(restored.history[0].match.consecutivePasses, 1);
  assert.equal(restored.match.emptyPasses, undefined);
});
