import type { CategoryGuide } from "@/lib/api";

interface Props {
  guide: CategoryGuide;
}

export default function CategoryBlock({ guide }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-xl">{guide.emoji}</span>
        <div>
          <span className="font-semibold">{guide.category_zh}</span>
          <span className="text-sm text-gray-400 ml-2">
            最优：{guide.best_store}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {guide.deals.map((deal, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{deal.zh_name}</div>
              <div className="text-xs text-gray-400 truncate">{deal.store}</div>
            </div>
            <div className="font-bold text-green-700 flex-shrink-0">
              {deal.price != null ? `$${Number(deal.price).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
