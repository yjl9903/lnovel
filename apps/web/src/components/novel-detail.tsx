import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { authorRole, formatNovelDate, type Novel } from '../lib/novel';
import { buildFeedUrl, buildNovelUrl, buildVolumeUrl } from '../lib/novel-links';
import { Cover, FoloButton, RssButton, NovelTag, SourceButton } from './novel-shared';
import { SiteFooter } from './site-footer';
import { Skeleton } from './ui/skeleton';
import { Badge } from './ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import { Download04Icon } from '@hugeicons/core-free-icons';
import { useVolumeDownload } from '../lib/use-volume-download';

export function NovelLayout({ children, novel }: { children: ReactNode; novel?: Novel }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10 pt-8 sm:max-w-[90vw] md:max-w-3xl lg:max-w-5xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 p-2">
          <Link to="/" className="text-2xl font-semibold">
            lnovel
          </Link>
        </header>
        <main className="min-w-0 flex-1 pt-4">{children}</main>
        <SiteFooter
          feedUrl={novel ? buildFeedUrl(novel.nid) : '/bili/top/weekvisit/feed.xml'}
          foloFeedId={novel?.follow?.feedId}
        />
      </div>
    </div>
  );
}

export function NovelNotFound() {
  return (
    <NovelLayout>
      <section className="space-y-3 py-12">
        <p className="text-sm text-slate-500">404</p>
        <h1 className="text-2xl font-semibold">小说不存在</h1>
      </section>
    </NovelLayout>
  );
}

export function NovelLoading() {
  return (
    <NovelLayout>
      <div role="status" aria-label="加载中" className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-24" />
      </div>
    </NovelLayout>
  );
}

export function NovelDetail({ novel }: { novel: Novel }) {
  const download = useVolumeDownload(novel);
  return (
    <NovelLayout novel={novel}>
      {novel.isDeleted ? (
        <p
          role="status"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          作品已下架，以下为已保存的信息。
        </p>
      ) : null}
      <section
        aria-labelledby="novel-name"
        className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]"
      >
        <Cover
          src={novel.cover}
          title={novel.name}
          className="aspect-[3/4] w-full self-start rounded-2xl sm:row-span-2"
        />
        <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
          <h1 id="novel-name" className="text-lg font-semibold">
            {novel.name}
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            {novel.authors.length
              ? novel.authors
                  .map(({ name, position }) => `${authorRole(position)}：${name}`)
                  .join(' · ')
              : '作者：未知'}
          </p>
          {novel.labels.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="作品标签">
              {novel.labels.map((label, index) => (
                <li key={`${label}-${index}`} className="min-w-0 max-w-full">
                  <NovelTag>{label}</NovelTag>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-slate-500">
            更新于 <time dateTime={novel.updatedAt}>{formatNovelDate(novel.updatedAt)}</time>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-start-2 sm:self-start">
          <RssButton href={buildFeedUrl(novel.nid)} />
          {novel.follow?.feedId ? <FoloButton feedId={novel.follow.feedId} /> : null}
          <SourceButton href={buildNovelUrl(novel.nid)} />
        </div>
      </section>

      <section aria-labelledby="novel-description" className="mt-10">
        <h2 id="novel-description" className="border-b border-slate-200 pb-3 text-lg font-semibold">
          作品简介
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600 [overflow-wrap:anywhere]">
          {novel.description || '暂无简介。'}
        </p>
      </section>

      <section aria-labelledby="novel-volumes" className="mt-10">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <h2 id="novel-volumes" className="text-lg font-semibold">
            分卷
          </h2>
          <span className="text-sm text-slate-500">共 {novel.volumes.length} 卷</span>
        </div>
        {novel.volumes.length ? (
          <ul className="divide-y divide-slate-100">
            {novel.volumes.map((vol) => (
              <li key={vol.vid} className="flex gap-4 py-5">
                <a
                  href={buildVolumeUrl(novel.nid, vol.vid)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                >
                  <Cover
                    src={vol.cover}
                    title={vol.title}
                    className="aspect-[3/4] w-14 rounded-lg sm:w-16"
                  />
                </a>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    {vol.volume && vol.volume !== vol.title ? (
                      <p className="mb-1 text-xs text-slate-500">{vol.volume}</p>
                    ) : null}
                    <h3 className="text-sm font-medium">
                      <a
                        href={buildVolumeUrl(novel.nid, vol.vid)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {vol.title}
                      </a>
                    </h3>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <RssButton href={buildFeedUrl(novel.nid, vol.vid)} />
                    <Badge
                      render={
                        <button
                          type="button"
                          disabled={download.active}
                          aria-label={'下载 EPUB：' + vol.title}
                          onClick={() => void download.start(vol)}
                        />
                      }
                      variant="outline"
                      className="cursor-pointer hover:bg-muted disabled:cursor-wait disabled:opacity-50"
                    >
                      <HugeiconsIcon icon={Download04Icon} strokeWidth={2} aria-hidden="true" />
                      下载 EPUB
                    </Badge>
                    <SourceButton href={buildVolumeUrl(novel.nid, vol.vid)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">暂无分卷信息。</p>
        )}
      </section>
    </NovelLayout>
  );
}
