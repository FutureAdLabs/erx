/*
 * A stripped down Promise implementation, primarily here for adding
 * the ability to wait for observables to close using a promise chain.
 *
 * We offer no guarantees it'll be Promises/A+ compliant, but it's
 * reasonably close.
 */

 
const asap = require("asap")

// const global = typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {}

// const NativePromise = global.Promise || {}

export type Resolver<A> = (resolve: (result: A) => void, reject: (error: Error) => void) => void;

export default class Promise<A> {
  onResolve: Array<(result: A) => void>;
  onReject: Array<(error: Error) => void>;
  resolved: boolean;
  failed: boolean;
  value: A;
  error: Error;
  resolve: (result: A) => void;
  reject: (error: Error) => void;

  
  static resolved: <A>(val: A) => Promise<A>;
  static rejected: <A>(error: Error) => Promise<A>;

  static sequence: <A>(as: Promise<A>[]) => Promise<A[]>;
  static all: <A>(as: Promise<A>[]) => Promise<A[]>;
  static race: <A>(as: Promise<A>[]) => Promise<A>;

  constructor(resolver?: Resolver<A>) {
    this.onResolve = []; this.onReject = [];
    this.resolved = false; this.failed = false;
    this.resolve = (result) => {
      if (this.resolved === true) {
        throw new Error("tried to resolve an already resolved promise");
      } else {
        this.resolved = true; this.failed = false;
        this.value = result;
        this.onResolve.forEach((r) => asap(() => r(result)));
        this.onResolve = []; this.onReject = [];
      }
    };
    this.reject = (error) => {
      if (this.resolved === true) {
        throw new Error("tried to resolve an already resolved promise");
      } else {
        this.resolved = true; this.failed = true;
        this.error = error;
        this.onReject.forEach((r) => asap(() => r(error)));
        this.onResolve = []; this.onReject = [];
      }
    };
    if (resolver != null) {
      asap(() => resolver && resolver(this.resolve, this.reject));
    }
  }

  callback(): (err?: Error, res?: A) => void {
    return (err, res) => {
      if (err != null) {
        this.reject(err);
      } else if (res != null) {
        this.resolve(res);
      }
    };
  }

  then<B>(onFulfilled: (result: A) => Promise<B> | B, onRejected?: (error: Error) => void): Promise<B> {
    return new Promise((resolve, reject) => {
      function _resolve(val: A) {
        const next = onFulfilled(val);
        if (next instanceof Promise) {
          next.then((val) => resolve(val), (err) => reject(err));
        } else if (next != null) {
          resolve(next);
        }
      }
      function _reject(error: Error) {
        if (onRejected != null) {
          onRejected(error);
        }
        reject(error);
      }

      if (this.resolved) {
        if (this.failed) {
          _reject(this.error);
        } else {
          _resolve(this.value);
        }
      } else {
        this.onResolve.push(_resolve);
        this.onReject.push(_reject);
      }
    });
  }
}

Promise.resolved = function resolved<A>(val: A): Promise<A> {
  return new Promise((resolve, _) => resolve(val))
}

Promise.rejected = function rejected<A>(error: Error): Promise<A> {
  return new Promise((_, reject) => reject(error));
}

Promise.sequence = function sequence<A>(as: Promise<A>[]): Promise<Array<A>> {
  return new Promise((resolve, reject) => {
    const out = new Array(as.length)
    let done = 0, err = false;
    as.forEach((p, i) => {
      p.then((val) => {
        if (!err) {
          out[i] = val;
          done += 1;
          if (done === as.length) {
            resolve(out);
          }
        }
      }, (error) => {
        err = true;
        reject(error);
      });
    });
  });
};

Promise.all = Promise.sequence

Promise.race = function race<A>(as: Array<Promise<A>>): Promise<A> {
  let prom: Promise<A>
  
  prom = new Promise((resolve, reject) => {
    const res = (v: A) => prom.resolved && resolve(v)
    const rej = (v: Error) => prom.resolved && reject(v)

    as.forEach(p => {
      p.then(res, rej)
    })
  })

  return prom
}

// const nativePromise = global.Promise ? global.Promise : Promise
