export const enum BilinovelErrorCode {
  empty = -1001,
  banned = -1002
}

export class BilinovelError extends Error {
  public readonly pathname: string;

  public readonly code: BilinovelErrorCode;

  public readonly reason: string;

  constructor(pathname: string, code: BilinovelErrorCode, reason: string = 'unknown') {
    super(`Failed resolving "${pathname}": ${reason || 'unknown'}`);
    this.pathname = pathname;
    this.code = code;
    this.reason = reason;
  }
}
