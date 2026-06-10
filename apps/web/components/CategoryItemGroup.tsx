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
        <span aria-hidden="true" className="text-lg">{emoji}</span>
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">({items.length})</span>
      </div>

      {/* Items card */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 divide-y divide-gray-100">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.zh_name}</div>
              {item.price_text && (
                <div className="text-xs text-gray-400 truncate">{item.price_text}</div>
              )}
            </div>
            <div className="font-bold text-green-700 flex-shrink-0 text-sm">
              {item.price != null ? `$${Number(item.price).toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
