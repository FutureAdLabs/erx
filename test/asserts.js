import assert from "assert";

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
