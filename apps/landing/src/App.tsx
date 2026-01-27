import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent } from 'react';

import feedIcon from './assets/feed.svg';
import foloIcon from './assets/folo.svg';

type TopNovelItem = {
  nid: number;
  title: string;
  cover?: string;
  author?: string;
  library?: string;
  status?: string;
  updatedAt?: string;
  latestChapter?: string;
  description?: string;
  rank?: number;
  follow?: {
    feedId: string;
  };
};

type TopResponse = {
  ok: boolean;
  message?: string;
  data?: {
    title?: string;
    items: TopNovelItem[];
  };
};

const fetchTopWeekvisit = async () => {
  const response = await fetch('/bili/top/weekvisit', {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch recommendations.');
  }

  const payload = (await response.json()) as TopResponse;

  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || 'No data received.');
  }

  return payload.data;
};

const buildNovelUrl = (nid: number) => `https://www.linovelib.com/novel/${nid}.html`;
const buildFeedUrl = (nid: number) => `/bili/novel/${nid}/feed.xml`;
const buildFoloShareUrl = (feedId: string) => `https://app.folo.is/share/feeds/${feedId}`;
const buildFoloDeeplink = (feedId: string, view = 'timeline') => `feed?id=${feedId}&view=${view}`;

const FOLO_APP_PROTOCOL = 'folo';
const FOLO_DEEPLINK_SCHEME = `${FOLO_APP_PROTOCOL}://`;

type CoverProps = {
  src?: string;
  title: string;
  className?: string;
};

function Cover({ src, title, className }: CoverProps) {
  return (
    <div className={`overflow-hidden bg-slate-100 ${className ?? ''}`.trim()}>
      {src ? (
        <img src={src} alt={title} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
          暂无封面
        </div>
      )}
    </div>
  );
}

type RssButtonProps = {
  href: string;
  className?: string;
};

function RssButton({ href, className }: RssButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:border-amber-500 hover:bg-amber-200',
        className
      )}
    >
      <img src={feedIcon} alt="" className="h-3 w-3" />
      RSS
    </a>
  );
}

const openInFoloApp = ({ deeplink, fallbackUrl }: { deeplink: string; fallbackUrl?: string }) => {
  const timeout = 500;
  let isAppOpened = false;

  const handleBlur = () => {
    isAppOpened = true;
    window.removeEventListener('blur', handleBlur);
  };

  window.addEventListener('blur', handleBlur);
  window.location.href = `${FOLO_DEEPLINK_SCHEME}${deeplink}`;

  window.setTimeout(() => {
    window.removeEventListener('blur', handleBlur);
    if (!isAppOpened && fallbackUrl) {
      window.location.href = fallbackUrl;
    }
  }, timeout);
};

type FoloButtonProps = {
  feedId: string;
  className?: string;
};

function FoloButton({ feedId, className }: FoloButtonProps) {
  const feedURL = buildFoloShareUrl(feedId);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!feedId) return;
    event.preventDefault();
    openInFoloApp({
      deeplink: buildFoloDeeplink(feedId),
      fallbackUrl: feedURL
    });
  };

  return (
    <a
      href={feedURL}
      onClick={handleClick}
      target="_blank"
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-[#ff6e2d]/40 bg-[#ff6e2d]/15 px-2 py-0.5 text-[10px] font-medium text-[#ff6e2d] hover:border-[#ff6e2d]/60 hover:bg-[#ff6e2d]/25',
        className
      )}
    >
      <img src={foloIcon} alt="" className="h-3 w-3" />
      Folo
    </a>
  );
}

export default function App() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['top-weekvisit'],
    queryFn: fetchTopWeekvisit
  });

  const items = data?.items ?? [];
  const featured = items.slice(0, 6);
  const rest = items.slice(6);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= featured.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, featured.length]);

  const feedURL = `/bili/top/weekvisit/feed.xml`;
  const foloFeedId = '231789721946592256';
  const foloURL = buildFoloShareUrl(foloFeedId);

  const activeItem = featured[activeIndex];
  const descriptionLineCount = activeItem?.description
    ? activeItem.description.split(/\r?\n+/).filter(Boolean).length
    : 0;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="relative overflow-hidden">
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-8 sm:max-w-[90vw] md:max-w-3xl lg:max-w-5xl">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 p-2">
            <div className="flex items-center gap-4">
              <h1 className="select-none text-2xl font-semibold text-slate-900">lnovel</h1>
              <div className="flex items-center gap-2">
                <RssButton href={feedURL} className="shrink-0" />
                <FoloButton feedId={foloFeedId} className="shrink-0" />
              </div>
            </div>
            <label className="flex flex-1 justify-end">
              <input
                type="search"
                placeholder="开发中..."
                disabled
                className="w-32 lg:w-40 rounded-md border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600 placeholder:text-slate-400"
              />
            </label>
          </header>

          <main className="flex-1">
            {isLoading ? (
              <div className="mt-4 space-y-3">
                {[...Array(4)].map((_, index) => (
                  <div
                    key={`loading-${index}`}
                    className="h-16 rounded-2xl border border-slate-100 bg-slate-50"
                  />
                ))}
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error instanceof Error ? error.message : '加载失败，请稍后再试。'}
              </div>
            ) : null}

            {!isLoading && !error ? (
              <>
                {featured.length > 0 && activeItem ? (
                  <section className="mt-4">
                    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
                      <div className="flex flex-col gap-3">
                        <a
                          href={buildNovelUrl(activeItem.nid)}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          <Cover
                            src={activeItem.cover}
                            title={activeItem.title}
                            className="aspect-[3/4] rounded-2xl"
                          />
                        </a>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <h3 className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900 line-clamp-1">
                            <a
                              href={buildNovelUrl(activeItem.nid)}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 hover:underline"
                            >
                              {activeItem.title}
                            </a>
                            <RssButton href={buildFeedUrl(activeItem.nid)} className="shrink-0" />
                            {activeItem.follow ? (
                              <FoloButton feedId={activeItem.follow.feedId} className="shrink-0" />
                            ) : null}
                          </h3>
                          <p className="mt-2 text-sm text-slate-500">
                            作者 {activeItem.author ?? '未知'}
                            {activeItem.library ? ` · ${activeItem.library}` : ''}
                            {activeItem.status ? ` · ${activeItem.status}` : ''}
                            {activeItem.latestChapter ? (
                              <span className="inline-flex w-fit items-center rounded-full bg-slate-100 ml-4 px-2 py-1 text-xs text-slate-600">
                                最新：{activeItem.latestChapter}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">
                          {activeItem.description}
                        </p>
                        {featured.length > 1 ? (
                          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                            {featured.map((item, index) => (
                              <a
                                key={item.nid}
                                href={buildNovelUrl(item.nid)}
                                target="_blank"
                                rel="noreferrer"
                                onMouseEnter={() => setActiveIndex(index)}
                                onFocus={() => setActiveIndex(index)}
                                className="text-left"
                              >
                                <Cover
                                  src={item.cover}
                                  title={item.title}
                                  className={`aspect-3/4 rounded-xl shadow-sm transition ${
                                    index === activeIndex
                                      ? 'ring-2 ring-slate-300'
                                      : 'hover:ring-2 hover:ring-slate-200'
                                  }`}
                                />
                                <p className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-700">
                                  <span className="min-w-0 truncate">{item.title}</span>
                                </p>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ) : null}

                {rest.length > 0 ? (
                  <ul className="mt-6 space-y-4 max-w-full">
                    {rest.map((item) => (
                      <li
                        key={item.nid}
                        className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm max-w-full"
                      >
                        <a
                          href={buildNovelUrl(item.nid)}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0"
                        >
                          <Cover
                            src={item.cover}
                            title={item.title}
                            className="aspect-3/4 w-16 lg:w-24 rounded-xl"
                          />
                        </a>
                        <div className="flex-auto grow-0">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <a
                                  href={buildNovelUrl(item.nid)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 max-w-40 lg:max-w-full truncate hover:underline"
                                >
                                  {item.title}
                                </a>
                                <RssButton href={buildFeedUrl(item.nid)} className="shrink-0" />
                                {item.follow ? (
                                  <FoloButton feedId={item.follow.feedId} className="shrink-0" />
                                ) : null}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                <span>{item.author ? `${item.author} · ` : ''}</span>
                                <span>{item.status ?? '连载中'}</span>
                                <span className="ml-4 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                                  {item.latestChapter}
                                </span>
                              </p>
                            </div>
                          </div>
                          {item.description ? (
                            <p className="mt-3 line-clamp-4 text-xs text-slate-600">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {items.length === 0 ? (
                  <div className="mt-6 text-sm text-slate-500">暂无榜单数据。</div>
                ) : null}
              </>
            ) : null}
          </main>

          <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500 [&_a]:hover:underline">
            <p>
              <span>
                © 2025{' '}
                <a href="https://github.com/animegarden" target="_blank">
                  Anime Space
                </a>
                .
              </span>
              <span> | </span>
              <span>
                <a href={`https://github.com/yjl9903/lnvoel`} target="_blank">
                  GitHub
                </a>
              </span>
              <span> | </span>
              <span>
                <a href={feedURL} target="_blank">
                  RSS
                </a>
              </span>
              <span> | </span>
              <span>
                <a href={foloURL} target="_blank">
                  Folo
                </a>
              </span>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
