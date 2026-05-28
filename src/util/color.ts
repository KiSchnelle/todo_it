// Allowlist of characters safe inside an SVG attribute and a CSS color value.
// Permits hex (#abc), rgb()/rgba()/hsl()/hsla(), and named colors, while
// rejecting anything that could break out of an XML attribute (< > " ' &).
const SAFE_COLOR = /^[#0-9a-zA-Z(),.%\s/-]{1,64}$/;

/** Returns the color if it is a safe color literal, otherwise undefined. */
export function sanitizeColor(input: string | undefined): string | undefined {
  return input && SAFE_COLOR.test(input) ? input : undefined;
}
