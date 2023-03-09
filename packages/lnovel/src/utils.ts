export function padNumber(n: number | string, fill = '0', len = 2) {
  const s = String(n);
  return fill.repeat(Math.max(0, len - s.length)) + s;
}
