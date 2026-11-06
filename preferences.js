(function () {
const { CONFIG, storageKeys } = window.GenericBlockGame;

function getBoardMode() {
  return localStorage.getItem(CONFIG.boardModeKey) === "square" ? "square" : "hex";
}

function setBoardMode(mode) {
  if (mode === "hex" || mode === "square") localStorage.setItem(CONFIG.boardModeKey, mode);
}

function defaultGlobalPreferences() {
  return { dragInitialOffset: 100, dragMovingOffset: 180, dragHorizontalOffset: 170, pieceHue: 212 };
}

function defaultModePreferences(mode = getBoardMode()) {
  return {
    undoEnabled: true,
    pieces: {},
    customPieces: [],
    frequencyVersion: 2,
    boardSettingsVersion: 1,
    snapOverlapMultiplier: mode === "hex" ? 1.5 : 2.0,
    traySize: 3,
    boardSide: mode === "hex" ? 5 : 9,
    timeTrialEnabled: false,
    twoPlayerEnabled: false,
    timeTrialSeconds: 180,
  };
}

function defaultPreferences(mode = getBoardMode()) {
  return { ...defaultModePreferences(mode), ...defaultGlobalPreferences() };
}

function readSettings(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

function pickSettings(source, defaults) {
  return Object.fromEntries(Object.keys(defaults).map(key => [key, source[key] ?? defaults[key]]));
}

function loadGlobalPreferences() {
  const defaults = defaultGlobalPreferences();
  const saved = readSettings(CONFIG.globalSettingsKey);
  if (saved) return pickSettings(saved, defaults);
  const legacy = readSettings(storageKeys(getBoardMode()).settingsKey)
    || readSettings(storageKeys(getBoardMode() === "hex" ? "square" : "hex").settingsKey) || {};
  const global = pickSettings(legacy, defaults);
  // Replace the old offset defaults while keeping custom values.
  for (const key of ["dragInitialOffset", "dragMovingOffset", "dragHorizontalOffset"]) {
    if (global[key] === 110) global[key] = defaults[key];
  }
  localStorage.setItem(CONFIG.globalSettingsKey, JSON.stringify(global));
  return global;
}

function loadPreferences(mode = getBoardMode()) {
  const defaults = defaultModePreferences(mode);
  const key = storageKeys(mode).settingsKey;
  const saved = readSettings(key) || {};
  const preferences = pickSettings(saved, defaults);
  if (mode === "square" && saved.boardSide === undefined && saved.boardWidth !== undefined) {
    preferences.boardSide = Number(saved.boardWidth);
  }
  const sizes = mode === "hex" ? [4, 5, 6] : [6, 9, 12];
  preferences.boardSide = Number(preferences.boardSide);
  if (!sizes.includes(preferences.boardSide)) preferences.boardSide = defaults.boardSide;
  if (mode === "square") preferences.twoPlayerEnabled = false;
  if (saved.boardSettingsVersion !== 1 && mode === "hex" && preferences.snapOverlapMultiplier === 2) {
    preferences.snapOverlapMultiplier = 1.5;
  }
  if (preferences.frequencyVersion !== 2) {
    for (const setting of Object.values(preferences.pieces)) delete setting.weight;
    preferences.frequencyVersion = 2;
  }
  const global = loadGlobalPreferences();
  if (Object.keys(saved).length) localStorage.setItem(key, JSON.stringify(preferences));
  return { ...preferences, ...global };
}

function savePreferences(preferences, mode = getBoardMode()) {
  const modeSettings = pickSettings(preferences, defaultModePreferences(mode));
  if (mode === "square") modeSettings.twoPlayerEnabled = false;
  localStorage.setItem(storageKeys(mode).settingsKey, JSON.stringify(modeSettings));
  localStorage.setItem(CONFIG.globalSettingsKey,
    JSON.stringify(pickSettings(preferences, defaultGlobalPreferences())));
}

function resetAllPreferences() {
  localStorage.setItem(CONFIG.globalSettingsKey, JSON.stringify(defaultGlobalPreferences()));
  for (const mode of ["hex", "square"]) {
    localStorage.setItem(storageKeys(mode).settingsKey, JSON.stringify(defaultModePreferences(mode)));
  }
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
  getBoardMode,
  setBoardMode,
  resetAllPreferences,
  defaultPreferences,
  loadPreferences,
  savePreferences,
  isDefaultPreferences,
  isDefaultTimedPreferences,
});
}());
