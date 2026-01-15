export function extractIdFromUrl(href: `https://www.wenku8.net/book/${number}.htm`) {
  return +href.match(/(\d+)\.htm$/)![1];
}
