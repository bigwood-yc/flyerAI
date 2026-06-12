import { useEffect, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getFlyers,
  getFlyer,
  getRecommendations,
  type FlyersResponse,
  type FlyerResponse,
  type RecommendationsResponse,
} from "./api";

/**
 * React Query hooks for the three data screens. Caching, retries, request
 * dedup and background refresh are handled by the QueryClient configured in
 * app/_layout.tsx, so screens only deal with {data, isLoading, error, refetch}.
 */

export function useFlyersQuery(
  postalCode: string,
): UseQueryResult<FlyersResponse, Error> {
  return useQuery({
    queryKey: ["flyers", postalCode],
    queryFn: () => getFlyers(postalCode),
    enabled: !!postalCode,
  });
}

export function useFlyerQuery(
  store: string,
  postalCode: string,
): UseQueryResult<FlyerResponse, Error> {
  return useQuery({
    queryKey: ["flyer", store, postalCode],
    queryFn: () => getFlyer(store, postalCode),
    enabled: !!store && !!postalCode,
  });
}

export function useRecommendationsQuery(
  postalCode: string,
  stores?: string[],
): UseQueryResult<RecommendationsResponse, Error> {
  // Sorted store list → stable cache key regardless of selection order.
  const storesKey =
    stores && stores.length > 0 ? [...stores].sort().join(",") : "";
  return useQuery({
    queryKey: ["recs", postalCode, storesKey],
    queryFn: () => getRecommendations(postalCode, stores),
    enabled: !!postalCode,
  });
}

/**
 * Returns true once `active` has stayed true for `delayMs` (default 8s).
 * Used to surface a "the server may be waking up, please wait" hint during a
 * cold start, so users don't think the app is frozen.
 */
export function useSlowLoadHint(active: boolean, delayMs = 8000): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return show;
}
