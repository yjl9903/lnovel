import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTopResponse, preloadHome, topWeekvisitOptions } from '../src/lib/top';
import { apiFetch } from '../src/lib/api';
import { createHomeStore } from '../src/lib/home-store';

vi.mock('../src/lib/api', () => ({ apiFetch: vi.fn() }));
const data = { items: [{ nid: 1, title: '测试小说' }] };
beforeEach(() => vi.mocked(apiFetch).mockReset());

describe('home query lifecycle', () => {
  it('hydrates prefetched data without fetching again while fresh', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ ok: true, data }));
    const server = new QueryClient();
    await preloadHome(server);
    const client = new QueryClient();
    hydrate(client, dehydrate(server));
    expect(await client.fetchQuery(topWeekvisitOptions())).toEqual(data);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/bili/top/weekvisit', expect.any(AbortSignal));
    server.clear();
    client.clear();
  });

  it('clears a failed SSR prefetch so the client can retry', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await preloadHome(client);
    expect(client.getQueryState(['top-weekvisit'])).toBeUndefined();
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: true, data }));
    expect(await client.fetchQuery(topWeekvisitOptions())).toEqual(data);
    client.clear();
  });

  it('does not share query or UI state between instances', async () => {
    const first = new QueryClient();
    const second = new QueryClient();
    first.setQueryData(['top-weekvisit'], data);
    expect(second.getQueryData(['top-weekvisit'])).toBeUndefined();
    const a = createHomeStore();
    const b = createHomeStore();
    a.setState(() => ({ activeIndex: 5 }));
    expect(b.state.activeIndex).toBe(0);
    first.clear();
    second.clear();
  });

  it('preserves empty data and existing error messages', async () => {
    expect(await parseTopResponse(Response.json({ ok: true, data: { items: [] } }))).toEqual({
      items: []
    });
    await expect(parseTopResponse(new Response(null, { status: 500 }))).rejects.toThrow(
      'Failed to fetch recommendations.'
    );
    await expect(
      parseTopResponse(Response.json({ ok: false, message: 'upstream error' }))
    ).rejects.toThrow('upstream error');
    await expect(parseTopResponse(Response.json({ ok: true }))).rejects.toThrow(
      'No data received.'
    );
  });
});
