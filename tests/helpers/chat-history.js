// In-memory Firebase-shaped source shared by Node tests and the browser fixture.
(function (root) {
  function createChatHistorySource(count = 125) {
    const records = Array.from({ length: count }, (_, i) => ({
      key: `-fixture${String(i + 1).padStart(4, "0")}`,
      data: { username: "Tester", text: `Message ${i + 1}`, timestamp: 1700000000000 + i * 1000 },
    }));
    const listeners = new Set();
    const requests = [];
    const leaf = record => ({ key: record.key, val: () => record.data });
    const snapshot = entries => ({
      forEach(callback) { for (const entry of entries) if (callback(leaf(entry)) === true) break; },
      numChildren: () => entries.length,
    });
    const backend = { records, requests, failNext: false, pauseNext: false, transactions: 0 };
    function query(before = null, limit = Infinity) {
      const entries = () => records.filter(record => !before || record.key < before).slice(-limit);
      return {
        orderByKey() { return this; },
        endBefore(key) { return query(key, limit); },
        limitToLast(size) { return query(before, size); },
        on(event, callback) {
          if (event === "child_added") {
            listeners.add(callback);
            entries().forEach(record => callback(leaf(record)));
          }
        },
        off(event, callback) { listeners.delete(callback); },
        async once() {
          requests.push({ before, limit });
          if (backend.failNext) { backend.failNext = false; throw new Error("offline"); }
          if (backend.pauseNext) {
            backend.pauseNext = false;
            await new Promise(resolve => { backend.resume = resolve; });
          }
          return snapshot(entries());
        },
      };
    }
    backend.ref = query();
    backend.add = (data = {}, key = null) => {
      const record = { key: key || `-fixture${String(records.length + 1).padStart(4, "0")}`,
        data: { username: "Tester", text: "Live message", timestamp: Date.now(), ...data } };
      records.push(record);
      listeners.forEach(callback => callback(leaf(record)));
    };
    backend.game = { transaction() { backend.transactions++; } };
    return backend;
  }
  if (typeof module !== "undefined") module.exports = createChatHistorySource;
  else root.createChatHistorySource = createChatHistorySource;
})(typeof window !== "undefined" ? window : null);
