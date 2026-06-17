(function () {
// Central tuning values for the board, tray, touch behavior, and saved data.
// Change these values to rebalance the game without editing the game engine.
const CONFIG = {
  trayCellSize: 22,
  pickupAreaPadding: 18,

  // The piece starts above the pointer, then rises farther as the pointer
  // travels away from the tray. This keeps the board visible under a finger.
  drag: {
    baseLiftPx: 110,
    maxExtraLiftPx: 110,
    maxHorizontalOffsetPx: 110,
    extraLiftDistancePx: 360,

    // Once a valid position is reached, require this much extra cell travel
    // before allowing the piece to move into an invalid position. 0.5 = 50%.
    invalidMoveResistance: 0.5,
  },

  storageKey: "generic-block-game-state-v1",
  bestScoreKey: "generic-block-game-best-v1",
  modifiedBestScoreKey: "generic-block-game-best-modified-v1",
  timedBestScoreKey: "generic-block-game-best-timed-v1",
  timedModifiedBestScoreKey: "generic-block-game-best-timed-modified-v1",
  settingsKey: "generic-block-game-settings-v1",
};

window.GenericBlockGame = window.GenericBlockGame || {};
window.GenericBlockGame.CONFIG = CONFIG;
}());
