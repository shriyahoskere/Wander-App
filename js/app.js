/*
  app.js - connects the page (index.html) to the engine.

  What it is for: it switches between the three tabs (Session, Wording, Settings) and builds
  the Settings tab automatically from the config's list of settings.

  How it fits: it starts the Session screen (live-ui.js) and the Wording tab (wording-ui.js).
*/
(function () {
  var VS = window.VS;

  // Browser storage can be blocked (private windows, some file:// setups), so test it first.
  var storage = null;
  try { storage = window.localStorage; storage.setItem('vs-probe', '1'); storage.removeItem('vs-probe'); } catch (e) { storage = null; }
  var cfg = VS.createConfig(storage);
  // Your wording from the Wording tab (saved in this browser), on top of the defaults.
  VS.wordingStore = VS.createWording(storage);
  var chooser = VS.createChooser(VS.currentClips);

  function $(id) { return document.getElementById(id); }
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  // ---------------- a small confirmation that floats up from the bottom ----------------
  var toastTimer = null;
  VS.toast = function (text) {
    var t = $('toast');
    if (!t) { return; }
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  };

  // ---------------- tabs ----------------
  var tabButtons = document.querySelectorAll('#tabs button');
  var ink = document.querySelector('#tabs .tab-ink');
  // The soft pill behind the chosen tab slides to it.
  function moveInk(b) {
    if (!ink || !b) { return; }
    ink.style.width = b.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + b.offsetLeft + 'px)';
  }
  Array.prototype.forEach.call(tabButtons, function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(tabButtons, function (x) {
        var on = x === b;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        $('tab-' + x.getAttribute('data-tab')).hidden = !on;
      });
      moveInk(b);
      window.scrollTo(0, 0);
      if (b.getAttribute('data-tab') === 'settings' && typeof buildSettings === 'function') { buildSettings(); }
    });
  });
  function inkToSelected() { moveInk(document.querySelector('#tabs button[aria-selected="true"]')); }
  window.addEventListener('resize', inkToSelected);
  window.addEventListener('load', inkToSelected);
  setTimeout(inkToSelected, 0);

  // ---------------- settings ----------------
  var settingsBox = $('settings');

  function buildSettings() {
    settingsBox.textContent = '';
    var lastGroup = null;
    cfg.describe().forEach(function (e) {
      if (e.hidden) { return; }
      if (e.group !== lastGroup) { settingsBox.appendChild(make('div', 'group', e.group)); lastGroup = e.group; }
      var row = make('div', 'setting' + (cfg.isChanged(e.key) ? ' changed' : ''));
      row.appendChild(make('div', 'name', e.key));
      var input, val = cfg.get(e.key);
      if (e.type === 'number') { input = make('input'); input.type = 'number'; input.step = 'any'; input.min = e.min; input.max = e.max; input.value = val; }
      else if (e.type === 'boolean') { input = make('input'); input.type = 'checkbox'; input.checked = val; }
      else if (e.type === 'choice') { input = make('select'); e.options.forEach(function (o) { var op = make('option', '', o); op.value = o; input.appendChild(op); }); input.value = val; }
      else if (e.type === 'text') { input = make('input'); input.type = 'text'; input.value = val; }
      else if (e.type === 'secret') { input = make('input'); input.type = 'password'; input.autocomplete = 'off'; input.value = val; input.placeholder = val ? '' : 'not set'; }
      else if (e.type === 'list') { input = make('textarea'); input.rows = Math.min(8, Math.max(2, val.length)); input.value = val.join('\n'); }
      else { input = make('textarea'); input.rows = 8; input.value = JSON.stringify(val, null, 2); }
      input.setAttribute('aria-label', e.key);
      row.appendChild(input);
      var reset = make('button', '', 'Reset'); reset.type = 'button';
      reset.addEventListener('click', function () { cfg.reset(e.key); buildSettings(); });
      row.appendChild(reset);
      row.appendChild(make('div', 'help', e.help));
      var err = make('div', 'err'); row.appendChild(err);
      function commit() {
        var v = e.type === 'boolean' ? input.checked : input.value;
        try { cfg.set(e.key, v); err.textContent = ''; row.className = 'setting' + (cfg.isChanged(e.key) ? ' changed' : ''); }
        catch (ex) { err.textContent = ex.message; }
      }
      input.addEventListener('change', commit);
      settingsBox.appendChild(row);
    });
  }
  buildSettings();
  $('resetAll').addEventListener('click', function () { cfg.resetAll(); buildSettings(); });

  // Another tab changed the saved settings: pick the change up (hot reload across tabs).
  window.addEventListener('storage', function () { cfg.reload(); buildSettings(); });

  // The Session screen.
  if (VS.initLiveUi) { VS.initLiveUi(cfg); }
  // The Wording tab.
  if (VS.initWordingUi) { VS.initWordingUi(VS.wordingStore, cfg); }

})();
