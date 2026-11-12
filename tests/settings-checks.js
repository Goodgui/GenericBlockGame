const api = window.GenericBlockGame;
const frame = document.querySelector("#game");
const runButton = document.querySelector("#run");
const results = document.querySelector("#results");
const doc = () => frame.contentDocument;
const field = id => doc().querySelector(`#${id}`);
const click = id => field(id).click();
const tab = mode => doc().querySelector(`[data-board-mode="${mode}"]`).click();

function assert(value, message) { if (!value) throw new Error(message); }
async function until(check) {
  const end = Date.now() + 4000;
  while (!check()) {
    if (Date.now() >= end) throw new Error("Game did not reach the expected state");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
function change(id, value) {
  field(id).value = value;
  field(id).dispatchEvent(new frame.contentWindow.Event("change", { bubbles: true }));
}
async function loadFrame() {
  await new Promise(resolve => {
    frame.onload = resolve;
    frame.src = document.querySelector("#version").value + `?check=${Date.now()}`;
  });
  await until(() => field("board")?.children.length);
  if (field("changelogModal").classList.contains("is-open")) click("changelogButton");
  if (field("modal").classList.contains("is-open") && field("modalButton").textContent === "Start game") click("modalButton");
}
async function placeSingle(q, r) {
  const win = frame.contentWindow;
  const slot = doc().querySelector(".tray-slot:not(.used)");
  const piece = slot.querySelector(".piece").getBoundingClientRect();
  const cell = doc().querySelector(`.cell[data-q="${q}"][data-r="${r}"]`).getBoundingClientRect();
  const send = (target, type, x, y) => target.dispatchEvent(new win.PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true,
    button: 0, clientX: x, clientY: y,
  }));
  send(slot, "pointerdown", piece.x + piece.width / 2, piece.y + piece.height / 2);
  send(win, "pointermove", cell.x + cell.width / 2, cell.y + cell.height / 2);
  send(win, "pointerup", cell.x + cell.width / 2, cell.y + cell.height / 2);
  await until(() => !doc().querySelector(".cell.clearing"));
}
async function check(name, action) {
  const row = document.createElement("li");
  results.append(row);
  try { await action(); row.className = "pass"; row.textContent = `PASS: ${name}`; }
  catch (error) { row.className = "fail"; row.textContent = `FAIL: ${name}: ${error.message}`; }
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  results.replaceChildren();
  document.querySelector("#summary").textContent = "Running checks.";
  const keys = new Set([api.CONFIG.globalSettingsKey, api.CONFIG.boardModeKey,
    api.CONFIG.twoPlayerStorageKey, api.CONFIG.aiStorageKey]);
  for (const mode of ["hex", "square"]) {
    const storage = api.storageKeys(mode);
    for (const key of ["settingsKey", "storageKey", "bestScoreKey", "modifiedBestScoreKey", "timedBestScoreKey", "timedModifiedBestScoreKey"]) keys.add(storage[key]);
  }
  const backup = [...keys].map(key => [key, localStorage.getItem(key)]);
  try {
    for (const key of keys) localStorage.removeItem(key);
    api.setBoardMode("hex");
    api.resetAllPreferences();
    await check("Hex opens with the new defaults", async () => {
      await loadFrame();
      click("settingsButton");
      assert(field("dragInitialOffsetSetting").value === "100", "Wrong pickup offset");
      assert(field("dragMovingOffsetSetting").value === "180", "Wrong vertical offset");
      assert(field("dragHorizontalOffsetSetting").value === "170", "Wrong horizontal offset");
      assert(field("snapOverlapSetting").value === "1.5", "Wrong Hex snap margin");
    });
    await check("closing Settings keeps an unfinished custom piece", async () => {
      for (const key of ["-2,0", "-1,0"]) doc().querySelector(`#shapeEditor [data-cell="${key}"]`).click();
      field("customPieceName").value = "Unfinished piece";
      click("settingsCloseButton"); click("settingsButton");
      assert(field("customPieceName").value === "Unfinished piece", "Closing Settings lost the piece name");
      assert(doc().querySelectorAll("#shapeEditor .selected").length === 2, "Closing Settings lost the selected cells");
      click("clearDesignerButton");
    });
    await check("tabs, General, Accessibility, and Reset have the requested order", async () => {
      const headings = [...doc().querySelectorAll(".settings-section h3")].map(node => node.textContent).join("|");
      assert(headings === "General|Pieces|Create a piece|Accessibility|Reset", headings);
      const general = doc().querySelector(".general-heading").closest("section");
      assert(field("snapOverlapSetting").closest("section") === general, "Snap is outside General");
      assert(general.querySelector(".drag-settings").lastElementChild.contains(field("snapOverlapSetting")), "Snap is not last in General");
      assert(field("boardTypeSetting").nextElementSibling === field("boardSettingsContent"), "Tabs are misplaced");
    });
    await check("Square uses its own defaults and the shared accessibility values", async () => {
      change("dragInitialOffsetSetting", 95); change("dragMovingOffsetSetting", 210); change("dragHorizontalOffsetSetting", 200);
      change("snapOverlapSetting", 1.7); change("traySizeSetting", 4);
      field("boardSizeSetting").querySelector('[data-size="6"]').click();
      field("gameModeSetting").querySelector('[data-mode="two-player"]').click();
      tab("square");
      assert(field("snapOverlapSetting").value === "2.0", "Square inherited Hex snap");
      assert(field("traySizeSetting").value === "3", "Square inherited Hex tray");
      assert(field("dragInitialOffsetSetting").value === "95" && field("dragMovingOffsetSetting").value === "210"
        && field("dragHorizontalOffsetSetting").value === "200", "Accessibility did not carry across");
      assert(doc().querySelectorAll("#board .cell").length === 81, "Square board is not 9 by 9");
      assert(doc().querySelectorAll("#shapeEditor button").length === 25, "Square editor is not 5 by 5");
    });
    await check("Square cannot select two player mode", async () => {
      const button = field("gameModeSetting").querySelector('[data-mode="two-player"]');
      assert(button.hidden && field("passButton").hidden, "Square exposes match controls");
      button.click();
      assert(!api.loadPreferences().twoPlayerEnabled && !api.loadGame().match, "Square started a match");
    });
    await check("each tab retains its General settings and Hex match", async () => {
      change("snapOverlapSetting", 2.4); change("traySizeSetting", 2);
      field("boardSizeSetting").querySelector('[data-size="12"]').click();
      field("gameModeSetting").querySelector('[data-mode="timed"]').click();
      change("timeTrialDurationSetting", 90);
      tab("hex");
      assert(field("snapOverlapSetting").value === "1.7" && field("traySizeSetting").value === "4", "Hex General changed");
      assert(doc().querySelectorAll("#board .cell").length === 91, "Hex size changed");
      assert(!field("passButton").hidden && field("turnStatus").textContent === "Red's turn", "Hex match did not return");
      tab("square");
      assert(field("snapOverlapSetting").value === "2.4" && field("traySizeSetting").value === "2", "Square General changed");
      assert(field("timeTrialDurationSetting").value === "90" && !field("timeTrialDurationRow").hidden, "Square time trial changed");
    });
    await check("the square piece editor keeps custom pieces apart from Hex", async () => {
      for (const key of ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]) {
        doc().querySelector(`#shapeEditor [data-cell="${key}"]`).click();
      }
      field("customPieceName").value = "Square test";
      click("saveCustomPieceButton");
      assert(api.loadPreferences().customPieces.length === 1, "Square piece was not saved");
      tab("hex");
      assert(api.loadPreferences().customPieces.length === 0, "Square custom piece leaked to Hex");
      assert(doc().querySelectorAll("#shapeEditor button").length === 19, "Hex editor changed");
    });
    await check("square touch events place, clear, and undo a row", async () => {
      api.setBoardMode("square");
      const preferences = api.defaultPreferences();
      preferences.dragInitialOffset = preferences.dragMovingOffset = preferences.dragHorizontalOffset = 0;
      api.savePreferences(preferences);
      const board = api.createEmptyBoard();
      for (let q = 0; q < 9; q += 1) if (q !== 4) board.cells[`${q},4`] = 1;
      api.saveGame({ board, tray: ["single", "line2", "single"].map((shapeId, index) => ({ uid: `square-${index}`, shapeId, rotation: 0, used: false })),
        history: [], score: 0, streak: 0, scoringVersion: 2, match: null, gameOver: false, timedMode: false });
      await loadFrame();
      await placeSingle(4, 4);
      assert(field("score").textContent === "9" && !doc().querySelector(".cell.filled"), "Square row did not clear");
      click("undoButton");
      assert(field("score").textContent === "0" && doc().querySelectorAll(".cell.filled").length === 8, "Undo did not restore the row");
    });
    await check("switching boards restores the square game and Undo", async () => {
      click("settingsButton"); tab("hex"); tab("square");
      assert(doc().querySelectorAll(".cell.filled").length === 8, "Square game did not return");
      click("settingsCloseButton");
      await loadFrame();
      assert(doc().body.classList.contains("square-mode") && doc().querySelectorAll(".cell.filled").length === 8, "Square reload failed");
    });
    await check("large trays show three pieces and shift one piece at a time on both boards", async () => {
      for (const mode of ["hex", "square"]) {
        api.setBoardMode(mode);
        const preferences = api.defaultPreferences();
        Object.assign(preferences, { traySize: 8, slowModeEnabled: true,
          dragInitialOffset: 0, dragMovingOffset: 0, dragHorizontalOffset: 0 });
        api.savePreferences(preferences);
        api.saveGame({ board: api.createEmptyBoard(), score: 0, streak: 0, scoringVersion: 2,
          tray: Array.from({ length: 8 }, (_, index) => ({ uid: `${mode}-${index}`, shapeId: "single", rotation: 0, used: false })),
          history: [], match: null, gameOver: false, timedMode: false });
        await loadFrame();
        const slots = [...field("tray").children];
        const view = field("tray").parentElement.getBoundingClientRect();
        const first = slots[0].getBoundingClientRect();
        assert(field("trayPreviousButton").hidden && !field("trayNextButton").hidden, "Only the right arrow should show at the start");
        const arrow = field("trayNextButton");
        assert(!arrow.textContent.trim() && arrow.querySelector("svg path"), "Tray arrows must use lines instead of text");
        assert(frame.contentWindow.getComputedStyle(arrow).borderTopWidth === "0px", "Tray arrow has a button border");
        assert(frame.contentWindow.getComputedStyle(arrow.querySelector("path")).strokeWidth
          === frame.contentWindow.getComputedStyle(doc().querySelector(".chunk-outlines path")).strokeWidth, "Arrow and section lines must use the same width");
        assert(Math.abs(first.width - (view.width - 6) / 3) < 1, "Tray squeezed more than three pieces into view");
        assert(Math.abs(slots[3].getBoundingClientRect().top - first.top) < 1, "Tray wrapped onto another row");
        assert(slots[3].getBoundingClientRect().left >= view.right - 1, "Fourth piece must start outside the view");
        click("trayNextButton");
        await until(() => Math.abs(slots[1].getBoundingClientRect().left - first.left) < 1);
        assert(Math.abs(slots[1].getBoundingClientRect().left - first.left) < 1, "Right arrow did not shift one piece");
        assert(!field("trayPreviousButton").hidden && !field("trayNextButton").hidden, "Both arrows should show between the ends");
        click("trayPreviousButton");
        await until(() => Math.abs(slots[0].getBoundingClientRect().left - first.left) < 1);
        assert(Math.abs(slots[0].getBoundingClientRect().left - first.left) < 1, "Left arrow did not shift one piece");
        for (let index = 0; index < 8; index++) click("trayNextButton");
        await until(() => Math.abs(slots[7].getBoundingClientRect().right - view.right) < 1);
        assert(field("trayNextButton").hidden && !field("trayPreviousButton").hidden && Math.abs(slots[7].getBoundingClientRect().right - view.right) < 1,
          "Tray must stop with the last piece in view");
      }
    });
    await check("pieces slide together to three, then keep their positions", async () => {
      const state = api.loadGame();
      state.tray = state.tray.slice(0, 4);
      api.saveGame(state);
      await loadFrame();
      const uid = state.tray[1].uid;
      const center = piece => { const box = piece.getBoundingClientRect(); return box.left + box.width / 2; };
      const secondPiece = () => doc().querySelector(`[data-uid="${uid}"] .piece`);
      const before = center(secondPiece());
      await placeSingle(4, 4);
      assert(field("tray").children.length === 3, "The larger tray did not close its gap");
      if (!frame.contentWindow.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        assert(secondPiece().getAnimations().some(motion => motion.playState === "running"), "Remaining pieces did not animate");
        assert(Math.abs(center(secondPiece()) - before) < 8, "The remaining piece jumped before its slide");
      }
      await until(() => !secondPiece().getAnimations().some(motion => motion.playState === "running"));
      assert(Math.abs(center(secondPiece()) - before) > 20, "The tray kept the old gap");
      const positions = new Map([...field("tray").children].map(slot => [slot.dataset.uid, center(slot.querySelector(".piece"))]));
      await placeSingle(5, 4);
      assert(field("tray").children.length === 2, "Placed piece stayed in the tray");
      for (const slot of field("tray").children) {
        assert(Math.abs(center(slot.querySelector(".piece")) - positions.get(slot.dataset.uid)) < 1, "The final three positions moved");
      }
      await placeSingle(6, 4);
      const lastSlot = field("tray").firstElementChild;
      assert(field("tray").children.length === 1
        && Math.abs(center(lastSlot.querySelector(".piece")) - positions.get(lastSlot.dataset.uid)) < 1,
        "The final piece moved from its fixed slot");
      click("undoButton");
      assert([...field("tray").children].map(slot => slot.dataset.uid).join() === state.tray.slice(2).map(item => item.uid).join(),
        "Undo did not restore the order of the remaining pieces");
      await loadFrame();
      for (const slot of field("tray").children) {
        assert(Math.abs(center(slot.querySelector(".piece")) - positions.get(slot.dataset.uid)) < 1, "Reload moved a fixed tray slot");
      }
    });
    await check("slow mode keeps the last move through reload and Undo until Continue", async () => {
      const state = api.loadGame();
      state.tray = [{ ...state.tray[0], used: false }];
      state.board = api.createEmptyBoard();
      state.score = state.streak = 0;
      state.history = [];
      api.saveGame(state);
      await loadFrame();
      await placeSingle(4, 4);
      await until(() => !field("continueButton").hidden && !field("continueButton").disabled);
      assert(!field("undoButton").disabled && api.loadGame().history.length === 1, "Last move lost Undo");
      await loadFrame();
      assert(!field("continueButton").hidden && !field("undoButton").disabled, "Reload advanced the tray");
      click("undoButton");
      assert(field("continueButton").hidden && !doc().querySelector(".cell.filled"), "Undo did not restore the last piece");
      await placeSingle(4, 4);
      await until(() => !field("continueButton").disabled);
      click("continueButton");
      assert(field("continueButton").hidden && api.loadGame().history.length === 0
        && api.loadGame().tray.every(item => !item.used), "Continue did not start a fresh tray");
      const uid = api.loadGame().tray[0].uid;
      click("settingsButton");
      field("slowModeSetting").checked = false;
      field("slowModeSetting").dispatchEvent(new frame.contentWindow.Event("change", { bubbles: true }));
      assert(api.loadGame().tray[0].uid === uid, "Slow mode toggle restarted the game");
      tab("hex");
      assert(!field("slowModeSetting").checked, "Slow mode must apply to both boards");
      tab("square"); click("settingsCloseButton");
    });
    await check("Reset top score clears both boards", async () => {
      for (const mode of ["hex", "square"]) api.saveBestScore(99, mode);
      click("settingsButton"); click("resetBestButton"); click("confirmResetButton");
      assert(api.loadBestScore("hex") === 0 && api.loadBestScore("square") === 0, "Reset did not reach both boards");
    });
    await check("Reset all settings resets both profiles and shared accessibility", async () => {
      click("resetSettingsButton"); click("confirmResetButton");
      assert(api.getBoardMode() === "square", "Reset changed the selected board");
      assert(field("dragInitialOffsetSetting").value === "100" && field("dragMovingOffsetSetting").value === "180"
        && field("dragHorizontalOffsetSetting").value === "170", "Global defaults did not reset");
      assert(field("snapOverlapSetting").value === "2.0", "Square default did not reset");
      tab("hex");
      assert(field("snapOverlapSetting").value === "1.5" && field("traySizeSetting").value === "3", "Hex defaults did not reset");
      assert(field("passButton").hidden && !doc().querySelector(".cell.filled"), "Hex match or old cells survived reset");
    });
    await check("settings fit a 320 pixel phone view and labels use the game name", async () => {
      frame.style.width = "320px"; frame.style.height = "640px";
      await until(() => frame.contentWindow.innerWidth === 320);
      assert(field("settingsPanel").querySelector(".settings-content").scrollWidth
        <= field("settingsPanel").querySelector(".settings-content").clientWidth, "Settings overflow sideways");
      assert(doc().title === "GenericBlockGame", "Wrong page title");
      assert(!doc().body.textContent.toLowerCase().includes("prototype"), "Old labels remain");
    });
  } finally {
    frame.src = "about:blank";
    for (const [key, value] of backup) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    const failed = results.querySelectorAll(".fail").length;
    document.querySelector("#summary").textContent = `${results.children.length - failed} passed, ${failed} failed. Saves restored.`;
    runButton.disabled = false;
  }
});
