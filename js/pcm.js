/*
  pcm.js - gets microphone sound into the shape ElevenLabs expects.

  What it is for: the microphone gives us sound as decimal numbers at 44,100 or 48,000 samples
  a second. ElevenLabs wants "PCM 16 kHz": whole numbers (16-bit) at 16,000 samples a second,
  sent as text (base64). This file does those three steps:
    1. resample: smooth away very high sounds, then pick out 16,000 samples a second
    2. convert each sample to a 16-bit whole number
    3. turn the bytes into base64 text so it can travel inside a JSON message

  How it fits: stt-elevenlabs.js uses these. They are plain maths, so they are unit-tested.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  /*
    createResampler(inRate, outRate) -> { push(Float32Array) -> Float32Array }
    Keeps its place between calls, so audio arriving in pieces joins up seamlessly.
  */
  VS.createResampler = function (inRate, outRate) {
    var step = inRate / outRate;         // how many input samples per output sample
    var pos = 0;                         // where the next output sample sits, in input samples
    var prev = 0;                        // last filtered sample from the previous piece
    var cutoff = Math.min(0.45 * outRate, 7000);
    var a = 1 - Math.exp(-2 * Math.PI * cutoff / inRate);
    var y1 = 0, y2 = 0;                  // two smoothing stages, to remove sounds too high to keep

    return {
      push: function (input) {
        var filtered = new Float32Array(input.length);
        for (var i = 0; i < input.length; i++) {
          y1 += a * (input[i] - y1);
          y2 += a * (y1 - y2);
          filtered[i] = y2;
        }
        var out = [];
        // pos is relative to the start of this piece; -1 means "the last sample of the previous piece"
        while (pos < input.length - 1) {
          var i0 = Math.floor(pos), frac = pos - i0;
          var s0 = i0 < 0 ? prev : filtered[i0];
          var s1 = filtered[i0 + 1];
          out.push(s0 + (s1 - s0) * frac);
          pos += step;
        }
        pos -= input.length;
        prev = filtered[input.length - 1];
        return Float32Array.from(out);
      }
    };
  };

  /* Decimal samples (-1..1) to 16-bit whole numbers. Anything too loud is clipped, not wrapped. */
  VS.floatToInt16 = function (f32) {
    var out = new Int16Array(f32.length);
    for (var i = 0; i < f32.length; i++) {
      var s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    }
    return out;
  };

  /* Bytes to base64 text. */
  VS.bytesToBase64 = function (bytes) {
    if (typeof btoa === 'undefined') { return Buffer.from(bytes).toString('base64'); }
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + CH)));
    }
    return btoa(s);
  };

  /* 16-bit samples to base64 (little-endian, which is what PCM files use). */
  VS.int16ToBase64 = function (i16) {
    return VS.bytesToBase64(new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength));
  };
})(typeof window !== 'undefined' ? window : globalThis);
