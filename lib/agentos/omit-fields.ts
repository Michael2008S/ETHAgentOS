type RemainingFields<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Copy an object's own enumerable fields except the named commitment/private fields. */
export function omitFields<T extends object, const K extends readonly (keyof T)[]>(value: T, ...keys: K): RemainingFields<T, K[number]> {
  const excluded = new Set<PropertyKey>(keys.map(key => typeof key === 'number' ? String(key) : key));
  return Object.fromEntries(
    Reflect.ownKeys(value)
      .filter(key => !excluded.has(key) && Object.prototype.propertyIsEnumerable.call(value, key))
      .map(key => [key, value[key as keyof T]]),
  ) as RemainingFields<T, K[number]>;
}
