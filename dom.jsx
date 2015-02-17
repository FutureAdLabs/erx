/* @flow -*- mode: flow -*- */

var erx = require(".");

function now() {
  var perf = typeof performance !== 'undefined' ? performance : null;
  return (
    perf && (perf.now || perf.webkitNow || perf.msNow ||
             perf.oNow || perf.mozNow) ||
        (process && process.hrtime && function() {
          var t = process.hrtime();
          return (t[0] * 1e9 + t[1]) / 1e6;
        }) || Date.now
  ).call(perf);
}

function animationFrame(): erx.Observable<number> {
  var requestAnimFrame, cancelAnimFrame;
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
  } else {
    requestAnimFrame = function(cb) {
      setTimeout(function() { cb(now()); }, 1000/60);
    };
    cancelAnimFrame = window.clearTimeout;
  }
  return new erx.Observable((sink) => {
    requestAnimFrame(function tick(t) {
      sink.value(t);
      requestAnimFrame(tick);
    });
  });
}

module.exports = {
  animationFrame
};
