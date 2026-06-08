// API 响应类型定义 + 调用封装
// 服务端组件直接访问 localhost:8000；浏览器走 Next.js rewrite 代理

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

// Server components fetch directly; browser calls go through Next.js rewrite
const API_BASE =
  typeof window === "undefined" ? "http://localhost:8000" : "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
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
  postalCode: string
): Promise<RecommendationsResponse> {
  return fetchJson<RecommendationsResponse>(
    `/api/recommendations?postal_code=${encodeURIComponent(postalCode)}`
  );
}
