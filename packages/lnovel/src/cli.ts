import * as path from 'node:path';

import * as color from '@breadc/color';
import { breadc } from 'breadc';

import { version } from '../package.json';

const cli = breadc('lnovel', {
  version,
  description: '轻松下载你想要的轻小说.',
  builtin: {
    version: { description: '输出 lnovel 版本号' },
    help: { description: '输出 lnovel 帮助信息' }
  }
});

cli.command('bili top').action(async () => {});

cli.command('bili wenku').action(async () => {});

cli.command('bili novel <nid>').action(async (nid: string) => {});

cli.command('bili volume <nid> <vid>').action(async (nid: string, vid: string) => {});

cli.command('bili chapter <nid> <cid>').action(async (nid: string, cid: string) => {});

cli.run(process.argv.slice(2)).catch((err) => {
  console.log(color.lightRed(`${err.message}`));
  console.error(err);
});
