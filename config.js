(function () {
// Central tuning values for the board, tray, touch behavior, and saved data.
// Change these values to rebalance the game without editing the game engine.
const CONFIG = {
  trayCellSize: 22,
  pickupAreaPadding: 18,

  // The piece starts above the pointer, then rises farther as the pointer
  // travels away from the tray. This keeps the board visible under a finger.
  drag: {
    baseLiftPx: 100,
    maxExtraLiftPx: 180,
    maxHorizontalOffsetPx: 170,
    extraLiftDistancePx: 360,

    // Once a valid position is reached, require this much extra cell travel
    // before allowing the piece to move into an invalid position. 0.5 = 50%.
    invalidMoveResistance: 0.5,
  },

  storageKey: "generic-block-game-hex-state-v1",
  twoPlayerStorageKey: "generic-block-game-hex-two-player-v1",
  bestScoreKey: "generic-block-game-hex-best-v1",
  modifiedBestScoreKey: "generic-block-game-hex-best-modified-v1",
  timedBestScoreKey: "generic-block-game-hex-best-timed-v1",
  timedModifiedBestScoreKey: "generic-block-game-hex-best-timed-modified-v1",
  settingsKey: "generic-block-game-hex-settings-v1",
  globalSettingsKey: "generic-block-game-global-settings-v1",
  boardModeKey: "generic-block-game-board-mode-v1",
};

const SQUARE_STORAGE = {
  storageKey: "generic-block-game-state-v1",
  bestScoreKey: "generic-block-game-best-v1",
  modifiedBestScoreKey: "generic-block-game-best-modified-v1",
  timedBestScoreKey: "generic-block-game-best-timed-v1",
  timedModifiedBestScoreKey: "generic-block-game-best-timed-modified-v1",
  settingsKey: "generic-block-game-settings-v1",
};

function storageKeys(mode = window.GenericBlockGame.getBoardMode?.() || "hex") {
  return mode === "square" ? SQUARE_STORAGE : CONFIG;
}

window.GenericBlockGame = window.GenericBlockGame || {};
window.GenericBlockGame.CONFIG = CONFIG;
window.GenericBlockGame.storageKeys = storageKeys;
}());
