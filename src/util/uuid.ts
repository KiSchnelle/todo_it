// Both Node 20+ and modern browsers expose `crypto.randomUUID` on `globalThis`.
// Importing `node:crypto` here would break the web extension bundle.
export function newId(): string {
  return (globalThis as { crypto: { randomUUID: () => string } }).crypto.randomUUID();
}
