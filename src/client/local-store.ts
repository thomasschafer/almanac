import type { z } from "zod";

/**
 * Small values kept on this device only, such as dismissed notices and an offline copy of each
 * tool's state. Anything that fails to parse is reported and dropped, as it's only ever a cache.
 */
export function readLocal<S extends z.ZodType>(key: string, schema: S): z.infer<S> | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    console.error(`dropping unreadable local value ${key}`, error);
    localStorage.removeItem(key);
    return null;
  }
}

export function writeLocal(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
