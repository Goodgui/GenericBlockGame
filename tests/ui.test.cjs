const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const layouts = [["hex", 4], ["hex", 5], ["hex", 6], ["square", 6], ["square", 9], ["square", 12]];
const hexSteps = [[1,-1],[1,0],[0,1],[-1,1],[-1,0],[0,-1]];
const squareSteps = [[0,-1],[1,0],[0,1],[-1,0]];

function setup(mode, side) {
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
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const elements = new Map(), saved = new Map();
  const timers = new Map(), listeners = new Map();
  let now = 0, nextTimer = 0;
  const window = {
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
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value),
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
  return { game, board, cells, borders, elements, advance, listeners,
    emit: type => [...(listeners.get(type) || [])].forEach(action => action()),
    draw: () => game.renderGame(state, 0, "Best score", () => true, () => {}) };
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
