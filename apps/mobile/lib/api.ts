import { API_BASE } from "../constants/config";
import { supabase } from "./supabase";

// ── Type definitions ──────────────────────────────────────────────────────────

export interface FlyerInfo {
  id: number;
  merchant: string;
  distance_km?: number | null;
  address?: string | null;
}

export interface FlyersResponse {
  postal_code: string;
  stale: boolean;
  flyers: FlyerInfo[];
}

export interface FlyerItem {
  name: string;
  price: number;
  price_text: string;
  category: string;
  emoji: string;
  category_zh: string;
  zh_name: string;
  is_grocery: boolean;
}

export interface FlyerResponse {
  store: string;
  stale: boolean;
  items: FlyerItem[];
}

export interface Deal {
  name: string;
  zh_name: string;
  price: number;
  price_text: string;
  store: string;
  emoji: string;
  category_zh: string;
}

export interface CategoryGuide {
  category: string;
  emoji: string;
  category_zh: string;
  best_store: string;
  deals: Deal[];
}

export interface RecommendationsResponse {
  postal_code: string;
  weekly_guide: CategoryGuide[];
  shopping_route: string[];
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Parse the price unit from a Flipp price_text string.
 *
 * "$3.99 / lb"  → "lb"
 * "$4.99/kg"    → "kg"
 * "2 for $5.00" → ""
 * ""            → ""
 */
export function parsePriceUnit(priceText: string): string {
  if (!priceText) return "";
  const match = priceText.match(/\/\s*([a-zA-Z]+)/);
  return match ? match[1].toLowerCase() : "";
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

// Long enough to cover a Render free-tier cold start (~30–60s) so the first
// request after the server sleeps still succeeds instead of hanging forever.
const REQUEST_TIMEOUT_MS = 60_000;

/** Error with a user-facing Chinese message and a machine-readable `kind`. */
export class ApiError extends Error {
  kind: "timeout" | "network" | "server";
  status?: number;
  constructor(kind: ApiError["kind"], message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, signal: controller.signal });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("timeout", "服务器响应超时，请稍后重试");
    }
    throw new ApiError("network", "网络连接失败，请检查网络后重试");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiError("server", `服务器开小差了（${res.status}），请稍后重试`, res.status);
  }
  return res.json() as Promise<T>;
}

export function getFlyers(postalCode: string): Promise<FlyersResponse> {
  return fetchJson<FlyersResponse>(
    `/api/flyers?postal_code=${encodeURIComponent(postalCode)}`
  );
}

export function getFlyer(
  store: string,
  postalCode: string
): Promise<FlyerResponse> {
  return fetchJson<FlyerResponse>(
    `/api/flyer?store=${encodeURIComponent(store)}&postal_code=${encodeURIComponent(postalCode)}`
  );
}

export function getRecommendations(
  postalCode: string,
  stores?: string[]
): Promise<RecommendationsResponse> {
  let path = `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`;
  if (stores && stores.length > 0) {
    path += `&stores=${encodeURIComponent(stores.join(","))}`;
  }
  return fetchJson<RecommendationsResponse>(path);
}
