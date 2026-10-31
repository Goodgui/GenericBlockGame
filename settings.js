(function () {
const {
  CONFIG,
  SHAPES,
  defaultPreferences,
  getAllShapes,
  loadPreferences,
  savePreferences,
  shapeDimensions,
  makePiece,
  buildHexGrid,
} = window.GenericBlockGame;

const panel = document.querySelector("#settingsPanel");
const closeButton = document.querySelector("#settingsCloseButton");
const undoSetting = document.querySelector("#undoSetting");
const gameModeSetting = document.querySelector("#gameModeSetting");
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

let preferences = loadPreferences();
let selectedCells = new Set();
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
  buildHexGrid(editor, 3, (q, r, key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.cell = key;
    button.setAttribute("aria-label", `Editor hex ${q}, ${r}`);
    button.setAttribute("aria-pressed", "false");
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
  let rotatedCells = cells.map(([x, y]) => [x, y]);
  const candidateKeys = new Set();

  for (let turn = 0; turn < 6; turn += 1) {
    candidateKeys.add(layoutKey(rotatedCells));
    rotatedCells = rotatedCells.map(([q, r]) => [-r, q + r]);
  }

  return getAllShapes().some(shape => candidateKeys.has(layoutKey(shape.cells)));
}

function saveCustomPiece() {
  const cells = [...selectedCells].map(key => key.split(",").map(Number));
  if (!cells.length) {
    message.textContent = "Select at least one hex.";
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

function openSettings() {
  preferences = loadPreferences();
  undoSetting.checked = preferences.undoEnabled;
  updateGameModeControl(preferences.timeTrialEnabled);
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
  renderPieceList();
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  closeResetConfirmation();
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function updateBoardSizeControl(size) {
  const sizes = [4, 5, 6];
  const selectedIndex = Math.max(0, sizes.indexOf(size));
  boardSizeSetting.style.setProperty("--selected-index", selectedIndex);
  boardSizeSetting.querySelectorAll("button").forEach(button => {
    const selected = Number(button.dataset.size) === size;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function updateGameModeControl(timed) {
  gameModeSetting.style.setProperty("--selected-index", timed ? 1 : 0);
  gameModeSetting.querySelectorAll("button").forEach(button => {
    const selected = (button.dataset.mode === "timed") === timed;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function openResetConfirmation(type) {
  pendingReset = type;
  resetConfirmationText.textContent = type === "score"
    ? "Reset all hex top scores to zero? This cannot be undone."
    : "Restore every setting, frequency, drag offset, and custom piece to its default?";
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
    preferences = defaultPreferences();
    savePreferences(preferences);
    undoSetting.checked = preferences.undoEnabled;
    updateGameModeControl(preferences.timeTrialEnabled);
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
    clearEditor();
    renderPieceList();
    callbacks.onChange?.(preferences);
  }
  closeResetConfirmation();
}

function initSettings(options) {
  callbacks = options;
  buildEditor();
  undoSetting.addEventListener("change", () => {
    preferences.undoEnabled = undoSetting.checked;
    saveAndNotify();
  });
  gameModeSetting.addEventListener("click", event => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    preferences.timeTrialEnabled = button.dataset.mode === "timed";
    updateGameModeControl(preferences.timeTrialEnabled);
    timeTrialDurationRow.hidden = !preferences.timeTrialEnabled;
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
