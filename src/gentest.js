const toStr = Object.prototype.toString;
const fnToStr = Function.prototype.toString;
const isFnRegex = /^\s*function\*/;

function isGen(fn) {
  let test = null;
  try {
    if (window.regeneratorRuntime) {
      /* global regeneratorRuntime */
      test = window.regeneratorRuntime.isGeneratorFunction;
    }
  } catch(e) {}
  try {
    if (global.regeneratorRuntime) {
      /* global regeneratorRuntime */
      test = global.regeneratorRuntime.isGeneratorFunction;
    }
  } catch(e) {}
  if (test !== null) {
    return test(fn);
  }
  if (typeof fn !== 'function') { return false; }
  var fnStr = toStr.call(fn);
  return (fnStr === '[object Function]' || fnStr === '[object GeneratorFunction]') && isFnRegex.test(fnToStr.call(fn));
}

export default isGen;
