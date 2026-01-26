import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { fetchNovelPage, fetchNovelVolumePage, fetchNovelChapterPages } from '../src/novel';

describe('novel', () => {
  const nid = 1410;

  describe(`nid:${nid}`, async () => {
    async function fetchHTML(pathname: string) {
      const filename = pathname
        .replace(/^\//, '')
        .replace(/\//g, '_')
        .replace(/\.html$/, '.html')
        .replace('catalog', 'catalog.html');

      return await fs.readFile(path.join(import.meta.dirname, '__assets__', filename), 'utf-8');
    }

    const novel = (await fetchNovelPage(fetchHTML, nid, { transformImgSrc }))!;

    it('should scrape novel', () => {
      expect(novel).toMatchInlineSnapshot(`
        {
          "authors": [
            {
              "name": "入间人间",
              "position": "author",
            },
            {
              "name": "Fly",
              "position": "illustrator",
            },
          ],
          "cover": "https://lnovel.animes.garden/bili/files/article/image/1/1410/1410s.jpg?570722",
          "description": "暑假结束，妹妹哭著找我讨救兵。那是她六岁，我十岁时的事。<br>
        难得主动靠近的妹妹，手上拿著绘图日记本。「帮我……」<br>
        她目光一与我对上，便战战兢兢地朝我递出日记本，小声地如此说道。<br>
        我想，我和妹妹的关系，就是从这个瞬间开始发展的。<br>
        爱哭、没有毅力、只会发呆、没有朋友，让人操心，无法放著不管的存在。<br>
        ──那就是我的妹妹。<br>
        「因为哥─哥几乎是我人生的全部嘛。」<br>
        始于幼年期，经历成长期，于成年之后做出选择的人生──<br>
        描述难分难舍的两人的「一生」，略带苦涩的兄妹爱情喜剧。",
          "labels": [
            "完结",
            "电击文库",
            "日本轻小说",
            "青春",
            "恋爱",
            "妹妹",
          ],
          "name": "妹妹人生",
          "nid": 1410,
          "updatedAt": 2020-02-27T17:03:50.000Z,
          "volumes": [
            {
              "cover": "https://lnovel.animes.garden/bili/img3/cover/1410/180624.jpg",
              "nid": 1410,
              "title": "妹妹人生 〈上〉",
              "vid": 52748,
              "volume": "〈上〉",
            },
            {
              "cover": "https://lnovel.animes.garden/bili/img3/cover/1410/180645.jpg",
              "nid": 1410,
              "title": "妹妹人生 〈下〉",
              "vid": 52758,
              "volume": "〈下〉",
            },
          ],
        }
      `);
    });

    it.each(novel.volumes.map((v) => v.vid))('should scrape volume vid:%i', async (vid: number) => {
      const volume = (await fetchNovelVolumePage(fetchHTML, nid, vid, { transformImgSrc }))!;

      expect(volume).toMatchSnapshot();

      await fs.mkdir(`.data/${volume.name}`, { recursive: true }).catch(() => {});

      for (const ch of volume.chapters) {
        const cid = ch.cid;

        const chapter = await fetchNovelChapterPages(fetchHTML, nid, cid, {
          transformBbcode: true,
          transformImgSrc
        });

        expect(chapter).toMatchSnapshot();
      }
    });
  });
});

function transformImgSrc(_url: string) {
  try {
    if (_url.startsWith('/files/')) {
      _url = 'https://www.linovelib.com' + _url;
    }

    const url = new URL(_url);
    if (url.host === 'img3.readpai.com') {
      return `https://lnovel.animes.garden/bili/img3${url.pathname}${url.search}`;
    }
    if (url.host === 'www.linovelib.com' && url.pathname.startsWith('/files/')) {
      return `https://lnovel.animes.garden/bili${url.pathname}${url.search}`;
    }
    return _url;
  } catch (error) {
    return _url;
  }
}
