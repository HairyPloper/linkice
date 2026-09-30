const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function setup(options = {}) {
  class Element {
    constructor(id = '') { this.id = id; this.children = []; this.dataset = {}; this.events = {}; this.value = ''; this.textContent = ''; }
    appendChild(child) { this.children.push(child); }
    prepend(child) { this.children.unshift(child); }
    setAttribute() {}
    addEventListener(name, handler) { this.events[name] = handler; }
    focus() {}
    querySelector(selector) { return this.children.find(child => `.${child.className}` === selector) || null; }
    querySelectorAll(selector) { return this.children.filter(child => `.${child.className}` === selector); }
  }
  const nodes = new Map(['chat-input', 'chat-connection-status', 'chat-reconnect-btn', 'chat-draft-status', 'send-btn'].map(id => [id, new Element(id)]));
  const local = options.local || new Map();
  const session = options.session || new Map();
  const store = backing => ({
    getItem: key => { if (options.blockStorage) throw Error('blocked'); return backing.get(key) ?? null; },
    setItem: (key, value) => { if (options.blockStorage) throw Error('blocked'); backing.set(key, value); },
    removeItem: key => { if (options.blockStorage) throw Error('blocked'); backing.delete(key); },
  });
  const events = {}, pending = [], pushed = [], timers = new Map();
  const records = options.records || new Map();
  let connectedCallback, nextId = 0;
  const chatRef = {
    push: () => ({ key: `-send${++nextId}` }),
    child: id => ({ transaction(update, callback, applyLocally) {
      const data = update(records.get(id) ?? null);
      return new Promise((resolve, reject) => pending.push({ id, data, applyLocally, reject, resolve() {
        const value = update(records.get(id) ?? null);
        if (value !== undefined) records.set(id, { ...value, timestamp: 123456 });
        resolve({ committed: value !== undefined, snapshot: { exists: () => records.has(id), val: () => records.get(id) } });
      } }));
    } }),
  };
  const auth = { currentUser: options.auth === false ? null : { uid: 'me' }, signInAnonymously: async () => {} };
  const database = () => ({ ref: key => key === '.info/connected' ? { on: (_event, callback) => { connectedCallback = callback; } } : chatRef, goOnline() {} });
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  const window = { CHANNEL: options.room || 'test', myDisplayName: 'Tester', addEventListener: (name, handler) => { events[name] = handler; },
    chatRef: options.ready === false ? null : chatRef,
    appendMessage(name, text, color, key, data, renderOptions) {
      if (nodes.has(`chat-msg-${key}`)) return;
      const bubble = new Element(`chat-msg-${key}`);
      bubble.message = { name, text, data, options: renderOptions };
      if (data.type === 'poll') for (const option of data.options) {
        const button = new Element(); button.className = 'poll-btn'; button.textContent = option; bubble.appendChild(button);
      }
      nodes.set(bubble.id, bubble);
      return bubble;
    },
    notificationManager: { hasEnsuredPushThisSession: true, triggerGlobalPush: (...args) => { pushed.push(args); } },
  };
  const document = { getElementById: id => nodes.get(id) || null, createElement: () => new Element(), addEventListener: (name, handler) => { events[name] = handler; } };
  const context = vm.createContext({ window, document, navigator: { onLine: true }, localStorage: store(local), sessionStorage: store(session),
    firebase: { auth: () => auth, database }, console: { warn() {} },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    chatInput: nodes.get('chat-input'), sendBtn: nodes.get('send-btn'), commandHistory: [], historyIndex: 0,
    handleCommand: () => false, getChatSenderMetadata: () => ({ senderUserId: auth.currentUser?.uid || null, senderSessionId: '42' }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/chat-delivery.js'), 'utf8'), context);
  const chat = fs.readFileSync(path.join(__dirname, '../../js/chat.js'), 'utf8');
  vm.runInContext(chat.slice(chat.indexOf('window.sendMessage ='), chat.indexOf('if (sendBtn) sendBtn.onclick')), context);
  const input = nodes.get('chat-input');
  const connect = value => connectedCallback({ val: () => value });
  if (options.connected !== false) connect(true);
  return { window, input, nodes, context, local, session, pending, records, pushed, events, timers, auth, chatRef, connect,
    type(value) { input.value = value; input.events.input(); },
    delivery(id = '-send1') { return nodes.get(`chat-msg-${id}`)?.querySelector('.message-delivery'); },
  };
};
