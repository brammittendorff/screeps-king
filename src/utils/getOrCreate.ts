export function getOrCreate<T>(obj: any, key: string, def: T): T {
  if (!obj[key]) obj[key] = def;
  return obj[key];
} 