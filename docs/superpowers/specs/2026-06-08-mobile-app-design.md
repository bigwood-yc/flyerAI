# 移动端 App 设计文档

**日期**：2026-06-08  
**项目**：Grocery Flyer AI Recommender — iOS + Android 移动端  
**技术栈**：Expo SDK 51+ · Expo Router · NativeWind v4 · TypeScript strict  

---

## 1. 目标与范围

为华裔加拿大家庭提供移动端原生体验，复用现有 FastAPI 后端（`localhost:8000`）。功能范围**推荐优先**：

- 邮编输入 → 推荐页（各品类最优惠超市）→ 超市传单详情
- 双平台：iOS + Android（一套代码，Expo 托管工作流）
- 中文优先双语（与 Web 端一致）

**不在范围内**：账号系统、推送通知、价格历史、离线模式。

---

## 2. 架构

```
apps/mobile/               ← Expo 项目根目录
├── app/                   ← Expo Router 页面（文件即路由）
│   ├── _layout.tsx        ← 根布局（Tab Bar，3 个标签）
│   ├── (tabs)/
│   │   ├── index.tsx      ← Tab 1：首页（邮编输入）
│   │   ├── recommendations.tsx  ← Tab 2：推荐页
│   │   └── stores.tsx     ← Tab 3：超市列表
│   └── flyer/[store].tsx  ← 超市传单详情（从 Tab 3 或推荐页进入）
├── components/
│   ├── PostalCodeInput.tsx ← 邮编输入框组件（含格式校验）
│   ├── CategoryCard.tsx   ← 推荐页品类卡片
│   ├── StoreItem.tsx      ← 超市列表项
│   └── FlyerItemRow.tsx   ← 传单商品行（含计价单位）
├── lib/
│   └── api.ts             ← API 类型 + fetch 封装（复用 Web 类型定义）
├── constants/
│   └── config.ts          ← API_BASE URL（开发/生产可切换）
├── tailwind.config.js
├── babel.config.js
├── app.json
└── package.json
```

### 与 Web 端的关系

| 层次 | Web (`apps/web`) | Mobile (`apps/mobile`) |
|------|-----------------|----------------------|
| API 后端 | 共用 `localhost:8000` | 共用 `localhost:8000` |
| 类型定义 | `lib/api.ts` | `lib/api.ts`（复制后独立维护） |
| 样式 | Tailwind CSS 3 | NativeWind v4（相同类名） |
| 路由 | Next.js App Router | Expo Router（相同文件路由心智模型） |

---

## 3. 导航结构

底部 Tab 栏，固定 3 个标签页：

```
┌─────────────────────────────────┐
│         屏幕内容区域              │
│                                 │
├────────┬──────────┬─────────────┤
│ 🏠 首页 │  ⭐ 推荐  │  🏪 超市   │
└────────┴──────────┴─────────────┘
```

超市传单详情（`/flyer/[store]`）作为**堆栈页**叠加在 Tab 3 之上，有返回按钮。从推荐页点击品类卡片也可进入，返回后回到推荐页。

---

## 4. 页面详细说明

### 4.1 首页（Tab 1：`(tabs)/index.tsx`）

- 居中布局：🛒 图标 + 「本周特价」标题 + 邮编输入框 + 查找按钮
- 邮编校验：正则 `/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/`
- 错误提示：「请输入有效的加拿大邮编，例如 L3R 0B1」（红色，输入框下方）
- 提交后将邮编存入 React state（通过 Expo Router 的 `router.push` 携带参数跳转至推荐页）

### 4.2 推荐页（Tab 2：`(tabs)/recommendations.tsx`）

加载状态：居中 ActivityIndicator + 「正在加载本周特价...」

正常状态，FlatList 渲染 `CategoryCard` 列表：

**`CategoryCard` 内容（全部左对齐）：**
```
🥩 肉类
─────────────────────────────────
No Frills              [导航 →]
📍 点击查找附近门店
─────────────────────────────────
猪排骨 · $3.99/lb
鸡全腿 · $1.49/lb
```

- 「导航 →」按钮：调用 `Linking.openURL` 打开 Google Maps 搜索
  - URL 格式：`https://www.google.com/maps/search/{StoreName}+near+{PostalCode}`
  - iOS/Android 均使用 web URL（无需 native SDK，系统自动唤起 Maps App）
- 商品价格格式：`{zh_name} · {price}/{unit}`，`unit` 来自 `price_text` 解析
- 点击整个卡片进入该超市传单详情

错误状态：红色提示框 + 「重新查找」按钮。

### 4.3 超市列表（Tab 3：`(tabs)/stores.tsx`）

- 显示当前邮编下所有可用超市（来自 `GET /api/flyers`）
- 每行：超市 Logo 占位（emoji）+ 超市名 + 「查看传单 →」
- 无邮编时显示引导文字：「请先在首页输入邮编」

### 4.4 超市传单详情（`/flyer/[store].tsx`）

- 顶部导航栏：返回按钮 + 「{超市名} 本周特价」
- 品类筛选 chip 横向滚动（ScrollView horizontal）：全部 / 🥩 肉类 / 🥦 蔬果 / ...
- FlatList 渲染 `FlyerItemRow`：
  ```
  猪排骨              $3.99
  Pork Back Ribs · 🥩  /lb
  ```
  价格绿色大字，单位灰色小字在右下角

---

## 5. 状态管理

邮编是全局共享状态，需要跨 Tab 传递。使用 **React Context**（无需额外依赖）：

```
PostalCodeContext
  ├── postalCode: string        ← 当前邮编（空字符串表示尚未输入）
  └── setPostalCode: fn         ← 首页提交后更新
```

- 在根布局 `_layout.tsx` 中挂载 `PostalCodeContext.Provider`
- Tab 2（推荐页）和 Tab 3（超市列表）从 Context 读取 `postalCode`
- `postalCode` 为空时，Tab 2 和 Tab 3 显示引导文字「请先在首页输入邮编」

---

## 6. API 层变更（后端）

移动端需要两项后端变更，同时兼容现有 Web 端：

### 6.1 新增 `price_text` 字段

**文件**：`apps/api/flipp/service.py` → `_clean_item()`

```python
# 现在
return {
    "name": raw.get("name", ""),
    "price": raw.get("price"),
    ...
}

# 变更后
return {
    "name": raw.get("name", ""),
    "price": raw.get("price"),
    "price_text": raw.get("current_price_text") or raw.get("price_text") or "",  # 新增
    ...
}
```

`GET /api/flyer` 响应中的每个 item 新增 `price_text` 字段（如 `"$3.99 / lb"`），Web 端忽略此字段，不受影响。

### 6.2 计价单位解析（前端）

移动端 `lib/api.ts` 中提供 `parsePriceUnit(price_text: string): string` 工具函数：
- `"$3.99 / lb"` → `"lb"`
- `"2 for $5.00"` → `""`（无标准单位，不显示）
- `""` → `""`

---

## 7. API 客户端（`lib/api.ts`）

复用 Web 端全部 TypeScript 类型，新增：
- `FlyerItem` 接口增加 `price_text: string` 字段
- `API_BASE` 改为从 `constants/config.ts` 读取（开发：`http://localhost:8000`；生产：环境变量）
- `parsePriceUnit()` 工具函数

---

## 8. 样式规范

- 遵循现有 Web 端色彩体系：`bg-gray-50`、`text-gray-900`、`text-blue-500`（品牌蓝）、`text-green-600`（价格绿）
- NativeWind v4 类名与 Web Tailwind 类名保持一致
- 圆角：`rounded-lg`（卡片）/ `rounded-full`（chip）
- 字体：系统默认（iOS San Francisco / Android Roboto）

---

## 9. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 网络不可用 | 红色 Banner：「网络不可用，请检查连接」|
| API 返回 503 | 「暂时无法获取数据，请稍后重试」+ 重试按钮 |
| 邮编无传单 | 「该地区暂无传单数据」|
| 无 API Key | 商品显示英文原名（降级，不崩溃）|

---

## 10. 测试策略

- **单元测试**：`parsePriceUnit()` 函数，覆盖所有 price_text 格式
- **组件测试**：`PostalCodeInput` 校验逻辑（Jest + React Native Testing Library）
- **集成测试**：不做（API 已有后端测试覆盖）
- **设备测试**：iOS Simulator + Android Emulator（Expo Go）

---

## 11. 依赖清单

```json
{
  "expo": "~51.0.0",
  "expo-router": "~3.5.0",
  "react-native": "0.74.x",
  "nativewind": "^4.0.0",
  "tailwindcss": "^3.4.0",
  "expo-linking": "~6.3.0"
}
```

---

## 12. 开发启动

```bash
cd apps/mobile
npm install
npx expo start          # 扫码用 Expo Go 运行，或按 i/a 启动模拟器
# 需要 API 服务先在 :8000 运行：cd apps/api && uvicorn server:app --reload
```
