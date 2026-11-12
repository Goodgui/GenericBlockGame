const api = window.GenericBlockGame;
const frame = document.querySelector("#game");
const results = document.querySelector("#results");
const runButton = document.querySelector("#run");
const doc = () => frame.contentDocument;
const field = id => doc().querySelector(`#${id}`);
const click = id => field(id).click();
const saved = () => api.loadGame("ai", "hex");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(value, message) { if (!value) throw new Error(message); }
async function until(check) {
  const end = Date.now() + 10000;
  while (!check()) {
    if (Date.now() > end) throw new Error("Game did not reach the expected state");
    await delay(20);
  }
}
async function waitForHumanTurn() {
  await until(() => saved().match.player === 0 && !field("passButton").disabled);
}
async function reload() {
  await new Promise(resolve => {
    frame.onload = resolve;
    frame.src = document.querySelector("#version").value + `?check=${Date.now()}`;
  });
}
async function load(options = {}) {
  api.setBoardMode("hex");
  const preferences = api.defaultPreferences();
  if (options.board) preferences.boardSide = api.getBoardSide(options.board);
  preferences.aiEnabled = true;
  preferences.aiDifficulty = options.difficulty || "hard";
  preferences.traySize = options.traySize || 2;
  preferences.dragInitialOffset = preferences.dragMovingOffset = preferences.dragHorizontalOffset = 0;
  for (const shape of api.SHAPES) preferences.pieces[shape.id] = { enabled: shape.id === "single" };
  api.savePreferences(preferences);
  api.saveGame({
    board: options.board || api.createEmptyBoard(),
    match: { ...api.createMatch(), ...options.match }, aiOpponent: true,
    tray: (options.shapes || ["single", "single"]).map((shapeId, index) => ({
      uid: `test-${index}`, shapeId, rotation: 0, used: Boolean(options.used),
    })),
    score: 0, streak: 0, history: [], scoringVersion: 2,
    gameOver: false, timedMode: false, timerStarted: false, timeRemainingMs: null,
  });
  await reload();
  const expectedCells = Object.keys(options.board?.cells || api.createEmptyBoard().cells).length;
  assert(doc().querySelectorAll("#board .cell").length === expectedCells, "Saved test board did not load");
}
function sendPiece(index, q, r) {
  const win = frame.contentWindow;
  const slot = doc().querySelectorAll(".tray-slot")[index];
  const piece = slot.querySelector(".piece").getBoundingClientRect();
  const cell = doc().querySelector(`.cell[data-q="${q}"][data-r="${r}"]`).getBoundingClientRect();
  const send = (target, type, x, y) => target.dispatchEvent(new win.PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0,
    clientX: x, clientY: y,
  }));
  send(slot, "pointerdown", piece.x + piece.width / 2, piece.y + piece.height / 2);
  send(win, "pointermove", cell.x + cell.width / 2, cell.y + cell.height / 2);
  send(win, "pointerup", cell.x + cell.width / 2, cell.y + cell.height / 2);
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
    for (const key of ["settingsKey", "storageKey", "bestScoreKey", "modifiedBestScoreKey", "timedBestScoreKey", "timedModifiedBestScoreKey"]) {
      keys.add(api.storageKeys(mode)[key]);
    }
  }
  const backup = [...keys].map(key => [key, localStorage.getItem(key)]);
  try {
    await check("You start as Blue against AI Red", async () => {
      await load();
      assert(field("turnStatus").textContent === "Your turn (Blue)", "Wrong first turn");
      assert(field("bluePlayer").textContent.includes("You (Blue)"), "Missing player label");
      assert(field("redPlayer").textContent.includes("AI (Red)"), "Missing AI label");
      assert(field("bluePlayer").classList.contains("active-player"), "Blue is not active first");
      assert(doc().documentElement.style.getPropertyValue("--piece-hue") === "212", "Your tray is not blue");
      assert(!field("passButton").disabled && field("timerDisplay").hidden, "Wrong match controls");
    });
    await check("VS AI defaults to Hard and remembers each selected level", async () => {
      click("settingsButton");
      assert(!field("aiDifficultyRow").hidden, "Difficulty is hidden in VS AI");
      assert(doc().querySelector('[data-difficulty="hard"]').getAttribute("aria-checked") === "true", "Hard is not the default");
      for (const difficulty of ["easy", "medium", "hard"]) {
        doc().querySelector(`[data-difficulty="${difficulty}"]`).click();
        assert(api.loadPreferences().aiDifficulty === difficulty, "Level did not save");
        click("settingsCloseButton");
        await reload(); click("settingsButton");
        assert(doc().querySelector(`[data-difficulty="${difficulty}"]`).getAttribute("aria-checked") === "true", "Reload lost the level");
      }
      click("settingsCloseButton");
    });
    await check("The AI plays at the selected level", async () => {
      for (const [difficulty, expected] of [["medium", 36], ["hard", 43]]) {
        const board = api.createEmptyBoard(4);
        for (const key of ["0,-3", "0,-2", "2,-2", "3,-2", "-1,-1", "0,-1", "1,-1", "-3,0",
          "1,0", "-3,1", "0,1", "1,1", "2,1", "-3,2", "1,2", "-2,3", "0,3"]) board.cells[key] = 1;
        await load({ board, difficulty, shapes: ["single", "line2", "bend3"], traySize: 3, match: { player: 1 } });
        await waitForHumanTurn();
        assert(saved().match.scores[1] === expected, `${difficulty} used the wrong search`);
      }
      await load();
    });
    await check("Easy keeps playing instead of taking a winning pass", async () => {
      await load({ difficulty: "easy", match: { player: 1, scores: [7, 9], consecutivePasses: 1 } });
      await until(() => saved().match.player === 0 || saved().gameOver);
      assert(!saved().gameOver, "Easy used a winning pass");
      await waitForHumanTurn();
      assert(saved().match.consecutivePasses === 0, "Easy did not finish its tray");
      assert(doc().querySelectorAll('.cell[data-player="red"]').length === 2, "Easy did not place red pieces");
      await load();
    });
    await check("Changing difficulty cancels a pending AI move and starts a fresh match", async () => {
      await load({ match: { player: 1 } });
      click("settingsButton"); doc().querySelector('[data-difficulty="easy"]').click();
      click("settingsCloseButton"); await delay(650);
      assert(saved().match.player === 0 && !doc().querySelector(".cell.filled"), "Old AI moved after difficulty changed");
      assert(api.loadPreferences().aiDifficulty === "easy", "New difficulty did not save");
      await load();
    });
    await check("Human moves and Undo still work in the current tray", async () => {
      sendPiece(0, 0, 0);
      await until(() => saved().match.placed === 1);
      assert(saved().board.cells["0,0"] === 1, "Human piece has the wrong owner");
      assert(doc().querySelector('.cell[data-q="0"][data-r="0"]').dataset.player === "blue", "Human did not place Blue");
      click("undoButton");
      assert(saved().board.cells["0,0"] === 0 && saved().match.placed === 0, "Undo failed");
    });
    await check("Passing starts the AI and locks human input", async () => {
      click("passButton"); click("modalButton");
      assert(saved().match.player === 1, "AI did not receive turn");
      assert(field("passButton").disabled && field("undoButton").disabled, "Human controls stayed enabled");
      assert(field("redPlayer").classList.contains("active-player"), "AI's red score is not active");
      assert(doc().documentElement.style.getPropertyValue("--piece-hue") === "0", "AI's tray is not red");
      const before = JSON.stringify(saved());
      sendPiece(0, 0, 0); click("undoButton"); click("passButton");
      assert(JSON.stringify(saved()) === before, "Human changed an AI turn");
      await waitForHumanTurn();
      assert(Object.values(saved().board.cells).filter(value => value === 2).length === 2, "AI did not place its tray");
      assert(doc().querySelectorAll('.cell[data-player="red"]').length === 2, "AI cells are not red");
      assert(saved().history.length === 0 && saved().match.consecutivePasses === 0, "Completed AI turn did not reset");
      assert(!field("passButton").disabled, "Human controls did not return");
    });
    await check("A completed human tray starts the AI without a pass", async () => {
      await load();
      sendPiece(0, 0, 0); sendPiece(1, 2, 0);
      await until(() => saved().match.player === 1);
      await waitForHumanTurn();
      assert(Object.values(saved().board.cells).filter(value => value === 1).length === 2, "Human cells lost");
      assert(Object.values(saved().board.cells).filter(value => value === 2).length === 2, "AI did not act");
    });
    await check("AI earns a clear from your Blue cells and shows its Red score", async () => {
      const board = api.createEmptyBoard();
      for (let q = -4; q <= 4; q += 1) if (q !== 0) board.cells[`${q},0`] = 1;
      await load({ board, match: { player: 1 }, shapes: ["single"] });
      await waitForHumanTurn();
      assert(saved().match.scores[0] === 0 && saved().match.scores[1] === 9, "AI clear scored for the wrong player");
      assert(field("redScore").textContent === "9" && field("blueScore").textContent === "0", "Scores have the wrong colors");
      assert(Object.values(saved().board.cells).every(value => value === 0), "Clear did not finish");
    });
    await check("Blue pieces, both scores, and the Blue pass prompt survive reload", async () => {
      const board = api.createEmptyBoard();
      board.cells["0,0"] = 1; board.cells["2,0"] = 2;
      await load({ board, match: { scores: [17, 9] } });
      await reload();
      assert(doc().querySelector('.cell[data-q="0"][data-r="0"]').dataset.player === "blue", "Reload changed your color");
      assert(doc().querySelector('.cell[data-q="2"][data-r="0"]').dataset.player === "red", "Reload changed AI's color");
      assert(field("blueScore").textContent === "17" && field("redScore").textContent === "9", "Reload swapped scores");
      click("passButton");
      assert(field("modalTitle").textContent === "Blue, pass?", "Pass prompt uses the wrong color");
      click("modalCancelButton");
    });
    await check("Your higher Blue score wins after both blocked passes", async () => {
      const board = api.createEmptyBoard();
      for (const key of Object.keys(board.cells)) board.cells[key] = 1;
      await load({ board, shapes: ["line4"], match: { scores: [17, 9] } });
      click("passButton"); await until(() => saved().gameOver);
      assert(field("modalTitle").textContent === "You win", "Your Blue score did not win");
    });
    await check("AI passes a blocked tray without asking the human", async () => {
      const board = api.createEmptyBoard();
      for (const key of Object.keys(board.cells)) board.cells[key] = 1;
      board.cells["0,0"] = 0;
      await load({ board, match: { player: 1 }, shapes: ["line4"] });
      await waitForHumanTurn();
      assert(saved().match.consecutivePasses === 1, "AI did not pass");
      assert(!field("modal").classList.contains("is-open"), "AI pass asked the human");
    });
    await check("Two blocked passes end the match and reload keeps its result", async () => {
      const board = api.createEmptyBoard();
      for (const key of Object.keys(board.cells)) board.cells[key] = 1;
      await load({ board, shapes: ["line4"], match: { scores: [7, 9] } });
      click("passButton");
      await until(() => saved().gameOver);
      assert(field("modalTitle").textContent === "AI wins", "Wrong result");
      await reload();
      assert(field("modalTitle").textContent === "AI wins", "Reload lost the result");
    });
    await check("AI can take a winning second pass with a playable tray", async () => {
      await load({ match: { player: 1, scores: [7, 9], consecutivePasses: 1 } });
      await until(() => saved().gameOver);
      assert(field("modalTitle").textContent === "AI wins", "AI failed to take a winning pass");
      assert(!Object.values(saved().board.cells).some(Boolean), "AI placed before its winning pass");
    });
    await check("Reload resumes an AI turn and changes players once", async () => {
      await load({ match: { player: 1 } });
      await reload();
      await waitForHumanTurn();
      assert(Object.values(saved().board.cells).filter(value => value === 2).length === 2, "Reload lost or doubled moves");
      await reload();
      assert(saved().match.player === 0, "Reload changed the player twice");
    });
    await check("Reload after a used tray changes players once", async () => {
      await load({ used: true, match: { placed: 2 } });
      await until(() => saved().match.player === 1);
      await waitForHumanTurn();
      assert(Object.values(saved().board.cells).filter(value => value === 2).length === 2, "Used tray resumed wrong");
    });
    await check("Reload midway through an AI tray keeps each move once", async () => {
      await load({ shapes: ["single", "single", "single"], traySize: 3, match: { player: 1 } });
      await until(() => saved().match.placed === 1);
      await reload();
      await waitForHumanTurn();
      assert(Object.values(saved().board.cells).filter(value => value === 2).length === 3, "Reload lost or doubled a placed piece");
    });
    await check("Settings pause the AI and closing them resumes it", async () => {
      await load({ match: { player: 1 } });
      click("settingsButton");
      const before = JSON.stringify(saved());
      await delay(650);
      assert(JSON.stringify(saved()) === before, "AI moved under Settings");
      click("settingsCloseButton");
      await waitForHumanTurn();
    });
    await check("Changing mode cancels a pending AI move", async () => {
      await load({ match: { player: 1 } });
      click("settingsButton");
      doc().querySelector('[data-mode="two-player"]').click();
      click("settingsCloseButton");
      await delay(650);
      assert(field("turnStatus").textContent === "Red's turn", "Old AI changed the new mode");
      assert(!doc().querySelector(".cell.filled"), "AI placed in a local match");
    });
    await check("Restart cancels an AI turn and gives Red a fresh board", async () => {
      await load({ match: { player: 1 } });
      click("resetButton"); click("modalButton");
      await delay(650);
      assert(saved().match.player === 0 && !doc().querySelector(".cell.filled"), "Old AI survived Restart");
    });
    await check("VS AI sits next to 2 Player and fits a 320 pixel phone", async () => {
      await load();
      frame.style.width = "320px"; frame.style.height = "640px";
      click("settingsButton");
      await until(() => frame.contentWindow.innerWidth === 320);
      const ai = doc().querySelector('[data-mode="ai"]');
      assert(ai.previousElementSibling.dataset.mode === "two-player", "VS AI has the wrong position");
      assert(ai.getAttribute("aria-checked") === "true", "VS AI is not selected");
      const rect = ai.getBoundingClientRect();
      assert(rect.right <= 320 && rect.left >= 0 && ai.scrollWidth <= ai.clientWidth, "Mode control does not fit");
      assert(doc().documentElement.scrollWidth <= 320, "Page overflows sideways");
      const difficulty = field("aiDifficultySetting").getBoundingClientRect();
      assert(difficulty.left >= 0 && difficulty.right <= 320, "Difficulty control does not fit");
      for (const button of field("aiDifficultySetting").querySelectorAll("button")) {
        assert(button.scrollWidth <= button.clientWidth, "Difficulty label is clipped");
      }
    });
    await check("Square hides both match modes and cancels pending AI work", async () => {
      await load({ match: { player: 1 } });
      click("settingsButton");
      doc().querySelector('[data-board-mode="square"]').click();
      click("settingsCloseButton");
      await delay(650);
      assert(field("matchScoreboard").hidden && field("passButton").hidden, "Square shows match controls");
      assert(doc().querySelector('[data-mode="ai"]').hidden, "Square shows VS AI");
      assert(field("aiDifficultyRow").hidden, "Square shows AI difficulty");
      assert(!api.loadPreferences().aiEnabled && !api.loadGame().match, "Square started an AI match");
    });
    await check("AI matches leave solo and two player games and best scores intact", async () => {
      const localMatch = localStorage.getItem(api.CONFIG.twoPlayerStorageKey);
      await load({ match: { player: 1 } });
      await waitForHumanTurn();
      assert(localStorage.getItem(api.CONFIG.twoPlayerStorageKey) === localMatch, "AI changed a two player save");
      const untouched = [api.CONFIG.storageKey, api.CONFIG.bestScoreKey, api.CONFIG.modifiedBestScoreKey];
      for (const key of untouched) {
        assert(localStorage.getItem(key) === backup.find(entry => entry[0] === key)[1], "AI changed another mode's save or score");
      }
    });
  } finally {
    await new Promise(resolve => { frame.onload = resolve; frame.src = "about:blank"; });
    for (const [key, value] of backup) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    const failed = results.querySelectorAll(".fail").length;
    document.querySelector("#summary").textContent = `${results.children.length - failed} passed, ${failed} failed. Saves restored.`;
    runButton.disabled = false;
  }
});
