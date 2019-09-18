const toStr = Object.prototype.toString;
const fnToStr = Function.prototype.toString;
const isFnRegex = /^\s*function\*/;

export default function isGen(fn: any): fn is GeneratorFunction {
  let test: (maybeGen: any) => maybeGen is GeneratorFunction = null;
  try {
    // @ts-ignore
    if (window.regeneratorRuntime) {
      /* global regeneratorRuntime */
      // @ts-ignore
      test = window.regeneratorRuntime.isGeneratorFunction;
    }
  } catch (e) { }
  try {
    // @ts-ignore
    if (global.regeneratorRuntime) {
      /* global regeneratorRuntime */
      // @ts-ignore
      test = global.regeneratorRuntime.isGeneratorFunction;
    }
  } catch (e) { }
  if (test !== null) {
    return test(fn);
  }
  if (typeof fn !== 'function') { return false; }
  var fnStr = toStr.call(fn);
  return (fnStr === '[object Function]' || fnStr === '[object GeneratorFunction]') && isFnRegex.test(fnToStr.call(fn));
}
