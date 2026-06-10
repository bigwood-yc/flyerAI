"use client";

import { useState } from "react";
import Link from "next/link";
import type { FlyerInfo } from "@/lib/api";

interface Props {
  flyers: FlyerInfo[];
  postalCode: string;
}

export default function StoreSelector({ flyers, postalCode }: Props) {
  // Default: all stores selected
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(flyers.map((f) => f.merchant))
  );

  const toggleStore = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) {
        next.delete(merchant);
      } else {
        next.add(merchant);
      }
      return next;
    });
  };

  const allSelected = selected.size === flyers.length;
  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(flyers.map((f) => f.merchant))
    );

  // Build recommendations URL: omit stores param when all are selected
  const selectedArr = Array.from(selected);
  const recsHref =
    selectedArr.length === 0
      ? null
      : selectedArr.length === flyers.length
      ? `/recommendations?postal_code=${postalCode}`
      : `/recommendations?postal_code=${postalCode}&stores=${encodeURIComponent(
          selectedArr.join(",")
        )}`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggleAll}
          className="text-sm text-blue-600 hover:underline"
        >
          {allSelected ? "取消全选" : "全选"}
        </button>
        {recsHref ? (
          <Link
            href={recsHref}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            本周推荐 ({selected.size}家) →
          </Link>
        ) : (
          <span className="text-sm text-gray-400 px-4 py-2">
            请选择至少一家超市
          </span>
        )}
      </div>

      {/* Store grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {flyers.map((f) => {
          const isSelected = selected.has(f.merchant);
          return (
            <div
              key={f.id}
              className={`bg-white border rounded-xl p-4 cursor-pointer transition select-none ${
                isSelected
                  ? "border-blue-400 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => toggleStore(f.merchant)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => e.key === " " && toggleStore(f.merchant)}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                    isSelected
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Store info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">
                    {f.merchant}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <Link
                      href={`/flyers/${encodeURIComponent(f.merchant)}?postal_code=${postalCode}`}
                      className="text-sm text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      查看传单 →
                    </Link>
                    {f.distance_km != null && (
                      <span className="text-xs text-gray-400">
                        📍 ~{Number(f.distance_km).toFixed(1)} km
                      </span>
                    )}
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
