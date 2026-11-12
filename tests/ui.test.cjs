const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const layouts = [["hex", 4], ["hex", 5], ["hex", 6], ["square", 6], ["square", 9], ["square", 12]];
const hexSteps = [[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]];
const squareSteps = [[0,-1],[1,0],[0,1],[-1,0]];

function setup(mode, side, landscape = false) {
  class Element {
    get firstChild() { return this.children[0]; }
    get childNodes() { return this.children; }
    constructor(tag = "div") {
      this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {};
      this.style = { setProperty(name, value) { this[name] = value; } };
      const classes = new Set();
      this.classList = { add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name),
        toggle(name, enabled = !classes.has(name)) { enabled ? classes.add(name) : classes.delete(name); } };
    }
    append(...nodes) {
      for (const node of nodes) {
        if (node.tag === "fragment") this.append(...node.children);
        else { node.parentElement = this; this.children.push(node); }
      }
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    insertBefore(node, before) {
      node.remove();
      node.parentElement = this;
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, node);
    }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(node => node !== this);
      this.parentElement = null;
    }
    querySelector(selector) { return this.children.find(node => node.className === selector.slice(1)); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 22, height: 22 }; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(type, action) { this[type] = action; }
  }
  const elements = new Map(), saved = new Map();
  const writes = [];
  const timers = new Map(), listeners = new Map();
  let now = 0, nextTimer = 0;
  const window = {
    matchMedia: query => ({ matches: query.includes("orientation: landscape") && landscape }),
    setTimeout(action, delay) { const id = ++nextTimer; timers.set(id, { action, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, action) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(action);
    },
    removeEventListener(type, action) { listeners.get(type)?.delete(action); },
  };
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].action();
    }
    now = end;
  }
  const context = vm.createContext({ window, localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); saved.set(key, value); },
  }, document: {
    body: new Element(), querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    }, createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
    createDocumentFragment: () => new Element("fragment"),
  } });
  for (const file of ["config.js", "hex.js", "preferences.js", "shapes.js", "board.js", "scoring.js", "two-player.js", "ui.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  }
  const game = context.window.GenericBlockGame;
  game.setBoardMode(mode); game.buildBoard(side);
  const board = game.createEmptyBoard(side);
  const state = { board, score: 0, history: [], tray: [], match: null, gameOver: false };
  const cells = new Map(elements.get("#board").children.filter(node => node.tag === "div")
    .map(cell => [`${cell.dataset.q},${cell.dataset.r}`, cell]));
  const borders = elements.get("#board").children.find(node => node.attributes.class === "chunk-outlines").children;
  return { game, board, state, cells, borders, elements, advance, listeners, writes,
    setLandscape: value => { landscape = value; },
    emit: type => [...(listeners.get(type) || [])].forEach(action => action()),
    draw: () => game.renderGame(state, 0, "Best score", () => true, () => {}) };
}

for (const mode of ["hex", "square"]) {
  test(`${mode}: repeated tray and board renders do not write settings`, () => {
    const app = setup(mode, mode === "hex" ? 5 : 9);
    const preferences = app.game.defaultPreferences();
    preferences.customPieces = [{ id: "custom", weight: 5, cells: [[2,3], [3,3]] }];
    app.game.savePreferences(preferences);
    app.state.tray = ["single", "custom", "line3"].map((shapeId, index) =>
      ({ uid: `piece-${index}`, shapeId, rotation: 0, used: false }));
    app.writes.length = 0;
    for (let i = 0; i < 100; i += 1) app.draw();
    assert.equal(app.writes.length, 0);
    assert.equal(app.elements.get("#tray").children.length, 3);
  });
}

test("AI motion follows a resized board and waits until it reaches the new target", () => {
  const app = setup("hex", 5);
  const shape = app.game.rotateShape(app.game.shapeById("line2"), 1);
  const piece = app.game.makePiece(shape, 22);
  const tray = app.elements.get("#tray");
  tray.append(piece);
  tray.querySelector = () => piece;
  piece.getBoundingClientRect = () => ({ left: 20, top: 500, width: 40, height: 30 });
  const [q, r] = shape.cells[0];
  let target = { left: 150, top: 200, width: 40 };
  app.cells.get(`${q},${r}`).getBoundingClientRect = () => target;
  let completed = 0;
  const stop = app.game.animateAiMove({ uid: "test" }, shape, 0, 0, () => completed++);
  const layer = app.elements.get("#dragLayer");
  const firstTransform = layer.style.transform;
  app.advance(300);
  target = { left: 250, top: 100, width: 30 };
  app.emit("resize");
  assert.notEqual(layer.style.transform, firstTransform, "Motion must update its destination on resize");
  const values = layer.style.transform.match(/-?\d+(?:\.\d+)?/g).map(Number);
  // translate3d contributes the first number (3); scale is relative to the initial piece.
  const [, x, y, , scale] = values;
  assert.equal(scale, 0.75);
  assert.equal(x + parseFloat(layer.firstChild.style.left) * scale, target.left);
  assert.equal(y + parseFloat(layer.firstChild.style.top) * scale, target.top);
  app.advance(140);
  assert.equal(completed, 0, "The old completion timer must not place the piece early");
  app.advance(300);
  assert.equal(completed, 1);
  assert.equal(layer.classList.contains("active"), false);
  assert.equal(tray.classList.contains("dragging"), false);
  assert.equal(app.listeners.get("resize").size, 0);
  stop();
  app.advance(1000);
  assert.equal(completed, 1);
});

test("cancelling AI motion removes resize handling and never places the piece", () => {
  const app = setup("hex", 5);
  const shape = app.game.shapeById("single");
  const piece = app.game.makePiece(shape, 22);
  const tray = app.elements.get("#tray");
  tray.append(piece);
  tray.querySelector = () => piece;
  piece.getBoundingClientRect = () => ({ left: 20, top: 500, width: 22, height: 22 });
  app.cells.get("0,0").getBoundingClientRect = () => ({ left: 150, top: 200, width: 40 });
  let completed = 0;
  const stop = app.game.animateAiMove({ uid: "test" }, shape, 0, 0, () => completed++);
  app.advance(100);
  stop();
  app.emit("resize");
  app.advance(1000);
  assert.equal(completed, 0);
  assert.equal(app.elements.get("#dragLayer").classList.contains("active"), false);
  assert.equal(tray.classList.contains("dragging"), false);
  assert.equal(app.listeners.get("resize")?.size || 0, 0);
});

for (const mode of ["hex", "square"]) {
  test(`${mode}: a vertical tray scrolls, keeps its final slots, and rotates back to a row`, () => {
    const app = setup(mode, mode === "hex" ? 5 : 9, true);
    const tray = app.elements.get("#tray");
    tray.clientWidth = 90;
    tray.clientHeight = 300;
    app.state.tray = Array.from({ length: 5 }, (_, index) => ({ uid: `vertical-${index}`, shapeId: "line3", used: false }));
    app.draw();
    const previous = app.elements.get("#trayPreviousButton");
    const next = app.elements.get("#trayNextButton");
    assert.equal(previous.attributes["aria-label"], "Shift tray up one piece");
    assert.equal(next.attributes["aria-label"], "Shift tray down one piece");
    assert.ok(tray.children.every(slot => slot.style.gridColumn === "1"));
    for (const slot of tray.children) {
      const shape = app.game.shapeById(slot.dataset.shape.split(":")[0]);
      const dimensions = app.game.shapeDimensions(shape);
      assert.ok(Number(slot.dataset.cellSize) * dimensions.width <= tray.clientWidth - 12);
      assert.ok(Number(slot.dataset.cellSize) * dimensions.height <= 86);
    }
    app.game.shiftTray(1);
    assert.equal(tray.style.transform, "translateY(calc(-33.333333333333336% - 1px))");
    app.game.revealTrayItem("vertical-4");
    assert.equal(Number(tray.dataset.offset), 2);
    assert.equal(next.hidden, true);
    app.state.tray[0].used = true;
    app.state.tray[1].used = true;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridRow), ["1", "2", "3"]);
    app.state.tray[3].used = true;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridRow), ["1", "3"]);
    app.state.tray[3].used = false;
    app.state.restoredTrayItemUid = "vertical-3";
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridRow), ["1", "2", "3"]);
    app.setLandscape(false);
    tray.clientWidth = 360;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridColumn), ["1", "2", "3"]);
    assert.ok(tray.children.every(slot => slot.style.gridRow === "auto"));
    assert.equal(next.attributes["aria-label"], "Shift tray right one piece");
    assert.equal(tray.style.transform, "translateX(calc(0% - 0px))");
  });

  test(`${mode}: trays close gaps, hide arrows at each end, and restore pieces in order`, () => {
    const app = setup(mode, mode === "hex" ? 5 : 9);
    const tray = app.elements.get("#tray");
    tray.clientWidth = 360;
    const previous = app.elements.get("#trayPreviousButton");
    const next = app.elements.get("#trayNextButton");
    for (const count of [1, 2, 3, 4, 8]) {
      app.state.tray = Array.from({ length: count }, (_, index) => ({ uid: `${count}-${index}`, shapeId: "single", used: false }));
      app.draw();
      assert.equal(Number(tray.dataset.offset), 0);
      assert.equal(tray.children.length, count);
      assert.equal(tray.style["--tray-columns"], 3);
      assert.equal(previous.hidden, true);
      assert.equal(next.hidden, count <= 3);
      if (count <= 3) continue;
      assert.equal(previous.disabled, true);
      assert.equal(next.disabled, false);
      app.game.shiftTray(1);
      assert.equal(Number(tray.dataset.offset), 1);
      assert.equal(tray.style.transform, "translateX(calc(-33.333333333333336% - 1px))");
      assert.equal(previous.hidden, false);
      const survivor = tray.children[2];
      app.state.tray[1].used = true;
      app.draw();
      assert.equal(tray.children.length, count - 1, "Used pieces must leave no slots behind");
      assert.equal(tray.children[1], survivor, "Remaining slots must stay intact for their slide");
      assert.deepEqual(tray.children.map(slot => slot.dataset.uid), app.state.tray.filter(item => !item.used).map(item => item.uid));
      assert.equal(Number(tray.dataset.offset), Math.min(1, count - 4));
      app.game.shiftTray(99);
      assert.equal(Number(tray.dataset.offset), count - 4);
      assert.equal(next.disabled, true);
      assert.equal(next.hidden, true);
      app.game.shiftTray(-1);
      assert.equal(Number(tray.dataset.offset), Math.max(0, count - 5));
      app.game.shiftTray(-99);
      assert.equal(Number(tray.dataset.offset), 0);
      assert.equal(previous.disabled, true);
      assert.equal(previous.hidden, true);
      app.game.revealTrayItem(app.state.tray.at(-1).uid);
      assert.equal(Number(tray.dataset.offset), count - 4, "AI pieces must be visible before they move");
      app.state.tray[1].used = false;
      app.state.restoredTrayItemUid = app.state.tray[1].uid;
      app.draw();
      assert.deepEqual(tray.children.map(slot => slot.dataset.uid), app.state.tray.map(item => item.uid), "Undo must restore the original order");
      app.state.restoredTrayItemUid = app.state.tray[0].uid;
      app.draw();
      assert.equal(Number(tray.dataset.offset), 0, "Undo must reveal the restored piece");
      for (const item of app.state.tray) item.used = true;
      app.draw();
      assert.equal(tray.children.length, 0);
      assert.equal(previous.hidden, true);
      assert.equal(next.hidden, true);
    }
    app.state.tray = [{ uid: "fresh-tray", shapeId: "single", used: false }];
    app.draw();
    assert.equal(Number(tray.dataset.offset), 0);
    assert.equal(next.hidden, true);
  });

  test(`${mode}: the final three pieces keep their slots through placements and Undo`, () => {
    const app = setup(mode, mode === "hex" ? 5 : 9);
    const tray = app.elements.get("#tray");
    app.state.tray = Array.from({ length: 4 }, (_, index) => ({ uid: `fixed-${index}`, shapeId: "single", used: false }));
    app.draw();
    app.state.tray[0].used = true;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridColumn), ["1", "2", "3"]);
    app.state.tray[2].used = true;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridColumn), ["1", "3"]);
    app.state.tray[1].used = true;
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridColumn), ["3"]);
    assert.equal(tray.style["--tray-columns"], 3);
    app.state.tray[2].used = false;
    app.state.restoredTrayItemUid = "fixed-2";
    app.draw();
    assert.deepEqual(tray.children.map(slot => slot.style.gridColumn), ["2", "3"]);
  });
}

test("clear borders cover each section edge once on every grid", () => {
  for (const [mode, side] of layouts) {
    const { game, board, cells, borders, elements } = setup(mode, side);
    const chunks = game.boardChunks(board);
    for (const chunk of chunks) {
      const drawn = [...cells].filter(([,cell]) => cell.dataset.chunk === chunk.center).map(([key]) => key).sort();
      assert.deepEqual(drawn, [...chunk.cells].sort());
    }
    const expected = new Set();
    const steps = mode === "hex" ? hexSteps : squareSteps;
    for (const [key, cell] of cells) {
      if (cell.dataset.chunk === undefined) continue;
      const [q, r] = key.split(",").map(Number);
      for (const [dq, dr] of steps) {
        const neighbor = `${q + dq},${r + dr}`;
        if (cells.get(neighbor)?.dataset.chunk !== cell.dataset.chunk) expected.add([key, neighbor].sort().join("|"));
      }
    }
    const actual = borders.map(border => {
      assert.ok(border.dataset.cell !== undefined && border.dataset.neighbor !== undefined, "Border must track both sides");
      assert.ok(/^M[^MLZ]+L[^MLZ]+$/.test(border.attributes.d), "Border must follow a single cell edge");
      assert.ok(!/NaN|undefined/.test(border.attributes.d));
      return [border.dataset.cell, border.dataset.neighbor].sort().join("|");
    });
    assert.equal(new Set(actual).size, actual.length, "Shared borders must not draw twice");
    assert.deepEqual([...actual].sort(), [...expected].sort());
    const frame = elements.get("#board").children.find(node => node.attributes.class === "board-frame");
    assert.equal(frame.children.length, 3);
    assert.ok(frame.children[0].attributes.d.endsWith("Z"));
  }
});

test("neighboring clear sections use three shades on Hex and dark and medium on Square", () => {
  for (const [mode, side] of layouts) {
    const { game, board, cells } = setup(mode, side);
    const palette = mode === "square" ? ["0", "1"] : ["0", "1", "2"];
    const shades = new Set();
    const steps = mode === "hex" ? hexSteps : squareSteps;
    for (const cell of cells.values()) {
      const shade = cell.dataset.sectionShade;
      assert.ok(palette.includes(shade), `${mode} ${side}: cell uses a shade outside its palette`);
      shades.add(shade);
    }
    for (const chunk of game.boardChunks(board)) {
      const shade = cells.get(chunk.cells[0]).dataset.sectionShade;
      for (const key of chunk.cells) assert.equal(cells.get(key).dataset.sectionShade, shade);
    }
    assert.equal(shades.size, palette.length, `${mode} ${side} should use every shade in its palette`);
    for (const [key, cell] of cells) {
      if (cell.dataset.chunk === undefined) continue;
      const [q, r] = key.split(",").map(Number);
      for (const [dq, dr] of steps) {
        const other = cells.get(`${q + dq},${r + dr}`);
        if (other?.dataset.chunk !== undefined && other.dataset.chunk !== cell.dataset.chunk) {
          assert.notEqual(cell.dataset.sectionShade, other.dataset.sectionShade, `${mode} ${side}: touching sections share a shade`);
        }
      }
    }
  }
});

test("each clear border is dark only when both adjacent cells are filled", () => {
  for (const [mode, side] of layouts) {
    const { board, borders, draw } = setup(mode, side);
    draw();
    assert.ok(borders.every(border => border.dataset.filled === "false"), "Empty borders should be light");
    const edge = borders.find(border => Object.hasOwn(board.cells, border.dataset.neighbor));
    assert.ok(edge, "Missing shared border");
    for (const [a, b, dark] of [[1,0,false],[0,2,false],[1,1,true],[1,2,true],[0,2,false],[2,2,true],[2,0,false],[0,0,false]]) {
      board.cells[edge.dataset.cell] = a;
      board.cells[edge.dataset.neighbor] = b;
      draw();
      assert.equal(edge.dataset.filled, String(dark));
      assert.ok(borders.some(border => border.dataset.filled === "false"), "A placed cell must not darken distant borders");
    }
    const outer = borders.find(border => !Object.hasOwn(board.cells, border.dataset.neighbor));
    assert.ok(outer, "Missing outside border");
    board.cells[outer.dataset.cell] = 1; draw(); assert.equal(outer.dataset.filled, "false");
    board.cells[outer.dataset.cell] = 0; draw(); assert.equal(outer.dataset.filled, "false");
  }
});
