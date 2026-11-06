/*
  ticker.js - a steady heartbeat that keeps going when the tab is in the background.

  What it is for: the silence engine and the voice detector need to be checked every few
  milliseconds. Normal page timers are slowed right down by Chrome when a tab is in the
  background. Timers inside a "Web Worker" (a small helper that runs separately from the page)
  are slowed much less, so the heartbeat comes from one of those. If a worker cannot be made,
  it falls back to a normal timer.

  How it fits: live.js and mic.js each create a ticker.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.createTicker = function (intervalMs, fn) {
    var worker = null, timer = null;
    try {
      var code = 'var t=null;onmessage=function(e){clearInterval(t);if(e.data>0){t=setInterval(function(){postMessage(0)},e.data)}}';
      worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      worker.onmessage = function () { fn(); };
      worker.postMessage(intervalMs);
    } catch (e) {
      worker = null;
      timer = setInterval(fn, intervalMs);
    }
    return {
      usingWorker: !!worker,
      stop: function () {
        if (worker) { worker.postMessage(0); worker.terminate(); worker = null; }
        if (timer) { clearInterval(timer); timer = null; }
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
