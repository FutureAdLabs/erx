/*global describe, it */

import assert from "assert";
import * as erx from "../src";
import asap from "asap";
import { assertSeq, assertSignal } from "./asserts";

function assertFreed(cons, done) {
  return erx.stream((sink) => {
    cons(sink);
    return done;
  });
}

function counter(sink) {
  asap(() => sink.value(1));
  asap(() => sink.value(2));
  asap(() => sink.value(3));
  asap(() => sink.value(4));
  asap(() => sink.value(5));
  asap(() => sink.close());
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
    let doneCount = 0;
    function doneThrice() {
      doneCount++;
      if (doneCount === 3) {
        done();
      }
    }
    const c = erx.Stream.of([1, 2, 3, 4, 5]);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
    assertSeq(c, [1, 2, 3, 4, 5], doneThrice);
  });
});
