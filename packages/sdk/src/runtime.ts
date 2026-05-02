export function describeValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
  return (
    x !== null &&
    typeof x === "object" &&
    typeof (x as PromiseLike<unknown>).then === "function"
  );
}
