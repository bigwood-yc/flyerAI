// API response types + fetch helpers.
// All calls are server-side; token comes from the Supabase server session.

export interface FlyerInfo {
  id: number;
  merchant: string;
}

export interface FlyersResponse {
  postal_code: string;
  stale: boolean;
  flyers: FlyerInfo[];
}

export interface FlyerItem {
  name: string;
  price: number;
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

// Server-side only: reads from process.env (not NEXT_PUBLIC_)
const API_BASE = process.env.API_BASE ?? "http://localhost:8000";

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getFlyers(postalCode: string, token: string): Promise<FlyersResponse> {
  return fetchJson<FlyersResponse>(
    `/api/flyers?postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}

export function getFlyer(
  store: string,
  postalCode: string,
  token: string,
): Promise<FlyerResponse> {
  return fetchJson<FlyerResponse>(
    `/api/flyer?store=${encodeURIComponent(store)}&postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}

export function getRecommendations(
  postalCode: string,
  token: string,
): Promise<RecommendationsResponse> {
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`,
    token,
  );
}
