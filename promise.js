"use strict";
/*
 * A stripped down Promise implementation, primarily here for adding
 * the ability to wait for observables to close using a promise chain.
 *
 * We offer no guarantees it'll be Promises/A+ compliant, but it's
 * reasonably close.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
var asap_1 = require("asap");
var Promise = /** @class */ (function () {
    function Promise(resolver) {
        var _this = this;
        this.onResolve = [];
        this.onReject = [];
        this.resolved = false;
        this.failed = false;
        this.resolve = function (result) {
            if (_this.resolved === true) {
                throw new Error("tried to resolve an already resolved promise");
            }
            else {
                _this.resolved = true;
                _this.failed = false;
                _this.value = result;
                _this.onResolve.forEach(function (r) { return asap_1.default(function () { return r(result); }); });
                _this.onResolve = [];
                _this.onReject = [];
            }
        };
        this.reject = function (error) {
            if (_this.resolved === true) {
                throw new Error("tried to resolve an already resolved promise");
            }
            else {
                _this.resolved = true;
                _this.failed = true;
                _this.error = error;
                _this.onReject.forEach(function (r) { return asap_1.default(function () { return r(error); }); });
                _this.onResolve = [];
                _this.onReject = [];
            }
        };
        if (resolver != null) {
            asap_1.default(function () { return resolver && resolver(_this.resolve, _this.reject); });
        }
    }
    Promise.prototype.callback = function () {
        var _this = this;
        return function (err, res) {
            if (err != null) {
                _this.reject(err);
            }
            else if (res != null) {
                _this.resolve(res);
            }
        };
    };
    Promise.prototype.then = function (onFulfilled, onRejected) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            function _resolve(val) {
                var next = onFulfilled(val);
                if (next instanceof Promise) {
                    next.then(function (val) { return resolve(val); }, function (err) { return reject(err); });
                }
                else if (next != null) {
                    resolve(next);
                }
            }
            function _reject(error) {
                if (onRejected != null) {
                    onRejected(error);
                }
                reject(error);
            }
            if (_this.resolved) {
                if (_this.failed) {
                    _reject(_this.error);
                }
                else {
                    _resolve(_this.value);
                }
            }
            else {
                _this.onResolve.push(_resolve);
                _this.onReject.push(_reject);
            }
        });
    };
    return Promise;
}());
exports.default = Promise;
Promise.resolved = function resolved(val) {
    return new Promise(function (resolve, _) { return resolve(val); });
};
Promise.rejected = function rejected(error) {
    return new Promise(function (_, reject) { return reject(error); });
};
Promise.sequence = function sequence(as) {
    return new Promise(function (resolve, reject) {
        var out = new Array(as.length);
        var done = 0, err = false;
        as.forEach(function (p, i) {
            p.then(function (val) {
                if (!err) {
                    out[i] = val;
                    done += 1;
                    if (done === as.length) {
                        resolve(out);
                    }
                }
            }, function (error) {
                err = true;
                reject(error);
            });
        });
    });
};
Promise.all = Promise.sequence;
Promise.race = function race(as) {
    var prom;
    prom = new Promise(function (resolve, reject) {
        var res = function (v) { return prom.resolved && resolve(v); };
        var rej = function (v) { return prom.resolved && reject(v); };
        as.forEach(function (p) {
            p.then(res, rej);
        });
    });
    return prom;
};
// const nativePromise = global.Promise ? global.Promise : Promise
