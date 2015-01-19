/*global describe, it */

var assert = require("assert");

var erx = require("../index.jsx");

describe("observable", () => {
  it("transmits values to observers", (done) => {
    var c = erx.channel((sink) => sink.value("lol"));
    c.subscribe((i) => {
      assert.equal(i, "lol");
      done();
    });
  });

  it("notifies observers on error", (done) => {
    var c = erx.channel((sink) => sink.error("omg"));
    c.subscribe(null, (err) => {
      assert.equal(err, "omg");
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
      process.nextTick(() => sink.error("omg"));
      return done;
    });
    c.subscribe();
  });

  it("calls free on unobserve", (done) => {
    var c = erx.channel((sink) => {
      return done;
    });
    c.unobserve(c.subscribe());
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

  it("pushes values over a bus", (done) => {
    var b = erx.bus();
    b.observable.subscribe((v) => {
      assert.equal(v, 1337);
      done();
    });
    b.push(1337);
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
});
