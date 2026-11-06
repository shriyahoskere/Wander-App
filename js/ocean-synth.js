/*
  ocean-synth.js - a stand-in ocean sound, made from scratch.

  What it is for: you have not given me your ocean recording yet, and I want you to be able to
  hear the ducking right away. This generates a calm, wave-like sound (slow swells of filtered
  noise) with no files needed. It is a placeholder: your real recording will sound far better.
  Use the "Choose ocean file" button on the Live audio tab to replace it.

  How it works: three layers of random noise. A low rumble; a wash whose brightness and loudness
  swell up and down like waves arriving; and a faint fizz on top of each wave. Left and right
  channels use different random numbers so it feels wide.

  How it fits: live.js asks for these numbers and hands them to the mixer when no real
  recording is available. The random numbers are seeded, so the same call gives the same sound.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One channel of ocean. The swell periods divide the length evenly, so the waves line up at the loop point.
  function makeChannel(sr, seconds, rand, swellPhase) {
    var n = Math.floor(sr * seconds), out = new Float32Array(n);
    var periods = [seconds / 4, seconds / 6, seconds / 3];
    var weights = [0.5, 0.3, 0.2];
    var phases = [rand() * 6.283 + swellPhase, rand() * 6.283, rand() * 6.283];
    var brown = 0, wash = 0, fizz = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr, e = 0;
      for (var k = 0; k < 3; k++) { e += weights[k] * (0.5 + 0.5 * Math.sin(6.283185 * t / periods[k] + phases[k])); }
      var swell = Math.pow(e, 1.7);                       // 0..1, wave arriving and draining
      var white = rand() * 2 - 1;
      brown = brown * 0.998 + white * 0.04;               // low rumble
      var cutoff = 0.02 + 0.30 * swell;                   // wash gets brighter as the wave builds
      wash += (white - wash) * cutoff;
      var f = rand() * 2 - 1;
      fizz += (f - fizz) * 0.35;
      var hi = f - fizz;                                  // high part of the noise
      out[i] = brown * 0.3 * (0.4 + 0.6 * swell) + wash * (0.1 + 0.9 * swell) + hi * swell * swell * 0.15;
    }
    return out;
  }

  /*
    synthOcean(sampleRate, seconds, seed) -> { sampleRate, channels: [Float32Array, Float32Array] }
    Peak level is normalised to 0.8 so it is never harsh.
  */
  VS.synthOcean = function (sampleRate, seconds, seed) {
    sampleRate = sampleRate || 44100; seconds = seconds || 40;
    var rand = mulberry32(seed === undefined ? 1234 : seed);
    var chans = [makeChannel(sampleRate, seconds, rand, 0), makeChannel(sampleRate, seconds, rand, 0.7)];
    var peak = 1e-9;
    chans.forEach(function (c) { for (var i = 0; i < c.length; i++) { var a = Math.abs(c[i]); if (a > peak) { peak = a; } } });
    var g = 0.8 / peak;
    chans.forEach(function (c) { for (var i = 0; i < c.length; i++) { c[i] *= g; } });
    return { sampleRate: sampleRate, channels: chans };
  };
})(typeof window !== 'undefined' ? window : globalThis);
