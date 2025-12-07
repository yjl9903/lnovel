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
