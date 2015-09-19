import assert from "assert";
import * as erx from "../src";

export function assertSeq(c, expected, done) {
  const acc = [];
  c.subscribe((v) => acc.push(v), null, () => {
    assert.deepEqual(acc, expected);
    done();
  });
}

export function assertSignal(c, expected, done) {
  const acc = [], err = () => {
    throw new Error("Signal closed unexpectedly!");
  };
  c.subscribe((v) => {
    acc.push(v);
    if (acc.length === expected.length) {
      assert.deepEqual(acc, expected);
      done();
    }
  }, err, err);
}

export function assertFreed(cons, done) {
  return erx.stream((sink) => {
    cons(sink);
    return done;
  });
}

export function assertSignalFreed(init, cons, done) {
  return new erx.Signal(init, (sink) => {
    cons(sink);
    return done;
  });
}

export function doneX(times, done) {
  let doneCount = 0;
  return function() {
    doneCount++;
    if (doneCount >= times) {
      done();
    }
  }
}
