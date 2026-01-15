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
})

cli.run(process.argv.slice(2)).catch((err) => {
  console.log(color.lightRed(`[Unknown Error] ${err.message}`));
  console.error(err);
});
