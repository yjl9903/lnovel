import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useStore } from '@tanstack/react-store';
import { topWeekvisitOptions } from './lib/top';
import { createHomeStore } from './lib/home-store';
import { buildFeedUrl } from './lib/novel-links';
import { Cover, RssButton, FoloButton, NovelTag } from './components/novel-shared';
import { SiteFooter } from './components/site-footer';
import { Skeleton } from './components/ui/skeleton';

export default function App() {
  const { data, isLoading, error } = useQuery(topWeekvisitOptions());

  const items = data?.items ?? [];
  const featured = items.slice(0, 6);
  const rest = items.slice(6);
  const [store] = useState(createHomeStore);
  const activeIndex = useStore(store, (state) => state.activeIndex);
  const setActiveIndex = (activeIndex: number) => store.setState(() => ({ activeIndex }));

  useEffect(() => {
    if (activeIndex >= featured.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, featured.length]);

  const feedURL = `/bili/top/weekvisit/feed.xml`;
  const foloFeedId = '231789721946592256';

  const activeItem = featured[activeIndex];

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
              <div role="status" aria-label="加载中" className="mt-4 space-y-3">
                {[...Array(4)].map((_, index) => (
                  <Skeleton key={`loading-${index}`} className="h-16" />
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
                        <Link
                          to="/bili/novel/$nid"
                          params={{ nid: String(activeItem.nid) }}
                          className="block"
                        >
                          <Cover
                            src={activeItem.cover}
                            title={activeItem.title}
                            className="aspect-[3/4] rounded-2xl"
                          />
                        </Link>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div>
                          <h3 className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900 line-clamp-1">
                            <Link
                              to="/bili/novel/$nid"
                              params={{ nid: String(activeItem.nid) }}
                              className="min-w-0 hover:underline"
                            >
                              {activeItem.title}
                            </Link>
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
                              <NovelTag className="ml-4 align-middle">
                                最新：{activeItem.latestChapter}
                              </NovelTag>
                            ) : null}
                          </p>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">
                          {activeItem.description}
                        </p>
                        {featured.length > 1 ? (
                          <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                            {featured.map((item, index) => (
                              <Link
                                key={item.nid}
                                to="/bili/novel/$nid"
                                params={{ nid: String(item.nid) }}
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
                              </Link>
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
                        <Link
                          to="/bili/novel/$nid"
                          params={{ nid: String(item.nid) }}
                          className="shrink-0"
                        >
                          <Cover
                            src={item.cover}
                            title={item.title}
                            className="aspect-3/4 w-16 lg:w-24 rounded-xl"
                          />
                        </Link>
                        <div className="flex-auto grow-0">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Link
                                  to="/bili/novel/$nid"
                                  params={{ nid: String(item.nid) }}
                                  className="min-w-0 max-w-40 lg:max-w-full truncate hover:underline"
                                >
                                  {item.title}
                                </Link>
                                <RssButton href={buildFeedUrl(item.nid)} className="shrink-0" />
                                {item.follow ? (
                                  <FoloButton feedId={item.follow.feedId} className="shrink-0" />
                                ) : null}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                <span>{item.author ? `${item.author} · ` : ''}</span>
                                <span>{item.status ?? '连载中'}</span>
                                {item.latestChapter ? (
                                  <NovelTag className="ml-4 align-middle">
                                    {item.latestChapter}
                                  </NovelTag>
                                ) : null}
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

          <SiteFooter feedUrl={feedURL} foloFeedId={foloFeedId} />
        </div>
      </div>
    </div>
  );
}
