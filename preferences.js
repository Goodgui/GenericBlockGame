(function () {
const { CONFIG } = window.GenericBlockGame;

function defaultPreferences() {
  return {
    undoEnabled: true,
    pieces: {},
    customPieces: [],
    frequencyVersion: 2,
    dragInitialOffset: 110,
    dragMovingOffset: 110,
    dragHorizontalOffset: 110,
    pieceHue: 212,
    snapOverlapMultiplier: 2.0,
    traySize: 3,
    boardSide: 5,
    timeTrialEnabled: false,
    timeTrialSeconds: 180,
  };
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG.settingsKey));
    const preferences = { ...defaultPreferences(), ...saved };
    if (![4, 5, 6].includes(Number(preferences.boardSide))) {
      preferences.boardSide = 5;
    }
    if (preferences.frequencyVersion !== 2) {
      for (const setting of Object.values(preferences.pieces || {})) delete setting.weight;
      preferences.frequencyVersion = 2;
      localStorage.setItem(CONFIG.settingsKey, JSON.stringify(preferences));
    }
    return preferences;
  } catch {
    return defaultPreferences();
  }
}

function savePreferences(preferences) {
  localStorage.setItem(CONFIG.settingsKey, JSON.stringify(preferences));
}

// Internal migration fields do not affect score mode. Piece overrides only
// count as modified when their effective value differs from the defaults.
function isDefaultPreferences(preferences = loadPreferences()) {
  const defaults = defaultPreferences();
  const pieceSettingsAreDefault = Object.values(preferences.pieces || {}).every(setting => {
    const enabledIsDefault = setting.enabled === undefined || setting.enabled === true;
    const weightIsDefault = setting.weight === undefined || Number(setting.weight) === 5;
    return enabledIsDefault && weightIsDefault;
  });

  return Number(preferences.traySize) === defaults.traySize
    && Number(preferences.boardSide) === defaults.boardSide
    && (preferences.customPieces || []).length === 0
    && pieceSettingsAreDefault;
}

// Time Trial has its own default check. The mode toggle itself is not a
// modification, but changing its duration from three minutes is.
function isDefaultTimedPreferences(preferences = loadPreferences()) {
  return isDefaultPreferences(preferences)
    && Number(preferences.timeTrialSeconds) === 180;
}

Object.assign(window.GenericBlockGame, {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  isDefaultPreferences,
  isDefaultTimedPreferences,
});
}());
