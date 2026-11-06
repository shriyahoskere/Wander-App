/*
  ocean-store.js - remembers your chosen sound files (ocean, question cue, saved sound) inside this browser.

  What it is for: a page opened straight from your Mac is not allowed to read other files in its
  folder by itself, so you choose the ocean file once with a button, and a copy is kept in the
  browser's own storage (IndexedDB, a small database every browser has). Next time you open the
  page it is already there. Nothing is uploaded anywhere.

  How it fits: live.js asks loadOcean() for the saved file and falls back to the stand-in ocean.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var DB = 'voice-space', STORE = 'files';

  function open() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no storage')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('storage error')); };
    });
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), out;
        var req = fn(store);
        if (req) { req.onsuccess = function () { out = req.result; }; }
        tx.oncomplete = function () { db.close(); resolve(out); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  /* Any sound file you choose, kept under a name ("ocean", "prompt-cue", "saved-cue"). */
  VS.fileStore = {
    /* Save { name, data: ArrayBuffer } */
    save: function (key, name, data) { return run('readwrite', function (s) { return s.put({ name: name, data: data, savedAt: Date.now() }, key); }); },
    /* Resolves to { name, data } or null. Never rejects. */
    load: function (key) { return run('readonly', function (s) { return s.get(key); }).then(function (r) { return r || null; }, function () { return null; }); },
    clear: function (key) { return run('readwrite', function (s) { return s.delete(key); }).catch(function () { return null; }); }
  };

  VS.oceanStore = {
    save: function (name, data) { return VS.fileStore.save('ocean', name, data); },
    load: function () { return VS.fileStore.load('ocean'); },
    clear: function () { return VS.fileStore.clear('ocean'); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
