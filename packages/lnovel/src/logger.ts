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
  const BAR = gray('│');
  console.log(BAR);
  console.log(
    `${BAR}  ${bold('标题')} ${link(novel.name, novel.href)} ${gray(`(${novel.status})`)}`
  );
  console.log(`${BAR}  ${bold('作者')} ${novel.author}`);
  console.log(`${BAR}  ${bold('文库')} ${novel.publisher}`);
  console.log(`${BAR}  ${bold('标签')} ${novel.tags.join(' ')}`);
  console.log(`${BAR}  ${bold('卷数')} ${novel.volumes.length}`);
  console.log(`${BAR}  ${bold('最近更新于')} ${novel.lastUpdateTime.toLocaleDateString()}`);
  console.log(BAR);
  console.log(
    novel.description
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => BAR + '  ' + t)
      .join('\n')
  );
}
