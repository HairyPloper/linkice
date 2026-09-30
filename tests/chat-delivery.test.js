const assert = require('node:assert/strict');
const test = require('node:test');
const setup = require('./helpers/chat-delivery');
const settle = () => new Promise(setImmediate);

test('connection status distinguishes starting, connected, offline, and permission errors', () => {
  const app = setup({ connected: false });
  const status = app.nodes.get('chat-connection-status');
  assert.equal(status.dataset.state, 'connecting');
  app.connect(false);
  assert.equal(status.dataset.state, 'connecting');
  [...app.timers.values()].forEach(fn => fn());
  assert.equal(status.dataset.state, 'offline');
  app.connect(true);
  assert.equal(status.dataset.state, 'online');
  app.connect(false);
  assert.equal(status.dataset.state, 'offline');
  assert.equal(app.nodes.get('chat-reconnect-btn').hidden, false);
  app.connect(true);
  app.window.chatDelivery.unavailable();
  assert.equal(status.dataset.state, 'offline');
  app.connect(false);
  app.connect(true);
  assert.equal(status.dataset.state, 'offline');
  app.window.chatDelivery.ready();
  assert.equal(status.dataset.state, 'online');
});

test('a connected transport does not claim chat is ready before authentication and initialization', () => {
  const app = setup({ ready: false, auth: false });
  assert.equal(app.nodes.get('chat-connection-status').dataset.state, 'connecting');
  app.auth.currentUser = { uid: 'me' };
  app.window.chatRef = app.chatRef;
  app.window.chatDelivery.ready();
  assert.equal(app.nodes.get('chat-connection-status').dataset.state, 'online');
});

test('drafts survive refresh, stay separate per room, and can be cleared', () => {
  const local = new Map();
  const first = setup({ local });
  first.type('An unfinished thought 🪐');
  const refreshed = setup({ local });
  assert.equal(refreshed.input.value, 'An unfinished thought 🪐');
  assert.equal(setup({ local, room: 'another-room' }).input.value, '');
  refreshed.type('');
  assert.equal(setup({ local }).input.value, '');
});

test('offline sends wait for the real connection and become sent only after acknowledgement', async () => {
  const app = setup({ connected: false });
  app.type('Offline message');
  await app.window.sendMessage();
  assert.equal(app.pending.length, 0);
  assert.equal(app.delivery().children[0].textContent, 'Čeka vezu…');
  assert.equal(app.input.value, '');
  app.connect(true);
  app.connect(true);
  assert.equal(app.pending.length, 1);
  assert.equal(app.pending[0].applyLocally, false);
  assert.equal(app.delivery().children[0].textContent, 'Slanje…');
  app.type('A newer draft');
  app.pending[0].resolve();
  await settle();
  assert.equal(app.delivery().dataset.state, 'sent');
  assert.equal(app.input.value, 'A newer draft');
  assert.equal(app.pushed.length, 1);
  assert.equal(app.session.size, 0);
});

test('closing an unchanged older tab does not overwrite a newer room draft', () => {
  const local = new Map();
  const older = setup({ local });
  older.type('Earlier draft');
  const newer = setup({ local });
  newer.type('Newer draft');
  older.events.pagehide();
  assert.equal(setup({ local }).input.value, 'Newer draft');
});

test('a later draft with identical text is not cleared by the previous acknowledgement', async () => {
  const app = setup();
  app.type('Again');
  await app.window.sendMessage();
  app.type('Again');
  app.pending[0].resolve();
  await settle();
  assert.equal(app.input.value, 'Again');
});

test('failed message and newer draft both survive refresh, and retry never creates a duplicate', async () => {
  const app = setup();
  app.type('First message');
  await app.window.sendMessage();
  app.type('Next draft');
  // Simulate a commit whose acknowledgement was lost when the page closed.
  app.records.set('-send1', { ...app.pending[0].data, timestamp: 77 });
  const refreshed = setup({ local: app.local, session: app.session, records: app.records });
  assert.equal(refreshed.input.value, 'Next draft');
  assert.equal(refreshed.delivery().dataset.state, 'failed');
  assert.equal(refreshed.pending.length, 0);
  refreshed.delivery().children[1].onclick();
  refreshed.delivery().children[1].onclick();
  assert.equal(refreshed.pending.length, 1);
  refreshed.pending[0].resolve();
  await settle();
  assert.equal(refreshed.records.size, 1);
  assert.equal(refreshed.records.get('-send1').timestamp, 77);
  assert.equal(refreshed.pushed.length, 0);
  assert.equal(refreshed.delivery().dataset.state, 'sent');
  assert.equal(refreshed.input.value, 'Next draft');
});

test('restored uncommitted messages retry at the same key and remain private when addressed', async () => {
  const app = setup({ connected: false });
  app.window.chatDelivery.enqueue({ username: 'Tester', text: 'Addressed message', type: 'private', to: 'Someone', toSessionId: '7' });
  const restored = setup({ session: app.session });
  restored.delivery().children[1].onclick();
  restored.pending[0].resolve();
  await settle();
  assert.equal(restored.records.get('-send1').toSessionId, '7');
  assert.equal(restored.pushed.length, 0);
  assert.equal(restored.delivery().dataset.state, 'sent');
});

test('storage restrictions do not erase text or permit rapid duplicate sends', async () => {
  const app = setup({ blockStorage: true });
  app.type('Keep this text');
  await app.window.sendMessage();
  await app.window.sendMessage();
  assert.equal(app.pending.length, 1);
  assert.equal(app.input.value, 'Keep this text');
  app.pending[0].reject(Error('denied'));
  await settle();
  assert.equal(app.delivery().dataset.state, 'failed');
  assert.equal(app.input.value, 'Keep this text');
  app.delivery().children[1].onclick();
  app.pending[1].resolve();
  await settle();
  assert.equal(app.input.value, '');
});

test('a failed notification does not turn an acknowledged message into a failed send', async () => {
  const app = setup();
  app.window.notificationManager.triggerGlobalPush = async () => { throw Error('notifications unavailable'); };
  app.type('Hello');
  await app.window.sendMessage();
  app.pending[0].resolve();
  await settle();
  assert.equal(app.delivery().dataset.state, 'sent');
  assert.equal(app.session.size, 0);
});

test('pending polls cannot be voted on until their initial message is committed', async () => {
  const app = setup();
  app.window.chatDelivery.enqueue({ username: 'Tester', text: '', type: 'poll', question: 'Go?', options: ['Yes', 'No'], votes: {} });
  const buttons = app.nodes.get('chat-msg--send1').querySelectorAll('.poll-btn');
  assert.ok(buttons.every(button => button.disabled));
  app.pending[0].reject(Error('write denied'));
  await settle();
  assert.ok(buttons.every(button => button.disabled));
  app.delivery().children[1].onclick();
  app.pending[1].resolve();
  await settle();
  assert.ok(buttons.every(button => !button.disabled));
});
