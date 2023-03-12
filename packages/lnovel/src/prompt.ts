import { intro, isCancel, outro, select, multiselect, confirm } from '@clack/prompts';

import { LightNovel, SearchResult, Volume } from './providers/base';

export function startPrompt(title: string) {
  intro(title);
}

export function endPrompt(title: string) {
  outro(title);
}

export async function promptSelect(list: SearchResult[]): Promise<SearchResult | undefined> {
  const selected = await select({
    message: '选择你想要的轻小说?',
    options: list.map((r) => ({ label: r.name, value: r }))
  });
  if (isCancel(selected)) {
    outro('操作取消');
    process.exit(1);
  }
  return selected as SearchResult;
}

export async function promptSelectVolume(novel: LightNovel): Promise<Volume[] | undefined> {
  const selected = await multiselect({
    message: '选择你想要的卷数?',
    options: novel.volumes.map((r) => ({ label: r.name, value: r })),
    initialValues: novel.volumes
  });
  if (isCancel(selected)) {
    outro('操作取消');
    process.exit(1);
  }
  return selected as Volume[];
}

export async function promptConfirm(): Promise<boolean> {
  const ok = await confirm({
    message: '确认开始下载?'
  });
  if (isCancel(ok)) {
    outro('操作取消');
    process.exit(1);
  }
  return ok as boolean;
}
