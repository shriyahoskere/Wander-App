/*
  seascape.js - the water on the Session screen, with its paper boats.

  What it is for: the screen mirrors what the session is doing, without words. It follows the
  animation in your screen recording: long swells that heave and travel, five layers moving
  against each other, and paper boats that tilt with the slope.
    - You are speaking: the waves calm down to small, slow swells, and your voice moves them.
      Louder words lift the crests a little; when you pause between words they settle.
    - You are quiet (the session is still listening): the full swell from the recording, moved
      by the ocean sound you hear.
    - Stopped (and snoozed, and before a session starts): the water is completely still.
  A paper boat sails in from outside the frame each time a thought is captured, and after every
  so many words you say (Settings, "The water on screen"). Boats stay where they are, riding the
  waves, and stop at 10.

  How it fits: live-ui.js tells it the mode, feeds it the sound level every frame, and adds or
  removes boats. Two parts:
    VS.createSeaModel()   - where the boats are and how the water moves. No drawing, so the
                            tests can check it.
    VS.createSeascape()   - draws the model on a <canvas>, about 60 times a second.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // Colours from the Wander session frame (Figma "User testing", iPhone 17 - 282), back (top)
  // layer first: many soft bands of blue that darken toward the bottom.
  var LAYERS = ['#3A7894', '#306C88', '#28627D', '#215873', '#1D516B', '#164863', '#1F5169',
    '#1E4A60', '#1B4356', '#163A4B', '#0F3040', '#06222F'].map(function (c, i, all) {
    return { color: c, alpha: i === 0 ? 0.9 : 1, base: 0.565 + i * (0.4 / (all.length - 1)) };
  });
  var BOAT_LAYERS = 4;      // boats ride on the first 4 layers, so the nearer water passes in front
  var ARRIVE_S = 6;         // seconds for a boat to sail in (in moving time)
  var LEAVE_S = 4;
  var PERIOD_S = 7;         // one full swell takes about 7 seconds: slow and subtle

  // How the water moves in each mode: wave height (1 = the recording), speed, and how much the
  // sound level adds on top.
  var MODES = {
    rough: { amp: 1, speed: 1, react: 0.35 },
    calm: { amp: 0.28, speed: 0.6, react: 0.5 },
    still: { amp: null, speed: 0, react: 0 } // amp null: keep the shape exactly where it froze
  };

  function easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { t = Math.max(0, Math.min(1, t)); return t * t * t; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  /* ---------------- the model ---------------- */
  VS.createSeaModel = function (opts) {
    opts = opts || {};
    var rand = opts.random || Math.random;
    var maxBoats = function () { return opts.maxBoats ? opts.maxBoats() : 10; };
    var calmAmp = function () { return opts.calmAmp ? opts.calmAmp() : MODES.calm.amp; };
    var reactivity = function () { return opts.reactivity ? opts.reactivity() : 1; };
    var m = {
      mode: 'still', sceneT: 0,       // scene time only advances while the water moves
      speed: 0, amp: 0.6,             // current values, eased toward the mode's targets
      input: 0, level: 0,             // the sound level fed in (0..1), and its smoothed value
      boats: [], nextId: 1
    };

    function active() { return m.boats.filter(function (b) { return b.phase !== 'leaving'; }); }

    // Pick a resting spot (0..1 across) away from the other boats.
    function pickSpot(layer) {
      var best = 0.5, bestD = -1;
      for (var i = 0; i < 24; i++) {
        // the two back layers pass the title on the left, so their boats keep to the right of it
        var x = layer <= 1 ? 0.46 + rand() * 0.46 : 0.08 + rand() * 0.84, d = 2;
        m.boats.forEach(function (b) {
          if (b.phase === 'leaving') { return; }
          var dist = Math.abs(b.toX - x) + Math.abs(b.layer - layer) * 0.05;
          if (dist < d) { d = dist; }
        });
        if (d > bestD) { bestD = d; best = x; }
      }
      return best;
    }

    var api = {
      /* 'rough' (quiet, listening), 'calm' (you are speaking) or 'still'. */
      setMode: function (mode) { if (MODES[mode]) { m.mode = mode; } },
      mode: function () { return m.mode; },

      /* The sound level right now, 0 (silent) to 1 (loud). Call it as often as you like. */
      setLevel: function (x) { m.input = clamp01(+x || 0); },
      level: function () { return m.level; },

      /* Add a boat. reason: 'thought' or 'words'. Returns the boat, or null at the limit. */
      addBoat: function (reason, tag) {
        if (active().length >= maxBoats()) { return null; }
        var layer = Math.floor(rand() * BOAT_LAYERS);
        var fromLeft = rand() < 0.5;
        var b = {
          id: m.nextId++, tag: tag == null ? null : tag, reason: reason || 'thought', layer: layer,
          fromX: fromLeft ? -0.1 : 1.1, toX: pickSpot(layer), x: fromLeft ? -0.1 : 1.1,
          t0: m.sceneT, phase: 'arriving', flip: rand() < 0.5 ? -1 : 1, bobPhase: rand() * Math.PI * 2
        };
        m.boats.push(b);
        return b;
      },

      /* Sail away the boats with these tags (a thought you scratched). */
      removeTagged: function (tags) {
        var n = 0;
        m.boats.forEach(function (b) {
          if (b.phase !== 'leaving' && b.tag != null && tags.indexOf(b.tag) >= 0) {
            b.phase = 'leaving'; b.fromX = b.x; b.toX = b.x < 0.5 ? -0.12 : 1.12; b.t0 = m.sceneT; n++;
          }
        });
        return n;
      },

      clear: function () { m.boats = []; },
      count: function () { return active().length; },
      boats: function () { return m.boats; },
      sceneTime: function () { return m.sceneT; },
      motion: function () { return { speed: m.speed, amp: m.amp, level: m.level }; },

      /* Advance by dt seconds. Returns true if anything moved. */
      step: function (dt) {
        dt = Math.max(0, Math.min(0.1, dt));
        var target = MODES[m.mode];
        // the level rises quickly with a sound and falls back slowly, like a swell
        var tau = m.input > m.level ? 0.12 : 0.7;
        m.level += (m.input - m.level) * (1 - Math.exp(-dt / tau));
        var react = target.react * reactivity();
        var baseAmp = m.mode === 'calm' ? calmAmp() : target.amp;
        var targetAmp = baseAmp == null ? null : baseAmp + react * m.level;
        var targetSpeed = target.speed * (1 + 0.25 * react * m.level);
        m.speed += (targetSpeed - m.speed) * (1 - Math.exp(-dt / 0.45));
        if (target.speed === 0 && m.speed < 0.01) { m.speed = 0; } // settle fully in about 2 seconds
        if (targetAmp != null && m.speed > 0.001) {
          m.amp += (targetAmp - m.amp) * (1 - Math.exp(-dt / 0.6));
        }
        m.sceneT += dt * m.speed;
        // boats follow scene time, so stopping freezes a boat mid-sail too
        m.boats = m.boats.filter(function (b) {
          if (b.phase === 'arriving') {
            var p = (m.sceneT - b.t0) / ARRIVE_S;
            b.x = b.fromX + (b.toX - b.fromX) * easeOut(p);
            if (p >= 1) { b.phase = 'resting'; b.x = b.toX; }
          } else if (b.phase === 'leaving') {
            var q = (m.sceneT - b.t0) / LEAVE_S;
            b.x = b.fromX + (b.toX - b.fromX) * easeIn(q);
            if (q >= 1) { return false; }
          }
          return true;
        });
        return m.speed > 0;
      }
    };
    return api;
  };

  /* ---------------- drawing ---------------- */

  // Each layer: a long swell, a shorter cross-wave, and a small ripple, each with its own
  // direction and pace, so the layers waver against each other.
  function layerShape(i) {
    var r = function (n) { var x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    return {
      len: 0.85 + r(1) * 0.45,      // swell length, in screen widths
      p1: r(2) * 6.28, p2: r(3) * 6.28, p3: r(4) * 6.28, p0: r(5) * 6.28,
      w1: 0.85 + r(6) * 0.3, w2: 1.1 + r(7) * 0.35, w3: 1.6 + r(8) * 0.5,
      dir: i % 2 ? -1 : 1,          // neighbouring layers travel opposite ways
      heave: 0.8 + r(9) * 0.4
    };
  }
  var SHAPES = LAYERS.map(function (c, i) { return layerShape(i); });
  var TWO_PI = Math.PI * 2;

  // y of layer i's surface at x (px), for a W x H stage, at scene time t, wave height amp
  function surface(i, x, W, H, t, amp) {
    var s = SHAPES[i], L = LAYERS[i];
    var lambda = Math.max(W, H * 1.15) * s.len;
    var k = TWO_PI / lambda, w = TWO_PI / PERIOD_S;
    var depth = 0.75 + 0.35 * (i / (LAYERS.length - 1));
    var swell = Math.sin(k * x - s.dir * w * s.w1 * t + s.p1) * 0.74 +
                Math.sin(1.7 * k * x + s.dir * w * s.w2 * t * 0.7 + s.p2) * 0.19 +
                Math.sin(3.1 * k * x - s.dir * w * s.w3 * t * 0.5 + s.p3) * 0.07;
    var heave = Math.sin(w * 0.5 * s.heave * t + s.p0) * 0.25; // the whole layer rises and falls
    return H * L.base + H * 0.028 * amp * depth * (swell + heave); // low swells: subtle, not harsh
  }

  // The folded paper boat from the recording, in its own units: width 1, waterline at y = 0.
  var A = [-0.495, -0.387], B = [0.076, -0.436], C = [0.117, -0.153], D = [0.5, -0.054], E = [0.288, 0.09],
      F = [0.09, 0.072], G = [-0.252, -0.04], H_ = [-0.405, -0.153], I = [-0.014, -0.171], J = [-0.13, -0.23],
      K = [-0.072, 0.0];
  var FACES = [
    { pts: [A, J, I, K, G, H_], fill: '#E9EBEB' },  // near side of the hull
    { pts: [J, B, I], fill: '#E1E4E4' },             // sail, lit
    { pts: [B, C, I], fill: '#BCC0C1' },             // sail, shaded
    { pts: [I, C, D, E, F], fill: '#D5D8D8' },       // far side of the hull
    { pts: [I, F, K], fill: '#AEB2B3' },             // centre fold
    { pts: [G, K, F, E], fill: '#DCDFDF' }           // underside
  ];
  function drawBoat(ctx, w, flip) {
    ctx.scale(flip * w, w);
    for (var f = 0; f < FACES.length; f++) {
      var p = FACES[f].pts;
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
      for (var j = 1; j < p.length; j++) { ctx.lineTo(p[j][0], p[j][1]); }
      ctx.closePath(); ctx.fillStyle = FACES[f].fill; ctx.fill();
    }
  }

  VS.createSeascape = function (canvas, cfg) {
    var ctx = canvas.getContext('2d');
    var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var model = VS.createSeaModel({
      maxBoats: function () { return cfg ? cfg.get('maxBoats') : 10; },
      calmAmp: function () { return cfg ? cfg.get('calmWaveHeight') : MODES.calm.amp; },
      reactivity: function () { return cfg ? cfg.get('waveReactivity') : 1; }
    });
    var W = 0, H = 0, dpr = 1, last = 0, dirty = true, levelSource = null;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, root.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      dirty = true;
    }

    function draw() {
      var t = model.sceneTime() * (reduced ? 0.5 : 1), amp = model.motion().amp * (reduced ? 0.4 : 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var step = Math.max(4, Math.round(W / 180));
      var boats = model.boats();
      for (var i = 0; i < LAYERS.length; i++) {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W + step; x += step) { ctx.lineTo(x, surface(i, x, W, H, t, amp)); }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.globalAlpha = LAYERS[i].alpha;
        ctx.fillStyle = LAYERS[i].color;
        ctx.fill();
        ctx.globalAlpha = 1;
        // boats riding this layer go on top of it and behind the next one
        for (var b = 0; b < boats.length; b++) {
          var boat = boats[b];
          if (boat.layer !== i) { continue; }
          var size = Math.min(Math.max(35, W * 0.06), H * 0.1) * (0.84 + i * 0.07); // half the earlier size, as asked
          var bx = boat.x * W, dx = size * 0.3;
          var yl = surface(i, bx - dx, W, H, t, amp), yr = surface(i, bx + dx, W, H, t, amp);
          var y = (yl + yr) / 2;
          ctx.save();
          ctx.translate(bx, y + size * 0.04);
          ctx.rotate(Math.atan2(yr - yl, dx * 2) * 0.75);
          drawBoat(ctx, size, boat.flip);
          ctx.restore();
        }
      }
    }

    function frame(now) {
      var dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (levelSource) { try { model.setLevel(levelSource()); } catch (e) { model.setLevel(0); } }
      var moved = model.step(dt);
      if (moved || dirty) { draw(); dirty = false; }
      root.requestAnimationFrame(frame);
    }

    if (root.ResizeObserver) { new root.ResizeObserver(resize).observe(canvas); }
    else { root.addEventListener('resize', resize); }
    resize();
    root.requestAnimationFrame(frame);

    return {
      setMode: function (mode) { model.setMode(mode); },
      mode: model.mode,
      /* fn() -> 0..1, read every frame: how loud the sound driving the waves is right now */
      setLevelSource: function (fn) { levelSource = fn; },
      addBoat: function (reason, tag) { var b = model.addBoat(reason, tag); dirty = true; return b; },
      removeTagged: function (tags) { var n = model.removeTagged(tags); dirty = true; return n; },
      clear: function () { model.clear(); dirty = true; },
      count: model.count,
      /* Where a boat is on screen right now (px from the stage's top-left), or null. */
      positionOf: function (boat) {
        if (!boat || model.boats().indexOf(boat) < 0) { return null; }
        var t = model.sceneTime() * (reduced ? 0.5 : 1), amp = model.motion().amp * (reduced ? 0.4 : 1);
        var x = boat.x * W;
        return { x: x, y: surface(boat.layer, x, W, H, t, amp), w: W, h: H };
      },
      model: model
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
