const toStr = Object.prototype.toString;
const fnToStr = Function.prototype.toString;
const isFnRegex = /^\s*function\*/;

function isGen(fn) {
  if (window.regeneratorRuntime) {
    /* global regeneratorRuntime */
    return regeneratorRuntime.isGeneratorFunction(fn);
  }
  if (typeof fn !== 'function') { return false; }
  var fnStr = toStr.call(fn);
  return (fnStr === '[object Function]' || fnStr === '[object GeneratorFunction]') && isFnRegex.test(fnToStr.call(fn));
}

export default isGen;
