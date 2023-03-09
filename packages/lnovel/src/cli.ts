import color from '@breadc/color';
import { breadc } from 'breadc';

import { version } from '../package.json';

import { useProvider } from './providers';
import { useLogger, displayLightNovel } from './logger';

const logger = useLogger('lnovel');

const program = breadc('lnovel', {
  version,
  description: 'Download your favourite light novels easily'
})
  .option('-p, --provider <site>', '下载站点, 默认使用轻小说文库', { default: 'wenku8' })
  .option('-y, --yes', '是否进行确认')
  .option('--ext <ext>', {
    description: '生成 EPUB 或者 markdown 格式',
    default: 'epub'
  })
  .option('-o, --out-dir <dir>', {
    description: '指定小说放置目录，默认在当前目录下生成',
    default: './novels'
  })
  .option('--dry-run', '不下载轻小说')
  .option('--verbose', '显示更多日志')
  .option('--strict', '严格模式下图片的下载失败将会阻止 epub 文件的生成');

program
  .command('<name>', '搜索并下载轻小说')
  .alias('search')
  .option('--force', '覆盖下载缓存', { default: false })
  .option('--key <type>', '搜索方式（可选：name / author）', { default: 'name' })
  .action(async (name, options) => {
    const provider = await useProvider(options.provider);
    if (!provider) {
      logger.error(`Unknown provider ${options.provider}`);
      return;
    }

    const list = await provider.search(name, {});
    if (list.length === 0) {
      console.log(color.red(`没有找到任何与《${name}》相关的轻小说`));
      return;
    }

    const selected = list.length === 1 ? list[0] : await provider.promptSelect(list);
    if (!selected) return;

    const novel = await provider.fetch(selected);
    displayLightNovel(novel);

    if (options.dryRun) return;

    const volumes = await provider.promptSelectVolume(novel);
    if (!volumes || volumes.length === 0) return;

    const ok = options.yes || (await provider.promptConfirm());
    if (!ok) return;

    for (const volume of volumes) {
      await provider.download(novel, volume, { outDir: options.outDir, force: options.force });
    }
  });

program
  .command('fetch <url>', '使用小说详情页链接或 ID 进行下载')
  .action(async (link, options) => {});

program.run(process.argv.slice(2)).catch((err) => console.error(err));
