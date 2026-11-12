(function () {
const {
  getBoardMode,
  resetAllPreferences,
  rotationCount,
  rotateShape,
  getAllShapes,
  loadPreferences,
  savePreferences,
  shapeDimensions,
  makePiece,
  buildHexGrid,
  buildSquareGrid,
  APP_VERSION,
  CHANGELOG,
  loadSeenVersion,
  saveSeenVersion,
} = window.GenericBlockGame;

const panel = document.querySelector("#settingsPanel");
const closeButton = document.querySelector("#settingsCloseButton");
const undoSetting = document.querySelector("#undoSetting");
const slowModeSetting = document.querySelector("#slowModeSetting");
const gameModeSetting = document.querySelector("#gameModeSetting");
const aiDifficultySetting = document.querySelector("#aiDifficultySetting");
const aiDifficultyRow = document.querySelector("#aiDifficultyRow");
const boardTypeSetting = document.querySelector("#boardTypeSetting");
const boardSettingsContent = document.querySelector("#boardSettingsContent");
const timeTrialDurationSetting = document.querySelector("#timeTrialDurationSetting");
const timeTrialDurationRow = document.querySelector("#timeTrialDurationRow");
const dragInitialOffsetSetting = document.querySelector("#dragInitialOffsetSetting");
const dragMovingOffsetSetting = document.querySelector("#dragMovingOffsetSetting");
const dragHorizontalOffsetSetting = document.querySelector("#dragHorizontalOffsetSetting");
const pieceHueSetting = document.querySelector("#pieceHueSetting");
const pieceHueValue = document.querySelector("#pieceHueValue");
const snapOverlapSetting = document.querySelector("#snapOverlapSetting");
const traySizeSetting = document.querySelector("#traySizeSetting");
const boardSizeSetting = document.querySelector("#boardSizeSetting");
const resetBestButton = document.querySelector("#resetBestButton");
const resetSettingsButton = document.querySelector("#resetSettingsButton");
const resetConfirmation = document.querySelector("#resetConfirmation");
const resetConfirmationText = document.querySelector("#resetConfirmationText");
const cancelResetButton = document.querySelector("#cancelResetButton");
const confirmResetButton = document.querySelector("#confirmResetButton");
const pieceList = document.querySelector("#pieceSettingsList");
const editor = document.querySelector("#shapeEditor");
const nameInput = document.querySelector("#customPieceName");
const weightInput = document.querySelector("#customPieceWeight");
const message = document.querySelector("#designerMessage");
const clearButton = document.querySelector("#clearDesignerButton");
const saveButton = document.querySelector("#saveCustomPieceButton");
const appVersion = document.querySelector("#appVersion");
const changelogModal = document.querySelector("#changelogModal");
const changelogVersion = document.querySelector("#changelogVersion");
const changelogList = document.querySelector("#changelogList");
const changelogButton = document.querySelector("#changelogButton");

let preferences = loadPreferences();
let selectedCells = new Set();
let editorMode = null;
let callbacks = {};
let pendingReset = null;

// Small previews make the piece list scannable without relying on IDs alone.
function makePreview(shape) {
  const { width, height } = shapeDimensions(shape);
  const preview = document.createElement("div");
  preview.className = "settings-piece-preview";
  preview.append(makePiece(shape, Math.min(9, 46 / width, 46 / height)));
  return preview;
}

function renderPieceList() {
  pieceList.replaceChildren();
  const customIds = new Set(preferences.customPieces.map(shape => shape.id));

  for (const shape of getAllShapes()) {
    const setting = preferences.pieces[shape.id] || {};
    const row = document.createElement("div");
    row.className = "piece-setting-row";

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = setting.enabled !== false;
    enabled.setAttribute("aria-label", `Enable ${shape.name || shape.id}`);

    const preview = makePreview(shape);
    const label = document.createElement("span");
    label.className = "piece-setting-name";
    label.textContent = shape.name || shape.id;

    const frequency = document.createElement("input");
    frequency.type = "number";
    frequency.min = "0";
    frequency.max = "100";
    frequency.value = String(setting.weight ?? shape.weight);
    frequency.className = "frequency-input";
    frequency.setAttribute("aria-label", `${shape.name || shape.id} frequency`);

    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.className = "frequency-button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Decrease ${shape.name || shape.id} frequency`);

    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = "frequency-button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Increase ${shape.name || shape.id} frequency`);

    const frequencyControl = document.createElement("div");
    frequencyControl.className = "frequency-control";
    frequencyControl.append(decrease, frequency, increase);

    const setFrequency = value => {
      const nextValue = Math.max(0, Math.min(100, value));
      frequency.value = String(nextValue);
      updatePiece(shape.id, { weight: nextValue });
    };

    enabled.addEventListener("change", () => updatePiece(shape.id, { enabled: enabled.checked }));
    decrease.addEventListener("click", () => setFrequency((Number(frequency.value) || 0) - 1));
    increase.addEventListener("click", () => setFrequency((Number(frequency.value) || 0) + 1));
    frequency.addEventListener("change", () => setFrequency(Number(frequency.value) || 0));

    row.append(enabled, preview, label, frequencyControl);
    if (customIds.has(shape.id)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-piece-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Delete ${shape.name || shape.id}`);
      remove.addEventListener("click", () => removeCustomPiece(shape.id));
      row.append(remove);
    }
    pieceList.append(row);
  }
}

function updatePiece(id, change) {
  preferences.pieces[id] = { ...preferences.pieces[id], ...change };
  saveAndNotify();
}

function removeCustomPiece(id) {
  preferences.customPieces = preferences.customPieces.filter(shape => shape.id !== id);
  delete preferences.pieces[id];
  saveAndNotify();
  renderPieceList();
}

function buildEditor() {
  const square = getBoardMode() === "square";
  const build = square ? buildSquareGrid : buildHexGrid;
  editor.classList.toggle("square-editor", square);
  document.querySelector("#pieceEditorHint").textContent = `Select ${square ? "square" : "hex"} cells to make a piece.`;
  build(editor, square ? 5 : 3, (q, r, key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cell = key;
    button.setAttribute("aria-label", `Editor ${square ? "square" : "hex"} ${q}, ${r}`);
    button.classList.toggle("selected", selectedCells.has(key));
    button.setAttribute("aria-pressed", String(selectedCells.has(key)));
    button.addEventListener("click", () => {
      selectedCells.has(key) ? selectedCells.delete(key) : selectedCells.add(key);
      button.classList.toggle("selected", selectedCells.has(key));
      button.setAttribute("aria-pressed", String(selectedCells.has(key)));
      message.textContent = "";
    });
    return button;
  });
}

function clearEditor() {
  selectedCells.clear();
  editor.querySelectorAll("button").forEach(button => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
  nameInput.value = "";
  message.textContent = "";
}

// Produces a position-independent key so layouts can be compared reliably.
function layoutKey(cells) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx)
    .map(([x, y]) => `${x},${y}`)
    .join(";");
}

// Checks every rotation, so a sideways copy also counts as an existing piece.
function pieceAlreadyExists(cells) {
  const candidateKeys = new Set();

  for (let turn = 0; turn < rotationCount(); turn += 1) {
    candidateKeys.add(layoutKey(rotateShape({ cells }, turn).cells));
  }

  return getAllShapes().some(shape => candidateKeys.has(layoutKey(shape.cells)));
}

function saveCustomPiece() {
  const cells = [...selectedCells].map(key => key.split(",").map(Number));
  if (!cells.length) {
    message.textContent = "Select at least one cell.";
    return;
  }
  const [anchorQ, anchorR] = cells[0];
  const normalized = cells.map(([q, r]) => [q - anchorQ, r - anchorR]);
  if (pieceAlreadyExists(normalized)) {
    message.textContent = "This piece already exists, possibly in another orientation.";
    return;
  }
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const usedCustomNumbers = preferences.customPieces
    .map(shape => /^Custom (\d+)$/.exec(shape.name || ""))
    .filter(Boolean)
    .map(match => Number(match[1]));
  const nextCustomNumber = Math.max(0, ...usedCustomNumbers) + 1;
  const shape = {
    id,
    name: nameInput.value.trim() || `Custom ${nextCustomNumber}`,
    weight: Math.max(1, Number(weightInput.value) || 1),
    cells: normalized,
  };

  preferences.customPieces.push(shape);
  saveAndNotify();
  clearEditor();
  renderPieceList();
  message.textContent = `${shape.name} added.`;
}

function saveAndNotify() {
  savePreferences(preferences);
  callbacks.onChange?.(preferences);
}

// Accessibility changes apply live without restarting or changing score mode.
function saveAccessibilityAndNotify() {
  savePreferences(preferences);
  callbacks.onAccessibilityChange?.(preferences);
}

function renderSettings() {
  preferences = loadPreferences();
  const mode = getBoardMode();
  boardTypeSetting.style.setProperty("--selected-index", mode === "hex" ? 0 : 1);
  boardTypeSetting.querySelectorAll("button").forEach(button => {
    const selected = button.dataset.boardMode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", String(selected));
    if (selected) boardSettingsContent.setAttribute("aria-labelledby", button.id);
  });
  undoSetting.checked = preferences.undoEnabled;
  slowModeSetting.checked = preferences.slowModeEnabled;
  updateGameModeControl();
  timeTrialDurationSetting.value = String(preferences.timeTrialSeconds);
  timeTrialDurationRow.hidden = !preferences.timeTrialEnabled;
  dragInitialOffsetSetting.value = String(preferences.dragInitialOffset);
  dragMovingOffsetSetting.value = String(preferences.dragMovingOffset);
  dragHorizontalOffsetSetting.value = String(preferences.dragHorizontalOffset);
  pieceHueSetting.value = String(preferences.pieceHue);
  pieceHueValue.textContent = `${preferences.pieceHue}°`;
  snapOverlapSetting.value = Number(preferences.snapOverlapMultiplier).toFixed(1);
  traySizeSetting.value = String(preferences.traySize);
  updateBoardSizeControl(preferences.boardSide);
  if (editorMode !== mode) {
    clearEditor();
    editorMode = mode;
  }
  buildEditor();
  renderPieceList();
}

function openSettings() {
  renderSettings();
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  updateSettingsViewport();
}

function keepFocusedSettingVisible() {
  const field = document.activeElement;
  if (panel.classList.contains("is-open") && panel.contains(field)
    && field.matches("input, select, textarea")) {
    field.scrollIntoView({ block: "nearest" });
  }
}

function updateSettingsViewport() {
  const viewport = window.visualViewport;
  panel.style.top = `${viewport?.offsetTop || 0}px`;
  panel.style.height = `${viewport?.height || window.innerHeight}px`;
  keepFocusedSettingVisible();
}

function closeSettings() {
  closeResetConfirmation();
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  callbacks.onClose?.();
}

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function updateBoardSizeControl(size) {
  const square = getBoardMode() === "square";
  const sizes = square ? [6, 9, 12] : [4, 5, 6];
  const label = square ? "Board size" : "Cells per edge";
  document.querySelector("#boardSizeLabel").textContent = label;
  boardSizeSetting.setAttribute("aria-label", label);
  const selectedIndex = Math.max(0, sizes.indexOf(size));
  boardSizeSetting.style.setProperty("--selected-index", selectedIndex);
  boardSizeSetting.querySelectorAll("button").forEach((button, index) => {
    button.dataset.size = sizes[index];
    button.textContent = square ? `${sizes[index]}×${sizes[index]}` : sizes[index];
    const selected = Number(button.dataset.size) === size;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function updateGameModeControl() {
  const square = getBoardMode() === "square";
  aiDifficultyRow.hidden = square || !preferences.aiEnabled;
  updateAiDifficultyControl();
  gameModeSetting.querySelector('[data-mode="two-player"]').hidden = square;
  gameModeSetting.querySelector('[data-mode="ai"]').hidden = square;
  gameModeSetting.style.setProperty("--segment-count", square ? 2 : 4);
  const mode = preferences.aiEnabled ? "ai" : preferences.twoPlayerEnabled ? "two-player"
    : preferences.timeTrialEnabled ? "timed" : "unlimited";
  gameModeSetting.style.setProperty("--selected-index", ["unlimited", "timed", "two-player", "ai"].indexOf(mode));
  gameModeSetting.querySelectorAll("button").forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function updateAiDifficultyControl() {
  aiDifficultySetting.style.setProperty("--selected-index", ["easy", "medium", "hard"].indexOf(preferences.aiDifficulty));
  aiDifficultySetting.querySelectorAll("button").forEach(button => {
    const selected = button.dataset.difficulty === preferences.aiDifficulty;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function openResetConfirmation(type) {
  pendingReset = type;
  resetConfirmationText.textContent = type === "score"
    ? "Reset all Hex and Square top scores to zero? This cannot be undone."
    : "Restore settings and remove custom pieces for both Hex and Square? This also resets shared accessibility settings and starts fresh games.";
  resetConfirmation.hidden = false;
  resetConfirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeResetConfirmation() {
  pendingReset = null;
  resetConfirmation.hidden = true;
}

function confirmReset() {
  if (pendingReset === "score") {
    callbacks.onResetBest?.();
  } else if (pendingReset === "settings") {
    resetAllPreferences();
    callbacks.onResetSettings?.();
    clearEditor();
    renderSettings();
  }
  closeResetConfirmation();
}

// The seen version is saved only once the player closes the changelog.
function showChangelogIfUpdated() {
  if (loadSeenVersion() === APP_VERSION) {
    saveSeenVersion();
    return;
  }
  openChangelog();
}

function openChangelog() {
  const entry = CHANGELOG.find(item => item.version === APP_VERSION);
  changelogVersion.textContent = `Version ${APP_VERSION}`;
  changelogList.replaceChildren(...(entry?.changes || []).map(change => {
    const item = document.createElement("li");
    item.textContent = change;
    return item;
  }));
  changelogModal.classList.add("is-open");
  changelogButton.focus();
}

function closeChangelog() {
  changelogModal.classList.remove("is-open");
  saveSeenVersion();
  if (panel.classList.contains("is-open")) appVersion.focus();
  callbacks.onChangelogClose?.();
}

function initSettings(options) {
  panel.addEventListener("focusin", keepFocusedSettingVisible);
  window.addEventListener("resize", updateSettingsViewport);
  window.visualViewport?.addEventListener("resize", updateSettingsViewport);
  window.visualViewport?.addEventListener("scroll", updateSettingsViewport);
  callbacks = options;
  buildEditor();
  appVersion.textContent = `v${APP_VERSION}`;
  appVersion.addEventListener("click", openChangelog);
  changelogButton.addEventListener("click", closeChangelog);
  showChangelogIfUpdated();
  boardTypeSetting.addEventListener("click", event => {
    const button = event.target.closest("button[data-board-mode]");
    if (!button || button.dataset.boardMode === getBoardMode()) return;
    closeResetConfirmation();
    callbacks.onBoardChange?.(button.dataset.boardMode);
    renderSettings();
  });
  boardTypeSetting.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const mode = event.key === "Home" ? "hex" : event.key === "End" ? "square"
      : getBoardMode() === "hex" ? "square" : "hex";
    const button = boardTypeSetting.querySelector(`[data-board-mode="${mode}"]`);
    button.click();
    button.focus();
  });
  undoSetting.addEventListener("change", () => {
    preferences.undoEnabled = undoSetting.checked;
    saveAndNotify();
  });
  slowModeSetting.addEventListener("change", () => {
    preferences.slowModeEnabled = slowModeSetting.checked;
    saveAccessibilityAndNotify();
  });
  gameModeSetting.addEventListener("click", event => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.hidden) return;
    preferences.timeTrialEnabled = button.dataset.mode === "timed";
    preferences.twoPlayerEnabled = button.dataset.mode === "two-player";
    preferences.aiEnabled = button.dataset.mode === "ai";
    updateGameModeControl();
    timeTrialDurationRow.hidden = !preferences.timeTrialEnabled;
    saveAndNotify();
  });
  aiDifficultySetting.addEventListener("click", event => {
    const button = event.target.closest("button[data-difficulty]");
    if (!button || aiDifficultyRow.hidden || button.dataset.difficulty === preferences.aiDifficulty) return;
    preferences.aiDifficulty = button.dataset.difficulty;
    updateAiDifficultyControl();
    saveAndNotify();
  });
  timeTrialDurationSetting.addEventListener("change", () => {
    preferences.timeTrialSeconds = clampInteger(timeTrialDurationSetting.value, 30, 600);
    timeTrialDurationSetting.value = String(preferences.timeTrialSeconds);
    saveAndNotify();
  });
  dragInitialOffsetSetting.addEventListener("change", () => {
    preferences.dragInitialOffset = clampInteger(dragInitialOffsetSetting.value, 0, 300);
    dragInitialOffsetSetting.value = String(preferences.dragInitialOffset);
    saveAccessibilityAndNotify();
  });
  dragMovingOffsetSetting.addEventListener("change", () => {
    preferences.dragMovingOffset = clampInteger(dragMovingOffsetSetting.value, 0, 400);
    dragMovingOffsetSetting.value = String(preferences.dragMovingOffset);
    saveAccessibilityAndNotify();
  });
  dragHorizontalOffsetSetting.addEventListener("change", () => {
    preferences.dragHorizontalOffset = clampInteger(dragHorizontalOffsetSetting.value, 0, 400);
    dragHorizontalOffsetSetting.value = String(preferences.dragHorizontalOffset);
    saveAccessibilityAndNotify();
  });
  pieceHueSetting.addEventListener("input", () => {
    preferences.pieceHue = clampInteger(pieceHueSetting.value, 0, 359);
    pieceHueValue.textContent = `${preferences.pieceHue}°`;
    saveAccessibilityAndNotify();
  });
  snapOverlapSetting.addEventListener("change", () => {
    const value = Math.max(1, Math.min(3, Number(snapOverlapSetting.value) || 1));
    preferences.snapOverlapMultiplier = Math.round(value * 10) / 10;
    snapOverlapSetting.value = preferences.snapOverlapMultiplier.toFixed(1);
    saveAccessibilityAndNotify();
  });
  traySizeSetting.addEventListener("change", () => {
    preferences.traySize = clampInteger(traySizeSetting.value, 1, 8);
    traySizeSetting.value = String(preferences.traySize);
    saveAndNotify();
  });
  boardSizeSetting.addEventListener("click", event => {
    const button = event.target.closest("button[data-size]");
    if (!button) return;
    preferences.boardSide = Number(button.dataset.size);
    updateBoardSizeControl(preferences.boardSide);
    saveAndNotify();
  });

  document.querySelectorAll("[data-step-target]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.dataset.stepTarget}`);
      const minimum = Number(input.min);
      const maximum = Number(input.max);
      const change = Number(button.dataset.step);
      input.value = String(Math.max(minimum, Math.min(maximum, (Number(input.value) || 0) + change)));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  resetBestButton.addEventListener("click", () => openResetConfirmation("score"));
  resetSettingsButton.addEventListener("click", () => openResetConfirmation("settings"));
  cancelResetButton.addEventListener("click", closeResetConfirmation);
  confirmResetButton.addEventListener("click", confirmReset);
  closeButton.addEventListener("click", closeSettings);
  panel.addEventListener("click", event => {
    if (event.target === panel) closeSettings();
  });
  clearButton.addEventListener("click", clearEditor);
  saveButton.addEventListener("click", saveCustomPiece);
}

Object.assign(window.GenericBlockGame, { initSettings, openSettings, closeSettings });
}());
