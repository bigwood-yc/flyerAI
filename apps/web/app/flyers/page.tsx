import Link from "next/link";
import StoreCard from "@/components/StoreCard";
import { getFlyers } from "@/lib/api";

interface Props {
  searchParams: Promise<{ postal_code?: string }>;
}

export default async function FlyersPage({ searchParams }: Props) {
  const { postal_code } = await searchParams;
  const pc = postal_code ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-gray-500">请先输入邮编 / Please enter a postal code</p>
        <Link href="/" className="text-blue-600 underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getFlyers(pc);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyers
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">邮编 {data.postal_code} 的传单</h2>
          <p className="text-sm text-gray-500">
            共 {data.flyers.length} 家超市 / {data.flyers.length} stores
          </p>
        </div>
        <Link
          href={`/recommendations?postal_code=${pc}`}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
        >
          本周推荐 →
        </Link>
      </div>

      {data.stale && (
        <p className="text-orange-600 text-sm bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新 / Served from cache, may not be current
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.flyers.map((f) => (
          <StoreCard key={f.id} merchant={f.merchant} postalCode={pc} />
        ))}
      </div>
    </div>
  );
}
