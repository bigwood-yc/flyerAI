"""
Command-line entry point for the Flyer Retrieval Service.
传单检索服务命令行入口。

    python -m flipp.cli L3R0B1                 # list grocery flyers / 列出杂货传单
    python -m flipp.cli L3R0B1 --store Walmart  # one store's items / 查看某家店的商品

Uses the real Flipp client and a local SQLite cache (flipp_cache.db). The first
run hits the network; subsequent runs within 24h are served from cache.
首次运行会联网；24 小时内再次运行会直接读本地缓存。
"""

import argparse

from .client import FlippClient, FlippError
from .cache import SqliteCache
from .service import FlyerRetrievalService
from .enrich import AnthropicClient, Enricher, STABLE_TTL

# Result-display strings are bilingual (Chinese first, English in parentheses)
# so non-English-reading users can read the output. Store and product names come
# straight from Flipp and are left unchanged.
STALE_TAG = "（缓存数据，可能不是最新 / from stale cache）"


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="从 Flipp 获取杂货传单 (Retrieve grocery flyers from Flipp)."
    )
    parser.add_argument(
        "postal_code", help="加拿大邮编，例如 L3R0B1 (Canadian postal code)"
    )
    parser.add_argument(
        "--store", help="只看某一家店的商品 (show items for a single store)"
    )
    parser.add_argument(
        "--db", default="flipp_cache.db", help="缓存文件路径 (cache file path)"
    )
    args = parser.parse_args(argv)

    service = FlyerRetrievalService(FlippClient(), SqliteCache(args.db))

    try:
        if args.store:
            flyer = service.get_flyer(args.store, args.postal_code)
            if flyer is None:
                print(
                    f"邮编 {args.postal_code} 没有找到 “{args.store}” 的杂货传单 "
                    f"(no grocery flyer for this store)"
                )
                return
            tag = STALE_TAG if flyer["stale"] else ""
            priced = [i for i in flyer["items"] if i["price"] not in (None, "")]

            llm = AnthropicClient()
            if llm.available():
                enricher = Enricher(llm, SqliteCache(args.db, ttl=STABLE_TTL))
                enr = enricher.enrich([it["name"] for it in priced])
                groceries = [it for it in priced if enr[it["name"]]["is_grocery"]]
                filtered = len(priced) - len(groceries)
                print(f"{flyer['store']} — 共 {len(groceries)} 个特价商品 (priced items){tag}")
                for it in groceries[:20]:
                    e = enr[it["name"]]
                    print(f"  {e['emoji']} {e['category_zh']}  {e['zh_name']}"
                          f"（{it['name']}）  ${it['price']}")
                if filtered:
                    print(f"  （已过滤 {filtered} 个非杂货商品 / filtered {filtered} non-grocery items）")
            else:
                print(f"{flyer['store']} — 共 {len(priced)} 个特价商品 (priced items){tag}")
                for it in priced[:20]:
                    print(f"  {it['name'][:55]:55} ${it['price']}")
                print("  提示：设置环境变量 ANTHROPIC_API_KEY 后可显示中文品类与商品名 "
                      "(set ANTHROPIC_API_KEY to enable Chinese names)")
        else:
            listing = service.get_grocery_flyers(args.postal_code)
            tag = STALE_TAG if listing["stale"] else ""
            print(
                f"邮编 {listing['postal_code']} 共找到 {len(listing['flyers'])} 个杂货传单 "
                f"(grocery flyers){tag}"
            )
            for f in listing["flyers"]:
                print(f"  {f['merchant']}  · 传单编号 (flyer) {f['id']}")
    except FlippError as e:
        print(f"无法获取传单 (could not retrieve flyers)：{e}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
