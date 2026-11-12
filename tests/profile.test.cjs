const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const saved = new Map();
  let failKey = null;
  const context = vm.createContext({ window: { GenericBlockGameHost: { getScoreContext: () => "tester-a" } },
    localStorage: { getItem: key => saved.get(key) ?? null,
      setItem(key, value) { if (key === failKey) { failKey = null; throw new Error("Storage full"); } saved.set(key, String(value)); },
      removeItem: key => saved.delete(key) } });
  for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "two-player.js", "storage.js", "profile.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  return { game: context.window.GenericBlockGame, saved, failOnce: key => { failKey = key; } };
}
const plain = value => JSON.parse(JSON.stringify(value));

test("profile exports all settings and eight best categories, with no unfinished game data", () => {
  const { game, saved } = setup();
  const settings = game.loadPreferences("hex");
  settings.customPieces = [{ id: "custom-test", name: "Test", weight: 4, cells: [[0, 0], [1, 1]] }];
  settings.pieces = { line2: { enabled: false, weight: 0 } };
  settings.dragInitialOffset = 45;
  game.savePreferences(settings, "hex");
  let score = 100;
  for (const board of ["hex", "square"]) {
    game.saveBestScore(score++, board); game.saveModifiedBestScore(score++, board);
    game.saveTimedBestScore(score++, false, board); game.saveTimedBestScore(score++, true, board);
  }
  for (const key of [game.CONFIG.storageKey, game.CONFIG.aiStorageKey, game.CONFIG.twoPlayerStorageKey, game.storageKeys("square").storageKey]) {
    saved.set(key, '{"private":"unfinished board, tray, timer, history"}');
  }
  const profile = game.profile.export();
  assert.deepEqual(Object.keys(profile).sort(), ["bests", "settings", "version"]);
  assert.equal(profile.settings.global.dragInitialOffset, 45);
  assert.equal(profile.settings.hex.customPieces[0].name, "Test");
  assert.equal(profile.settings.hex.pieces.line2.enabled, false);
  assert.deepEqual(plain(profile.bests.hex), { solo: 100, modifiedSolo: 101, timeTrial: 102, modifiedTimeTrial: 103 });
  assert.deepEqual(plain(profile.bests.square), { solo: 104, modifiedSolo: 105, timeTrial: 106, modifiedTimeTrial: 107 });
  assert.doesNotMatch(JSON.stringify(profile), /unfinished|history|timeRemainingMs|scoreRun|seenVersion/);
});

test("restore takes saved settings and higher bests, preserving unfinished games and the seen version", () => {
  const { game, saved } = setup();
  game.saveSeenVersion("local-version");
  const backup = game.profile.export();
  backup.settings.global.pieceHue = 80;
  backup.settings.square.traySize = 4;
  backup.settings.boardMode = "square";
  backup.bests.hex.solo = 200;
  backup.bests.hex.modifiedSolo = 40;
  backup.bests.square.timeTrial = 300;
  game.saveBestScore(100, "hex"); game.saveModifiedBestScore(90, "hex");
  const gameKeys = [game.CONFIG.storageKey, game.CONFIG.aiStorageKey, game.CONFIG.twoPlayerStorageKey, game.storageKeys("square").storageKey];
  for (const key of gameKeys) saved.set(key, `unfinished:${key}`);
  const events = [];
  game.profile.subscribe(event => events.push(event.type));
  const restored = game.profile.restore(backup);
  assert.equal(game.getBoardMode(), "square");
  assert.equal(game.loadPreferences().pieceHue, 80);
  assert.equal(game.loadPreferences().traySize, 4);
  assert.equal(restored.bests.hex.solo, 200);
  assert.equal(restored.bests.hex.modifiedSolo, 90);
  assert.equal(restored.bests.square.timeTrial, 300);
  for (const key of gameKeys) assert.equal(saved.get(key), `unfinished:${key}`);
  assert.equal(game.loadSeenVersion(), "local-version");
  assert.deepEqual(events, ["profile-restored", "profile-changed"]);
});

test("invalid profiles are rejected before any storage change", () => {
  const { game, saved } = setup();
  const valid = plain(game.profile.export());
  const before = [...saved];
  for (const change of [
    profile => { profile.version = 2; },
    profile => { profile.board = {}; },
    profile => { delete profile.settings.hex; },
    profile => { profile.bests.hex.solo = -1; },
    profile => { profile.bests.square.timeTrial = "10"; },
    profile => { profile.settings.global.pieceHue = 500; },
    profile => { profile.settings.hex.customPieces = [{ id: "custom-bad", name: "Bad", weight: 5, cells: [] }]; },
    profile => { profile.settings.square.aiEnabled = true; },
    profile => { profile.settings.hex.pieces = { single: { weight: 500 } }; },
    profile => { profile.settings.hex.traySize = 0; },
  ]) {
    const bad = plain(valid); change(bad);
    assert.throws(() => game.profile.restore(bad));
    assert.deepEqual([...saved], before);
  }
});

test("a failed restore rolls back all profile keys and sends no success event", () => {
  const { game, saved, failOnce } = setup();
  const backup = game.profile.export();
  backup.settings.boardMode = "square";
  backup.settings.global.pieceHue = 90;
  const before = [...saved].sort();
  const events = [];
  game.profile.subscribe(event => events.push(event));
  failOnce(game.storageKeys("square").settingsKey);
  assert.throws(() => game.profile.restore(backup), /Storage full/);
  assert.deepEqual([...saved].sort(), before);
  assert.deepEqual(events, []);
});

test("settings and best writes notify the host without replacing storage functions", () => {
  const { game } = setup();
  const events = [];
  game.profile.subscribe(event => events.push(event.type));
  game.savePreferences(game.loadPreferences()); game.saveBestScore(12); game.saveModifiedBestScore(13); game.saveTimedBestScore(14);
  assert.deepEqual(events, Array(4).fill("profile-changed"));
});

test("a run cannot regain eligibility after using modified rules", () => {
  const { game } = setup();
  const preferences = game.loadPreferences();
  const state = { board: game.createEmptyBoard(), score: 123, gameOver: false, timedMode: false,
    scoreRun: game.createScoreRun(preferences, "hex", false) };
  const events = [];
  game.profile.subscribe(event => events.push(event));
  game.finishScoreRun(state);
  assert.equal(events.length, 0);
  game.savePreferences({ ...preferences, traySize: 4 });
  game.trackScoreRun(state);
  game.savePreferences(preferences);
  game.trackScoreRun(state);
  state.gameOver = true;
  game.finishScoreRun(state);
  const run = events.find(event => event.type === "run-finished").run;
  assert.equal(run.defaultRules, false);
  assert.equal(run.context, "tester-a");
});

test("old runs are ineligible and a finished score only emits once until improved", () => {
  const { game } = setup();
  const state = { board: game.createEmptyBoard(), score: 123, gameOver: true, timedMode: false };
  const events = [];
  game.profile.subscribe(event => events.push(event));
  game.finishScoreRun(state); game.finishScoreRun(state);
  assert.equal(events.length, 1);
  assert.equal(events[0].run.defaultRules, false);
  state.score = 150; game.finishScoreRun(state);
  assert.equal(events.length, 2);
});
