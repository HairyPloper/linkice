const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Minimal DOM for event/lifecycle checks. Layout is verified in the browser.
module.exports = function setup() {
  class Element {
    constructor(tag = "div") {
      this.tag = tag; this.children = []; this.style = {}; this.events = {};
      this.className = ""; this.attributes = {};
      this.classList = {
        contains: (name) => this.className.split(" ").includes(name),
        add: (name) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
        remove: (name) => { this.className = this.className.split(" ").filter((c) => c !== name).join(" "); },
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
      };
    }
    append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
    appendChild(child) { this.append(child); }
    prepend(child) { child.parentNode = this; this.children.unshift(child); }
    remove() { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
    async fire(name, props = {}) {
      const event = { target: this, stopPropagation() {}, preventDefault() {}, ...props };
      for (const handler of this.events[name] || []) await handler(event);
      await this[`on${name}`]?.(event);
    }
    querySelector(selector) {
      const match = (el) => selector === ":focus-visible" ? el.keyboardFocus : selector[0] === "."
        ? el.classList.contains(selector.slice(1)) : selector[0] === "#" ? el.id === selector.slice(1) : el.tag === selector;
      for (const child of this.children) { if (match(child)) return child; const found = child.querySelector(selector); if (found) return found; }
      return null;
    }
    getBoundingClientRect() { return { bottom: 900 }; }
    async requestFullscreen() { document.fullscreenElement = this; await document.fire("fullscreenchange"); }
  }
  const document = new Element("document");
  document.createElement = (tag) => new Element(tag);
  document.getElementById = (id) => document.querySelector(`#${id}`);
  const query = document.querySelector.bind(document);
  document.querySelector = (selector) => {
    const parts = selector.split(" ");
    return parts.length > 1 ? query(parts[0])?.querySelector(parts[1]) : query(selector);
  };
  document.exitFullscreen = async () => { document.fullscreenElement = null; await document.fire("fullscreenchange"); };
  const grid = new Element(); grid.id = "user-grid"; document.append(grid);
  const watched = []; const adjusted = []; const warnings = []; const timers = new Map(); let timerId = 0;
  const window = {
    animals: ["🐢"], client: {uid:123456},
    getRemoteVolume: (_uid, kind) => kind === "screen" ? 42 : 100,
    setWatchedScreen: (uid) => watched.push(uid),
    adjustScreenVolume: (...args) => adjusted.push(args),
  };
  const context = vm.createContext({window, document, console: {warn: (...args) => warnings.push(args)},
    setTimeout: (fn, delay) => { timers.set(++timerId, {fn, delay}); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "js", "ui.js"), "utf8"), context);
  window.drawUser(123456, "Me", "🐢", true);
  window.drawUser(234567, "Sharer", "🐢");
  const track = { calls: [], play(id) { this.calls.push(id); } };
  const start = () => {
    window.playVideoInCard(234567, track);
    const wrapper = document.getElementById("video-wrapper-234567");
    return {wrapper, panel:wrapper.querySelector(".screen-player-controls"), input:wrapper.querySelector("input"), output:wrapper.querySelector("output")};
  };
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(({fn}) => fn()); };
  return { window, document, track, start, watched, adjusted, warnings, timers, tick };
};
