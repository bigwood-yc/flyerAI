import type { CategoryGuide } from "@/lib/api";

interface Props {
  guide: CategoryGuide;
}

export default function CategoryBlock({ guide }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span className="text-headline">{guide.emoji}</span>
        <div>
          <span className="text-title font-semibold text-ink">{guide.category_zh}</span>
          <span className="text-caption text-ink-soft ml-2">
            最优：{guide.best_store}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-100">
        {guide.deals.map((deal, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium text-ink truncate">{deal.zh_name}</div>
              <div className="text-caption text-ink-soft truncate">{deal.store}</div>
            </div>
            <div className="text-headline font-bold text-price flex-shrink-0">
              {deal.price != null ? `$${Number(deal.price).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
