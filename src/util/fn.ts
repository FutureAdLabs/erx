export function tryFn<A, B>(fn: (val: A) => B, val: A, onValue: (val: B) => void, onError: (err: Error) => void) {
  let v: any;
  try {
    v = fn(val);
  } catch (e) {
    onError(e);
    return;
  }
  onValue(v);
}
