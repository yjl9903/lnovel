import { JSDOM } from 'jsdom';

export function sleep(timeout: number) {
  return new Promise<void>((res) => setTimeout(res, timeout));
}

export function parseShanghaiDateTime(input: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(input.trim());
  if (!match) return undefined;

  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;
  const date = new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh) - 8, // shift from UTC+8 to UTC
      Number(mm),
      Number(ss)
    )
  );

  return !Number.isNaN(date.getTime()) ? date : undefined;
}

export function applyTransformImgSrc(
  src: string,
  transformImgSrc?: string | ((url: string) => string | undefined | null)
) {
  if (!src || !transformImgSrc) return src ?? undefined;
  if (typeof transformImgSrc === 'function') {
    const next = transformImgSrc(src);
    return next ?? src;
  }
  const replacement = transformImgSrc.endsWith('/') ? transformImgSrc : `${transformImgSrc}/`;
  return src.replace(/^https?:\/\/[^/]+\/?/, replacement);
}

export function createDocument(html: string): Document {
  return new JSDOM(html).window.document;
}

export function isCloudflareDocument(document: Document) {
  if (document.querySelector('#cf-wrapper')) return true;
  if (document.querySelector('.ray-id')) return true;
  return false;
}

export function splitUrlForFetch(target: URL) {
  const entries = Array.from(target.searchParams.entries());
  const query = entries.length ? Object.fromEntries(entries) : undefined;
  return {
    path: target.pathname,
    query
  };
}

export function parsePositiveInteger(input: string | null | undefined): number | undefined {
  if (input === null || input === undefined) return undefined;
  const value = Number(input);
  if (!Number.isFinite(value)) return undefined;
  const num = Math.floor(value);
  return num > 0 ? num : undefined;
}

export function resolveMappedKey<T extends Record<string, number | string>>(
  map: T,
  value: keyof T | T[keyof T] | undefined,
  fallback: keyof T
): keyof T {
  if (value === undefined) return fallback;
  if (Object.prototype.hasOwnProperty.call(map, value as keyof T)) {
    return value as keyof T;
  }
  const matched = (Object.keys(map) as Array<keyof T>).find((key) => map[key] === value);
  return matched ?? fallback;
}

export function resolveMappedValue<T extends Record<string, number | string>>(
  map: T,
  value: keyof T | T[keyof T] | undefined,
  fallback: keyof T
): T[keyof T] {
  if (value === undefined) return map[fallback];
  if (Object.prototype.hasOwnProperty.call(map, value as keyof T)) {
    return map[value as keyof T];
  }
  const matched = Object.values(map).find((item) => item === value);
  return matched ?? (map[fallback] as any);
}

export function parseMappedParam<T extends Record<string, number | string>>(
  map: T,
  input: string | null | undefined
): keyof T | T[keyof T] | undefined {
  if (input === null || input === undefined) return undefined;
  const value = input.trim();
  if (!value) return undefined;

  const keyMatch = (Object.keys(map) as Array<keyof T>).find(
    (key) => key.toString().toLowerCase() === value.toLowerCase()
  );
  if (keyMatch) return keyMatch;

  const parsed: string | number = /^\d+$/.test(value) ? Number(value) : value;
  const valMatch = (Object.values(map) as Array<T[keyof T]>).find((item) => {
    if (typeof item === 'number' && typeof parsed === 'number') return item === parsed;
    if (typeof item === 'string' && typeof parsed === 'string') {
      return item.toLowerCase() === parsed.toLowerCase();
    }
    return item === (parsed as any);
  });

  return valMatch;
}

export type QueryValue = string | number | boolean | null | undefined;

export function getSearchParams(
  input: string | URL | URLSearchParams | Record<string, QueryValue | QueryValue[]>
) {
  if (input instanceof URLSearchParams) return input;
  if (input instanceof URL) return input.searchParams;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('?')) return new URLSearchParams(trimmed.slice(1));
    try {
      const url = new URL(trimmed, trimmed.includes('://') ? undefined : 'https://example.com');
      if (url.search || trimmed.includes('?') || !trimmed.includes('=')) {
        return url.searchParams;
      }
    } catch {
      // ignore and fallback to parsing as query string
    }
    return new URLSearchParams(trimmed);
  }

  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const list = Array.isArray(value) ? value : [value];
    list.forEach((item) => params.append(key, String(item)));
  });
  return params;
}
