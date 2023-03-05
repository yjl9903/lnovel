import type { LightNovelProvider } from './base';

export async function useProvider(name: string): Promise<LightNovelProvider | undefined> {
  switch (name) {
    case 'wenku8': {
      const { Wenku8Provider } = await import('./wenku8');
      await Wenku8Provider.init();
      return new Wenku8Provider();
    }
    default: {
      return undefined;
    }
  }
}
