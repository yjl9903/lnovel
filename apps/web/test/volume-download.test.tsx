import { act, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVolumeDownload } from '../src/lib/use-volume-download';
import { generateVolumeEpub } from '../src/lib/volume-epub';
import { epubNovel } from './fixtures/epub';

vi.mock('../src/lib/volume-epub', () => ({ generateVolumeEpub: vi.fn() }));
let root: Root;
let dom: JSDOM;
let hook: ReturnType<typeof useVolumeDownload>;
let click = vi.fn<() => void>();
let revoke = vi.fn<(url: string) => void>();
function Harness({ nid = 1 }: { nid?: number }) {
  hook = useVolumeDownload({ ...epubNovel, nid });
  return <p>{hook.active ? 'active' : 'idle'}</p>;
}

function notice() {
  const current = toast.getToasts().at(-1);
  if (!current || 'dismiss' in current) throw new Error('Expected an EPUB toast');
  return current;
}

function invokeAction(label: string) {
  const action = notice().action;
  if (!action || typeof action !== 'object' || !('onClick' in action)) {
    throw new Error('Expected a toast action');
  }
  expect(action.label).toBe(label);
  const event = { preventDefault: vi.fn() };
  action.onClick(event as unknown as MouseEvent<HTMLButtonElement>);
  expect(event.preventDefault).toHaveBeenCalledOnce();
}

beforeEach(async () => {
  dom = new JSDOM('<div id="root"></div>', {
    url: 'https://local.example',
    pretendToBeVisual: true
  });
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  toast.dismiss();
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  click = vi.fn();
  vi.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  revoke = vi.fn();
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
  vi.mocked(generateVolumeEpub)
    .mockReset()
    .mockResolvedValue({
      blob: new Blob(['epub']),
      filename: 'test.epub'
    });
  root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('does not generate on mount, blocks duplicate clicks and releases download URLs', async () => {
  expect(generateVolumeEpub).not.toHaveBeenCalled();
  await act(async () => {
    const first = hook.start(epubNovel.volumes[0]);
    const second = hook.start(epubNovel.volumes[0]);
    await Promise.all([first, second]);
  });
  expect(generateVolumeEpub).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector('a')).toBeNull();
  expect(hook.active).toBe(false);
  expect(toast.getToasts()).toHaveLength(1);
  expect(notice()).toMatchObject({
    type: 'success',
    title: '已开始下载。',
    description: '第一卷',
    duration: 8000,
    dismissible: true
  });
  expect(notice().action).toBeUndefined();
  await act(async () => root.render(<Harness nid={2} />));
  expect(revoke).toHaveBeenCalledWith('blob:test');
  expect(hook.active).toBe(false);
  expect(toast.getToasts()).toHaveLength(0);
});

it('shows failures and allows an explicit retry', async () => {
  vi.mocked(generateVolumeEpub).mockRejectedValueOnce(new Error('封面失败'));
  await act(async () => {
    await hook.start(epubNovel.volumes[0]);
  });
  expect(hook.active).toBe(false);
  expect(notice()).toMatchObject({ type: 'error', title: '封面失败', duration: 8000 });
  const id = notice().id;
  expect(click).not.toHaveBeenCalled();
  await act(async () => {
    invokeAction('重试');
  });
  expect(click).toHaveBeenCalledOnce();
  expect(notice()).toMatchObject({ id, type: 'success' });
});

it('cancels in-flight generation without downloading, then permits retry', async () => {
  vi.mocked(generateVolumeEpub).mockImplementationOnce(async ({ signal, onProgress }) => {
    onProgress({ phase: 'chapters', current: 1, total: 2 });
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  });
  let pending: Promise<void>;
  await act(async () => {
    pending = hook.start(epubNovel.volumes[0]);
  });
  expect(hook.active).toBe(true);
  expect(toast.getToasts()).toHaveLength(1);
  expect(notice()).toMatchObject({
    title: '获取正文 1/2',
    type: 'loading',
    duration: Infinity,
    dismissible: false,
    closeButton: false
  });
  const id = notice().id;
  await act(async () => {
    invokeAction('取消');
    await pending;
  });
  expect(click).not.toHaveBeenCalled();
  expect(hook.active).toBe(false);
  expect(notice()).toMatchObject({ id, type: 'info', title: '已取消。' });
  expect(notice().action).toBeUndefined();
  await act(async () => {
    await hook.start(epubNovel.volumes[0]);
  });
  expect(click).toHaveBeenCalledOnce();
});

it('aborts on navigation and discards a late result even if generation ignores cancellation', async () => {
  let finish!: (result: Awaited<ReturnType<typeof generateVolumeEpub>>) => void;
  vi.mocked(generateVolumeEpub).mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  let pending: Promise<void>;
  await act(async () => {
    pending = hook.start(epubNovel.volumes[0]);
  });
  const signal = vi.mocked(generateVolumeEpub).mock.calls[0][0].signal;
  await act(async () => root.render(<Harness nid={2} />));
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish({ blob: new Blob(['epub']), filename: 'late.epub' });
    await pending;
  });
  expect(click).not.toHaveBeenCalled();
  expect(hook.active).toBe(false);
  expect(toast.getToasts()).toHaveLength(0);
});
