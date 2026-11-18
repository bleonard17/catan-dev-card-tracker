"use strict";

// Dependency-free regression tests for the exact browser script deployed by GitHub Pages.
// The small DOM stub captures event handlers; only the instrumented in-memory copy is
// modified, never the production app.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const originalDeck = { knight: 14, monopoly: 2, "year-of-plenty": 2, "road-building": 2, "victory-point": 5 };
const cardIds = Object.keys(originalDeck);

function createTracker() {
  const elements = new Map();
  const makeElement = id => ({
    id,
    textContent: "",
    innerHTML: "",
    disabled: false,
    hidden: true,
    listeners: {},
    src: "",
    href: "",
    classList: { toggle() {} },
    style: { setProperty() {} },
    addEventListener(eventName, callback) { this.listeners[eventName] = callback; },
    querySelector(selector) {
      if (selector === ".primary-btn-title" || selector === ".primary-btn-plus") {
        if (!this.children) this.children = new Map();
        if (!this.children.has(selector)) this.children.set(selector, { textContent: "" });
        return this.children.get(selector);
      }
      if (selector.includes("button[data-action") || selector.includes(".owner-choice")) {
        return { focus() {} };
      }
      return null;
    },
    setAttribute() {}
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const document = {
    getElementById: get,
    querySelector: selector => get(selector),
    documentElement: { style: { setProperty() {} } }
  };
  const window = {
    CATAN_ICONS: {},
    clearTimeout() {},
    setTimeout() { return 1; },
    confirm() { return true; }
  };
  const debug = `
  window.__inspect = () => ({
    state: cloneState(state),
    remaining: physicalRemaining(),
    known: knownTotal(),
    hidden: hiddenCount(),
    probabilities: Object.fromEntries(CARD_TYPES.map(c => [c.id, probabilityFor(c)])),
    pendingChoice,
    historyLength: history.length
  });
  render();
})();`;
  const code = source.replace(/\n  render\(\);\s*\n\}\)\(\);\s*$/, "\n" + debug);
  assert.notEqual(code, source, "test inspector injection point must exist");
  vm.runInNewContext(code, { window, document }, { filename: "app.js", timeout: 1000 });

  const action = (name, cardId) => {
    get("cardRows").listeners.click({
      target: { closest: () => ({ dataset: { action: name, cardId }, disabled: false }) }
    });
  };
  const click = id => {
    const el = get(id);
    assert.ok(el.listeners.click, id + " must have click handler");
    el.listeners.click();
  };
  return { state: () => window.__inspect(), action, click, get, document };
}

function validState(s) {
  assert.ok(s.remaining >= 0 && s.remaining <= 25, "remaining physical cards");
  assert.ok(s.hidden >= 0 && s.known >= 0 && s.known <= 25, "hidden/known nonnegative");
  assert.equal(s.hidden + s.known + s.remaining, 25, "25 total cards accounted for");
  for (const [card, count] of Object.entries(originalDeck)) {
    assert.ok(s.state.ownDrawn[card] >= 0 && s.state.ownPlayed[card] >= 0 &&
      s.state.opponentPlayed[card] >= 0, card + " counts nonnegative");
    assert.ok(s.state.ownPlayed[card] <= s.state.ownDrawn[card], card + " cannot play more than drawn");
    assert.ok(s.state.ownDrawn[card] + s.state.opponentPlayed[card] <= count, card + " deck maximum");
    assert.ok(s.probabilities[card] >= 0 && s.probabilities[card] <= 1, card + " odds in range");
  }
  const sum = Object.values(s.probabilities).reduce((a,b) => a+b, 0);
  assert.ok(Math.abs(sum - (s.remaining > 0 ? 1 : 0)) < 1e-10, "next-draw odds normalize");
}

test("initial deck has correct probabilities and no recorded actions", () => {
  const app = createTracker();
  const s = app.state();
  validState(s);
  assert.equal(s.remaining, 25);
  assert.equal(s.probabilities.knight, 14/25);
  assert.equal(s.probabilities["victory-point"], 5/25);
  assert.equal(s.historyLength, 0);
});

test("I Drew and then Played my Knight do not double-count its identity", () => {
  const app = createTracker();
  app.action("draw", "knight");
  const before = app.state();
  assert.equal(before.remaining, 24);
  assert.equal(before.known, 1);
  assert.equal(before.hidden, 0);
  app.action("played", "knight");
  const after = app.state();
  validState(after);
  assert.equal(after.state.ownPlayed.knight, 1);
  assert.equal(after.state.opponentPlayed.knight, 0);
  assert.equal(after.probabilities.knight, before.probabilities.knight);
  assert.equal(after.known, 1);
  app.action("played", "knight");
  assert.equal(app.state().state.ownPlayed.knight, 1, "cannot play same own card twice");
  app.click("undoBtn");
  assert.equal(app.state().state.ownPlayed.knight, 0, "undo the play only");
  validState(app.state());
});

test("opponent purchase and reveal change hidden count but not physical drawn count", () => {
  const app = createTracker();
  app.click("unknownDrawBtn");
  app.click("unknownDrawBtn");
  app.click("unknownDrawBtn");
  const old = app.state();
  assert.equal(old.probabilities.knight, 14/25, "unidentified purchases alone preserve conditional odds");
  assert.equal(old.hidden, 3);
  app.action("played", "knight");
  app.action("played", "knight");
  app.action("played", "monopoly");
  const s = app.state();
  validState(s);
  assert.equal(s.remaining, 22);
  assert.equal(s.hidden, 0);
  assert.equal(s.state.opponentPlayed.knight, 2);
  assert.equal(s.state.opponentPlayed.monopoly, 1);
  assert.equal(s.probabilities.knight, 12/22);
});

test("ambiguous Played offers owner choice, and each path records the right event", () => {
  const app = createTracker();
  app.action("draw", "knight");
  app.click("unknownDrawBtn");
  app.action("played", "knight");
  assert.equal(app.state().pendingChoice, "knight");
  assert.ok(app.get("cardRows").innerHTML.includes("choice-knight"));
  app.action("play-mine", "knight");
  let s=app.state();
  validState(s);
  assert.equal(s.state.ownPlayed.knight, 1);
  assert.equal(s.hidden, 1);
  assert.equal(s.known, 1);
  app.click("undoBtn");
  app.action("played", "knight");
  app.action("play-opponent", "knight");
  s=app.state();
  validState(s);
  assert.equal(s.state.ownPlayed.knight, 0);
  assert.equal(s.state.opponentPlayed.knight, 1);
  assert.equal(s.hidden, 0);
  assert.equal(s.known, 2);
});

test("deck exhausted can still reveal opponents and Undo dismisses celebration", () => {
  const app = createTracker();
  for (let i=0; i<25; i++) app.click("unknownDrawBtn");
  let s=app.state();
  validState(s);
  assert.equal(s.remaining, 0);
  assert.equal(s.hidden, 25);
  assert.equal(app.get("deckCelebration").hidden, false, "shows final-draw celebration");
  app.click("unknownDrawBtn");
  assert.equal(app.state().state.drawn, 25, "cannot buy after deck exhaustion");
  app.action("played", "knight");
  s=app.state();
  assert.equal(s.state.opponentPlayed.knight, 1);
  assert.equal(s.remaining, 0);
  validState(s);
  app.click("undoBtn");
  app.click("undoBtn");
  s=app.state();
  assert.equal(s.remaining, 1);
  assert.equal(s.hidden, 24);
  assert.equal(app.get("deckCelebration").hidden, true, "Undo closes stale celebration");
  validState(s);
});

test("all 14 Knights accounted for, but an unplayed own Knight can still be played", () => {
  const app = createTracker();
  for(let i=0;i<14;i++) app.action("draw", "knight");
  assert.equal(app.state().state.ownDrawn.knight, 14);
  assert.ok(app.get("cardRows").innerHTML.includes("OUT"));
  const before=app.state();
  app.action("draw","knight");
  assert.equal(app.state().state.ownDrawn.knight,14,"cannot draw a 15th knight");
  app.action("played","knight");
  const s=app.state();
  assert.equal(s.state.ownPlayed.knight,1);
  assert.equal(s.state.ownDrawn.knight,14);
  assert.equal(s.known,before.known);
  validState(s);
});

test("reset clears drawn, known, played, history, and pending owner choice", () => {
  const app=createTracker();
  app.action("draw","knight");
  app.click("unknownDrawBtn");
  app.action("played","knight");
  assert.equal(app.state().pendingChoice,"knight");
  app.click("resetBtn");
  const s=app.state();
  validState(s);
  assert.equal(s.remaining,25);
  assert.equal(s.known,0);
  assert.equal(s.hidden,0);
  assert.equal(s.pendingChoice,null);
  assert.equal(s.historyLength,0);
  assert.equal(app.get("undoBtn").disabled,true);
});

test("keyboard focus stays on a usable card control after a row re-render", () => {
  const app=createTracker();
  let focused=0;
  app.document.activeElement = {
    dataset: { action: "draw", cardId: "knight" },
    closest: selector => selector === "#cardRows" ? {} : null
  };
  app.get("cardRows").querySelector = () => ({
    disabled: false,
    focus() { focused += 1; }
  });
  app.action("draw","knight");
  assert.equal(focused,1,"replaced control regains focus");
  validState(app.state());
});

test("static documents and share artwork match the current UI", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const svg=fs.readFileSync(path.join(__dirname,"..","social-preview.svg"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(html,/styles\.css\?v=10/);
  assert.doesNotMatch(html,/custom\.css/);
  assert.match(html,/app\.js\?v=11/);
  assert.match(html,/og:image" content="https:\/\/devcard\.trilho\.dev\/og-image\.png\?v=2"/);
  assert.match(svg,/>I Drew<\/text>/);
  assert.match(svg,/played · 3 known/);
  assert.match(css,/@media \(max-width: 380px\)/);
  assert.match(css,/\.owner-choice/);
});
