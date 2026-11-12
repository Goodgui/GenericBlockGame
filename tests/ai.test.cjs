const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(random = Math.random) {
  const saved = new Map();
  const context = vm.createContext({ window: {}, Math: Object.assign(Object.create(Math), { random }), localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  } });
  for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "two-player.js", "ai.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  const game = context.window.GenericBlockGame;
  function state(shapes = ["single"], side = 5) {
    return { board: game.createEmptyBoard(side), match: { ...game.createMatch(), player: 1 },
      aiOpponent: true, history: [], score: 0, streak: 0, gameOver: false,
      tray: shapes.map((shapeId, index) => ({ uid: `piece-${index}`, shapeId, rotation: 0, used: false })) };
  }
  return { game, saved, state };
}

test("AI completes a mixed color line and uses the current player's streak", () => {
  const { game, state } = setup();
  const match = state();
  for (let q = -4; q <= 4; q += 1) if (q !== 0) match.board.cells[`${q},0`] = q % 2 ? 1 : 2;
  match.match.streaks[1] = 2;
  const before = JSON.stringify(match);
  const move = game.chooseAiMove(match);
  assert.deepEqual({ ...move }, { uid: "piece-0", q: 0, r: 0 });
  assert.equal(JSON.stringify(match), before, "Search changed the live game");
  game.fillShape(match.board, game.shapeById("single"), move.q, move.r, 2);
  assert.equal(game.recordMatchPlacement(match.match, game.findCompletedCells(match.board)), 27);
  assert.deepEqual([...match.match.scores], [0, 27]);
});

test("AI searches ahead to clear a two-cell gap", () => {
  const { game, state } = setup();
  const match = state(["single", "single"]);
  for (let q = -4; q <= 4; q += 1) if (q !== 0 && q !== 1) match.board.cells[`${q},0`] = 1;
  for (let turn = 0; turn < 2; turn += 1) {
    const move = game.chooseAiMove(match);
    assert.equal(move.r, 0);
    assert.ok([0, 1].includes(move.q));
    const item = match.tray.find(item => item.uid === move.uid);
    item.used = true;
    game.fillShape(match.board, game.shapeById(item.shapeId), move.q, move.r, 2);
    const completed = game.findCompletedCells(match.board);
    game.recordMatchPlacement(match.match, completed);
    game.clearCells(match.board, completed.cells);
  }
  assert.equal(match.match.scores[1], 9);
});

test("Hard keeps the existing default and handles unknown levels", () => {
  const { game, state } = setup();
  const match = state(["single", "line2", "bend3"]);
  const hard = { ...game.chooseAiMove(match, "hard") };
  for (const difficulty of [undefined, "unknown", "constructor"]) {
    assert.deepEqual({ ...game.chooseAiMove(match, difficulty) }, hard);
  }
});

test("Easy chooses legal moves without chasing an obvious clear", () => {
  const { game, state } = setup(() => 0);
  const match = state();
  for (let q = -4; q <= 4; q += 1) if (q !== 0) match.board.cells[`${q},0`] = 1;
  const before = JSON.stringify(match);
  const move = game.chooseAiMove(match, "easy");
  assert.equal(JSON.stringify(match), before);
  assert.ok(game.canPlace(match.board, game.shapeById("single"), move.q, move.r));
  assert.ok(move.q !== 0 || move.r !== 0, "Easy chose the scoring move for every draw");
  for (const difficulty of ["medium", "hard"]) {
    const planned = game.chooseAiMove(match, difficulty);
    assert.deepEqual({ ...planned }, { uid: "piece-0", q: 0, r: 0 });
  }
  game.fillShape(match.board, game.shapeById("single"), move.q, move.r, 2);
  assert.equal(game.findCompletedCells(match.board).zoneCount, 0);
});

test("Easy can choose different legal moves on the same board", () => {
  const moves = [() => 0, () => 0.999].map(random => {
    const { game, state } = setup(random);
    const match = state();
    const move = game.chooseAiMove(match, "easy");
    assert.ok(game.canPlace(match.board, game.shapeById("single"), move.q, move.r));
    return { ...move };
  });
  assert.notDeepEqual(moves[0], moves[1]);
});

test("Easy passes only when blocked, even when passing would win", () => {
  const { game, state } = setup(() => 0);
  const match = state();
  match.match.consecutivePasses = 1;
  match.match.scores = [7, 9];
  assert.ok(game.chooseAiMove(match, "easy"), "Easy used a winning pass instead of playing");
  for (const key of Object.keys(match.board.cells)) match.board.cells[key] = 1;
  assert.equal(game.chooseAiMove(match, "easy"), null);
});

test("Hard finds better clears than Medium on a tray that rewards planning ahead", () => {
  const { game, state } = setup();
  const scores = [];
  for (const difficulty of ["medium", "hard"]) {
    const match = state(["single", "line2", "bend3"], 4);
    for (const key of ["0,-3", "0,-2", "2,-2", "3,-2", "-1,-1", "0,-1", "1,-1", "-3,0",
      "1,0", "-3,1", "0,1", "1,1", "2,1", "-3,2", "1,2", "-2,3", "0,3"]) match.board.cells[key] = 1;
    for (let turn = 0; turn < 3; turn += 1) {
      const before = JSON.stringify(match);
      const move = game.chooseAiMove(match, difficulty);
      assert.equal(JSON.stringify(match), before, `${difficulty} changed the live game`);
      const item = match.tray.find(item => item.uid === move.uid);
      assert.ok(!item.used);
      const shape = game.rotateShape(game.shapeById(item.shapeId), item.rotation);
      assert.ok(game.canPlace(match.board, shape, move.q, move.r));
      item.used = true;
      game.fillShape(match.board, shape, move.q, move.r, 2);
      const completed = game.findCompletedCells(match.board);
      game.recordMatchPlacement(match.match, completed);
      game.clearCells(match.board, completed.cells);
    }
    scores.push(match.match.scores[1]);
  }
  assert.ok(scores[0] < scores[1], `Expected a stronger plan on Hard: ${scores}`);
});

test("difficulty defaults to Hard, saves each level, and resets with settings", () => {
  const { game, saved } = setup();
  assert.equal(game.loadPreferences().aiDifficulty, "hard");
  for (const difficulty of ["easy", "medium", "hard"]) {
    const preferences = game.loadPreferences();
    preferences.aiDifficulty = difficulty;
    game.savePreferences(preferences);
    assert.equal(game.loadPreferences().aiDifficulty, difficulty);
  }
  for (const value of [null, "unknown", "constructor"]) {
    saved.set(game.CONFIG.settingsKey, JSON.stringify({ aiEnabled: true, aiDifficulty: value }));
    assert.equal(game.loadPreferences().aiDifficulty, "hard");
  }
  const preferences = game.loadPreferences();
  preferences.aiDifficulty = "easy";
  game.savePreferences(preferences);
  assert.equal(game.loadPreferences("square").aiDifficulty, "hard");
  assert.equal(game.loadPreferences().aiDifficulty, "easy");
  game.resetAllPreferences();
  assert.equal(game.loadPreferences().aiDifficulty, "hard");
});

test("AI passes only when blocked or when a second pass wins", () => {
  const { game, state } = setup();
  const match = state(["line4"]);
  for (const key of Object.keys(match.board.cells)) match.board.cells[key] = 1;
  match.board.cells["0,0"] = 0;
  assert.equal(game.chooseAiMove(match), null);
  const lead = state();
  lead.match.consecutivePasses = 1;
  lead.match.scores = [7, 9];
  assert.equal(game.chooseAiMove(lead), null);
  lead.match.scores = [9, 7];
  assert.ok(game.chooseAiMove(lead), "Losing AI passed with a legal move");
  lead.match.scores = [9, 9];
  assert.ok(game.chooseAiMove(lead), "Tied AI gave up a playable turn");
});

test("AI respects used pieces, fixed turns, and custom pieces on every Hex size", () => {
  const { game, state } = setup();
  const preferences = game.loadPreferences();
  preferences.customPieces = [{ id: "custom-test", cells: [[0,0], [2,0]], weight: 5 }];
  game.savePreferences(preferences);
  for (const side of [4, 5, 6]) {
    const match = state(["single", "line3", "custom-test"], side);
    match.tray[0].used = true;
    match.tray[1].rotation = 2;
    for (const [index, key] of Object.keys(match.board.cells).entries()) {
      if (index % 4 === 0) match.board.cells[key] = index % 3 ? 1 : 2;
    }
    const before = JSON.stringify(match);
    for (const difficulty of ["easy", "medium", "hard"]) {
      const move = game.chooseAiMove(match, difficulty);
      const item = match.tray.find(item => item.uid === move.uid);
      assert.ok(!item.used);
      assert.ok(game.canPlace(match.board, game.rotateShape(game.shapeById(item.shapeId), item.rotation), move.q, move.r));
      assert.equal(JSON.stringify(match), before);
      if (difficulty !== "easy") {
        assert.deepEqual({ ...game.chooseAiMove(match, difficulty) }, { ...move }, "Same board gave a different move");
      }
    }
  }
});

test("AI never acts for the human, a finished game, or Square", () => {
  const { game, state } = setup();
  const match = state();
  match.match.player = 0;
  assert.equal(game.chooseAiMove(match), null);
  match.match.player = 1;
  match.gameOver = true;
  assert.equal(game.chooseAiMove(match), null);
  match.gameOver = false;
  match.board = game.createEmptyBoard(9, "square");
  assert.equal(game.chooseAiMove(match), null);
});

test("VS AI makes the human Blue while local matches still start Red", () => {
  const { game, state } = setup();
  const match = state();
  assert.equal(game.matchPlayerColor(match, 0), "blue");
  assert.equal(game.matchPlayerColor(match, 1), "red");
  match.aiOpponent = false;
  assert.equal(game.matchPlayerColor(match, 0), "red");
  assert.equal(game.matchPlayerColor(match, 1), "blue");
  assert.equal(game.createMatch().player, 0);
});

test("an existing AI save keeps each owner's pieces, scores, and Undo after the color swap", () => {
  const { game, state } = setup();
  const match = state();
  match.board.cells["0,0"] = 1;
  match.board.cells["1,0"] = 2;
  match.match.scores = [17, 9];
  match.history = [{ board: game.cloneBoard(match.board), match: game.cloneMatch(match.match) }];
  game.saveGame(match);
  const restored = game.loadGame("ai");
  assert.deepEqual([...restored.match.scores], [17, 9]);
  assert.equal(game.matchPlayerColor(restored, restored.board.cells["0,0"] - 1), "blue");
  assert.equal(game.matchPlayerColor(restored, restored.board.cells["1,0"] - 1), "red");
  assert.deepEqual([...restored.history[0].match.scores], [17, 9]);
  assert.equal(restored.history[0].board.cells["0,0"], 1);
});

test("AI, two player, and solo saves stay apart, including global reset", () => {
  const { game, saved, state } = setup();
  const ai = state();
  ai.match.scores[1] = 9;
  const local = state();
  local.aiOpponent = false;
  local.match.scores[0] = 7;
  const solo = state();
  solo.aiOpponent = false;
  solo.match = null;
  game.saveGame(ai); game.saveGame(local); game.saveGame(solo);
  assert.equal(game.loadGame("ai").match.scores[1], 9);
  assert.equal(game.loadGame(true).match.scores[0], 7);
  assert.equal(game.loadGame().match, null);
  assert.equal(game.loadGame("ai", "square"), null);
  saved.set(game.CONFIG.aiStorageKey, saved.get(game.CONFIG.twoPlayerStorageKey));
  assert.equal(game.loadGame("ai"), null, "Loaded a local match as an AI match");
  game.saveGame(ai);
  game.resetSavedGames();
  assert.equal(game.loadGame("ai"), null);
  assert.equal(game.loadGame(true), null);
  assert.equal(game.loadGame(), null);
});

test("VS AI is a separate Hex setting and cannot enable a Square match", () => {
  const { game } = setup();
  const preferences = game.loadPreferences();
  Object.assign(preferences, { aiEnabled: true, twoPlayerEnabled: true, timeTrialEnabled: true });
  game.savePreferences(preferences);
  assert.equal(game.loadPreferences().aiEnabled, true);
  assert.equal(game.loadPreferences().twoPlayerEnabled, false);
  assert.equal(game.loadPreferences().timeTrialEnabled, false);
  game.savePreferences(preferences, "square");
  assert.equal(game.loadPreferences("square").aiEnabled, false);
  assert.equal(game.loadPreferences("square").twoPlayerEnabled, false);
  assert.equal(game.loadPreferences().aiEnabled, true);
});
