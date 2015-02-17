/*global describe, it */

var assert = require("assert");

var erx = require("..");
var asap = require("asap");

describe("observable", () => {
  it("transmits values to observers", (done) => {
    var c = erx.channel((sink) => sink.value("lol"));
    c.subscribe((i) => {
      assert.equal(i, "lol");
      done();
    });
  });

  it("notifies observers on error", (done) => {
    var c = erx.channel((sink) => sink.error(new Error("omg")));
    c.subscribe(null, (err) => {
      assert.equal(err.message, "omg");
      done();
    });
  });

  it("notifies observers on close", (done) => {
    var c = erx.channel((sink) => sink.close());
    c.subscribe(null, null, done);
  });

  it("calls free on close", (done) => {
    var c = erx.channel((sink) => {
      process.nextTick(() => sink.close());
      return done;
    });
    c.subscribe();
  });

  it("calls free on error", (done) => {
    var c = erx.channel((sink) => {
      process.nextTick(() => sink.error(new Error("omg")));
      return done;
    });
    c.subscribe(null, () => {});
  });

  it("calls free on unobserve", (done) => {
    var c = erx.channel((sink) => done);
    var o = c.subscribe();
    asap(() => c.unobserve(o));
  });

  it("maps values through functions", (done) => {
    var c = erx.channel((sink) => sink.value(37));
    c.map((i) => i + 1300).subscribe((i) => {
      assert.equal(i, 1337);
      done();
    });
  });

  it("catches errors in mapping function", (done) => {
    var c = erx.channel((sink) => sink.value(1337));
    c.map((i) => i.lol.omg).subscribe(null, (err) => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it("filters values out of streams", (done) => {
    var c = erx.channel((sink) => {
      sink.value(13);
      sink.value(37);
    });
    c.filter((i) => i > 30).subscribe((i) => {
      assert.equal(i, 37);
      done();
    });
  });

  it("catches errors in predicate function", (done) => {
    var c = erx.channel((sink) => sink.value(1337));
    c.filter((i) => i.lol.omg).subscribe(null, (err) => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  function assertSeq(c, expected, done) {
    var acc = [];
    c.subscribe((v) => acc.push(v), null, () => {
      assert.deepEqual(acc, expected);
      done();
    });
  }

  it("merges two channels properly", (done) => {
    var c1 = erx.channel((sink) => {sink.value(13); sink.close()});
    var c2 = erx.channel((sink) => {sink.value(37); sink.close()});
    assertSeq(c1.merge(c2), [13, 37], done);
  });

  it("concatenates two channels properly", (done) => {
    var c1 = erx.channel((sink) => {sink.value(13); sink.close()});
    var c2 = erx.channel((sink) => {sink.value(37); sink.close()});
    assertSeq(c1.concat(c2), [13, 37], done);
  });

  it("folds through a stream", (done) => {
    var c = erx.channel((sink) => {
        sink.value(37);
    });
    c.fold((acc, v) => { return acc + v }, 1300).subscribe((i) => {
      assert.equal(i, 1337);
      done();
    })
  });

  it("take() caps a stream at the specified number", (done) => {
    var c = erx.channel((sink) => {
      sink.value(1); sink.value(2); sink.value(3); sink.value(4);
      sink.close();
    });
    assertSeq(c.take(3), [1, 2, 3], done);
  });

  it("unpack() turns a stream of arrays of a into a stream of a", (done) => {
    var c = erx.channel((sink) => {
      sink.value([1,2]); sink.value([3,4]); sink.value([5, 6]);
      sink.close();
    });
    assertSeq(erx.Observable.unpack(c), [1, 2, 3, 4, 5, 6], done);
  });

  it("flatMap() concatenates array results of a map properly", (done) => {
    var c = erx.channel((sink) => {
      sink.value(1); sink.value(2); sink.value(3);
      sink.close();
    });
    assertSeq(c.flatMap((i) => [i, i * 2]), [1, 2, 2, 4, 3, 6], done);
  });

  it("distinct() filters out consecutive duplicates", (done) => {
    var c = erx.channel((sink) => {
      sink.value(1); sink.value(1); sink.value(1); sink.value(1);
      sink.value(2); sink.value(2); sink.value(2);
      sink.value(3); sink.value(3);
      sink.close();
    });
    assertSeq(c.distinct(), [1, 2, 3], done);
  });
});
