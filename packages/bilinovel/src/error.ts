export class BilinovelError extends Error {
  public readonly pathname: string;

  public readonly reason: string;

  constructor(pathname: string, reason: string = 'unknown') {
    super(`Failed resolving "${pathname}": ${reason || 'unknown'}`);
    this.pathname = pathname;
    this.reason = reason;
  }
}
