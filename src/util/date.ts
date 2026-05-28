function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a due-date expression into an ISO `YYYY-MM-DD` string, or `undefined` if invalid.
 * Accepts an exact date (`2026-06-01`), `today`, `tomorrow`, or a relative offset like
 * `3 days`, `2w`, `1 month`, `in 2 weeks`. The `now` parameter exists for testing.
 */
export function parseDueDate(input: string, now: Date = new Date()): string | undefined {
  const s = input.trim().toLowerCase();
  if (!s) {
    return undefined;
  }
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (s === "today") {
    return toIso(base);
  }
  if (s === "tomorrow") {
    base.setDate(base.getDate() + 1);
    return toIso(base);
  }

  const exact = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (exact) {
    const [y, m, d] = [Number(exact[1]), Number(exact[2]), Number(exact[3])];
    const date = new Date(y, m - 1, d);
    const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
    return valid ? toIso(date) : undefined;
  }

  const rel = /^(?:in\s+)?(\d+)\s*(d|days?|w|wks?|weeks?|m|mo|months?|y|yrs?|years?)$/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    if (unit.startsWith("d")) {
      base.setDate(base.getDate() + n);
    } else if (unit.startsWith("w")) {
      base.setDate(base.getDate() + n * 7);
    } else if (unit.startsWith("y")) {
      base.setFullYear(base.getFullYear() + n);
    } else {
      base.setMonth(base.getMonth() + n);
    }
    return toIso(base);
  }

  return undefined;
}
