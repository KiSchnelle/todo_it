export function main(): void {
  // TODO: wire up the real entry point
  const todos = collect(); // not a tag: "todos" is a plain word
  // FIXME: handle the empty case before shipping
  console.log(todos);
}

function collect(): string[] {
  return []; // NOTE: returns empty for now
}
