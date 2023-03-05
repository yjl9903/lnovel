import { LightNovelProvider } from '../base';

export class Wenku8Provider extends LightNovelProvider {
  public static async init() {}

  public search(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public fetch(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
