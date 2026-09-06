import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Novel } from './novel';
import type { EpubProgress, VolumeSummary } from './volume-epub';

function progressText(progress: EpubProgress) {
  switch (progress.phase) {
    case 'preparing':
      return '正在准备…';
    case 'chapters':
      return '获取正文 ' + progress.current + '/' + progress.total;
    case 'images':
      return '获取图片 ' + progress.current + '/' + progress.total;
    case 'bundling':
      return '正在打包…';
  }
}

function saveEpub(blob: Blob, filename: string, releases: Set<() => void>) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  const release = () => {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
    releases.delete(release);
  };
  // Keep the URL alive briefly for browsers that consume it after click returns.
  const timer = setTimeout(release, 30_000);
  releases.add(release);
  try {
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
  }
}

export function useVolumeDownload(novel: Novel) {
  const [active, setActive] = useState(false);
  const toastId = 'epub-download-' + useId();
  const task = useRef<AbortController | undefined>(undefined);
  const releases = useRef(new Set<() => void>());

  useEffect(() => {
    setActive(false);
    return () => {
      task.current?.abort();
      task.current = undefined;
      toast.dismiss(toastId);
      for (const release of releases.current) release();
    };
  }, [novel.nid, toastId]);

  async function start(volume: VolumeSummary) {
    if (task.current) return;
    const controller = new AbortController();
    task.current = controller;
    setActive(true);
    const description = volume.title;
    const finished = {
      id: toastId,
      description,
      duration: 4_000,
      dismissible: true,
      closeButton: true,
      action: undefined
    };
    const progress = (message: string) => {
      if (task.current !== controller) return;
      toast.loading(message, {
        id: toastId,
        description,
        duration: Infinity,
        dismissible: false,
        closeButton: false,
        action: {
          label: '取消',
          onClick: (event) => {
            // Keep the notification visible until cancellation settles.
            event.preventDefault();
            if (task.current !== controller) return;
            controller.abort();
            progress('正在取消…');
          }
        }
      });
    };
    progress('正在准备 EPUB…');
    try {
      const { generateVolumeEpub } = await import('./volume-epub');
      controller.signal.throwIfAborted();
      const result = await generateVolumeEpub({
        novel,
        volume,
        origin: window.location.origin,
        signal: controller.signal,
        onProgress: (value) => progress(progressText(value))
      });
      controller.signal.throwIfAborted();
      saveEpub(result.blob, result.filename, releases.current);
      if (task.current === controller) {
        toast.success('已开始下载。', { ...finished, duration: 8_000 });
      }
    } catch (error) {
      if (task.current !== controller) return;
      if (controller.signal.aborted) {
        toast.info('已取消。', finished);
      } else {
        toast.error(error instanceof Error ? error.message : '下载失败，请稍后重试。', {
          ...finished,
          duration: 8_000,
          action: {
            label: '重试',
            onClick: (event) => {
              event.preventDefault();
              void start(volume);
            }
          }
        });
      }
    } finally {
      if (task.current === controller) {
        task.current = undefined;
        setActive(false);
      }
    }
  }

  return { active, start };
}
