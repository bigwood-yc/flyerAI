"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FlyerInfo } from "@/lib/api";

interface Props {
  flyers: FlyerInfo[];
  postalCode: string;
}

export default function StoreSelector({ flyers, postalCode }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const uniqueFlyers = useMemo<FlyerInfo[]>(() => {
    const seen = new Set<string>();
    return flyers.filter((f) => {
      if (seen.has(f.merchant)) return false;
      seen.add(f.merchant);
      return true;
    });
  }, [flyers]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggleStore = (merchant: string) => {
    if (isPending) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) { next.delete(merchant); } else { next.add(merchant); }
      return next;
    });
  };

  const allSelected = selected.size === uniqueFlyers.length;
  const toggleAll = () => {
    if (isPending) return;
    setSelected(allSelected ? new Set() : new Set(uniqueFlyers.map((f) => f.merchant)));
  };

  const selectedArr = Array.from(selected);
  const recsHref =
    selectedArr.length === 0
      ? null
      : selectedArr.length === uniqueFlyers.length
      ? `/recommendations?postal_code=${postalCode}`
      : `/recommendations?postal_code=${postalCode}&stores=${encodeURIComponent(selectedArr.join(","))}`;

  function navigateToFlyer(e: React.MouseEvent, merchant: string) {
    e.stopPropagation();
    if (isPending) return;
    setPendingTarget(`flyer:${merchant}`);
    startTransition(() => {
      router.push(`/flyers/${encodeURIComponent(merchant)}?postal_code=${postalCode}`);
    });
  }

  function navigateToRecs(e: React.MouseEvent) {
    e.preventDefault();
    if (isPending || !recsHref) return;
    setPendingTarget("recs");
    startTransition(() => {
      router.push(recsHref);
    });
  }

  return (
    <div className={`space-y-4 ${isPending ? "pointer-events-none opacity-75" : ""}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline disabled:opacity-50" disabled={isPending}>
          {allSelected ? "取消全选" : "全选"}
        </button>
        {recsHref ? (
          <button
            onClick={navigateToRecs}
            disabled={isPending}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPending && pendingTarget === "recs" && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            本周推荐 ({selected.size}家) →
          </button>
        ) : (
          <span className="text-sm text-gray-400 px-4 py-2">请选择至少一家超市</span>
        )}
      </div>

      {/* Store grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {uniqueFlyers.map((f) => {
          const isSelected = selected.has(f.merchant);
          const isThisLoading = isPending && pendingTarget === `flyer:${f.merchant}`;
          return (
            <div
              key={f.id}
              className={`bg-white border rounded-xl p-4 cursor-pointer transition select-none ${
                isSelected ? "border-blue-400 shadow-sm" : "border-gray-200 hover:border-gray-300"
              } ${isPending ? "cursor-not-allowed" : ""}`}
              onClick={() => toggleStore(f.merchant)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && toggleStore(f.merchant)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{f.merchant}</div>
                  <div className="flex items-center justify-between mt-1 gap-2">
                    <button
                      onClick={(e) => navigateToFlyer(e, f.merchant)}
                      disabled={isPending}
                      className="text-sm text-blue-600 hover:underline flex-shrink-0 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isThisLoading && (
                        <span className="inline-block w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      )}
                      查看传单 →
                    </button>
                    <div className="text-xs text-gray-400 text-right min-w-0">
                      {f.distance_km != null && (
                        <span>📍 ~{Number(f.distance_km).toFixed(1)} km</span>
                      )}
                      {f.address && <span className="block truncate">{f.address}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
