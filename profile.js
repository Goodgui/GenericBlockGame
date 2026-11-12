(function () {
const game = window.GenericBlockGame;
const boards = ["hex", "square"];
const scoreNames = ["solo", "modifiedSolo", "timeTrial", "modifiedTimeTrial"];
const globalNames = ["slowModeEnabled", "dragInitialOffset", "dragMovingOffset", "dragHorizontalOffset", "pieceHue"];
const modeNames = ["undoEnabled", "pieces", "customPieces", "frequencyVersion", "boardSettingsVersion",
  "snapOverlapMultiplier", "traySize", "boardSide", "timeTrialEnabled", "twoPlayerEnabled", "aiEnabled", "aiDifficulty", "timeTrialSeconds"];
const listeners = new Set();
let restoring = false;

function emit(event) {
  if (restoring) return;
  try { window.GenericBlockGameHost?.onEvent?.(JSON.parse(JSON.stringify(event))); }
  catch (error) { window.console?.error("Game host listener failed", error); }
  for (const listener of listeners) {
    try { listener(JSON.parse(JSON.stringify(event))); }
    catch (error) { window.console?.error("Game host listener failed", error); }
  }
}

function object(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`Invalid ${label}.`);
}

function number(value, min, max, integer = true) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error("Invalid profile number.");
  }
}

function boolean(value) {
  if (typeof value !== "boolean") throw new Error("Invalid profile switch.");
}

function validateProfile(input) {
  const serialized = JSON.stringify(input);
  if (typeof serialized !== "string") throw new Error("Invalid profile.");
  if (serialized.length > 262144) throw new Error("Profile is too large.");
  const profile = JSON.parse(serialized);
  object(profile, ["version", "settings", "bests"], "profile");
  if (profile.version !== 1) throw new Error("Unsupported profile version.");
  object(profile.settings, ["boardMode", "global", ...boards], "settings");
  if (!boards.includes(profile.settings.boardMode)) throw new Error("Invalid board mode.");
  object(profile.settings.global, globalNames, "shared settings");
  const global = profile.settings.global;
  boolean(global.slowModeEnabled);
  number(global.dragInitialOffset, 0, 300);
  number(global.dragMovingOffset, 0, 400);
  number(global.dragHorizontalOffset, 0, 400);
  number(global.pieceHue, 0, 359);
  object(profile.bests, boards, "best scores");
  for (const board of boards) {
    const mode = profile.settings[board];
    object(mode, modeNames, `${board} settings`);
    for (const name of ["undoEnabled", "timeTrialEnabled", "twoPlayerEnabled", "aiEnabled"]) boolean(mode[name]);
    if (board === "square" && (mode.aiEnabled || mode.twoPlayerEnabled)) throw new Error("Invalid Square match.");
    if ((mode.aiEnabled && mode.twoPlayerEnabled) || ((mode.aiEnabled || mode.twoPlayerEnabled) && mode.timeTrialEnabled)) {
      throw new Error("Invalid game mode.");
    }
    if (!["easy", "medium", "hard"].includes(mode.aiDifficulty)) throw new Error("Invalid AI setting.");
    if (mode.frequencyVersion !== 2 || mode.boardSettingsVersion !== 1) throw new Error("Unsupported settings version.");
    number(mode.snapOverlapMultiplier, 1, 3, false);
    number(mode.traySize, 1, 8);
    number(mode.timeTrialSeconds, 30, 600);
    if (!(board === "hex" ? [4, 5, 6] : [6, 9, 12]).includes(mode.boardSide)) throw new Error("Invalid board size.");
    if (!mode.pieces || typeof mode.pieces !== "object" || Array.isArray(mode.pieces)
      || Object.keys(mode.pieces).length > 256) throw new Error("Invalid piece settings.");
    for (const [id, setting] of Object.entries(mode.pieces)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)
        || !setting || typeof setting !== "object" || Array.isArray(setting)
        || Object.keys(setting).some(key => !["enabled", "weight"].includes(key))) throw new Error("Invalid piece setting.");
      if (setting.enabled !== undefined) boolean(setting.enabled);
      if (setting.weight !== undefined) number(setting.weight, 0, 100, false);
    }
    if (!Array.isArray(mode.customPieces) || mode.customPieces.length > 100) throw new Error("Invalid custom pieces.");
    const ids = new Set();
    for (const piece of mode.customPieces) {
      object(piece, ["id", "name", "weight", "cells"], "custom piece");
      if (typeof piece.id !== "string" || !/^custom-[a-zA-Z0-9_-]{1,90}$/.test(piece.id) || ids.has(piece.id)) {
        throw new Error("Invalid custom piece ID.");
      }
      ids.add(piece.id);
      if (typeof piece.name !== "string" || piece.name.length > 64) throw new Error("Invalid piece name.");
      number(piece.weight, 1, 100, false);
      if (!Array.isArray(piece.cells) || !piece.cells.length || piece.cells.length > 121) throw new Error("Invalid piece cells.");
      const cells = new Set();
      for (const cell of piece.cells) {
        if (!Array.isArray(cell) || cell.length !== 2) throw new Error("Invalid piece cell.");
        cell.forEach(value => number(value, -20, 20));
        if (cells.has(cell.join(","))) throw new Error("Duplicate piece cell.");
        cells.add(cell.join(","));
      }
    }
    object(profile.bests[board], scoreNames, "best scores");
    for (const score of Object.values(profile.bests[board])) number(score, 0, Number.MAX_SAFE_INTEGER);
  }
  return profile;
}

function exportProfile() {
  const profile = { version: 1, settings: { boardMode: game.getBoardMode() }, bests: {} };
  const select = (source, names) => Object.fromEntries(names.map(name => [name, source[name]]));
  profile.settings.global = select(game.loadPreferences("hex"), globalNames);
  for (const board of boards) {
    profile.settings[board] = select(game.loadPreferences(board), modeNames);
    profile.bests[board] = {
      solo: game.loadBestScore(board), modifiedSolo: game.loadModifiedBestScore(board),
      timeTrial: game.loadTimedBestScore(false, board), modifiedTimeTrial: game.loadTimedBestScore(true, board),
    };
  }
  return validateProfile(profile);
}

function restoreProfile(input) {
  const profile = validateProfile(input);
  const local = exportProfile();
  for (const board of boards) for (const name of scoreNames) {
    profile.bests[board][name] = Math.max(profile.bests[board][name], local.bests[board][name]);
  }
  const changes = [[game.CONFIG.boardModeKey, profile.settings.boardMode]];
  const globalVersion = game.loadSeenVersion();
  changes.push([game.CONFIG.globalSettingsKey, JSON.stringify({ ...profile.settings.global, version: globalVersion })]);
  for (const board of boards) {
    const keys = game.storageKeys(board);
    changes.push([keys.settingsKey, JSON.stringify(profile.settings[board])]);
    for (const [name, key] of [["solo", keys.bestScoreKey], ["modifiedSolo", keys.modifiedBestScoreKey],
      ["timeTrial", keys.timedBestScoreKey], ["modifiedTimeTrial", keys.timedModifiedBestScoreKey]]) {
      changes.push([key, String(profile.bests[board][name])]);
    }
  }
  const previous = changes.map(([key]) => [key, localStorage.getItem(key)]);
  restoring = true;
  try {
    for (const [key, value] of changes) localStorage.setItem(key, value);
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  } finally { restoring = false; }
  emit({ type: "profile-restored" });
  emit({ type: "profile-changed" });
  return exportProfile();
}

function createScoreRun(preferences, board, timed) {
  return {
    version: 1, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    board, mode: timed ? "time-trial" : "solo", rulesVersion: 2,
    match: preferences.aiEnabled ? "ai" : preferences.twoPlayerEnabled ? "two-player" : "solo",
    defaultRules: timed ? game.isDefaultTimedPreferences(preferences) : game.isDefaultPreferences(preferences),
    context: window.GenericBlockGameHost?.getScoreContext?.() ?? null,
    finishedScore: -1,
  };
}

function trackScoreRun(state) {
  if (!state.scoreRun) {
    state.scoreRun = createScoreRun(game.loadPreferences(), state.board.type, state.timedMode);
    state.scoreRun.defaultRules = false;
  }
  const run = state.scoreRun;
  const preferences = game.loadPreferences();
  run.defaultRules = run.defaultRules === true && run.version === 1 && run.rulesVersion === 2
    && run.board === state.board.type && run.mode === (state.timedMode ? "time-trial" : "solo")
    && !state.match && !state.aiOpponent && !preferences.twoPlayerEnabled && !preferences.aiEnabled
    && (state.timedMode ? game.isDefaultTimedPreferences(preferences) : game.isDefaultPreferences(preferences));
  return run;
}

function finishScoreRun(state) {
  const run = trackScoreRun(state);
  if (!state.gameOver || state.score <= run.finishedScore) return;
  run.finishedScore = state.score;
  emit({ type: "run-finished", run: { ...run, score: state.score } });
}

Object.assign(game, {
  profile: { version: 1, export: exportProfile, validate: validateProfile, restore: restoreProfile,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
  notifyProfileChanged: () => emit({ type: "profile-changed" }),
  createScoreRun, trackScoreRun, finishScoreRun,
});
}());
