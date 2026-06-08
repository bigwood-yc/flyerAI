import Link from "next/link";
import CategoryBlock from "@/components/CategoryBlock";
import { getRecommendations } from "@/lib/api";

interface Props {
  searchParams: { postal_code?: string };
}

export default async function RecommendationsPage({ searchParams }: Props) {
  const pc = searchParams.postal_code ?? "";

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
    data = await getRecommendations(pc);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法生成推荐，请稍后重试 / Could not generate recommendations
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">本周最优惠</h2>
        <p className="text-sm text-gray-500">
          This Week's Best Deals · {data.postal_code}
        </p>
      </div>

      {data.shopping_route.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <div className="text-sm font-semibold text-blue-800 mb-1">
            🗺 建议购物路线 / Shopping Route
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {data.shopping_route.map((store, i) => (
              <span key={store} className="text-blue-700 text-sm">
                {i + 1}. {store}
                {i < data.shopping_route.length - 1 ? " →" : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.weekly_guide.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无推荐数据 / No data available</p>
      ) : (
        <div className="space-y-4">
          {data.weekly_guide.map((guide) => (
            <CategoryBlock key={guide.category} guide={guide} />
          ))}
        </div>
      )}

      <div className="text-center pt-2">
        <Link
          href={`/flyers?postal_code=${pc}`}
          className="text-blue-600 text-sm underline"
        >
          查看各超市传单 / Browse all flyers
        </Link>
      </div>
    </div>
  );
}
