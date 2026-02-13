import * as path from 'node:path';

import * as color from '@breadc/color';
import { breadc } from 'breadc';

import { version, description } from '../package.json';

const cli = breadc('lnovel', {
  version,
  description,
  i18n: 'zh'
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
