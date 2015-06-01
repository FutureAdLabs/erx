/* @flow -*- mode: flow -*- */

import * as erx from "./index";

function now() {
  const perf = typeof window.performance !== "undefined" ? window.performance : null;
  return (
    perf && (perf.now || perf.webkitNow || perf.msNow ||
             perf.oNow || perf.mozNow) ||
        (process && process.hrtime && function() {
          const t = process.hrtime();
          return (t[0] * 1e9 + t[1]) / 1e6;
        }) || Date.now
  ).call(perf);
}

export function animationFrame(): erx.Stream<number> {
  let requestAnimFrame = function(cb) {
    setTimeout(function() { cb(now()); }, 1000 / 60);
  }, cancelAnimFrame = window.clearTimeout;
  if (window.requestAnimationFrame) {
    requestAnimFrame = window.requestAnimationFrame;
    cancelAnimFrame = window.cancelAnimationFrame;
  } else if (window.mozRequestAnimationFrame) {
    requestAnimFrame = window.mozRequestAnimationFrame;
    cancelAnimFrame = window.mozCancelAnimationFrame;
  } else if (window.webkitRequestAnimationFrame) {
    requestAnimFrame = window.webkitRequestAnimationFrame;
    cancelAnimFrame = window.webkitCancelAnimationFrame;
  } else if (window.msRequestAnimationFrame) {
    requestAnimFrame = window.msRequestAnimationFrame;
    cancelAnimFrame = window.msCancelAnimationFrame;
  } else if (window.oRequestAnimationFrame) {
    requestAnimFrame = window.oRequestAnimationFrame;
    cancelAnimFrame = window.oCancelAnimationFrame;
  }
  return new erx.Stream((sink) => {
    const handle = requestAnimFrame(function tick(t) {
      sink.value(t);
      requestAnimFrame(tick);
    });
    return () => cancelAnimFrame(handle);
  });
}
