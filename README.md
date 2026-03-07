# 📚 lnovel

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/yjl9903/lnovel)
[![version](https://img.shields.io/npm/v/lnovel?color=rgb%2850%2C203%2C86%29&label=lnovel)](https://www.npmjs.com/package/lnovel)
[![CI](https://github.com/yjl9903/lnovel/actions/workflows/ci.yml/badge.svg)](https://github.com/yjl9903/lnovel/actions/workflows/ci.yml)

从哔哩轻小说、轻小说文库等站点抓取书籍, 提供轻小说开放接口和 RSS 订阅.

## 使用

你可以直接使用 lnovel 开放接口提供的 3 种 RSS 订阅链接.

+ **轻小说榜单索引**:
  + [哔哩轻小说 月点击榜](https://app.folo.is/share/feeds/231049696759276544)
  + [哔哩轻小说 周点击榜](https://app.folo.is/share/feeds/231789721946592256)
  + [哔哩轻小说 周推荐榜](https://app.folo.is/share/feeds/234666995431193600)
  + [哔哩轻小说 月推荐榜](https://app.folo.is/share/feeds/232505823724295168)
  + [哔哩轻小说 最新更新 · 日本轻小说](https://app.folo.is/share/feeds/221271104769934336)
+ **轻小说丛书系列**:
  + [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么](https://app.folo.is/share/feeds/224529602427239424)
+ **轻小说内容**:
  + [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么 第一卷](https://app.folo.is/share/feeds/224531353209850880)
  + [把喜欢的女生收作女仆后，她居然在我的房间里偷偷地在搞些什么 第二卷](https://app.folo.is/share/feeds/231759473318204416)

链接转换规则:

+ **排行榜索引页**: [https://www.linovelib.com/top/monthvisit/1.html](https://www.linovelib.com/top/monthvisit/1.html) 改写成 [https://lnovel.animes.garden/bili/top/monthvisit/feed.xml](https://lnovel.animes.garden/bili/top/monthvisit/feed.xml)
+ **轻小说丛书页**: [https://www.linovelib.com/novel/4972.html](https://www.linovelib.com/novel/4972.html) 提取小说 ID 4972 改写成 [https://lnovel.animes.garden/bili/novel/4972/feed.xml](https://lnovel.animes.garden/bili/novel/4972/feed.xml)
+ **轻小说内容页**: [https://www.linovelib.com/novel/4972/vol_306964.html](https://www.linovelib.com/novel/4972/vol_306964.html) 提取小说 ID 4972 和书籍 ID 306964 改写成 [https://lnovel.animes.garden/bili/novel/4972/vol/306964/feed.xml](https://lnovel.animes.garden/bili/novel/4972/vol/306964/feed.xml)

你也可以使用对应的 JSON API 接口, 见 [请求示例](./examples/api.http).

## 感谢

+ [轻小说文库](https://www.wenku8.net/)
+ [哔哩轻小说](https://www.linovelib.com/)

## 开源协议

AGPL-3.0 License © 2025 [XLor](https://github.com/yjl9903)
