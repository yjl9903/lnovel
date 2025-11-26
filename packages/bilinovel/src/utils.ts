export function sleep(timeout: number) {
  return new Promise<void>((res) => setTimeout(res, timeout));
}
