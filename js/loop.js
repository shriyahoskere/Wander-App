/*
  loop.js - makes a recording loop forever without a click or a gap.

  What it is for: if you just play a recording over and over, you usually hear a small
  "tick" or jump where the end meets the start. The fix is a crossfade: the last few seconds
  of the recording are blended into the first few seconds, and the loop is shortened by that
  overlap. When the loop wraps around, the sound continues smoothly.

  "Equal-power" means the two sounds are blended with a sine and a cosine curve, so the total
  loudness stays steady through the blend instead of dipping in the middle.

  How it fits: audio-mixer.js calls crossfadeLoop() once, when an ocean recording is loaded.
  It works on plain number arrays so it can be tested without any audio hardware.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  /*
    crossfadeLoop(channels, fadeSamples)
      channels: array of Float32Array (one per audio channel, all the same length N)
      fadeSamples: how many samples to overlap (shortened automatically for short recordings)
    Returns { channels: [Float32Array...], fadeSamples, length } where length = N - fadeSamples.
  */
  VS.crossfadeLoop = function (channels, fadeSamples) {
    var n = channels[0].length;
    var fade = Math.max(0, Math.min(Math.floor(fadeSamples), Math.floor(n / 3)));
    if (fade < 2) {
      return { channels: channels.map(function (c) { return new Float32Array(c); }), fadeSamples: 0, length: n };
    }
    var m = n - fade, out = [];
    var wIn = new Float32Array(fade), wOut = new Float32Array(fade);
    for (var i = 0; i < fade; i++) {
      var t = i / fade;
      wIn[i] = Math.sin(t * Math.PI / 2);
      wOut[i] = Math.cos(t * Math.PI / 2);
    }
    channels.forEach(function (src) {
      var dst = new Float32Array(m);
      for (var j = 0; j < m; j++) { dst[j] = src[j]; }
      // Blend: the start of the loop gradually fades in the beginning of the recording
      // while the recording's own ending (which would have been cut off) fades out.
      for (var k = 0; k < fade; k++) { dst[k] = src[k] * wIn[k] + src[m + k] * wOut[k]; }
      out.push(dst);
    });
    return { channels: out, fadeSamples: fade, length: m };
  };

  /*
    seamJump(channel): how big is the sudden jump at the point where the loop wraps around,
    compared with the typical jump between neighbouring samples? A ratio near 1 means seamless.
  */
  VS.seamJump = function (channel) {
    var n = channel.length, sum = 0, count = Math.min(n - 1, 200000);
    for (var i = 1; i <= count; i++) { sum += Math.abs(channel[i] - channel[i - 1]); }
    var typical = sum / count || 1e-9;
    var jump = Math.abs(channel[0] - channel[n - 1]);
    return { jump: jump, typical: typical, ratio: jump / typical };
  };
})(typeof window !== 'undefined' ? window : globalThis);
