const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(entries = []) {
  const saved = new Map(entries);
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

test("both boards use shared offset defaults and their own snap defaults", () => {
  const { game } = setup();
  for (const mode of ["hex", "square"]) {
    game.setBoardMode(mode);
    const preferences = game.loadPreferences();
    assert.equal(preferences.dragInitialOffset, 100);
    assert.equal(preferences.slowModeEnabled, false);
    assert.equal(preferences.dragMovingOffset, 180);
    assert.equal(preferences.dragHorizontalOffset, 170);
    assert.equal(preferences.snapOverlapMultiplier, mode === "hex" ? 1.5 : 2);
    assert.equal(preferences.boardSide, mode === "hex" ? 5 : 9);
    assert.equal(game.isDefaultPreferences(preferences), true);
  }
});

test("accessibility is shared while general settings and pieces stay with their board", () => {
  const { game, saved } = setup();
  const hex = game.loadPreferences();
  Object.assign(hex, {
    slowModeEnabled: true, dragInitialOffset: 95, dragMovingOffset: 210, dragHorizontalOffset: 200, pieceHue: 80,
    snapOverlapMultiplier: 1.8, boardSide: 6, traySize: 4, twoPlayerEnabled: true,
    pieces: { bend3: { weight: 9 } }, customPieces: [{ id: "hex-custom", cells: [[0,0]], weight: 5 }],
  });
  game.savePreferences(hex);
  game.setBoardMode("square");
  const square = game.loadPreferences();
  assert.equal(square.slowModeEnabled, true);
  assert.equal(square.dragInitialOffset, 95);
  assert.equal(square.dragMovingOffset, 210);
  assert.equal(square.dragHorizontalOffset, 200);
  assert.equal(square.pieceHue, 80);
  assert.equal(square.snapOverlapMultiplier, 2);
  assert.equal(square.twoPlayerEnabled, false);
  assert.equal(square.customPieces.length, 0);
  Object.assign(square, { dragInitialOffset: 85, snapOverlapMultiplier: 2.3, traySize: 2,
    boardSide: 12, undoEnabled: false, timeTrialEnabled: true, timeTrialSeconds: 90,
    pieces: { square2: { enabled: false } } });
  game.savePreferences(square);
  game.setBoardMode("hex");
  const restored = game.loadPreferences();
  assert.equal(restored.dragInitialOffset, 85);
  assert.equal(restored.snapOverlapMultiplier, 1.8);
  assert.equal(restored.boardSide, 6);
  assert.equal(restored.traySize, 4);
  assert.equal(restored.twoPlayerEnabled, true);
  assert.equal(restored.undoEnabled, true);
  assert.equal(restored.timeTrialEnabled, false);
  assert.equal(restored.pieces.bend3.weight, 9);
  assert.equal(restored.customPieces[0].id, "hex-custom");
  assert.equal(JSON.parse(saved.get(game.CONFIG.settingsKey)).dragInitialOffset, undefined);
  assert.equal(JSON.parse(saved.get(game.CONFIG.settingsKey)).slowModeEnabled, undefined);
  assert.equal(JSON.parse(saved.get(game.CONFIG.globalSettingsKey)).snapOverlapMultiplier, undefined);
});

test("the seen version is stored with shared settings and survives saves and resets", () => {
  const fresh = setup();
  assert.equal(fresh.game.loadSeenVersion(), fresh.game.APP_VERSION);

  const { game, saved } = setup([[ "generic-block-game-board-mode-v1", "hex" ]]);
  assert.equal(game.loadSeenVersion(), null);
  const stale = game.loadPreferences();
  game.saveSeenVersion();
  assert.equal(JSON.parse(saved.get(game.CONFIG.globalSettingsKey)).version, game.APP_VERSION);
  game.savePreferences({ ...stale, pieceHue: 40 });
  assert.equal(game.loadSeenVersion(), game.APP_VERSION);
  assert.equal(game.loadPreferences().pieceHue, 40);
  game.resetAllPreferences();
  assert.equal(game.loadSeenVersion(), game.APP_VERSION);
  game.saveSeenVersion("0.1");
  assert.equal(game.loadSeenVersion(), "0.1");
});

test("legacy defaults migrate while custom settings and square board sizes survive", () => {
  const { game } = setup([
    ["generic-block-game-hex-settings-v1", JSON.stringify({
      dragInitialOffset: 110, dragMovingOffset: 215, dragHorizontalOffset: 110,
      pieceHue: 45, snapOverlapMultiplier: 2, traySize: 4, frequencyVersion: 2,
    })],
    ["generic-block-game-settings-v1", JSON.stringify({ boardWidth: 12, twoPlayerEnabled: true })],
  ]);
  const hex = game.loadPreferences();
  assert.equal(hex.dragInitialOffset, 100);
  assert.equal(hex.dragMovingOffset, 215);
  assert.equal(hex.dragHorizontalOffset, 170);
  assert.equal(hex.pieceHue, 45);
  assert.equal(hex.snapOverlapMultiplier, 1.5);
  assert.equal(hex.traySize, 4);
  game.setBoardMode("square");
  const square = game.loadPreferences();
  assert.equal(square.boardSide, 12);
  assert.equal(square.twoPlayerEnabled, false);
  assert.equal(square.dragMovingOffset, 215);
});

test("square settings cannot enable two player play", () => {
  const { game, saved } = setup();
  game.setBoardMode("square");
  const preferences = game.loadPreferences();
  preferences.twoPlayerEnabled = true;
  game.savePreferences(preferences);
  assert.equal(game.loadPreferences().twoPlayerEnabled, false);
  assert.equal(JSON.parse(saved.get(game.storageKeys().settingsKey)).twoPlayerEnabled, false);
  assert.equal(game.loadGame(true), null);
  game.setBoardMode("hex");
  preferences.twoPlayerEnabled = true;
  game.savePreferences(preferences);
  assert.equal(game.loadPreferences().twoPlayerEnabled, true);
});

test("global reset clears both profiles and scores, keeping the selected board", () => {
  const { game } = setup();
  for (const mode of ["hex", "square"]) {
    game.setBoardMode(mode);
    const preferences = game.loadPreferences();
    preferences.traySize = 8;
    preferences.dragInitialOffset = 25;
    preferences.slowModeEnabled = true;
    preferences.customPieces.push({ id: "custom", weight: 5, cells: [[0,0]] });
    game.savePreferences(preferences);
    game.saveBestScore(100);
    game.saveModifiedBestScore(200);
    game.saveTimedBestScore(300);
    game.saveTimedBestScore(400, true);
    game.saveGame({ board: game.createEmptyBoard(), history: [], tray: [] });
  }
  game.resetAllPreferences();
  game.resetAllScores();
  game.resetSavedGames();
  assert.equal(game.getBoardMode(), "square");
  for (const mode of ["hex", "square"]) {
    game.setBoardMode(mode);
    assert.equal(game.loadPreferences().traySize, 3);
    assert.equal(game.loadPreferences().dragInitialOffset, 100);
    assert.equal(game.loadPreferences().slowModeEnabled, false);
    assert.equal(game.loadPreferences().customPieces.length, 0);
    assert.equal(game.loadPreferences().snapOverlapMultiplier, mode === "hex" ? 1.5 : 2);
    assert.equal(game.loadBestScore(), 0);
    assert.equal(game.loadModifiedBestScore(), 0);
    assert.equal(game.loadTimedBestScore(), 0);
    assert.equal(game.loadTimedBestScore(true), 0);
    assert.equal(game.loadGame(), null);
  }
});

test("square boards fit the original sizes and use four piece turns", () => {
  const { game } = setup();
  game.setBoardMode("square");
  for (const size of [6, 9, 12]) {
    const board = game.createEmptyBoard(size);
    assert.equal(board.type, "square");
    assert.equal(Object.keys(board.cells).length, size * size);
    assert.equal(game.boardChunks(board).length, size * size / 9);
    for (const key of Object.keys(board.cells)) {
      const [q, r] = key.split(",").map(Number);
      const point = game.boardPoint(board, q, r, 31);
      const snapped = game.boardCellAt(board, point.x, point.y, 31);
      assert.equal(snapped.q, q);
      assert.equal(snapped.r, r);
    }
  }
  assert.equal(game.rotationCount(), 4);
  for (const shape of game.getAllShapes()) {
    assert.ok(shape.cells.some(([q, r]) => q === 0 && r === 0));
    assert.deepEqual(game.rotateShape(shape, 4).cells, shape.cells);
    for (let turn = 0; turn < 4; turn += 1) {
      assert.ok(game.canPlaceAnywhere(game.createEmptyBoard(6), game.rotateShape(shape, turn)));
    }
  }
});

test("square rows, columns, and 3 by 3 groups clear together", () => {
  const { game } = setup();
  game.setBoardMode("square");
  const board = game.createEmptyBoard();
  for (const key of Object.keys(board.cells)) {
    const [q, r] = key.split(",").map(Number);
    if (q === 4 || r === 4 || (q >= 3 && q <= 5 && r >= 3 && r <= 5)) board.cells[key] = 1;
  }
  const result = game.findCompletedCells(board);
  assert.equal(result.zoneCount, 3);
  assert.equal(result.pointValue, 27);
  assert.equal(result.cells.size, 21);
  game.clearCells(board, result.cells);
  assert.ok(Object.values(board.cells).every(value => value === 0));
  for (let q = 0; q < 9; q += 1) board.cells[`${q},${q}`] = 1;
  assert.equal(game.findCompletedCells(board).zoneCount, 0);
});

test("hex and square games and scores survive switching without sharing data", () => {
  const { game } = setup();
  for (const [mode, score] of [["hex", 7], ["square", 9]]) {
    game.setBoardMode(mode);
    const state = { board: game.createEmptyBoard(), score, history: [], tray: [] };
    state.board.cells["0,0"] = 1;
    game.saveGame(state);
    game.saveBestScore(score);
  }
  for (const [mode, score] of [["hex", 7], ["square", 9]]) {
    game.setBoardMode(mode);
    assert.equal(game.loadGame().score, score);
    assert.equal(game.loadGame().board.type, mode);
    assert.equal(game.loadGame().board.cells["0,0"], 1);
    assert.equal(game.loadBestScore(), score);
  }
});

test("old square games and Undo boards load from their original save key", () => {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  board[2][3] = 1;
  const { game } = setup([["generic-block-game-state-v1", JSON.stringify({
    board, tray: [], history: [{ board }], score: 45,
  })]]);
  game.setBoardMode("square");
  const state = game.loadGame();
  assert.equal(state.score, 45);
  assert.equal(state.board.size, 9);
  assert.equal(state.board.cells["3,2"], 1);
  assert.equal(state.history[0].board.cells["3,2"], 1);
});
