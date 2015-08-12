/* @flow -*- mode: flow -*- */

/*
 * A stripped down Promise implementation, primarily here for adding
 * the ability to wait for observables to close using a promise chain.
 *
 * We offer no guarantees it'll be Promises/A+ compliant, but it's
 * reasonably close.
 */

import asap from "asap";

type Resolver<A> = (resolve: (result: A) => void, reject: (error: Error) => void) => void;

export default class Promise<A> {
  onResolve: Array<(result: A) => void>;
  onReject: Array<(error: Error) => void>;
  resolved: boolean;
  failed: boolean;
  value: A;
  error: Error;
  resolve: (result: A) => void;
  reject: (error: Error) => void;

  constructor(resolver?: Resolver<A>): void {
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

  then<B>(onFulfilled: (result: A) => Promise<B> | ?B, onRejected?: (error: Error) => void): Promise<B> {
    return new Promise((resolve, reject) => {
      function _resolve(val) {
        const next = onFulfilled(val);
        if (next instanceof Promise) {
          next.then((val) => resolve(val), (err) => reject(err));
        } else if (next != null) {
          resolve(next);
        }
      }
      function _reject(error) {
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
  return new Promise((resolve, reject) => resolve(val));
};

Promise.rejected = function rejected<A>(error: Error): Promise<A> {
  return new Promise((resolve, reject) => reject(error));
};

Promise.sequence = function sequence<A>(as: Array<Promise<A>>): Promise<Array<A>> {
  return new Promise((resolve, reject) => {
    const out = new Array(as.length);
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
