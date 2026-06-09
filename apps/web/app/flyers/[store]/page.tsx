import Link from "next/link";
import ItemRow from "@/components/ItemRow";
import { getFlyer } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ store: string }>;
  searchParams: Promise<{ postal_code?: string }>;
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
          <p className="text-gray-500">该超市暂无传单 / No flyer available</p>
          <Link href={`/flyers?postal_code=${pc}`} className="text-blue-600 underline">
            返回列表
          </Link>
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyer
      </div>
    );
  }

  const groceries = data.items.filter((i) => i.is_grocery);
  const filtered = data.items.length - groceries.length;

  return (
    <div className="space-y-4">
      <Link
        href={`/flyers?postal_code=${pc}`}
        className="text-blue-600 text-sm inline-block"
      >
        ← 返回列表
      </Link>

      <div>
        <h2 className="text-xl font-bold">{data.store}</h2>
        <p className="text-sm text-gray-500">
          共 {groceries.length} 个特价商品 / {groceries.length} priced items
        </p>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 px-4">
        {groceries.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无商品数据 / No items available</p>
        ) : (
          groceries.map((item, i) => <ItemRow key={i} item={item} />)
        )}
      </div>

      {filtered > 0 && (
        <p className="text-sm text-gray-400 text-center">
          已过滤 {filtered} 个非食品商品 / filtered {filtered} non-grocery items
        </p>
      )}
    </div>
  );
}
