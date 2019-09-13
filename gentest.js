"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var toStr = Object.prototype.toString;
var fnToStr = Function.prototype.toString;
var isFnRegex = /^\s*function\*/;
function isGen(fn) {
    var test = null;
    try {
        // @ts-ignore
        if (window.regeneratorRuntime) {
            /* global regeneratorRuntime */
            // @ts-ignore
            test = window.regeneratorRuntime.isGeneratorFunction;
        }
    }
    catch (e) { }
    try {
        // @ts-ignore
        if (global.regeneratorRuntime) {
            /* global regeneratorRuntime */
            // @ts-ignore
            test = global.regeneratorRuntime.isGeneratorFunction;
        }
    }
    catch (e) { }
    if (test !== null) {
        return test(fn);
    }
    if (typeof fn !== 'function') {
        return false;
    }
    var fnStr = toStr.call(fn);
    return (fnStr === '[object Function]' || fnStr === '[object GeneratorFunction]') && isFnRegex.test(fnToStr.call(fn));
}
exports.default = isGen;
