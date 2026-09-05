import { useEffect, useRef, useState, type MouseEvent, type ComponentProps } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import feedIcon from '../assets/feed.svg';
import foloIcon from '../assets/folo.svg';
import { buildFoloShareUrl, buildFoloDeeplink } from '../lib/novel-links';

import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

const FOLO_DEEPLINK_SCHEME = 'folo://';

type CoverProps = {
  src?: string;
  title: string;
  className?: string;
};

export function Cover({ src, title, className }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // The image may fail before hydration attaches React's onError handler.
    const image = imageRef.current;
    if (src && image?.complete && image.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  return (
    <div className={`overflow-hidden bg-slate-100 ${className ?? ''}`.trim()}>
      {src && src !== failedSrc ? (
        <img
          ref={imageRef}
          src={src}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          role="img"
          aria-label={`${title}：暂无封面`}
          className="flex h-full w-full items-center justify-center text-xs text-slate-400"
        >
          暂无封面
        </div>
      )}
    </div>
  );
}

export function NovelTag({ className, ...props }: ComponentProps<'span'>) {
  return (
    <Badge
      {...props}
      variant="secondary"
      className={cn(
        'max-w-full justify-start whitespace-normal text-left [overflow-wrap:anywhere]',
        className
      )}
    />
  );
}

export function SourceButton({ href }: { href: string }) {
  return (
    <Badge render={<a href={href} target="_blank" rel="noreferrer" />} variant="outline">
      <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} aria-hidden="true" />
      前往原站
    </Badge>
  );
}

type RssButtonProps = {
  href: string;
  className?: string;
};

export function RssButton({ href, className }: RssButtonProps) {
  return (
    <Badge
      render={<a href={href} target="_blank" rel="noreferrer" />}
      variant="outline"
      className={cn(
        'border-amber-400 bg-amber-100 text-amber-700 hover:border-amber-500 hover:bg-amber-200 hover:text-amber-700',
        className
      )}
    >
      <img src={feedIcon} alt="" className="h-3 w-3" />
      RSS
    </Badge>
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

export function FoloButton({ feedId, className }: FoloButtonProps) {
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
    <Badge
      render={<a href={feedURL} onClick={handleClick} target="_blank" rel="noreferrer" />}
      variant="outline"
      className={cn(
        'border-[#ff6e2d]/40 bg-[#ff6e2d]/15 text-[#ff6e2d] hover:border-[#ff6e2d]/60 hover:bg-[#ff6e2d]/25 hover:text-[#ff6e2d]',
        className
      )}
    >
      <img src={foloIcon} alt="" className="h-3 w-3" />
      Folo
    </Badge>
  );
}
