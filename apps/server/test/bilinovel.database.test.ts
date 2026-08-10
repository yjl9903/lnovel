import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lnovel-banned-test-'));
process.env.DATABASE_FILE = path.join(tempDirectory, 'lnovel.db');

const { database } = await import('../src/database.js');
const { getNovelFromDatabase, markNovelAsDeletedInDatabase } =
  await import('../src/bilinovel/database.js');
const { biliNovels, biliVolumes } = await import('../src/schema/index.js');

afterAll(async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

describe('bilinovel database', () => {
  it('keeps existing data available after marking a novel as deleted', async () => {
    const updatedAt = new Date('2026-04-15T01:22:33+08:00');
    const fetchedAt = new Date('2026-02-03T09:46:48+08:00');

    await database.insert(biliNovels).values({
      nid: 4695,
      name: '两个人一起生活，和妹妹做那档事也是理所当然的吧。',
      authors: [{ name: '月见ハク', position: 'author' }],
      description: 'existing description',
      cover: 'existing cover',
      labels: ['完结'],
      done: false,
      isDeleted: false,
      updatedAt,
      fetchedAt
    });
    await database.insert(biliVolumes).values({
      nid: 4695,
      vid: 280803,
      name: '第一卷',
      volume: '第一卷',
      description: 'existing volume description',
      cover: 'existing volume cover',
      labels: ['完结'],
      done: true,
      isDeleted: false,
      updatedAt,
      fetchedAt
    });

    expect(await getNovelFromDatabase('4695')).toBeUndefined();
    expect(await markNovelAsDeletedInDatabase(4695)).toBe(true);

    const deleted = await getNovelFromDatabase('4695');
    expect(deleted).toMatchObject({
      nid: 4695,
      done: true,
      isDeleted: true,
      description: 'existing description',
      volumes: [
        {
          vid: 280803,
          title: '第一卷',
          cover: 'existing volume cover'
        }
      ]
    });
  });
});
