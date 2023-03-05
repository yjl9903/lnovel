import { pino } from 'pino';
import { bold, gray, link } from '@breadc/color';

import type { LightNovel } from './providers/base';

export function useLogger(name: string) {
  return pino({
    name,
    base: {
      pid: undefined,
      hostname: undefined
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  });
}

export function displayLightNovel(novel: LightNovel) {
  console.log(`${bold('标题')} ${link(novel.name, novel.href)} ${gray(`(${novel.status})`)}`);
  console.log(`${bold('作者')} ${novel.author}`);
  console.log(`${bold('文库')} ${novel.publisher}`);
  console.log(`${bold('标签')} ${novel.tags.join(' ')}`);
  console.log(`${bold('最近更新于')} ${new Date(novel.lastUpdateTime).toLocaleDateString()}`);
  console.log();
  console.log(novel.description);
  console.log();
}
