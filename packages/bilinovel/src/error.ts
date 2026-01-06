export class CloudflareError extends Error {
  public url: URL;

  constructor(url: URL) {
    super(`"${url.toString()}" was blocked by cloudflare`);
    this.url = url;
  }
}
