export function resolveLink(base: URL, link: string): string {
  try {
    return new URL(link).toString();
  } catch {
    return new URL(link, base).toString();
  }
}

export function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
