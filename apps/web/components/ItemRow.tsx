import type { FlyerItem } from "@/lib/api";

interface Props {
  item: FlyerItem;
}

export default function ItemRow({ item }: Props) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="text-2xl w-8 text-center flex-shrink-0">{item.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.zh_name}</div>
        <div className="text-xs text-gray-400 truncate">{item.name}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-bold text-green-700">${item.price.toFixed(2)}</div>
        <div className="text-xs text-gray-400">{item.category_zh}</div>
      </div>
    </div>
  );
}
