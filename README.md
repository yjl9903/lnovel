# 📚 lnovel

[![version](https://img.shields.io/npm/v/lnovel?color=rgb%2850%2C203%2C86%29&label=lnovel)](https://www.npmjs.com/package/lnovel)
[![CI](https://github.com/yjl9903/lnovel/actions/workflows/ci.yml/badge.svg)](https://github.com/yjl9903/lnovel/actions/workflows/ci.yml)

从哔哩轻小说、轻小说文库等站点抓取轻小说.

## Usage

你可以直接使用提供的 RSS 订阅链接.

+ [哔哩轻小说月点击榜](https://app.folo.is/share/feeds/231049696759276544)
+ [哔哩轻小说 最新更新 · 日本轻小说](https://app.folo.is/share/feeds/221271104769934336)
+ [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么](https://app.folo.is/share/feeds/224529602427239424)
+ [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么 第一卷](https://app.folo.is/share/feeds/224531353209850880)
+ [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么 第二卷](https://app.folo.is/share/feeds/231759473318204416)

**链接转换规则**:

+ **排行榜索引页**: [https://www.linovelib.com/top/monthvisit/1.html](https://www.linovelib.com/top/monthvisit/1.html) 改写成 [https://lnovel.animes.garden/bili/top/monthvisit/feed.xml](https://lnovel.animes.garden/bili/top/monthvisit/feed.xml)
+ **轻小说丛书页**: [https://www.linovelib.com/novel/4972.html](https://www.linovelib.com/novel/4972.html) 提取小说 ID 4972 改写成 [https://lnovel.animes.garden/bili/novel/4972/feed.xml](https://lnovel.animes.garden/bili/novel/4972/feed.xml)
+ **轻小说内容页**: [https://www.linovelib.com/novel/4972/vol_306964.html](https://www.linovelib.com/novel/4972/vol_306964.html) 提取小说 ID 4972 和书籍 ID 306964 改写成 [https://lnovel.animes.garden/bili/novel/4972/vol/306964/feed.xml](https://lnovel.animes.garden/bili/novel/4972/vol/306964/feed.xml)

你也可以使用对应的 JSON API 接口, 见 [请求示例](./examples/api.http).

## Credits

+ [轻小说文库](https://www.wenku8.net/)
+ [哔哩轻小说](https://www.linovelib.com/)
+ [Messiahhh/wenku8-downloader](https://github.com/Messiahhh/wenku8-downloader): 轻小说文库的命令行小说下载器

## License

MIT License © 2023 [XLor](https://github.com/yjl9903)
