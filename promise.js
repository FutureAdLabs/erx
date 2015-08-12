/*  -*- mode: flow -*- */

/*
 * A stripped down Promise implementation, primarily here for adding
 * the ability to wait for observables to close using a promise chain.
 *
 * We offer no guarantees it'll be Promises/A+ compliant, but it's
 * reasonably close.
 */

"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _asap = require("asap");

var _asap2 = _interopRequireDefault(_asap);

var Promise = (function () {
  function Promise(resolver) {
    var _this = this;

    _classCallCheck(this, Promise);

    this.onResolve = [];this.onReject = [];
    this.resolved = false;this.failed = false;
    this.resolve = function (result) {
      if (_this.resolved === true) {
        throw new Error("tried to resolve an already resolved promise");
      } else {
        _this.resolved = true;_this.failed = false;
        _this.value = result;
        _this.onResolve.forEach(function (r) {
          return (0, _asap2["default"])(function () {
            return r(result);
          });
        });
        _this.onResolve = [];_this.onReject = [];
      }
    };
    this.reject = function (error) {
      if (_this.resolved === true) {
        throw new Error("tried to resolve an already resolved promise");
      } else {
        _this.resolved = true;_this.failed = true;
        _this.error = error;
        _this.onReject.forEach(function (r) {
          return (0, _asap2["default"])(function () {
            return r(error);
          });
        });
        _this.onResolve = [];_this.onReject = [];
      }
    };
    if (resolver != null) {
      (0, _asap2["default"])(function () {
        return resolver && resolver(_this.resolve, _this.reject);
      });
    }
  }

  _createClass(Promise, [{
    key: "callback",
    value: function callback() {
      var _this2 = this;

      return function (err, res) {
        if (err != null) {
          _this2.reject(err);
        } else if (res != null) {
          _this2.resolve(res);
        }
      };
    }
  }, {
    key: "then",
    value: function then(onFulfilled, onRejected) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        function _resolve(val) {
          var next = onFulfilled(val);
          if (next instanceof Promise) {
            next.then(function (val) {
              return resolve(val);
            }, function (err) {
              return reject(err);
            });
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

        if (_this3.resolved) {
          if (_this3.failed) {
            _reject(_this3.error);
          } else {
            _resolve(_this3.value);
          }
        } else {
          _this3.onResolve.push(_resolve);
          _this3.onReject.push(_reject);
        }
      });
    }
  }]);

  return Promise;
})();

exports["default"] = Promise;

Promise.resolved = function resolved(val) {
  return new Promise(function (resolve, reject) {
    return resolve(val);
  });
};

Promise.rejected = function rejected(error) {
  return new Promise(function (resolve, reject) {
    return reject(error);
  });
};

Promise.sequence = function sequence(as) {
  return new Promise(function (resolve, reject) {
    var out = new Array(as.length);
    var done = 0,
        err = false;
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
module.exports = exports["default"];