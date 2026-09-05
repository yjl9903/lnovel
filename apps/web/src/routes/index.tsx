import { createFileRoute } from '@tanstack/react-router';
import App from '../App';
import { preloadHome } from '../lib/top';
import { site } from '../lib/site';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: site.name },
      { name: 'description', content: site.description },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: site.name },
      { property: 'og:title', content: site.name },
      { property: 'og:description', content: site.description },
      { property: 'og:url', content: site.url },
      { property: 'og:locale', content: 'zh_CN' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: site.name },
      { name: 'twitter:description', content: site.description },
      {
        'script:ld+json': {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: site.name,
          url: site.url,
          description: site.description,
          inLanguage: 'zh-Hans'
        }
      }
    ],
    links: [{ rel: 'canonical', href: site.url }]
  }),
  loader: ({ context }) => preloadHome(context.queryClient),
  component: App
});
