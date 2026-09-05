export const buildNovelUrl = (nid: number) => `https://www.linovelib.com/novel/${nid}.html`;
export const buildVolumeUrl = (nid: number, vid: number) =>
  `https://www.linovelib.com/novel/${nid}/vol_${vid}.html`;
export const buildFeedUrl = (nid: number, vid?: number) =>
  `/bili/novel/${nid}${vid === undefined ? '' : `/vol/${vid}`}/feed.xml`;
export const buildFoloShareUrl = (feedId: string) => `https://app.folo.is/share/feeds/${feedId}`;
export const buildFoloDeeplink = (feedId: string, view = 'timeline') =>
  `feed?id=${feedId}&view=${view}`;
