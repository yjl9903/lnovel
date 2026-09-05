import { site } from '../lib/site';

export const robots = `User-agent: *
Allow: /
Disallow: /bili$
Disallow: /bili?
Disallow: /bili/
Allow: /bili/files/
Allow: /bili/img3/
Disallow: /health
Disallow: /_serverFn

Sitemap: ${new URL('/sitemap.xml', site.url).href}
`;

const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (char) => {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!;
  });

export const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${escapeXml(site.url)}</loc></url>
</urlset>
`;
