import type { ImageMediaType } from '@epubook/core';

export function imageProxyUrl(src: string, origin: string): string {
  let url: URL;
  try {
    url = new URL(src, origin);
  } catch {
    throw new Error('图片地址无效。');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('图片地址无效。');
  }
  let pathname = url.pathname;
  if (pathname.startsWith('/bili/files/') || pathname.startsWith('/bili/img3/')) {
    // Saved API data may contain a previous deployment's origin.
  } else if (
    pathname.startsWith('/files/') &&
    (url.origin === origin || url.hostname === 'www.linovelib.com')
  ) {
    pathname = '/bili' + pathname;
  } else if (url.hostname === 'img3.readpai.com') {
    pathname = '/bili/img3' + pathname;
  } else {
    throw new Error('图片地址不支持现有代理，无法下载完整 EPUB。');
  }
  return new URL(pathname + url.search, origin).href;
}

type EpubImage = { data: Uint8Array<ArrayBuffer>; extension: string; mediaType: ImageMediaType };

export async function prepareImage(
  input: Uint8Array<ArrayBuffer>,
  signal: AbortSignal
): Promise<EpubImage> {
  signal.throwIfAborted();
  const ascii = (start: number, end: number) => String.fromCharCode(...input.subarray(start, end));
  const begins = (signature: number[]) => signature.every((value, index) => input[index] === value);
  if (begins([137, 80, 78, 71, 13, 10, 26, 10])) {
    return { data: input, extension: 'png', mediaType: 'image/png' };
  }
  if (begins([255, 216, 255])) {
    return { data: input, extension: 'jpg', mediaType: 'image/jpeg' };
  }
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    return { data: input, extension: 'gif', mediaType: 'image/gif' };
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { data: input, extension: 'webp', mediaType: 'image/webp' };
  }
  const brands = [];
  if (ascii(4, 8) === 'ftyp') {
    const boxSize = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0);
    for (let i = 8; i + 4 <= Math.min(boxSize, input.length); i += 4) {
      if (i !== 12) brands.push(ascii(i, i + 4));
    }
  }
  if (!brands.some((brand) => brand === 'avif' || brand === 'avis')) {
    throw new Error('图片格式无法识别，无法下载完整 EPUB。');
  }

  const bitmap = await createImageBitmap(new Blob([input], { type: 'image/avif' }));
  const canvas = document.createElement('canvas');
  try {
    signal.throwIfAborted();
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法转换 AVIF 图片。');
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('AVIF 图片转换失败。'))),
        'image/png'
      )
    );
    signal.throwIfAborted();
    return {
      data: new Uint8Array(await png.arrayBuffer()),
      extension: 'png',
      mediaType: 'image/png'
    };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
