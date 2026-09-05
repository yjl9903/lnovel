import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export type TopNovelItem = {
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
  follow?: { feedId: string };
};

export type TopResponse = {
  ok: boolean;
  message?: string;
  data?: { title?: string; items: TopNovelItem[] };
};

export async function parseTopResponse(response: Response) {
  if (!response.ok) throw new Error('Failed to fetch recommendations.');
  const payload = (await response.json()) as TopResponse;
  if (!payload.ok || !payload.data) throw new Error(payload.message || 'No data received.');
  return payload.data;
}

export const topWeekvisitOptions = () =>
  queryOptions({
    queryKey: ['top-weekvisit'],
    queryFn: async ({ signal }) =>
      parseTopResponse(await apiFetch('/api/bili/top/weekvisit', signal)),
    staleTime: 60_000
  });

export async function preloadHome(queryClient: QueryClient) {
  const options = topWeekvisitOptions();
  await queryClient.prefetchQuery(options);
  // A failed SSR prefetch must hydrate as the original loading state, then retry on the client.
  if (queryClient.getQueryState(options.queryKey)?.status === 'error') {
    queryClient.removeQueries({ queryKey: options.queryKey, exact: true });
  }
}
