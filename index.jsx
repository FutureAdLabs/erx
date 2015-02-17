/* @flow -*- mode: flow -*- */

var debug = false;

var asap = require("asap");

class Sink<A> {
  value: (value: A) => void;
  error: (error: Error) => void;
  close: () => void;

  constructor(value: (v: A) => void, error: (e: Error) => void, close: () => void) {
    this.value = value;
    this.error = error;
    this.close = close;
  };
};

class Observer<A> {
  value: (value: A) => void;
  error: (error: Error) => void;
  close: () => void;

  constructor(onValue: ?(value: A) => void, onError: ?(error: Error) => void, onClose: ?() => void): void {
    this.value = onValue || nop;
    this.error =  onError || rethrow;
    this.close =  onClose || nop;
  }
}

type Producer<A> = (sink: Sink<A>) => (void | () => void)

var isFn = (v) => typeof v === "function";
var nop = function() {};

function rethrow(err: Error): void {
  console.error("Uncaught error on erx.Observer!");
  throw err;
}

function tryFn<A,B>(fn: (val: A) => B, val: A, onValue: (val: B) => void, onError: (err: Error) => void) {
  var v;
  try {
    v = fn(val);
  } catch(e) {
    onError(e);
    return;
  }
  onValue(v);
}

class Observable<A> {
  observers: Array<Observer<A>>;
  freeFn: ?(() => void);
  producer: Producer<A>;
  sink: Sink<A>;

  constructor(producer: Producer<A>) {
    this.observers = [];
    this.producer = producer;
    this.sink = new Sink(
      (value) => asap(() => this.observers.forEach((o) => o.value(value))),
      (err) => asap(() => {
        this.observers.forEach((o) => o.error(err));
        this.cleanup();
      }),
      () => asap(() => {
        this.observers.forEach((o) => o.close());
        this.cleanup();
      })
    );
    this.freeFn = null;
    if (debug) console.log("new Obs", this);
  }

  produce() {
    this.freeFn = this.producer(this.sink);
    if (debug) console.log("producing", this);
  }

  free() {
    if (this.freeFn) {
      this.freeFn();
    }
  }

  cleanup() {
    this.free();
    this.observers = [];
  }

  observe(o: Observer<A>) {
    var fresh = this.observers.length === 0;
    this.observers.push(o);
    if (fresh) asap(() => this.produce());
    if (debug) console.log("observe", this, o);
  }

  unobserve(o: Observer<A>) {
    var i = this.observers.indexOf(o);
    if (i >= 0) {
      this.observers = this.observers.slice(0, i).concat(this.observers.slice(i + 1));
      if (this.observers.length === 0) {
        this.free();
        this.freeFn = null;
      }
      if (debug) console.log("unobserve", this, o);
    }
  }

  subscribe(onValue: (v: A) => void, onError: (e: Error) => void, onClose: () => void): Observer<A> {
    var o = new Observer(onValue, onError, onClose);
    this.observe(o);
    return o;
  }

  map<B>(f: (a: A) => B): Observable<B> {
    return new Observable((sink) => {
      var o = this.subscribe((val) => tryFn(f, val, sink.value, sink.error),
                             sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  filter(f: (a: A) => boolean): Observable<A> {
    return new Observable((sink) => {
      var o = this.subscribe((val) => tryFn(f, val, (v) => {
        if (v) sink.value(val);
      }, sink.error), sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  merge(other: Observable<A>): Observable<A> {
    return new Observable((sink) => {
      var c = [false, false];
      var unsub = () => { this.unobserve(o1); this.unobserve(o2); };
      var onError = (err) => {
        sink.error(err);
        unsub();
      };
      var onClose = (i) => () => {
        c[i] = true;
        if (c[0] && c[1]) {
          sink.close();
          unsub();
        }
      };
      var o1 = this.subscribe(sink.value, onError, onClose(0));
      var o2 = other.subscribe(sink.value, onError, onClose(1));
      return unsub;
    });
  }

  concat(other: Observable<A>): Observable<A> {
    return new Observable((sink) => {
      var cur = this;
      var o = this.subscribe(sink.value, sink.error, () => {
        this.unobserve(o);
        cur = other;
        o = other.subscribe(sink.value, sink.error, sink.close);
      });
      return () => cur.unobserve(o);
    });
  }

  zip<B, C>(other: Observable<B>, select: (a: A, b: B) => C): Observable<C> {
    return new Observable((sink) => {
      var c = [null, null];
      var unsub = () => { this.unobserve(o1); other.unobserve(o2); }
      var onError = (err) => {
        sink.error(err);
        unsub();
      };
      var onClose = () => {
        sink.close();
        unsub();
      };
      var onValue = (i) => (val) => {
        c[i] = val;
        sink.value(select(c[0], c[1]));
      };
      var o1 = this.subscribe(onValue(0), onError, onClose);
      var o2 = other.subscribe(onValue(1), onError, onClose);
      return unsub;
    });
  }

  zipLeft<B, C>(other: Observable<B>, select: (a: A, b: B) => C): Observable<C> {
    return new Observable((sink) => {
      var c = [null, null];
      var unsub = () => { this.unobserve(o1); other.unobserve(o2); }
      var onError = (err) => {
        sink.error(err);
        unsub();
      };
      var onClose = () => {
        sink.close();
        unsub();
      };
      var onValue = (i) => (val) => {
        c[i] = val;
        if (i == 0) {
          sink.value(select(c[0], c[1]));
        }
      };
      var o1 = this.subscribe(onValue(0), onError, onClose);
      var o2 = other.subscribe(onValue(1), onError, onClose);
      return unsub;
    });
  }

  fold<B>(fun: (acc: B, next: A) => B, seed: B): Observable<B> {
    var acc = seed;
    return new Observable((sink) => {
      var onValue = (val) => {
        var accumulate = (val) => {
          acc = val;
          sink.value(val);
        }
        tryFn(fun.bind(this, acc), val, accumulate, sink.error);
      };
      var o = this.subscribe(onValue, sink.error, sink.close);
      return () => this.unobserve(o);
    });
  }

  take(total: number): Observable<A> {
    var count = 0;
    var o = new Observable((sink) => {
      this.subscribe((val) => {
        sink.value(val);
        count++;
        if (count === total) {
          this.unobserve(o);
          sink.close();
        }
      }, sink.error, sink.close);
    });
    return o;
  }

  flatMap<B>(f: (a: A) => Array<B>): Observable<B> {
    return Observable.unpack(this.map(f));
  }

  sampleOn<B>(tick: Observable<B>, seed: A): Observable<A> {
    return new Observable((sink) => {
      var current = seed;
      sink.value(seed);
      var obs1 = this.subscribe((val) => {
        current = val;
      }, sink.error, sink.close);
      var obs2 = tick.subscribe((val) => {
        sink.value(current);
      }, sink.error, sink.close);
      return () => {
        this.unobserve(obs1);
        tick.unobserve(obs2);
      };
    });
  }

  distinct(): Observable<A> {
    return new Observable((sink) => {
      var current = undefined;
      var observer = this.subscribe((val) => {
        if (val !== current) sink.value(val);
        current = val;
      }, sink.error, sink.close);
      return () => this.unobserve(observer);
    });
  }
}

class Bus<A> extends Observable<A> {
  constructor() {
    super(function() {});
  }

  push(val: A): void {
    if (this.observers.length > 0) {
      this.sink.value(val);
    }
  }

  pipe(o: Observable<A>): void {
    o.subscribe(this.sink.value, this.sink.error, this.sink.close);
  }
}

Observable.interval = function interval(ms: number): Observable<number>{
  return new Observable((sink) => {
    setInterval(() => sink.value(Date.now()), ms);
  });
}

Observable.unpack = function unpack<A>(o: Observable<Array<A>>): Observable<A> {
  return new Observable((sink) => {
    var observer = o.subscribe((val) => val.forEach((i) => sink.value(i)),
                               sink.error, sink.close);
    return () => o.unobserve(observer);
  });
}

module.exports = {
  Observable: Observable,
  Observer: Observer,
  Bus: Bus,

  channel: (f) => new Observable(f),
  bus: () => new Bus(),
};

try {
  module.exports.Producer = Producer;
} catch(e) {}
