import { createFileRoute, notFound, useRouter } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { novelHead, novelOptions, parseNovelId, preloadNovel } from '../lib/novel';
import { NovelDetail, NovelLayout, NovelLoading, NovelNotFound } from '../components/novel-detail';

export const Route = createFileRoute('/bili/novel/$nid')({
  loader: async ({ context, params }) => {
    const nid = parseNovelId(params.nid);
    if (nid === undefined) throw notFound();
    const novel = await preloadNovel(context.queryClient, nid);
    if (novel === null) throw notFound();
    return novel;
  },
  head: ({ loaderData, match }) => novelHead(match.status === 'notFound' ? null : loaderData),
  notFoundComponent: NovelNotFound,
  pendingComponent: NovelLoading,
  component: NovelPage
});

function NovelPage() {
  const { nid } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const router = useRouter();
  const { data, error, isPending, refetch } = useQuery(novelOptions(Number(nid)));

  // Re-run the cached loader to refresh route head metadata after browser recovery/refetch.
  useEffect(() => {
    if (data !== undefined && data !== loaderData) void router.invalidate();
  }, [data, loaderData, router]);

  if (data === null) throw notFound();
  if (data) return <NovelDetail novel={data} />;
  if (isPending) return <NovelLoading />;
  return (
    <NovelLayout>
      <section
        role="alert"
        className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
      >
        <h1 className="font-semibold">加载失败</h1>
        <p>{error?.message || '请稍后再试。'}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border border-rose-300 px-4 py-2 hover:bg-rose-100"
        >
          重试
        </button>
      </section>
    </NovelLayout>
  );
}
