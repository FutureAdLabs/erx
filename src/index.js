/* @flow -*- mode: flow -*- */

import Promise from "./promise";
import asap from "asap";

type Producer<A> = (sink: Sink<A>) => (void | () => void)

const isFn = (v) => typeof v === "function";
const nop = function() {};

function rethrow(err: Error): void {
  console.error("Uncaught error on erx.Observer!");
  throw err;
}

function tryFn<A, B>(fn: (val: A) => B, val: A, onValue: (val: B) => void, onError: (err: Error) => void) {
  let v;
  try {
    v = fn(val);
  } catch(e) {
    onError(e);
    return;
  }
  onValue(v);
}

export class Sink<A> {
  value: (value: A) => void;
  error: (error: Error) => void;
  close: () => void;

  constructor(value: (v: A) => void, error: (e: Error) => void, close: () => void) {
    this.value = value;
    this.error = error;
    this.close = close;
  };
}

export class Observer<A> {
  value: (value: A) => void;
  error: (error: Error) => void;
  close: () => void;

  constructor(onValue?: (value: A) => void, onError?: (error: Error) => void, onClose?: () => void): void {
    this.value = onValue || nop;
    this.error = onError || rethrow;
    this.close = onClose || nop;
  }
}

export class Observable<A> extends Promise<boolean> {
  observers: Array<Observer<A>>;
  freeFn: ?(() => void);
  closed: boolean;
  sink: Sink<A>;
  producer: Producer<A>;

  constructor(producer: Producer<A>) {
    super();
    this.closed = false;
    this.observers = [];
    this.freeFn = null;
    this.producer = producer;

    this.sink = new Sink(
      (value) => asap(() => this.observers.forEach((o) => o.value(value))),
      (err) => asap(() => {
        this.observers.forEach((o) => o.error(err));
        this.cleanup();
        if (!this.resolved) {
          this.reject(err);
        }
      }),
      () => asap(() => {
        this.closed = true;
        this.observers.forEach((o) => o.close());
        this.cleanup();
        if (!this.resolved) {
          this.resolve(true);
        }
      })
    );
  }

  produce(): void {
    this.freeFn = this.producer(this.sink);
  }

  free(): void {
    if (this.freeFn) {
      this.freeFn();
    }
  }

  cleanup(): void {
    this.free();
    this.observers = [];
  }

  observe(o: Observer<A>): void {
    if (this.closed) { throw new Error("Cannot subscribe to a closed stream."); }
    const fresh = this.observers.length === 0;
    this.observers.push(o);
    if (fresh) {
      asap(() => this.produce());
    }
  }

  unobserve(o: any): void { // FIXME Flow won't accept o: Observer<A> for some unknown reason
    const i = this.observers.indexOf(o);
    if (i >= 0) {
      this.observers = this.observers.slice(0, i).concat(this.observers.slice(i + 1));
      if (this.observers.length === 0) {
        this.free();
        this.freeFn = null;
      }
    }
  }

  subscribe(onValue?: (v: A) => void, onError?: (e: Error) => void, onClose?: () => void): Observer<A> {
    const o = new Observer(onValue, onError, onClose);
    this.observe(o);
    return o;
  }

  fold<B>(fun: (acc: B, next: A) => B, seed: B): Signal<B> {
    let acc = seed;
    return new Signal(seed, (sink) => {
      const onValue = (val) => {
        const accumulate = (val) => {
          acc = val;
          sink.value(val);
        };
        tryFn(fun.bind(this, acc), val, accumulate, sink.error);
      };
      const o = this.subscribe(onValue, sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  scan<B>(fun: (acc: B, next: A) => B, seed: B): Stream<B> {
    let acc = seed;
    return new Stream((sink) => {
      const onValue = (val) => {
        const accumulate = (val) => {
          acc = val;
          sink.value(val);
        };
        tryFn(fun.bind(this, acc), val, accumulate, sink.error);
      };
      const o = this.subscribe(onValue, sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }
}

export class Signal<A> extends Observable<A> {
  value: A;

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
}

export class Stream<A> extends Observable<A> {
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
      const onError = (err) => {
        sink.error(err);
        unsub();
      };
      const onClose = (i) => () => {
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
      let cur = this;
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
      const onError = (err) => {
        sink.error(err);
        unsub();
      };
      const onClose = () => {
        sink.close();
        unsub();
      };
      const onValue = (i) => (val) => {
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
      const onError = (err) => {
        sink.error(err);
        unsub();
      };
      const onClose = () => {
        sink.close();
        unsub();
      };
      const onValue = (i) => (val) => {
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
      let current;
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
      const delay = (f) => (v) => setTimeout(() => f(v), ms);
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

  takeWhile<B>(pred: (value: A) => boolean): Stream<A> {
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
}

export class Bus<A> extends Stream<A> {
  constructor() {
    super(function() {});
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
    let stream = null, o = null;
    const start = () => {
      stream = factory();
      o = stream.subscribe(sink.value, sink.error, start);
    };
    start();
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

Stream.wait = function wait(time: number): Stream<A> {
  return new Stream((sink) => {
    setTimeout(() => sink.close(), time);
  });
}

export function stream(f: Producer): Stream {
  return new Stream(f);
}

export function bus(): Bus {
  return new Bus();
}
