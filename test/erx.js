/*global describe, it */

import assert from "assert";
import * as erx from "../src";
import asap from "asap";
import { assertSeq, assertSignal, assertFreed, assertSignalFreed, doneX } from "./asserts";

function counter(sink) {
  asap(() => sink.value(1));
  asap(() => sink.value(2));
  asap(() => sink.value(3));
  asap(() => sink.value(4));
  asap(() => sink.value(5));
  asap(() => sink.close());
}

function slowCounter(sink) {
  setTimeout(() => sink.value(1), 15);
  setTimeout(() => sink.value(2), 40);
  setTimeout(() => sink.value(3), 65);
  setTimeout(() => sink.value(4), 90);
  setTimeout(() => sink.value(5), 115);
  setTimeout(() => sink.value(6), 140);
  setTimeout(() => sink.close(), 160);
}

describe("observable", () => {
  it("transmits values to observers", (done) => {
    const c = erx.stream((sink) => sink.value("lol"));
    c.subscribe((i) => {
      assert.equal(i, "lol");
      done();
    });
  });

  it("notifies observers on error", (done) => {
    const c = erx.stream((sink) => sink.error(new Error("omg")));
    c.subscribe(null, (err) => {
      assert.equal(err.message, "omg");
      done();
    });
  });

  it("notifies observers on close", (done) => {
    const c = erx.stream((sink) => sink.close());
    c.subscribe(null, null, done);
  });

  it("calls free on close", (done) => {
    assertFreed((sink) => {
      asap(() => sink.close());
    }, done).subscribe();
  });

  it("calls free on error", (done) => {
    assertFreed((sink) => {
      asap(() => sink.error(new Error("omg")));
    }, done).subscribe(null, () => {});
  });

  it("calls free on unobserve", (done) => {
    const c = assertFreed(() => {}, done);
    const o = c.subscribe();
    asap(() => c.unobserve(o));
  });

  it("maps values through functions", (done) => {
    const c = erx.stream((sink) => sink.value(37));
    c.map((i) => i + 1300).subscribe((i) => {
      assert.equal(i, 1337);
      done();
    });
  });

  it("catches errors in mapping function", (done) => {
    const c = erx.stream((sink) => sink.value(1337));
    c.map((i) => i.lol.omg).subscribe(null, (err) => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it("map() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.map((i) => i + 1).subscribe();
  });

  it("filters values out of streams", (done) => {
    const c = erx.stream((sink) => {
      sink.value(13);
      sink.value(37);
    });
    c.filter((i) => i > 30).subscribe((i) => {
      assert.equal(i, 37);
      done();
    });
  });

  it("catches errors in predicate function", (done) => {
    const c = erx.stream((sink) => sink.value(1337));
    c.filter((i) => i.lol.omg).subscribe(null, (err) => {
      assert.ok(err instanceof Error);
      done();
    });
  });

  it("filter() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.filter((i) => true).subscribe();
  });

  it("merges two channels properly", (done) => {
    const c1 = erx.stream((sink) => {sink.value(13); sink.close();});
    const c2 = erx.stream((sink) => {sink.value(37); sink.close();});
    assertSeq(c1.merge(c2), [13, 37], done);
  });

  it("merge() frees original streams", (done) => {
    let doneCount = 0;
    function doneTwice() {
      doneCount++;
      if (doneCount === 2) {
        done();
      }
    }
    const c1 = assertFreed(counter, doneTwice);
    const c2 = assertFreed(counter, doneTwice);
    c1.merge(c2).subscribe();
  });

  it("concatenates two channels properly", (done) => {
    const c1 = erx.stream((sink) => {sink.value(13); sink.close();});
    const c2 = erx.stream((sink) => {sink.value(37); sink.close();});
    assertSeq(c1.concat(c2), [13, 37], done);
  });

  it("concat() frees original streams", (done) => {
    let doneCount = 0;
    function doneTwice() {
      doneCount++;
      if (doneCount === 2) {
        done();
      }
    }
    const c1 = assertFreed(counter, doneTwice);
    const c2 = assertFreed(counter, doneTwice);
    c1.concat(c2).subscribe();
  });

  it("folds through a stream", (done) => {
    const c = erx.stream((sink) => {
      sink.value(37);
    });
    assertSignal(c.fold((acc, v) => acc + v, 1300), [1300, 1337], done);
  });

  it("fold() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.fold((a, n) => 0).subscribe();
  });

  it("take() caps a stream at the specified number", (done) => {
    const c = erx.stream((sink) => {
      sink.value(1); sink.value(2); sink.value(3); sink.value(4);
      sink.close();
    });
    assertSeq(c.take(3), [1, 2, 3], done);
  });

  it("take frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.take(3).subscribe();
  });

  it("unpack() turns a stream of arrays of a into a stream of a", (done) => {
    const c = erx.stream((sink) => {
      sink.value([1, 2]); sink.value([3, 4]); sink.value([5, 6]);
      sink.close();
    });
    assertSeq(erx.Stream.unpack(c), [1, 2, 3, 4, 5, 6], done);
  });

  it("unpack() frees original stream", (done) => {
    const c = assertFreed((sink) => {
      sink.value([1, 2]); sink.value([3, 4]); sink.value([5, 6]);
      sink.close();
    }, done);
    erx.Stream.unpack(c).subscribe();
  });

  it("flatMap() concatenates array results of a map properly", (done) => {
    const c = erx.stream((sink) => {
      sink.value(1); sink.value(2); sink.value(3);
      sink.close();
    });
    assertSeq(c.flatMap((i) => [i, i * 2]), [1, 2, 2, 4, 3, 6], done);
  });

  it("flatMap() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.flatMap((i) => [i, i]).subscribe();
  });

  it("distinct() filters out consecutive duplicates", (done) => {
    const c = erx.stream((sink) => {
      sink.value(1); sink.value(1); sink.value(1); sink.value(1);
      sink.value(2); sink.value(2); sink.value(2);
      sink.value(3); sink.value(3);
      sink.close();
    });
    assertSeq(c.distinct(), [1, 2, 3], done);
  });

  it("distinct() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.distinct().subscribe();
  });

  it("takeUntil() caps stream 1 when stream 2 yields", (done) => {
    const c2 = erx.bus();
    const c1 = erx.stream((sink) => {
      asap(() => sink.value(1));
      asap(() => sink.value(2));
      asap(() => c2.push("lol"));
      asap(() => sink.value(3));
      asap(() => sink.close());
    });
    assertSeq(c1.takeUntil(c2), [1, 2], done);
  });

  it("takeUntil() frees original stream", (done) => {
    const c2 = erx.bus();
    assertFreed((sink) => {
      asap(() => sink.value(1));
      asap(() => sink.value(2));
      asap(() => c2.push("lol"));
      asap(() => sink.value(3));
      asap(() => sink.close());
    }, done).takeUntil(c2).subscribe();
  });

  it("repeat() repeats a stream at least a few times", (done) => {
    const f = () => erx.stream((sink) => {
      sink.value(1); sink.value(2); sink.value(3); sink.close();
    });
    const c = erx.Stream.repeat(f);
    assertSeq(c.take(9), [1, 2, 3, 1, 2, 3, 1, 2, 3], done);
  });

  it("takeWhile() ends after the predicate fails", (done) => {
    const c = erx.stream(counter);
    assertSeq(c.takeWhile((i) => i < 4), [1, 2, 3], done);
  });

  it("takeWhile() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.takeWhile((i) => i < 4).subscribe();
  });

  it("delay() frees original stream", (done) => {
    const c = assertFreed(counter, done);
    c.delay(5).subscribe();
  });

  it("Observable.of() can be subscribed to by multiple observers", (done) => {
    const doneThrice = doneX(3, done);
    const c = erx.Stream.of([1, 2, 3, 4, 5]);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
  });

  it("Stream.zip() zips values good", (done) => {
    const c1 = erx.stream((sink) => {
      setTimeout(() => sink.value(1), 5);
      setTimeout(() => sink.value(2), 15);
      setTimeout(() => sink.value(3), 25);
      setTimeout(() => sink.close(), 35);
    });
    const c2 = erx.stream((sink) => {
      setTimeout(() => sink.value(1), 10);
      setTimeout(() => sink.value(2), 20);
      setTimeout(() => sink.value(3), 30);
      setTimeout(() => sink.close(), 40);
    });
    assertSeq(c1.zip(c2, (a, b) => [a, b]), [
      [1, null], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]
    ], done);
  });

  it("Signal.zip() zips values just as good", (done) => {
    const c1 = new erx.Signal(0, (sink) => {
      setTimeout(() => sink.value(1), 5);
      setTimeout(() => sink.value(2), 15);
      setTimeout(() => sink.value(3), 25);
      setTimeout(() => sink.close(), 35);
    });
    const c2 = new erx.Signal(0, (sink) => {
      setTimeout(() => sink.value(1), 10);
      setTimeout(() => sink.value(2), 20);
      setTimeout(() => sink.value(3), 30);
      setTimeout(() => sink.close(), 40);
    });
    assertSeq(c1.zip(c2, (a, b) => [a, b]), [
      [0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]
    ], done);
  });

  it("Signal.sampleOn() samples the right values", function(done) {
    this.slow(400);
    const c = new erx.Signal(0, slowCounter);
    assertSeq(c.sampleOn(erx.Stream.interval(50)), [0, 2, 4, 6], done);
  });

  it("Signal.sampleOn() samples the signal repeatedly", function(done) {
    this.slow(100);
    const c = new erx.Signal(5, (sink) => {
      setTimeout(() => sink.close(), 45);
    });
    assertSeq(c.sampleOn(erx.Stream.interval(10)), [5, 5, 5, 5, 5], done);
  });

  it("two Signal.sampleOn()s can run on the same signal", function(done) {
    this.slow(400);
    const doneTwice = doneX(2, done);
    const c = new erx.Signal(0, slowCounter);
    assertSeq(c.sampleOn(erx.Stream.interval(50)), [0, 2, 4, 6], doneTwice);
    assertSeq(c.sampleOn(erx.Stream.interval(50)), [0, 2, 4, 6], doneTwice);
  });

  it("Stream.sampleOn() samples the right values", function(done) {
    this.slow(400);
    const c = new erx.Stream(slowCounter);
    assertSeq(c.sampleOn(erx.Stream.interval(50), 0), [0, 2, 4, 6], done);
  });

  it("Stream.sampleOn() samples the signal repeatedly", function(done) {
    this.slow(100);
    const c = new erx.Stream((sink) => {
      setTimeout(() => sink.close(), 45);
    });
    assertSeq(c.sampleOn(erx.Stream.interval(10), 5), [5, 5, 5, 5, 5], done);
  });

  it("two Stream.sampleOn()s can run on the same stream", function(done) {
    this.slow(400);
    const doneTwice = doneX(2, done);
    const c = new erx.Stream(slowCounter);
    assertSeq(c.sampleOn(erx.Stream.interval(50), 0), [0, 2, 4, 6], doneTwice);
    assertSeq(c.sampleOn(erx.Stream.interval(50), 0), [0, 2, 4, 6], doneTwice);
  });

  it("Signal.sampleOn() frees original stream", function(done) {
    this.slow(400);
    const c = assertSignalFreed(0, slowCounter, done);
    c.sampleOn(erx.Stream.interval(50)).subscribe();
  });

  it("Stream.sampleOn() frees original stream", function(done) {
    this.slow(400);
    const c = assertFreed(slowCounter, done);
    c.sampleOn(erx.Stream.interval(50)).subscribe();
  });

  it("bus feeds values through", (done) => {
    const b = erx.bus();
    assertSeq(b, ["o", "m", "g"], done);
    for (let i of "omg") {
      b.push(i);
    }
    b.close();
  });

  it("property feeds values through", (done) => {
    const b = erx.property("lol");
    assertSeq(b, ["lol", "o", "m", "g"], done);
    for (let i of "omg") {
      b.set(i);
    }
    b.close();
  });
});
