import Link from "next/link";
import CategoryItemGroup from "@/components/CategoryItemGroup";
import { getFlyer, type FlyerItem } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ postal_code?: string }>;
}

interface CategoryGroup {
  emoji: string;
  label: string;
  items: FlyerItem[];
}

const CATEGORY_ORDER: Record<string, number> = {
  meat: 0, seafood: 1, produce: 2, dairy: 3, bakery: 4, frozen: 5, pantry: 6, other: 7,
};

/** Group grocery items by category, sort each group by price ascending. */
function groupByCategory(items: FlyerItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const item of items) {
    if (!item.is_grocery) continue;
    const key = item.category;
    if (!map.has(key)) {
      map.set(key, { emoji: item.emoji, label: item.category_zh, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  for (const group of map.values()) {
    group.items.sort((a, b) => Number(a.price) - Number(b.price));
  }
  return Array.from(map.entries())
    .sort(([catA], [catB]) => (CATEGORY_ORDER[catA] ?? 99) - (CATEGORY_ORDER[catB] ?? 99))
    .map(([, group]) => group);
}

export default async function StoreFlyerPage({ params, searchParams }: Props) {
  const { store: storeParam } = await params;
  const { postal_code } = await searchParams;
  const store = decodeURIComponent(storeParam);
  const pc = postal_code ?? "";

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  let data;
  try {
    data = await getFlyer(store, pc, token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("404")) {
      return (
        <div className="text-center py-12 space-y-3">
          <p className="text-body text-ink-soft">该超市暂无传单</p>
          <Link href={`/flyers?postal_code=${pc}`} className="text-brand text-body underline">
            返回列表
          </Link>
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-red-600 text-body">
        无法获取传单，请稍后重试
      </div>
    );
  }

  const groups = groupByCategory(data.items);
  const totalGroceries = groups.reduce((sum, g) => sum + g.items.length, 0);
  const filtered = data.items.length - totalGroceries;

  return (
    <div className="space-y-2">
      <Link
        href={`/flyers?postal_code=${pc}`}
        className="text-brand text-body inline-block"
      >
        ← 返回列表
      </Link>

      <div>
        <h2 className="text-display font-bold text-ink">{data.store}</h2>
        <p className="text-body text-ink-soft">
          共 {totalGroceries} 个特价商品
        </p>
      </div>

      {data.stale && (
        <p className="text-warn text-body bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新
        </p>
      )}

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-ink-soft text-body">
          暂无商品数据
        </div>
      ) : (
        groups.map((group) => (
          <CategoryItemGroup
            key={group.label}
            emoji={group.emoji}
            label={group.label}
            items={group.items}
          />
        ))
      )}

      {filtered > 0 && (
        <p className="text-caption text-ink-soft text-center">
          已过滤 {filtered} 个非食品商品
        </p>
      )}
    </div>
  );
}
