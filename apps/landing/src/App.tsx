import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

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
  foloFeedId?: string | null;
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
};

function RssButton({ href }: RssButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:border-amber-300 hover:bg-amber-200"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
        <path d="M5.07 2.82a1 1 0 0 0 0 2 13.11 13.11 0 0 1 13.11 13.1 1 1 0 1 0 2 0c0-8.34-6.78-15.1-15.1-15.1Z" />
        <path d="M5.07 8.64a1 1 0 1 0 0 2 7.29 7.29 0 0 1 7.29 7.28 1 1 0 0 0 2 0 9.29 9.29 0 0 0-9.29-9.28Z" />
        <circle cx="6.29" cy="17.71" r="2.29" />
      </svg>
      RSS
    </a>
  );
}

type FoloButtonProps = {
  href: string;
};

function FoloButton({ href }: FoloButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      className="inline-flex items-center gap-1 rounded-full border border-[#ff6e2d]/40 bg-[#ff6e2d]/15 px-2 py-0.5 text-[10px] font-medium text-[#ff6e2d] hover:border-[#ff6e2d]/60 hover:bg-[#ff6e2d]/25"
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
                <RssButton href="/bili/top/weekvisit/feed.xml"></RssButton>
                <FoloButton href="https://app.folo.is/share/feeds/231789721946592256" />
              </div>
            </div>
            <label className="flex flex-1 justify-end">
              <input
                type="search"
                placeholder="开发中..."
                disabled
                className="w-40 rounded-md border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600 placeholder:text-slate-400"
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
                          <h3 className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
                            <a
                              href={buildNovelUrl(activeItem.nid)}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 hover:underline"
                            >
                              {activeItem.title}
                            </a>
                            <RssButton href={buildFeedUrl(activeItem.nid)} />
                            {activeItem.foloFeedId ? (
                              <FoloButton href={buildFoloShareUrl(activeItem.foloFeedId)} />
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
                                  className={`aspect-[3/4] rounded-xl shadow-sm transition ${
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
                  <ul className="mt-6 space-y-4">
                    {rest.map((item) => (
                      <li
                        key={item.nid}
                        className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
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
                            className="aspect-[3/4] w-24 rounded-xl"
                          />
                        </a>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <a
                                  href={buildNovelUrl(item.nid)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 truncate hover:underline"
                                >
                                  {item.title}
                                </a>
                                <RssButton href={buildFeedUrl(item.nid)} />
                                {item.foloFeedId ? (
                                  <FoloButton href={buildFoloShareUrl(item.foloFeedId)} />
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

          <footer className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
            <p>© 2025 lnovel</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
