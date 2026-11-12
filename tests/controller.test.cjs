const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(saved = new Map(), host) {
  let now = 0;
  let landscape = false;
  let nextId = 0;
  const timers = new Map();
  const events = {};
  const windowEvents = {};
  function element() {
    const classes = new Set();
    const attributes = new Map();
    return {
      hidden: false, disabled: false, textContent: "", dataset: {}, style: { setProperty() {} },
      classList: {
        contains: name => classes.has(name),
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle(name, enabled = !classes.has(name)) { enabled ? classes.add(name) : classes.delete(name); },
      },
      addEventListener(type, action) { this[type] = action; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      hasAttribute: name => attributes.has(name),
      getAttribute: name => attributes.get(name),
      toggleAttribute(name, enabled = !attributes.has(name)) { enabled ? attributes.set(name, "") : attributes.delete(name); },
      focus() {}, replaceChildren() {},
    };
  }
  const document = { hidden: false, documentElement: element(), addEventListener: (type, action) => events[type] = action };
  const window = {
    GenericBlockGameHost: host,
    addEventListener(type, action) { windowEvents[type] = action; },
    removeEventListener(type) { delete windowEvents[type]; },
    matchMedia: query => ({ matches: landscape && query.includes("orientation: landscape") }),
    setTimeout(action, delay) { const id = ++nextId; timers.set(id, { action, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(action, delay) { const id = ++nextId; timers.set(id, { action, at: now + delay, interval: delay }); return id; },
    clearInterval: id => timers.delete(id),
  };
  const context = vm.createContext({
    window, document, Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)), removeItem: key => saved.delete(key) },
  });
  const head = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").split("</head>")[0];
  for (const [, script] of head.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
  for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "two-player.js", "ai.js", "storage.js", "profile.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  const game = window.GenericBlockGame;
  const elements = Object.fromEntries(["undoButton", "passButton", "continueButton", "trayPreviousButton", "trayNextButton", "board", "settingsPanel", "modal", "timerDisplay",
    "tray", "score", "bestScore", "bestScoreLabel", "modalButton", "modalUndoButton", "modalCancelButton",
    "resetButton", "settingsButton", "fullscreenButton", "dragLayer", "changelogModal"].map(name => [name, element()]));
  elements.modal.classList.add("is-open");
  let result;
  let displayed;
  let settings;
  let preview;
  Object.assign(game, {
    elements, renderGame: state => displayed = state, buildBoard() {}, clearPreview: () => preview = null, animateClear() {},
    animateAiMove(item, shape, q, r, done) { done(); return () => {}; },
    renderPreview: drag => preview = { q: drag.originQ + 0, r: drag.originR + 0, valid: drag.valid },
    makePiece: () => ({ childNodes: [] }), shiftTray() {}, revealTrayItem() {},
    hideModal: () => elements.modal.classList.remove("is-open"),
    showModal(title, text, button, options) { result = { title, ...options }; elements.modal.classList.add("is-open"); },
    initSettings: callbacks => settings = callbacks, openSettings() {},
  });
  function boot() {
    const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
    // Expose commands only within this test context; keep their real bodies.
    vm.runInContext(source.replace(/\}\(\)\);\s*$/, "window.controller = { state: () => state, placePiece, beginDrag }; }());"), context);
  }
  function advance(milliseconds) {
    const end = now + milliseconds;
    for (let count = 0; count < 10000; count += 1) {
      const task = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!task) { now = end; return; }
      const [id, timer] = task;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.action();
    }
    throw new Error("Timer callbacks did not settle");
  }
  function seed({ mode = "hex", timed = true, remaining = 30000, match = false, ai = false, slow = false, shapes = ["single", "single", "single"] } = {}) {
    game.setBoardMode(mode);
    const preferences = game.defaultPreferences();
    Object.assign(preferences, { timeTrialEnabled: timed, twoPlayerEnabled: match, aiEnabled: ai, slowModeEnabled: slow });
    game.savePreferences(preferences);
    const state = { board: game.createEmptyBoard(), score: 0, streak: 0, scoringVersion: 2, history: [], gameOver: false,
      tray: shapes.map((shapeId, index) => ({ uid: `piece-${index}`, shapeId, rotation: 0, used: false })),
      match: match || ai ? game.createMatch() : null, aiOpponent: ai,
      timedMode: timed, timerStarted: timed, timeRemainingMs: timed ? remaining : null };
    return state;
  }
  function place(index, q, r) {
    const item = window.controller.state().tray[index];
    window.controller.placePiece(item, game.rotateShape(game.shapeById(item.shapeId), item.rotation), q, r);
  }
  function startDrag(index = 0) {
    const state = window.controller.state();
    const size = game.getBoardDimensions(state.board);
    elements.board.getBoundingClientRect = () => ({ left: 100, top: 50, width: size.width * 40,
      height: size.height * 40, bottom: 50 + size.height * 40 });
    const item = state.tray[index];
    const bounds = game.shapeDimensions(game.rotateShape(game.shapeById(item.shapeId), item.rotation));
    const rect = { left: 160, top: 500, width: bounds.width * 22, height: bounds.height * 22 };
    const slot = element();
    slot.dataset = { uid: item.uid };
    slot.querySelector = () => ({ getBoundingClientRect: () => rect });
    window.controller.beginDrag({ currentTarget: slot, pointerId: 1, button: 0, isPrimary: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, preventDefault() {} });
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  function pointer(type, x, y) {
    windowEvents[type]({ pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
  }
  return { game, saved, context, elements, boot, advance, seed, place, events, document,
    setLandscape: value => { landscape = value; },
    startDrag, pointer, preview: () => preview,
    state: () => window.controller.state(), result: () => result, displayed: () => displayed,
    settings: () => settings, elapseWithoutTick: milliseconds => now += milliseconds };
}

test("native fullscreen starts without browser fullscreen controls or events", () => {
  const app = setup(new Map(), { fullscreen: "native" });
  let requests = 0;
  app.document.fullscreenEnabled = true;
  app.document.fullscreenElement = null;
  app.document.documentElement.requestFullscreen = () => { requests += 1; };
  assert.equal(app.document.documentElement.hasAttribute("data-native-fullscreen"), true);
  app.boot();
  assert.equal(app.elements.fullscreenButton.hidden, true);
  assert.equal(app.elements.fullscreenButton.tabIndex, -1);
  assert.equal(app.elements.fullscreenButton.click, undefined);
  assert.equal(app.events.fullscreenchange, undefined);
  assert.equal(requests, 0);
});

for (const host of [undefined, { fullscreen: "browser" }, { fullscreen: "unknown" }]) {
  test(`browser fullscreen stays available with host ${JSON.stringify(host)}`, async () => {
    const app = setup(new Map(), host);
    let requests = 0;
    let exits = 0;
    app.document.fullscreenEnabled = true;
    app.document.documentElement.requestFullscreen = async () => { requests += 1; };
    app.document.exitFullscreen = async () => { exits += 1; };
    app.boot();
    assert.equal(app.document.documentElement.hasAttribute("data-native-fullscreen"), false);
    assert.equal(app.elements.fullscreenButton.hidden, false);
    assert.equal(requests, 0);
    assert.equal(typeof app.events.fullscreenchange, "function");
    await app.elements.fullscreenButton.click();
    assert.equal(requests, 1);
    app.document.fullscreenElement = app.document.documentElement;
    app.events.fullscreenchange();
    assert.equal(app.elements.fullscreenButton.getAttribute("aria-label"), "Exit fullscreen");
    await app.elements.fullscreenButton.click();
    assert.equal(exits, 1);
  });
}

for (const mode of ["hex", "square"]) {
  function dragApp() {
    const app = setup(); const state = app.seed({ mode, timed: false });
    const preferences = app.game.loadPreferences();
    Object.assign(preferences, { dragInitialOffset: 0, dragMovingOffset: 0, dragHorizontalOffset: 0, snapOverlapMultiplier: 2 });
    app.game.savePreferences(preferences);
    return { app, state };
  }
  function origin(app) {
    const size = app.game.getBoardDimensions(app.state().board);
    return { x: 100 + size.width * 20, y: 50 + size.height * 20 };
  }
  function left(app) { return Number(/translate3d\(([-\d.]+)px/.exec(app.elements.dragLayer.style.transform)[1]); }

  test(`${mode}: the dragged piece follows the pointer while only its board preview snaps`, () => {
    const { app, state } = dragApp(); app.game.saveGame(state); app.boot(); app.startDrag();
    const center = origin(app);
    app.pointer("pointermove", center.x + 5, center.y + 3);
    const first = left(app);
    const target = mode === "hex" ? 0 : 4;
    assert.deepEqual(app.preview(), { q: target, r: target, valid: true });
    app.pointer("pointermove", center.x + 9, center.y + 7);
    assert.ok(Math.abs(left(app) - first - 4) < 1e-9, "The dragged piece snapped instead of following the pointer");
    assert.deepEqual(app.preview(), { q: target, r: target, valid: true });
    assert.equal(app.state().board.cells[`${target},${target}`], 0);
    app.pointer("pointerup", center.x + 9, center.y + 7);
    assert.equal(app.state().board.cells[`${target},${target}`], 1);
    assert.equal(app.elements.dragLayer.classList.contains("active"), false);
  });

  test(`${mode}: snap safety holds the board preview without holding the dragged piece`, () => {
    const { app, state } = dragApp();
    const q = mode === "hex" ? 0 : 4, r = q;
    state.board.cells[`${q + 1},${r}`] = state.board.cells[`${q + 2},${r}`] = 1;
    app.game.saveGame(state); app.boot(); app.startDrag();
    const center = origin(app); app.pointer("pointermove", center.x, center.y);
    const first = left(app);
    app.pointer("pointermove", center.x + 24, center.y);
    assert.deepEqual(app.preview(), { q, r, valid: true });
    assert.ok(Math.abs(left(app) - first - 24) < 1e-9, "Snap safety moved the physical piece");
    app.pointer("pointermove", center.x + 64, center.y);
    assert.equal(app.preview().valid, false);
    assert.equal(app.elements.dragLayer.classList.contains("invalid"), true);
    app.pointer("pointerup", center.x + 64, center.y); app.advance(50);
    assert.equal(Object.values(app.state().board.cells).filter(Boolean).length, 2);
    assert.equal(app.elements.dragLayer.classList.contains("active"), false);
  });
}

for (const mode of ["hex", "square"]) {
  test(`${mode}: landscape swaps both drag offsets and leaves saved settings intact`, () => {
    const app = setup();
    app.document.documentElement.clientHeight = 390;
    const state = app.seed({ mode, timed: false });
    const preferences = { ...app.game.loadPreferences(), dragInitialOffset: 40, dragMovingOffset: 80, dragHorizontalOffset: 60 };
    app.game.savePreferences(preferences);
    app.game.saveGame(state);
    app.boot();
    for (const landscape of [false, true, false]) {
      app.setLandscape(landscape);
      const start = app.startDrag();
      const check = (dx, dy, expectedX, expectedY) => {
        const x = start.x + dx, y = start.y + dy;
        app.pointer("pointermove", x, y);
        const [, left, top] = app.elements.dragLayer.style.transform.match(/translate3d\(([-.\d]+)px, ([-.\d]+)px/).map(Number);
        const offsetX = left + parseFloat(app.elements.dragLayer.style.width) / 2 - x;
        const offsetY = top + parseFloat(app.elements.dragLayer.style.height) / 2 - y;
        assert.ok(Math.abs(offsetX - expectedX) < 0.001, `Expected X offset ${expectedX}, got ${offsetX}`);
        assert.ok(Math.abs(offsetY - expectedY) < 0.001, `Expected Y offset ${expectedY}, got ${offsetY}`);
      };
      if (landscape) {
        check(0, 0, -40, 0);
        check(-180, 0, -80, 0);
        check(-360, 0, -120, 0);
        check(180, 0, -40, 0);
        check(0, 180, -40, 30);
        check(0, -180, -40, -30);
        check(-180, 180, -80, 30);
        check(0, 720, -40, 60);
      } else {
        check(0, 0, 0, -40);
        check(0, -180, 0, -80);
        check(0, -360, 0, -120);
        check(0, 180, 0, -40);
        check(180, 0, 30, -40);
        check(-180, 0, -30, -40);
        check(180, -180, 30, -80);
        check(720, 0, 60, -40);
      }
      app.pointer("pointercancel", start.x, start.y);
      app.advance(50);
    }
    assert.deepEqual({ ...app.game.loadPreferences() }, preferences);
  });
}

function lineGap(app, options) {
  const state = app.seed(options);
  if (state.board.type === "square") {
    for (let q = 0; q < 9; q += 1) if (q !== 4) state.board.cells[`${q},4`] = 1;
  } else {
    for (let q = -4; q <= 4; q += 1) if (q !== 0) state.board.cells[`${q},0`] = 1;
  }
  app.game.saveGame(state);
  app.boot();
}

test("expired Time Trial stays ended after reload, Settings, and Undo", () => {
  const app = setup();
  app.game.saveGame(app.seed({ remaining: 100 }));
  app.boot(); app.place(0, 0, 0); app.advance(250);
  assert.equal(app.result().showUndo, false);
  const restored = setup(new Map(app.saved));
  restored.boot();
  assert.equal(restored.result().showUndo, false);
  restored.settings().onClose();
  assert.equal(restored.result().showUndo, false);
  restored.elements.modalUndoButton.click(); restored.elements.undoButton.click();
  assert.equal(restored.state().gameOver, true);
  assert.equal(restored.state().history.length, 1);
  assert.equal(restored.elements.undoButton.disabled, true);
});

test("a move cannot beat an expired clock between timer ticks", () => {
  const app = setup();
  app.game.saveGame(app.seed({ remaining: 100 })); app.boot();
  app.elapseWithoutTick(150); app.place(0, 0, 0);
  assert.equal(app.state().board.cells["0,0"], 0);
  assert.equal(app.state().gameOver, true);
});

for (const mode of ["hex", "square"]) {
  test(`${mode}: a move saves its cleared board before animation or a timer save`, () => {
    const app = setup(); lineGap(app, { mode });
    app.place(0, mode === "hex" ? 0 : 4, mode === "hex" ? 0 : 4);
    for (const elapsed of [0, 250, 30]) {
      app.advance(elapsed);
      const saved = app.game.loadGame();
      assert.equal(saved.score, 9);
      assert.equal(app.game.findCompletedCells(saved.board).zoneCount, 0);
      const restored = setup(new Map(app.saved)); restored.boot();
      restored.place(1, mode === "hex" ? -4 : 0, mode === "hex" ? 1 : 0);
      assert.equal(restored.state().score, 9);
    }
    assert.equal(app.state().history.length, 1);
    app.elements.undoButton.click();
    assert.equal(app.state().score, 0);
    assert.equal(Object.values(app.state().board.cells).filter(Boolean).length, 8);
  });
}

test("the final placement saves the next player and tray exactly once before effects end", () => {
  const app = setup(); lineGap(app, { timed: false, match: true, shapes: ["single"] });
  app.place(0, 0, 0);
  const saved = app.game.loadGame(true);
  assert.equal(saved.match.player, 1);
  assert.equal(saved.match.scores[0], 9);
  assert.equal(saved.history.length, 0);
  assert.ok(saved.tray.every(item => !item.used));
  const restored = setup(new Map(app.saved)); restored.boot(); restored.advance(1000);
  app.advance(1000);
  assert.equal(restored.state().match.player, 1);
  assert.equal(app.state().match.player, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.state().tray)), JSON.parse(JSON.stringify(app.state().tray)));
});

for (const options of [
  { mode: "hex", timed: false },
  { mode: "square", timed: false },
  { mode: "hex", timed: true },
  { mode: "hex", timed: false, match: true },
  { mode: "hex", timed: false, ai: true },
]) {
  const name = options.ai ? "VS AI" : options.match ? "2 Player" : `${options.mode} ${options.timed ? "Time Trial" : "solo"}`;
  test(`${name}: slow mode keeps the last move for Undo until Continue`, () => {
    const app = setup();
    const state = app.seed({ ...options, slow: true, shapes: ["single"] });
    if (state.match) state.match.consecutivePasses = 1;
    app.game.saveGame(state); app.boot();
    app.place(0, 0, 0);
    assert.equal(app.elements.continueButton.disabled, true, "Wait for the placement effect");
    app.elements.continueButton.click();
    assert.equal(app.state().history.length, 1);
    app.advance(360);
    assert.equal(app.elements.continueButton.hidden, false);
    assert.equal(app.elements.continueButton.disabled, false);
    assert.equal(app.elements.undoButton.disabled, false);
    assert.equal(app.state().tray[0].used, true);
    if (state.match) {
      assert.equal(app.state().match.player, 0);
      assert.equal(app.elements.passButton.hidden, true);
      app.elements.passButton.click();
      assert.equal(app.state().match.player, 0, "A completed tray cannot count as a pass");
    }
    app.elements.undoButton.click();
    assert.equal(app.state().board.cells["0,0"], 0);
    assert.equal(app.state().tray[0].used, false);
    assert.equal(app.elements.continueButton.hidden, true);
    app.place(0, 0, 0); app.advance(360);
    const restored = setup(new Map(app.saved)); restored.boot();
    assert.equal(restored.state().tray[0].used, true, "Reload must keep the completed tray");
    assert.equal(restored.state().history.length, 1);
    assert.equal(restored.elements.continueButton.hidden, false);
    restored.elements.continueButton.click();
    assert.ok(restored.state().tray.every(item => !item.used));
    assert.equal(restored.state().history.length, 0);
    assert.equal(restored.elements.continueButton.hidden, true);
    if (state.match) {
      assert.equal(restored.state().match.player, 1);
      assert.equal(restored.state().match.consecutivePasses, 0);
    }
  });
}

test("slow mode advances after the AI tray and still waits after the human tray", () => {
  const app = setup();
  const state = app.seed({ timed: false, ai: true, slow: true, shapes: ["single"] });
  state.match.player = 1;
  app.game.saveGame(state); app.boot(); app.advance(2000);
  assert.equal(app.state().match.player, 0);
  assert.ok(app.state().tray.every(item => !item.used));
  assert.equal(app.state().match.consecutivePasses, 0, "An empty AI tray cannot trigger an automatic pass");
  assert.equal(app.elements.continueButton.hidden, true);
  assert.equal(app.state().history.length, 0);
  const restored = setup(new Map(app.saved)); restored.boot(); restored.advance(2000);
  assert.equal(restored.state().match.player, 0);
  assert.ok(restored.state().tray.every(item => !item.used));
  const origins = Object.keys(restored.state().board.cells).filter(key => !restored.state().board.cells[key]);
  for (let index = 0; index < restored.state().tray.length; index++) {
    const [q, r] = origins[index].split(",").map(Number);
    const item = restored.state().tray[index];
    item.shapeId = "single"; item.rotation = 0;
    restored.place(index, q, r); restored.advance(360);
  }
  assert.equal(restored.state().match.player, 0);
  assert.equal(restored.elements.continueButton.hidden, false);
  assert.equal(restored.elements.undoButton.disabled, false);
});

test("an older AI save waiting on Continue advances once in slow mode", () => {
  const app = setup();
  const state = app.seed({ timed: false, ai: true, slow: true, shapes: ["single"] });
  state.match.player = 1;
  state.tray[0].used = true;
  app.game.saveGame(state); app.boot();
  assert.equal(app.state().match.player, 0);
  assert.ok(app.state().tray.every(item => !item.used));
  assert.equal(app.elements.continueButton.hidden, true);
  const restored = setup(new Map(app.saved)); restored.boot(); restored.advance(2000);
  assert.equal(restored.state().match.player, 0);
});

for (const duringEffect of [false, true]) {
  test(`turning slow mode off ${duringEffect ? "during effects" : "while waiting"} advances once`, () => {
    const app = setup();
    app.game.saveGame(app.seed({ timed: false, match: true, slow: true, shapes: ["single"] }));
    app.boot(); app.place(0, 0, 0);
    if (!duringEffect) app.advance(360);
    app.game.savePreferences({ ...app.game.loadPreferences(), slowModeEnabled: false });
    app.settings().onAccessibilityChange(); app.advance(360);
    assert.equal(app.state().match.player, 1);
    assert.equal(app.state().history.length, 0);
    assert.ok(app.state().tray.every(item => !item.used));
    const uids = app.state().tray.map(item => item.uid).join();
    app.elements.continueButton.click();
    assert.equal(app.state().tray.map(item => item.uid).join(), uids);
    assert.equal(app.state().match.player, 1);
  });
}

test("Time Trial still expires while slow mode waits for Continue", () => {
  const app = setup();
  app.game.saveGame(app.seed({ remaining: 1000, slow: true, shapes: ["single"] }));
  app.boot(); app.place(0, 0, 0); app.advance(1250);
  assert.equal(app.state().gameOver, true);
  assert.equal(app.elements.continueButton.disabled, true);
  assert.equal(app.elements.undoButton.disabled, true);
  app.elements.continueButton.click();
  assert.equal(app.state().tray[0].used, true);
});

test("a move still displays its filled cells and current player during the clear", () => {
  const app = setup(); lineGap(app, { timed: false, match: true, shapes: ["single"] });
  app.place(0, 0, 0);
  assert.equal(app.game.findCompletedCells(app.displayed().board).zoneCount, 1);
  assert.equal(app.displayed().match.player, 0);
  assert.equal(app.displayed().match.scores[0], 9);
  assert.equal(app.state().match.player, 1);
  assert.equal(app.game.findCompletedCells(app.state().board).zoneCount, 0);
  app.advance(360);
  assert.equal(app.displayed().match.player, 1);
  assert.equal(app.game.findCompletedCells(app.displayed().board).zoneCount, 0);
});

test("switching boards during effects preserves the completed move and drops stale callbacks", () => {
  const app = setup(); lineGap(app, { timed: false, match: true, shapes: ["single"] });
  app.place(0, 0, 0); app.settings().onBoardChange("square"); app.advance(1000);
  assert.equal(app.state().board.type, "square");
  app.settings().onBoardChange("hex"); app.advance(1000);
  assert.equal(app.state().match.player, 1);
  assert.equal(app.state().match.scores[0], 9);
  assert.equal(app.game.findCompletedCells(app.state().board).zoneCount, 0);
});

for (const mode of ["hex", "square"]) {
  test(`${mode}: a legacy saved clear loads without paying its points again`, () => {
    const app = setup(); const state = app.seed({ mode });
    const previous = { board: app.game.cloneBoard(state.board), score: 0, streak: 0,
      tray: state.tray.map(item => ({ ...item })), match: null };
    if (mode === "hex") {
      for (let q = -4; q <= 4; q += 1) state.board.cells[`${q},0`] = 1;
      for (let q = -4; q <= 4; q += 1) if (q !== 0) previous.board.cells[`${q},0`] = 1;
    } else {
      for (let q = 0; q < 9; q += 1) state.board.cells[`${q},4`] = 1;
      for (let q = 0; q < 9; q += 1) if (q !== 4) previous.board.cells[`${q},4`] = 1;
    }
    Object.assign(state, { score: 9, streak: 1, history: [previous] }); state.tray[0].used = true;
    app.saved.set(app.game.storageKeys(mode).storageKey, JSON.stringify(state)); app.boot();
    assert.equal(app.state().score, 9);
    assert.equal(app.game.findCompletedCells(app.state().board).zoneCount, 0);
    app.elements.undoButton.click();
    assert.equal(app.state().score, 0);
    assert.equal(Object.values(app.state().board.cells).filter(Boolean).length, 8);
    assert.equal(app.game.loadGame().saveVersion, 1);
  });
}

test("legacy clear repair requires a matching score change", () => {
  const app = setup(); const state = app.seed();
  for (let q = -4; q <= 4; q += 1) state.board.cells[`${q},0`] = 1;
  Object.assign(state, { score: 20, streak: 1, history: [{ board: app.game.cloneBoard(state.board), score: 0 }] });
  app.saved.set(app.game.CONFIG.storageKey, JSON.stringify(state));
  assert.equal(app.game.findCompletedCells(app.game.loadGame().board).zoneCount, 1);
});

test("timer expiry during a clear saves a completed move and restart can proceed", () => {
  const app = setup(); lineGap(app, { remaining: 100 }); app.place(0, 0, 0); app.advance(250);
  const saved = app.game.loadGame();
  assert.equal(saved.gameOver, true);
  assert.equal(saved.score, 9);
  assert.equal(app.game.findCompletedCells(saved.board).zoneCount, 0);
  app.elements.modalButton.click(); app.advance(400);
  assert.equal(app.state().gameOver, false);
  assert.equal(app.state().score, 0);
});

test("a blocked solo game can still undo while time remains", () => {
  const app = setup(); const state = app.seed({ shapes: ["single", "line4"] });
  for (const key of Object.keys(state.board.cells)) {
    const [q, r] = key.split(",").map(Number);
    state.board.cells[key] = ((q - r) % 3 + 3) % 3 === 0 ? 0 : 1;
  }
  // Leave a second gap so the center group stays open after placement.
  state.board.cells["1,0"] = 0;
  app.game.saveGame(state); app.boot(); app.place(0, 0, 0); app.advance(400);
  assert.equal(app.state().gameOver, true);
  assert.equal(app.result().showUndo, true);
  app.elements.modalUndoButton.click();
  assert.equal(app.state().gameOver, false);
  assert.equal(app.state().board.cells["0,0"], 0);
});

test("the AI browser setup restores its supplied board and plays both levels", async () => {
  for (const [difficulty, points] of [["medium", 36], ["hard", 43]]) {
    const app = setup();
    const board = app.game.createEmptyBoard(4);
    for (const key of ["0,-3", "0,-2", "2,-2", "3,-2", "-1,-1", "0,-1", "1,-1", "-3,0",
      "1,0", "-3,1", "0,1", "1,1", "2,1", "-3,2", "1,2", "-2,3", "0,3"]) board.cells[key] = 1;
    const source = fs.readFileSync(path.join(__dirname, "ai-checks.js"), "utf8");
    const helper = source.slice(source.indexOf("async function load(options"), source.indexOf("function sendPiece"));
    Object.assign(app.context, { api: app.game, reload: async () => app.boot(),
      doc: () => ({ querySelectorAll: () => ({ length: Object.keys(app.displayed().board.cells).length }) }),
      assert: (value, message) => assert.ok(value, message),
      options: { board, difficulty, shapes: ["single", "line2", "bend3"], traySize: 3, match: { player: 1 } } });
    vm.runInContext(helper, app.context);
    await vm.runInContext("load(options)", app.context);
    assert.equal(app.game.getBoardSide(app.state().board), 4);
    app.advance(3000);
    assert.equal(app.state().match.player, 0);
    assert.equal(app.state().match.scores[1], points);
  }
});

for (const mode of ["hex", "square"]) {
  test(`${mode}: Time Trial sends a score at expiry, with no replay after reload`, () => {
    const app = setup(new Map(), { getScoreContext: () => "tester-a" });
    const state = app.seed({ mode, remaining: 100 });
    state.score = 123;
    state.scoreRun = app.game.createScoreRun(app.game.loadPreferences(), mode, true);
    app.game.saveGame(state);
    const events = [];
    app.game.profile.subscribe(event => { if (event.type === "run-finished") events.push(event.run); });
    app.boot();
    assert.equal(events.length, 0);
    app.advance(250);
    assert.equal(events.length, 1);
    assert.equal(events[0].board, mode);
    assert.equal(events[0].mode, "time-trial");
    assert.equal(events[0].score, 123);
    assert.equal(events[0].defaultRules, true);
    assert.equal(events[0].context, "tester-a");
    app.settings().onClose(); app.advance(1000);
    assert.equal(events.length, 1);
    const reloaded = setup(app.saved, { getScoreContext: () => "tester-b" });
    const replay = [];
    reloaded.game.profile.subscribe(event => replay.push(event)); reloaded.boot(); reloaded.advance(1000);
    assert.equal(replay.filter(event => event.type === "run-finished").length, 0);
  });

  test(`${mode}: solo sends a score only when the board becomes blocked`, () => {
    const app = setup(new Map(), { getScoreContext: () => "tester-a" });
    const state = app.seed({ mode, timed: false, shapes: ["single", "line4"] });
    state.score = 100;
    state.scoreRun = app.game.createScoreRun(app.game.loadPreferences(), mode, false);
    for (const key of Object.keys(state.board.cells)) {
      const [q, r] = key.split(",").map(Number);
      state.board.cells[key] = mode === "hex" ? (((q - r) % 3 + 3) % 3 === 0 ? 0 : 1) : ((q + r) % 2 === 0 ? 0 : 1);
    }
    if (mode === "hex") state.board.cells["1,0"] = 0;
    app.game.saveGame(state);
    const events = [];
    app.game.profile.subscribe(event => { if (event.type === "run-finished") events.push(event.run); });
    app.boot(); assert.equal(events.length, 0);
    app.place(0, 0, 0); app.advance(400);
    assert.equal(app.state().gameOver, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].mode, "solo");
    assert.equal(events[0].board, mode);
    assert.equal(events[0].defaultRules, true);
  });
}

test("restoring a profile refreshes live best scores without replacing unfinished saves", () => {
  const app = setup();
  const state = app.seed({ timed: false });
  app.game.saveGame(state);
  let renderedBest;
  app.game.renderGame = (state, best) => { renderedBest = best; };
  app.boot();
  const unfinished = app.saved.get(app.game.CONFIG.storageKey);
  const profile = app.game.profile.export(); profile.bests.hex.solo = 999;
  profile.settings.global.pieceHue = 80;
  app.game.profile.restore(profile);
  assert.equal(renderedBest, 999);
  assert.equal(app.game.loadPreferences().pieceHue, 80);
  assert.equal(app.saved.get(app.game.CONFIG.storageKey), unfinished);
});

test("a timer that ends during startup reaches the host before app subscription", () => {
  const events = [];
  const app = setup(new Map(), { getScoreContext: () => "tester-a", onEvent: event => events.push(event) });
  const state = app.seed({ remaining: 0 });
  state.score = 123;
  state.scoreRun = app.game.createScoreRun(app.game.loadPreferences(), "hex", true);
  app.game.saveGame(state);
  app.boot();
  const finished = events.filter(event => event.type === "run-finished");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].run.score, 123);
  assert.equal(finished[0].run.defaultRules, true);
});
