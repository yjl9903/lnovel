export class TaskManager {
  private readonly running = new Map<string, Task>();

  public constructor() {}

  public async register<T extends {} = any>(key: string, data: T) {
    const task = new Task<T>(this, key, data);
    this.running.set(key, task);
    return task;
  }

  public async abort(key: string) {
    return this.running.get(key)?.abort() || false;
  }

  public async finish(key: string) {
    this.running.delete(key);
  }

  public async getRunningTasks() {
    return [...this.running.values()];
  }
}

export enum TaskStatus {
  pending = 'pending',
  running = 'running',
  aborting = 'aborting'
}

export class Task<T extends {} = any> {
  public readonly key: string;

  private _data: T;

  private _status: TaskStatus;

  private readonly manager: TaskManager;

  public constructor(manager: TaskManager, key: string, data: T) {
    this.key = key;
    this._data = data;
    this._status = TaskStatus.pending;
    this.manager = manager;
  }

  public async start() {
    this._status = TaskStatus.running;
    return true;
  }

  public async getData() {
    return this._data;
  }

  public async updateData(data: T) {
    this._data = data;
  }

  public get status() {
    return this._status;
  }

  public get aborted() {
    return this._status === TaskStatus.aborting;
  }

  public async abort() {
    this._status = TaskStatus.aborting;
    return true;
  }

  public async finish() {
    await this.manager.finish(this.key);
  }

  public toJSON() {
    return {
      key: this.key,
      status: this._status,
      data: this._data
    };
  }
}
