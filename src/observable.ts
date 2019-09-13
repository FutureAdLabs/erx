import Promise from "./promise"

const asap = require("asap")

import { isGen, genToObs } from "./util/generator";
import { tryFn } from "./util/fn";
import { Signal, Stream } from "./stream";

export type Producer<A> = (sink: Sink<A>) => void | (() => void)

const isFn = (v: any): v is Function => typeof v === "function"
const noop = () => {};

function rethrow(err: Error): void {
  console.error("Uncaught error on erx.Observer!");
  throw err;
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

  constructor(onValue?: (value: A) => void, onError?: (error: Error) => void, onClose?: () => void) {
    this.value = onValue || noop
    this.error = onError || rethrow;
    this.close = onClose || noop;
  }
}

export class Observable<A> extends Promise<A> {
  observers: Array<Observer<A>>;
  freeFn?: (() => void) | void;
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
          this.resolve(this.value);
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
    const o = isGen(onValue) ? genToObs(onValue) : new Observer(onValue, onError, onClose);
    this.observe(o);
    return o;
  }

  fold<B>(fun: (acc: B, next: A) => B, seed: B): Signal<B> {
    let acc = seed;
    return new Signal(seed, (sink) => {
      const onValue = (val: any) => {
        const accumulate = (val: any) => {
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
      const onValue = (val: any) => {
        const accumulate = (val: any) => {
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
