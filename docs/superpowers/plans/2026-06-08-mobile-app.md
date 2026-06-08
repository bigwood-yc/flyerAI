# Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Expo + React Native 移动端 App（iOS + Android），复用现有 FastAPI 后端，为华裔加拿大家庭展示购物推荐。

**Architecture:** 底部三 Tab（Expo Router 文件路由）：首页（邮编）→ 推荐（品类卡片 + Google Maps 导航）→ 超市（传单列表与详情）。React Context 共享邮编全局状态，NativeWind v4 提供 Tailwind 兼容样式。后端新增 `price_text` 字段（计价单位），同时更新推荐引擎使 deals 也携带该字段。

**Tech Stack:** Expo SDK ~51, Expo Router ~3.5, React Native 0.74, NativeWind v4, TypeScript strict, jest-expo + React Native Testing Library

---

## 文件清单

**后端修改（Task 1）：**
- Modify: `apps/api/flipp/service.py` — `_clean_item()` 新增 `price_text`
- Modify: `apps/api/flipp/recommend.py` — deals 传递 `price_text`
- Modify: `apps/api/server.py` — `/api/flyer` 响应新增 `price_text`
- Modify: `apps/api/tests/test_server.py` — mock 数据 + 断言更新
- Modify: `apps/api/tests/test_service.py` — 新增 `price_text` 断言

**新建移动端（Tasks 2–8）：**
```
apps/mobile/
├── app/
│   ├── _layout.tsx                  Root Stack + PostalCodeContext.Provider
│   ├── (tabs)/
│   │   ├── _layout.tsx              Tab 导航（3 个标签）
│   │   ├── index.tsx                Tab 1：首页
│   │   ├── recommendations.tsx      Tab 2：推荐
│   │   └── stores.tsx               Tab 3：超市列表
│   └── flyer/
│       └── [store].tsx              传单详情（Stack 页，无 Tab）
├── components/
│   ├── PostalCodeInput.tsx
│   ├── CategoryCard.tsx
│   ├── StoreItem.tsx
│   └── FlyerItemRow.tsx
├── lib/
│   ├── api.ts                       类型 + fetch 封装 + parsePriceUnit
│   └── PostalCodeContext.tsx
├── constants/
│   └── config.ts
├── __tests__/
│   ├── parsePriceUnit.test.ts
│   └── PostalCodeInput.test.tsx
├── app.json
├── babel.config.js
├── global.css
├── jest.config.js
├── metro.config.js
├── nativewind-env.d.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## Task 1：后端新增 `price_text` 字段

**Files:**
- Modify: `apps/api/flipp/service.py`
- Modify: `apps/api/flipp/recommend.py`
- Modify: `apps/api/server.py`
- Modify: `apps/api/tests/test_server.py`
- Modify: `apps/api/tests/test_service.py`

- [ ] **Step 1：更新 test_server.py — 在 mock 数据和断言中加入 price_text**

打开 `apps/api/tests/test_server.py`，做两处修改：

```python
# 1) MOCK_FLYER_RESP 的 items 加入 price_text 字段
MOCK_FLYER_RESP = {
    "store": "Walmart", "stale": False,
    "items": [{"name": "SPINACH", "price": 2.5, "price_text": "$2.50 / bag",
               "valid_from": None, "valid_to": None,
               "merchant": "Walmart", "flyer_id": 1}],
}

# 2) test_get_flyer_ok_returns_enriched_items 新增断言
def test_get_flyer_ok_returns_enriched_items():
    with patch("server._make_service") as ms, patch("server._make_enricher") as me:
        ms.return_value.get_flyer.return_value = MOCK_FLYER_RESP
        me.return_value.enrich.return_value = MOCK_ENR
        resp = client.get("/api/flyer?store=Walmart&postal_code=L3R0B1")
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["zh_name"] == "菠菜"
    assert item["emoji"] == "🥬"
    assert item["price"] == 2.5
    assert item["price_text"] == "$2.50 / bag"   # 新增
```

- [ ] **Step 2：更新 test_service.py — 验证 _clean_item 保留 price_text**

打开 `apps/api/tests/test_service.py`，修改 `test_get_flyer_returns_items_for_store`：

```python
def test_get_flyer_returns_items_for_store():
    items = [
        {"name": "Spinach", "price": 2.5,
         "current_price_text": "$2.50 / bag",   # 新增
         "valid_from": "a", "valid_to": "b"},
        {"name": "Buns", "price": None, "valid_from": "a", "valid_to": "b"},
    ]
    client = FakeClient(flyers=SAMPLE_FLYERS, items=items)
    svc = FlyerRetrievalService(client, FakeCache())
    flyer = svc.get_flyer("Walmart", "L3R0B1")
    assert flyer["store"] == "Walmart"
    assert flyer["flyer_id"] == 1
    assert flyer["items"][0]["name"] == "Spinach"
    assert flyer["items"][0]["merchant"] == "Walmart"
    assert flyer["items"][0]["price_text"] == "$2.50 / bag"   # 新增
```

- [ ] **Step 3：运行测试，确认失败**

```bash
cd apps/api && python -m pytest tests/test_server.py tests/test_service.py -v
```

预期：`test_get_flyer_ok_returns_enriched_items` 和 `test_get_flyer_returns_items_for_store` 报 FAILED（KeyError 或 AssertionError）。其余测试仍通过。

- [ ] **Step 4：更新 service.py — _clean_item 新增 price_text**

打开 `apps/api/flipp/service.py`，修改 `_clean_item`：

```python
def _clean_item(raw: dict, merchant: str, flyer_id) -> dict:
    """Map a raw Flipp item to the fields downstream phases need."""
    return {
        "merchant": merchant,
        "flyer_id": flyer_id,
        "name": raw.get("name", ""),
        "price": raw.get("price"),
        "price_text": (
            raw.get("current_price_text") or raw.get("price_text") or ""
        ),
        "valid_from": raw.get("valid_from"),
        "valid_to": raw.get("valid_to"),
    }
```

- [ ] **Step 5：更新 recommend.py — deals 传递 price_text**

打开 `apps/api/flipp/recommend.py`，在 `category_items[cat].append(...)` 处新增 `price_text`：

```python
category_items[cat].append({
    "name": it["name"],
    "zh_name": e["zh_name"],
    "price": it["price"],
    "price_text": it.get("price_text", ""),   # 新增
    "store": store,
    "emoji": e["emoji"],
    "category_zh": e["category_zh"],
})
```

- [ ] **Step 6：更新 server.py — /api/flyer 响应包含 price_text**

打开 `apps/api/server.py`，在 `enriched_items` 的 list comprehension 中新增 `price_text`：

```python
enriched_items = [
    {
        "name": it["name"],
        "price": it["price"],
        "price_text": it.get("price_text", ""),   # 新增
        "category": enr[it["name"]]["category"],
        "emoji": enr[it["name"]]["emoji"],
        "category_zh": enr[it["name"]]["category_zh"],
        "zh_name": enr[it["name"]]["zh_name"],
        "is_grocery": enr[it["name"]]["is_grocery"],
    }
    for it in priced
]
```

- [ ] **Step 7：运行全部后端测试，确认通过**

```bash
cd apps/api && python -m pytest -v
```

预期：36 个测试全部 PASSED（原有测试 + 新断言）。

- [ ] **Step 8：提交**

```bash
cd apps/api
git add flipp/service.py flipp/recommend.py server.py tests/test_server.py tests/test_service.py
git commit -m "feat: expose price_text (unit) in flyer and recommendations API"
```

---

## Task 2：Expo 项目脚手架

**Files:** 全部新建于 `apps/mobile/`

- [ ] **Step 1：创建目录结构**

```bash
mkdir -p apps/mobile/app/"(tabs)" apps/mobile/app/flyer
mkdir -p apps/mobile/components apps/mobile/lib apps/mobile/constants apps/mobile/__tests__
```

- [ ] **Step 2：创建 package.json**

新建 `apps/mobile/package.json`：

```json
{
  "name": "flyer-ai-mobile",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "test": "jest --watchAll=false"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-linking": "~6.3.0",
    "expo-router": "~3.5.0",
    "expo-status-bar": "~1.12.1",
    "nativewind": "^4.0.36",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "tailwindcss": "^3.4.14"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@testing-library/react-native": "^12.4.0",
    "@types/react": "~18.2.45",
    "jest": "^29.2.1",
    "jest-expo": "~51.0.0",
    "typescript": "~5.3.0"
  }
}
```

- [ ] **Step 3：创建 app.json**

新建 `apps/mobile/app.json`：

```json
{
  "expo": {
    "name": "本周特价",
    "slug": "flyer-ai-mobile",
    "version": "1.0.0",
    "scheme": "flyerai",
    "orientation": "portrait",
    "platforms": ["ios", "android"],
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.flyerai.mobile"
    },
    "android": {
      "package": "com.flyerai.mobile",
      "adaptiveIcon": {
        "backgroundColor": "#ffffff"
      }
    },
    "plugins": ["expo-router"]
  }
}
```

- [ ] **Step 4：创建 tsconfig.json**

新建 `apps/mobile/tsconfig.json`：

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.d.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 5：创建 babel.config.js**

新建 `apps/mobile/babel.config.js`：

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 6：创建 tailwind.config.js**

新建 `apps/mobile/tailwind.config.js`：

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 7：创建 metro.config.js**

新建 `apps/mobile/metro.config.js`：

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: "./global.css" });
```

- [ ] **Step 8：创建 global.css**

新建 `apps/mobile/global.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9：创建 nativewind-env.d.ts**

新建 `apps/mobile/nativewind-env.d.ts`：

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 10：创建 jest.config.js**

新建 `apps/mobile/jest.config.js`：

```js
module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|tailwindcss)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
};
```

- [ ] **Step 11：安装依赖**

```bash
cd apps/mobile && npm install
```

预期：`node_modules/` 生成，无 peer dependency 错误。

- [ ] **Step 12：提交脚手架**

```bash
cd apps/mobile
git add app.json babel.config.js global.css jest.config.js metro.config.js nativewind-env.d.ts package.json package-lock.json tailwind.config.js tsconfig.json
git commit -m "feat: scaffold Expo mobile app with Router + NativeWind"
```

---

## Task 3：API 客户端 + parsePriceUnit（TDD）

**Files:**
- Create: `apps/mobile/constants/config.ts`
- Create: `apps/mobile/lib/api.ts`
- Create: `apps/mobile/__tests__/parsePriceUnit.test.ts`

- [ ] **Step 1：写 parsePriceUnit 的失败测试**

新建 `apps/mobile/__tests__/parsePriceUnit.test.ts`：

```typescript
import { parsePriceUnit } from "../lib/api";

describe("parsePriceUnit", () => {
  it("extracts lb from '$3.99 / lb'", () => {
    expect(parsePriceUnit("$3.99 / lb")).toBe("lb");
  });
  it("extracts each from '$1.49 / each'", () => {
    expect(parsePriceUnit("$1.49 / each")).toBe("each");
  });
  it("extracts bag from '$5.99 / bag'", () => {
    expect(parsePriceUnit("$5.99 / bag")).toBe("bag");
  });
  it("extracts kg from '$4.99/kg'", () => {
    expect(parsePriceUnit("$4.99/kg")).toBe("kg");
  });
  it("returns empty for '2 for $5.00' (no slash unit)", () => {
    expect(parsePriceUnit("2 for $5.00")).toBe("");
  });
  it("returns empty for empty string", () => {
    expect(parsePriceUnit("")).toBe("");
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/mobile && npm test -- __tests__/parsePriceUnit.test.ts
```

预期：Cannot find module `../lib/api`（FAIL）。

- [ ] **Step 3：创建 constants/config.ts**

新建 `apps/mobile/constants/config.ts`：

```typescript
// 开发时指向本地 FastAPI 服务；生产时改为部署 URL
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8000";
```

- [ ] **Step 4：创建 lib/api.ts（含 parsePriceUnit 和全部类型）**

新建 `apps/mobile/lib/api.ts`：

```typescript
import { API_BASE } from "../constants/config";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

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

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
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

// ── fetch 封装 ────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
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
```

- [ ] **Step 5：运行测试，确认通过**

```bash
cd apps/mobile && npm test -- __tests__/parsePriceUnit.test.ts
```

预期：6 tests PASSED。

- [ ] **Step 6：提交**

```bash
cd apps/mobile
git add constants/config.ts lib/api.ts __tests__/parsePriceUnit.test.ts
git commit -m "feat: add API client types, fetch helpers, and parsePriceUnit"
```

---

## Task 4：PostalCodeContext + 根布局 + Tab 布局

**Files:**
- Create: `apps/mobile/lib/PostalCodeContext.tsx`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1：创建 PostalCodeContext**

新建 `apps/mobile/lib/PostalCodeContext.tsx`：

```tsx
import React, { createContext, useContext, useState } from "react";

interface PostalCodeContextValue {
  postalCode: string;
  setPostalCode: (pc: string) => void;
}

const PostalCodeContext = createContext<PostalCodeContextValue>({
  postalCode: "",
  setPostalCode: () => {},
});

export function PostalCodeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [postalCode, setPostalCode] = useState("");
  return (
    <PostalCodeContext.Provider value={{ postalCode, setPostalCode }}>
      {children}
    </PostalCodeContext.Provider>
  );
}

export function usePostalCode(): PostalCodeContextValue {
  return useContext(PostalCodeContext);
}
```

- [ ] **Step 2：创建根布局 app/_layout.tsx**

新建 `apps/mobile/app/_layout.tsx`：

```tsx
import "../global.css";
import { Stack } from "expo-router";
import { PostalCodeProvider } from "../lib/PostalCodeContext";

export default function RootLayout() {
  return (
    <PostalCodeProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="flyer/[store]"
          options={{
            headerBackTitle: "返回",
            headerTitleStyle: { fontWeight: "bold" },
          }}
        />
      </Stack>
    </PostalCodeProvider>
  );
}
```

- [ ] **Step 3：创建 Tab 布局 app/(tabs)/_layout.tsx**

新建 `apps/mobile/app/(tabs)/_layout.tsx`：

```tsx
import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: 10, color: focused ? "#3b82f6" : "#94a3b8" }}>
        {label}
      </Text>
    </>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: { borderTopColor: "#e2e8f0" },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "首页",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="首页" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="recommendations"
        options={{
          title: "本周推荐",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⭐" label="推荐" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "超市传单",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏪" label="超市" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 4：提交**

```bash
cd apps/mobile
git add lib/PostalCodeContext.tsx app/_layout.tsx "app/(tabs)/_layout.tsx"
git commit -m "feat: add PostalCodeContext and root/tab layouts"
```

---

## Task 5：首页 + PostalCodeInput（TDD）

**Files:**
- Create: `apps/mobile/components/PostalCodeInput.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/__tests__/PostalCodeInput.test.tsx`

- [ ] **Step 1：写 PostalCodeInput 的失败测试**

新建 `apps/mobile/__tests__/PostalCodeInput.test.tsx`：

```tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import PostalCodeInput from "../components/PostalCodeInput";

describe("PostalCodeInput", () => {
  it("calls onSubmit with uppercased postal code when valid (no space)", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "l3r0b1");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).toHaveBeenCalledWith("L3R0B1");
  });

  it("calls onSubmit when postal code has a space", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "L3R 0B1");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).toHaveBeenCalledWith("L3R 0B1");
  });

  it("shows error and does not call onSubmit for invalid code", () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText, queryByText } = render(
      <PostalCodeInput onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "12345");
    fireEvent.press(getByText("查找特价"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(queryByText(/有效的加拿大邮编/)).toBeTruthy();
  });

  it("clears error when user starts typing again", () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <PostalCodeInput onSubmit={jest.fn()} />
    );
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "bad");
    fireEvent.press(getByText("查找特价"));
    expect(queryByText(/有效的加拿大邮编/)).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText("L3R 0B1"), "L");
    expect(queryByText(/有效的加拿大邮编/)).toBeNull();
  });
});
```

- [ ] **Step 2：运行测试，确认失败**

```bash
cd apps/mobile && npm test -- __tests__/PostalCodeInput.test.tsx
```

预期：Cannot find module `../components/PostalCodeInput`。

- [ ] **Step 3：创建 PostalCodeInput 组件**

新建 `apps/mobile/components/PostalCodeInput.tsx`：

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";

const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

interface Props {
  onSubmit: (postalCode: string) => void;
}

export default function PostalCodeInput({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim().toUpperCase();
    if (!POSTAL_CODE_REGEX.test(trimmed)) {
      setError("请输入有效的加拿大邮编，例如 L3R 0B1");
      return;
    }
    setError("");
    onSubmit(trimmed);
  };

  return (
    <View className="w-full">
      <TextInput
        className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 mb-3"
        placeholder="L3R 0B1"
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError("");
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={handleSubmit}
        accessibilityLabel="邮编输入框"
      />
      {error ? (
        <Text className="text-red-500 text-sm mb-3">{error}</Text>
      ) : null}
      <TouchableOpacity
        className="w-full bg-blue-500 rounded-lg py-3 items-center"
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text className="text-white font-bold text-base">查找特价</Text>
      </TouchableOpacity>
    </View>
  );
}
```

- [ ] **Step 4：运行测试，确认通过**

```bash
cd apps/mobile && npm test -- __tests__/PostalCodeInput.test.tsx
```

预期：4 tests PASSED。

- [ ] **Step 5：创建首页 app/(tabs)/index.tsx**

新建 `apps/mobile/app/(tabs)/index.tsx`：

```tsx
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import PostalCodeInput from "../../components/PostalCodeInput";
import { usePostalCode } from "../../lib/PostalCodeContext";

export default function HomeScreen() {
  const router = useRouter();
  const { setPostalCode } = usePostalCode();

  const handleSubmit = (pc: string) => {
    setPostalCode(pc);
    router.push("/(tabs)/recommendations");
  };

  return (
    <View className="flex-1 bg-gray-50 items-center justify-center px-6">
      <Text
        className="text-4xl mb-3"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        🛒
      </Text>
      <Text className="text-2xl font-bold text-gray-900 mb-1">本周特价</Text>
      <Text className="text-sm text-gray-500 mb-8">
        找附近最低价超市 / Find This Week's Best Deals
      </Text>
      <PostalCodeInput onSubmit={handleSubmit} />
    </View>
  );
}
```

- [ ] **Step 6：提交**

```bash
cd apps/mobile
git add components/PostalCodeInput.tsx "app/(tabs)/index.tsx" __tests__/PostalCodeInput.test.tsx
git commit -m "feat: add home tab and PostalCodeInput with validation"
```

---

## Task 6：推荐页 + CategoryCard

**Files:**
- Create: `apps/mobile/components/CategoryCard.tsx`
- Create: `apps/mobile/app/(tabs)/recommendations.tsx`

- [ ] **Step 1：创建 CategoryCard 组件**

新建 `apps/mobile/components/CategoryCard.tsx`：

```tsx
import { View, Text, TouchableOpacity, Alert } from "react-native";
import * as Linking from "expo-linking";
import { parsePriceUnit, type CategoryGuide } from "../lib/api";

interface Props {
  guide: CategoryGuide;
  postalCode: string;
  onPress: () => void;
}

export default function CategoryCard({ guide, postalCode, onPress }: Props) {
  const openMaps = async () => {
    const query = encodeURIComponent(
      `${guide.best_store} near ${postalCode}`
    );
    const url = `https://www.google.com/maps/search/${query}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert("无法打开地图", "请手动在地图应用中搜索该超市");
      }
    } catch {
      Alert.alert("无法打开地图", "请手动在地图应用中搜索该超市");
    }
  };

  return (
    <TouchableOpacity
      className="bg-white rounded-lg p-4 mb-3 border border-gray-200"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${guide.category_zh}，最优超市 ${guide.best_store}`}
    >
      {/* 品类标题 */}
      <Text className="text-sm font-bold text-gray-900 mb-2">
        {guide.emoji} {guide.category_zh}
      </Text>

      {/* 超市名 + 导航按钮（左对齐） */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-blue-500">
            {guide.best_store}
          </Text>
          <Text className="text-xs text-gray-400">📍 点击查找附近门店</Text>
        </View>
        <TouchableOpacity
          className="bg-green-600 rounded px-2 py-1 ml-3 flex-shrink-0"
          onPress={openMaps}
          accessibilityRole="button"
          accessibilityLabel={`在地图中查找 ${guide.best_store}`}
        >
          <Text className="text-white text-xs font-medium">导航 →</Text>
        </TouchableOpacity>
      </View>

      {/* 优惠商品列表（左对齐） */}
      <View className="border-t border-gray-100 pt-2">
        {guide.deals.map((deal, i) => {
          const unit = parsePriceUnit(deal.price_text);
          return (
            <Text key={i} className="text-xs text-gray-600 mb-0.5">
              {deal.zh_name}
              {" · "}
              <Text className="text-green-600 font-semibold">
                ${deal.price.toFixed(2)}
                {unit ? `/${unit}` : ""}
              </Text>
            </Text>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2：创建推荐页 app/(tabs)/recommendations.tsx**

新建 `apps/mobile/app/(tabs)/recommendations.tsx`：

```tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { getRecommendations, type RecommendationsResponse } from "../../lib/api";
import CategoryCard from "../../components/CategoryCard";

export default function RecommendationsScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!postalCode) return;
    setLoading(true);
    setError("");
    getRecommendations(postalCode)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [postalCode]);

  if (!postalCode) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          请先在首页输入邮编{"\n"}Please enter a postal code first
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3">正在加载本周特价...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 text-center mb-4">{error}</Text>
        <TouchableOpacity
          className="bg-blue-500 rounded-lg px-6 py-3"
          onPress={() => {
            setLoading(true);
            setError("");
            getRecommendations(postalCode)
              .then(setData)
              .catch((e: Error) => setError(e.message))
              .finally(() => setLoading(false));
          }}
        >
          <Text className="text-white font-bold">重新查找</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.weekly_guide.length === 0) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          该地区暂无传单数据{"\n"}No flyer data available
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={data.weekly_guide}
        keyExtractor={(item) => item.category}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text className="text-base font-bold text-gray-900 mb-4">
            本周推荐 · {postalCode}
          </Text>
        }
        renderItem={({ item }) => (
          <CategoryCard
            guide={item}
            postalCode={postalCode}
            onPress={() =>
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.best_store, postal_code: postalCode },
              })
            }
          />
        )}
      />
    </View>
  );
}
```

- [ ] **Step 3：提交**

```bash
cd apps/mobile
git add components/CategoryCard.tsx "app/(tabs)/recommendations.tsx"
git commit -m "feat: add recommendations tab with CategoryCard and Maps navigation"
```

---

## Task 7：超市列表页 + StoreItem

**Files:**
- Create: `apps/mobile/components/StoreItem.tsx`
- Create: `apps/mobile/app/(tabs)/stores.tsx`

- [ ] **Step 1：创建 StoreItem 组件**

新建 `apps/mobile/components/StoreItem.tsx`：

```tsx
import { TouchableOpacity, View, Text } from "react-native";

interface Props {
  merchant: string;
  onPress: () => void;
}

export default function StoreItem({ merchant, onPress }: Props) {
  return (
    <TouchableOpacity
      className="bg-white border border-gray-200 rounded-lg px-4 py-4 mb-3 flex-row items-center justify-between"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`查看 ${merchant} 传单`}
    >
      <View className="flex-row items-center gap-3">
        <Text className="text-2xl" accessibilityElementsHidden>
          🏪
        </Text>
        <Text className="text-sm font-semibold text-gray-900">{merchant}</Text>
      </View>
      <Text className="text-blue-500 text-sm">查看传单 →</Text>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2：创建超市列表页 app/(tabs)/stores.tsx**

新建 `apps/mobile/app/(tabs)/stores.tsx`：

```tsx
import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { getFlyers, type FlyersResponse } from "../../lib/api";
import StoreItem from "../../components/StoreItem";

export default function StoresScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const [data, setData] = useState<FlyersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    if (!postalCode) return;
    setLoading(true);
    setError("");
    getFlyers(postalCode)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [postalCode]);

  if (!postalCode) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-gray-400 text-center">
          请先在首页输入邮编{"\n"}Please enter a postal code first
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3">正在加载超市列表...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 text-center mb-4">{error}</Text>
        <TouchableOpacity
          className="bg-blue-500 rounded-lg px-6 py-3"
          onPress={load}
        >
          <Text className="text-white font-bold">重新加载</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {data?.stale && (
        <View className="bg-orange-100 px-4 py-2">
          <Text className="text-orange-700 text-xs text-center">
            显示的是缓存数据，可能不是最新传单
          </Text>
        </View>
      )}
      <FlatList
        data={data?.flyers ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text className="text-base font-bold text-gray-900 mb-4">
            附近超市 · {postalCode}
          </Text>
        }
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-8">
            该地区暂无传单 / No flyers available
          </Text>
        }
        renderItem={({ item }) => (
          <StoreItem
            merchant={item.merchant}
            onPress={() =>
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.merchant, postal_code: postalCode },
              })
            }
          />
        )}
      />
    </View>
  );
}
```

- [ ] **Step 3：提交**

```bash
cd apps/mobile
git add components/StoreItem.tsx "app/(tabs)/stores.tsx"
git commit -m "feat: add stores tab with flyer list"
```

---

## Task 8：超市传单详情页 + FlyerItemRow

**Files:**
- Create: `apps/mobile/components/FlyerItemRow.tsx`
- Create: `apps/mobile/app/flyer/[store].tsx`

- [ ] **Step 1：创建 FlyerItemRow 组件**

新建 `apps/mobile/components/FlyerItemRow.tsx`：

```tsx
import { View, Text } from "react-native";
import { parsePriceUnit, type FlyerItem } from "../lib/api";

interface Props {
  item: FlyerItem;
}

export default function FlyerItemRow({ item }: Props) {
  const unit = parsePriceUnit(item.price_text);
  return (
    <View className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-2 flex-row items-center justify-between">
      <View className="flex-1 mr-3">
        <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
          {item.zh_name}
        </Text>
        <Text className="text-xs text-gray-400" numberOfLines={1}>
          {item.name}
          {" · "}
          <Text>{item.emoji}</Text>
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-base font-bold text-green-600">
          ${item.price.toFixed(2)}
        </Text>
        {unit ? (
          <Text className="text-xs text-gray-400">/{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 2：创建传单详情页 app/flyer/[store].tsx**

新建 `apps/mobile/app/flyer/[store].tsx`：

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { getFlyer, type FlyerItem, type FlyerResponse } from "../../lib/api";
import FlyerItemRow from "../../components/FlyerItemRow";

const CATEGORY_CHIPS = [
  { key: "all", label: "全部" },
  { key: "produce", label: "🥦 蔬果" },
  { key: "meat", label: "🥩 肉类" },
  { key: "seafood", label: "🐟 海鲜" },
  { key: "dairy", label: "🥛 奶制品" },
  { key: "bakery", label: "🥖 烘焙" },
  { key: "frozen", label: "🧊 冷冻" },
  { key: "pantry", label: "🥫 干货" },
];

export default function FlyerDetailScreen() {
  const { store, postal_code } = useLocalSearchParams<{
    store: string;
    postal_code: string;
  }>();
  const navigation = useNavigation();
  const [data, setData] = useState<FlyerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    if (store) {
      navigation.setOptions({ title: `${store} 本周特价` });
    }
  }, [store]);

  useEffect(() => {
    if (!store || !postal_code) return;
    getFlyer(store, postal_code)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [store, postal_code]);

  const filteredItems = useMemo<FlyerItem[]>(() => {
    if (!data) return [];
    const groceryItems = data.items.filter((i) => i.is_grocery);
    if (activeCategory === "all") return groceryItems;
    return groceryItems.filter((i) => i.category === activeCategory);
  }, [data, activeCategory]);

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-500 mt-3">正在加载传单...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-red-500 text-center">
          {error || "该超市暂无传单 / No flyer available"}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {data.stale && (
        <View className="bg-orange-100 px-4 py-2">
          <Text className="text-orange-700 text-xs text-center">
            显示的是缓存数据，可能不是最新传单
          </Text>
        </View>
      )}

      {/* 品类筛选 chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 border-b border-gray-200 bg-white"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
      >
        {CATEGORY_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            className={`rounded-full px-3 py-1 ${
              activeCategory === chip.key ? "bg-blue-500" : "bg-gray-100"
            }`}
            onPress={() => setActiveCategory(chip.key)}
          >
            <Text
              className={`text-xs font-medium ${
                activeCategory === chip.key ? "text-white" : "text-gray-600"
              }`}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 商品列表 */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item, index) => `${item.name}-${index}`}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-8">
            暂无商品数据 / No items available
          </Text>
        }
        renderItem={({ item }) => <FlyerItemRow item={item} />}
      />
    </View>
  );
}
```

- [ ] **Step 3：提交**

```bash
cd apps/mobile
git add components/FlyerItemRow.tsx app/flyer/
git commit -m "feat: add flyer detail page with category filter and price units"
```

---

## 最终验证

- [ ] **后端测试全部通过**

```bash
cd apps/api && python -m pytest -v
```

预期：36 tests PASSED。

- [ ] **移动端测试全部通过**

```bash
cd apps/mobile && npm test
```

预期：parsePriceUnit（6）+ PostalCodeInput（4）= 10 tests PASSED。

- [ ] **iOS Simulator 冒烟测试**（需 macOS + Xcode）

```bash
cd apps/mobile && npm run ios
```

手动验证：
1. 首页显示 + 邮编输入框可用
2. 输入 `l3r0b1` → 跳转推荐页 → 显示品类卡片
3. 点击「导航 →」→ 弹出地图搜索（或提示无法打开）
4. 点击品类卡片 → 进入传单详情 → 价格显示 `$3.99/lb`
5. 切换 Tab → 超市列表 → 点击超市 → 传单详情

- [ ] **更新 progress.md**

在 `docs/progress.md` 的 `## 2026-06-08` 下追加：

```markdown
### 移动端 App — DONE
- `apps/mobile/`：Expo SDK 51 + Expo Router + NativeWind v4，iOS + Android。
- 3 个 Tab：首页（邮编输入）/ 推荐（品类卡片 + Google Maps 导航）/ 超市（传单列表）。
- 传单详情：品类 chip 筛选 + 商品列表（中文名 + 价格 + 计价单位）。
- 后端新增 `price_text` 字段，推荐引擎 deals 同步携带，Web 端不受影响。
- React Context 共享邮编状态，`parsePriceUnit()` 解析计价单位。
- 10 个单元/组件测试（parsePriceUnit × 6，PostalCodeInput × 4），全部通过。
```

```bash
git add docs/progress.md
git commit -m "docs: update progress with mobile app completion"
```
