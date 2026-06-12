import type { FlyerItem } from "@/lib/api";

interface Props {
  emoji: string;
  label: string;     // Chinese category label e.g. "蔬果"
  items: FlyerItem[]; // already sorted by price ascending by the caller
}

export default function CategoryItemGroup({ emoji, label, items }: Props) {
  return (
    <div>
      {/* Category header */}
      <div className="flex items-center gap-2 px-1 pt-4 pb-2">
        <span aria-hidden="true" className="text-headline">{emoji}</span>
        <span className="text-title font-semibold text-ink">{label}</span>
        <span className="text-caption text-ink-soft">({items.length})</span>
      </div>

      {/* Items card */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-3.5">
            <div className="flex-1 min-w-0">
              <div className="text-body font-medium text-ink truncate">{item.zh_name}</div>
              {item.price_text && (
                <div className="text-caption text-ink-soft truncate">{item.price_text}</div>
              )}
            </div>
            <div className="text-headline font-bold text-price flex-shrink-0">
              {item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
