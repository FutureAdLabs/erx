import { Observable, Observer, Producer } from "./observable";
import Promise from "./promise"
const asap = require("asap")
import { tryFn } from "./util/fn";

export class Signal<A> extends Observable<A> {

  constructor(value: A, producer: Producer<A>) {
    super(producer);
    this.value = value;
    const wrappedVal = this.sink.value;
    this.sink.value = (value) => {
      // yay OO
      wrappedVal(value);
      this.value = value;
    };
  }

  observe(o: Observer<A>): void {
    super.observe(o);
    o.value(this.value);
  }

  sampleOn<B>(tick: Observable<B>): Signal<A> {
    return new Signal(this.value, (sink) => {
      let current = this.value;
      const obs1 = this.subscribe((val) => {
        current = val;
      }, sink.error, sink.close);
      const obs2 = tick.subscribe((val) => {
        sink.value(current);
      }, sink.error, sink.close);
      return () => {
        this.unobserve(obs1);
        tick.unobserve(obs2);
      };
    });
  }

  distinct(): Signal<A> {
    return new Signal(this.value, (sink) => {
      let current = this.value;
      const observer = this.subscribe((val) => {
        if (val !== current) {
          sink.value(val);
        }
        current = val;
      }, sink.error, sink.close);
      return () => this.unobserve(observer);
    });
  }

  zip<B, C>(other: Signal<B>, select: (a: A, b: B) => C): Signal<C> {
    const seed: [ A, B ] = [this.value, other.value];
    return new Signal(select(seed[0], seed[1]), (sink) => {
      let c: [any, any] = seed;
      // Must ignore the first results from subscribing, as they're just
      // the current values repeated. We already have them in the seed.
      let ig: [boolean, boolean] = [false, false];
      const unsub = () => { this.unobserve(o1); other.unobserve(o2); };
      const onError = (err: Error) => {
        sink.error(err);
        unsub();
      };
      const onClose = () => {
        sink.close();
        unsub();
      };
      const onValue = (i: number) => (val: any) => {
        if (ig[i]) {
          c[i] = val;
          sink.value(select(c[0], c[1]));
        } else {
          ig[i] = true;
        }
      };
      const o1 = this.subscribe(onValue(0), onError, onClose);
      const o2 = other.subscribe(onValue(1), onError, onClose);
      return unsub;
    });
  }
}

export class Stream<A> extends Observable<A> {

  static interval: (ms: number) => Stream<number>;
  static tick: (ms: number) => Stream<number>;
  static unpack: <A>(o: Stream<A[]>) => Stream<A>;
  static mergeAll: <A>(os: Stream<A>[]) => Stream<A>;
  static concatAll: <A>(os: Stream<A>[]) => Stream<A>;
  static repeat: <A>(factory: () => Stream<A>) => Stream<A>;
  static repeatFinite: <A>(factory: () => Stream<A>, iterations: number) => Stream<A>;
  static of: <A>(values: A[]) => Stream<A>;
  static unit: <A>(value: A) => Stream<A>;
  static wait: (time: number) => Stream<any>;

  map<B>(f: (a: A) => B): Stream<B> {
    return new Stream((sink) => {
      const o = this.subscribe((val) => tryFn(f, val, sink.value, sink.error),
        sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  filter(f: (a: A) => boolean): Stream<A> {
    return new Stream((sink) => {
      const o = this.subscribe((val) => tryFn(f, val, (v) => {
        if (v) {
          sink.value(val);
        }
      }, sink.error), sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  merge(other: Stream<A>): Stream<A> {
    return new Stream((sink) => {
      let c = [false, false];
      const unsub = () => { this.unobserve(o1); this.unobserve(o2); };
      const onError = (err: Error) => {
        sink.error(err);
        unsub();
      };
      const onClose = (i: number) => () => {
        c[i] = true;
        if (c[0] && c[1]) {
          sink.close();
          unsub();
        }
      };
      const o1 = this.subscribe(sink.value, onError, onClose(0));
      const o2 = other.subscribe(sink.value, onError, onClose(1));
      return unsub;
    });
  }

  concat(other: Stream<A>): Stream<A> {
    return new Stream((sink) => {
      let cur: Stream<A> = this;
      let o = this.subscribe(sink.value, sink.error, () => {
        this.unobserve(o);
        cur = other;
        o = other.subscribe(sink.value, sink.error, sink.close);
      });
      return () => cur.unobserve(o);
    });
  }

  zip<B, C>(other: Stream<B>, select: (a: A, b: B) => C): Stream<C> {
    return new Stream((sink) => {
      let c: [any, any] = [null, null];
      const unsub = () => { this.unobserve(o1); other.unobserve(o2); };
      const onError = (err: Error) => {
        sink.error(err);
        unsub();
      };
      const onClose = () => {
        sink.close();
        unsub();
      };
      const onValue = (i: number) => (val: any) => {
        c[i] = val;
        sink.value(select(c[0], c[1]));
      };
      const o1 = this.subscribe(onValue(0), onError, onClose);
      const o2 = other.subscribe(onValue(1), onError, onClose);
      return unsub;
    });
  }

  zipLeft<B, C>(other: Stream<B>, select: (a: A, b: B) => C): Stream<C> {
    return new Stream((sink) => {
      let c: [any, any] = [null, null];
      const unsub = () => { this.unobserve(o1); other.unobserve(o2); };
      const onError = (err: Error) => {
        sink.error(err);
        unsub();
      };
      const onClose = () => {
        sink.close();
        unsub();
      };
      const onValue = (i: number) => (val: any) => {
        c[i] = val;
        if (i === 0) {
          sink.value(select(c[0], c[1]));
        }
      };
      const o1 = this.subscribe(onValue(0), onError, onClose);
      const o2 = other.subscribe(onValue(1), onError, onClose);
      return unsub;
    });
  }

  take(total: number): Stream<A> {
    let count = 0;
    return new Stream((sink) => {
      const o = this.subscribe((val) => {
        count++;
        if (count <= total) {
          sink.value(val);
        }
        if (count >= total) {
          this.unobserve(o);
          sink.close();
        }
      }, sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  flatMap<B>(f: (a: A) => Array<B>): Stream<B> {
    return Stream.unpack(this.map(f));
  }

  distinct(): Stream<A> {
    return new Stream((sink) => {
      let current: A;
      const observer = this.subscribe((val) => {
        if (val !== current) {
          sink.value(val);
        }
        current = val;
      }, sink.error, sink.close);
      return () => this.unobserve(observer);
    });
  }

  delay(ms: number): Stream<A> {
    return new Stream((sink) => {
      const delay = (f: Function) => (v?: A | Error) => setTimeout(() => f(v), ms);
      const observer = this.subscribe(
        delay(sink.value),
        delay(sink.error),
        delay(sink.close)
      );
      return () => this.unobserve(observer);
    });
  }

  takeUntil<B>(other: Stream<B>): Stream<A> {
    return new Stream((sink) => {
      const o1 = this.subscribe(sink.value, sink.error, sink.close);
      const o2 = other.subscribe((val) => {
        sink.close();
        free();
      }, sink.error);
      const free = () => {
        this.unobserve(o1);
        this.unobserve(o2);
      };
    });
  }

  takeWhile(pred: (value: A) => boolean): Stream<A> {
    return new Stream((sink) => {
      const o = this.subscribe((v) => {
        if (pred(v)) {
          sink.value(v);
        } else {
          sink.close();
          free();
        }
      }, sink.error, sink.close);
      const free = () => {
        this.unobserve(o);
      };
    });
  }

  sampleOn<B>(other: Observable<B>, seed: A): Signal<A> {
    return this.fold((acc, next) => next, seed).sampleOn(other);
  }
}

export class Bus<A> extends Stream<A> {
  constructor() {
    super(function () { });
  }

  push(val: A): void {
    if (this.observers.length > 0) {
      this.sink.value(val);
    }
  }

  close(): void {
    this.sink.close();
  }

  pipe(o: Stream<A>): void {
    o.subscribe(this.sink.value, this.sink.error);
  }
}

export class Property<A> extends Signal<A> {
  constructor(seed: A) {
    super(seed, () => {});
  }

  set(val: A): void {
    if (this.observers.length > 0) {
      this.sink.value(val);
    }
  }

  close(): void {
    this.sink.close();
  }
}

Stream.interval = function interval(ms: number): Stream<number> {
  return new Stream((sink) => {
    const i = setInterval(() => sink.value(typeof window !== "undefined" && window.performance !== undefined && window.performance.now !== undefined ? window.performance.now() : Date.now()), ms);
    return () => clearInterval(i);
  });
};

Stream.tick = function interval(ms: number): Stream<number> {
  return new Stream((sink) => {
    let c = 0;
    const i = setInterval(() => sink.value(c++), ms);
    return () => clearInterval(i);
  });
};

Stream.unpack = function unpack<A>(o: Stream<Array<A>>): Stream<A> {
  return new Stream((sink) => {
    const observer = o.subscribe((val) => val.forEach((i) => sink.value(i)),
      sink.error, sink.close);
    return () => o.unobserve(observer);
  });
};

Stream.mergeAll = function mergeAll<A>(os: Array<Stream<A>>): Stream<A> {
  if (os.length === 0) {
    throw new Error("Stream.mergeAll() called with an empty array, and that makes no sense.");
  }
  if (os.length === 1) {
    return os[0];
  }
  return os.reduce((acc, next) => acc.merge(next));
};

Stream.concatAll = function concatAll<A>(os: Array<Stream<A>>): Stream<A> {
  if (os.length === 0) {
    throw new Error("Stream.concatAll() called with an empty array, and that makes no sense.");
  }
  if (os.length === 1) {
    return os[0];
  }
  return os.reduce((acc, next) => acc.concat(next));
};

Stream.repeat = function repeat<A>(factory: () => Stream<A>): Stream<A> {
  return new Stream((sink) => {
    let stream: Stream<A>, o: Observer<A>;
    const start = () => {
      stream = factory();
      o = stream.subscribe(sink.value, sink.error, start);
    };
    start();
    return () => stream.unobserve(o);
  });
};

Stream.repeatFinite = function repeat<A>(factory: () => Stream<A>, iterations: number): Stream<A> {
  return new Stream((sink) => {
    let stream: Stream<A>, o: Observer<A>;
    const start = (i: number, c: number) => {
      stream = factory();
      var onEnd = () => start(i, c + 1);

      if (i === c + 1) {
        onEnd = sink.close;
      }

      o = stream.subscribe(sink.value, sink.error, onEnd);
    };
    start(iterations, 0);
    return () => stream.unobserve(o);
  });
};

Stream.of = function of<A>(values: Array<A>): Stream<A> {
  return new Stream((sink) => {
    asap(() => {
      values.forEach((v) => sink.value(v));
      sink.close();
    });
  });
};

Stream.unit = function unit<A>(value: A): Stream<A> {
  return Stream.of([value]);
};

Stream.wait = function wait(time: number): Stream<void> {
  return new Stream((sink) => {
    setTimeout(() => sink.close(), time);
  });
}

export function stream(f: Producer<any>): Stream<any> {
  return new Stream(f);
}

export function bus(): Bus<any> {
  return new Bus();
}

export function property(seed: any): Property<any> {
  return new Property(seed)
}
