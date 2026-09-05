import { buildFoloShareUrl } from '../lib/novel-links';

export function SiteFooter({ feedUrl, foloFeedId }: { feedUrl: string; foloFeedId?: string }) {
  return (
    <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500 [&_a]:hover:underline">
      <p>
        © 2025{' '}
        <a href="https://github.com/animegarden" target="_blank" rel="noreferrer">
          Anime Space
        </a>
        . |{' '}
        <a href="https://github.com/yjl9903/lnovel" target="_blank" rel="noreferrer">
          GitHub
        </a>
        {' | '}
        <a href={feedUrl} target="_blank" rel="noreferrer">
          RSS
        </a>
        {foloFeedId ? (
          <>
            {' | '}
            <a href={buildFoloShareUrl(foloFeedId)} target="_blank" rel="noreferrer">
              Folo
            </a>
          </>
        ) : null}
      </p>
    </footer>
  );
}
