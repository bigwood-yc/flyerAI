# UX 修复：翻译质量 & 分类排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复传单详情页三个显示问题：(1) 分类排序错误（蔬果显示在最底部），(2) 热带水果名未翻译（Dragon Fruit、Papaya 等），(3) NO NAME 品牌前缀出现在中文名称中。

**Architecture:** 两部分修复 — (a) 前端 `groupByCategory` 从中文拼音排序改为英文 category key 固定优先级；(b) 后端改进 LLM prompt + 添加 NO NAME 后处理 + enrichment cache key 由 `zh:` 升级为 `zh2:`（强制所有已缓存条目重新翻译）。

**Tech Stack:** Python 3.11 / pytest / Next.js 14 TypeScript

---

## File Map

| File | 改动 |
|------|------|
| `apps/web/app/flyers/[store]/page.tsx` | 修复 `groupByCategory` sort 逻辑 |
| `apps/api/flipp/enrich.py` | 改进 prompt、添加 NO NAME 后处理、cache key 升级为 zh2: |
| `apps/api/tests/test_enrich.py` | 新增三个测试覆盖上述改动 |
| `apps/api/server.py` | 删除诊断用的临时 debug log |

---

## Task 1: 修复 Web 分类排序

**Files:**
- Modify: `apps/web/app/flyers/[store]/page.tsx:18-35`

**根因：** `a.label.localeCompare(b.label, "zh")` 按汉语拼音排序 — 蔬果(shū) > 商品(shāng)，所以蔬果排最后。修复：改为按英文 category key 使用固定优先级字典排序。

- [ ] **Step 1: 替换 `groupByCategory` 排序逻辑**

将 `apps/web/app/flyers/[store]/page.tsx` 中 `groupByCategory` 函数（第 18–35 行）替换为：

```typescript
const CATEGORY_ORDER: Record<string, number> = {
  produce: 0, meat: 1, seafood: 2, dairy: 3, bakery: 4, frozen: 5, pantry: 6, other: 7,
};

/** Group grocery items by category, sort each group by price ascending. */
function groupByCategory(items: FlyerItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const item of items) {
    if (!item.is_grocery) continue;
    const key = item.category;
    if (!map.has(key)) {
      map.set(key, { emoji: item.emoji, label: item.category_zh, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  for (const group of map.values()) {
    group.items.sort((a, b) => Number(a.price) - Number(b.price));
  }
  return Array.from(map.entries())
    .sort(([catA], [catB]) => (CATEGORY_ORDER[catA] ?? 99) - (CATEGORY_ORDER[catB] ?? 99))
    .map(([, group]) => group);
}
```

注意：`map.entries()` 保留了 category 英文 key，用于排序；unknown/neutral 类别（如不在 ORDER 中的）使用 99 排到最后。

- [ ] **Step 2: 手动验证**

```bash
cd apps/web && npm run dev
```

打开 `http://localhost:3000/flyers/No%20Frills?postal_code=L4C0E6`

期望：🥬 蔬果 排在最前；🛒 商品 或 🥫 罐装/杂货 排在最后。

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/flyers/[store]/page.tsx"
git commit -m "fix(web): sort flyer category groups by fixed priority (produce first)"
```

---

## Task 2: 翻译质量修复 + NO NAME 去除 + Cache Key 升级

**Files:**
- Modify: `apps/api/flipp/enrich.py`
- Modify: `apps/api/tests/test_enrich.py`

**根因：**
1. "DRAGON FRUIT" 等热带水果名：LLM 可能原样返回英文名，该结果以 `zh:{name}` key + STABLE_TTL（10年）永久缓存，后续永远用缓存不再翻译。
2. "NO NAME" 品牌：Loblaws 旗下无品牌系列，LLM 保留该前缀输出到中文名，用户希望隐藏。
3. 修复：bump cache key `zh:` → `zh2:` 强制所有条目重新翻译；改进 prompt；加后处理去除 NO NAME。

- [ ] **Step 1: 编写失败测试**

在 `apps/api/tests/test_enrich.py` 末尾追加：

```python
def test_no_name_brand_stripped_from_zh_name():
    """LLM 在 zh_name 中返回 NO NAME 前缀，应被自动去除。"""
    mapping = {
        "NO NAME WHITE VINEGAR 4L": ("pantry", "NO NAME 白醋 4升", True),
    }
    enr = Enricher(FakeLLM(mapping), FakeCache())
    rec = enr.enrich(["NO NAME WHITE VINEGAR 4L"])["NO NAME WHITE VINEGAR 4L"]
    assert rec["zh_name"] == "白醋 4升"
    assert rec["enriched"] is True


def test_cache_key_is_zh2():
    """Enrichment 必须写入 zh2: key（不是 zh:），以便旧的错误翻译可被跳过。"""
    llm = FakeLLM({"APPLE": ("produce", "苹果", True)})
    cache = FakeCache()
    Enricher(llm, cache).enrich(["APPLE"])
    assert "zh2:APPLE" in cache.store
    assert "zh:APPLE" not in cache.store


def test_enriched_result_written_to_zh2_cache():
    """成功翻译的条目写入 zh2: key，不写 zh:（确保旧 key 的缓存不被读取）。"""
    mapping = {"DRAGON FRUIT": ("produce", "火龙果", True)}
    cache = FakeCache()
    Enricher(FakeLLM(mapping), cache).enrich(["DRAGON FRUIT"])
    assert cache.store["zh2:DRAGON FRUIT"]["zh_name"] == "火龙果"
    assert all(not k.startswith("zh:") for k in cache.store)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/api && python -m pytest tests/test_enrich.py::test_no_name_brand_stripped_from_zh_name tests/test_enrich.py::test_cache_key_is_zh2 tests/test_enrich.py::test_enriched_result_written_to_zh2_cache -v
```

期望：三个测试全部 FAIL（`test_enriched_result_written_to_zh2_cache` 因写入 `zh:` key 而失败，另两个因缺少 NO NAME 处理和 zh2: key 而失败）。

- [ ] **Step 3: 更新 `_PROMPT`（改进翻译规则）**

将 `apps/api/flipp/enrich.py` 中 `_PROMPT`（第 41–52 行）完整替换为：

```python
_PROMPT = (
    "You translate Canadian grocery flyer product names into Simplified Chinese "
    "for shoppers who do not read English. For each numbered item, return:\n"
    "  - i: the item's number\n"
    "  - category: one of produce, meat, seafood, dairy, bakery, frozen, pantry, other\n"
    "  - is_grocery: false for non-food items (health & beauty, household, pet, "
    "electronics, etc.), true otherwise\n"
    "  - zh_name: a concise Simplified Chinese name. Rules:\n"
    "    • Translate ALL produce names to Chinese, including tropical/exotic fruits "
    "(Dragon Fruit→火龙果, Papaya→木瓜, Lychee→荔枝, Jackfruit→菠萝蜜, Guava→番石榴, "
    "Durian→榴莲, Passion Fruit→百香果, Mango→芒果, Starfruit→杨桃).\n"
    "    • For items prefixed with 'NO NAME', omit the brand prefix entirely and "
    "translate only the product name (e.g., 'NO NAME White Vinegar 4L' → '白醋 4升').\n"
    "    • Keep all other brand names in their original form or transliterate them.\n"
    "    • Include the size/weight if present.\n"
    "Respond with ONLY a JSON array, no prose and no markdown code fences.\n\n"
    "Items:\n"
)
```

- [ ] **Step 4: 升级 cache key + 添加 NO NAME 后处理**

在 `apps/api/flipp/enrich.py` 中，将 `Enricher.enrich()` 方法（第 123–154 行）中两处 `f"zh:{name}"` 改为 `f"zh2:{name}"`：

```python
    def enrich(self, names) -> dict:
        result, todo = {}, []
        for name in names:
            cached = self.cache.get(f"zh2:{name}")   # ← 改为 zh2:
            if cached is not None:
                result[name] = cached[0]
            else:
                todo.append(name)

        batches = [todo[i:i + self.batch_size] for i in range(0, len(todo), self.batch_size)]
        max_workers = min(4, len(batches)) if batches else 1
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(self._call, batch): batch for batch in batches}
            for fut in as_completed(futures):
                batch = futures[fut]
                enriched = fut.result()
                for name in batch:
                    if name in enriched:
                        self.cache.set(f"zh2:{name}", enriched[name])   # ← 改为 zh2:
                        result[name] = enriched[name]
                    else:
                        result[name] = _neutral_record(name)
        return result
```

在 `Enricher._call()` 方法（第 156–186 行）中，将 `out[name]` 赋值前加 NO NAME 后处理。替换整个 `out = {}` 循环体：

```python
        out = {}
        for obj in _parse_json_array(text):
            if not isinstance(obj, dict):
                continue
            idx = obj.get("i")
            if not isinstance(idx, int) or not (0 <= idx < len(names)):
                continue
            cat = obj.get("category", "other")
            if cat not in CATEGORIES:
                cat = "other"
            emoji, zh = CATEGORIES[cat]
            name = names[idx]
            zh_name = obj.get("zh_name") or name
            # Strip "NO NAME" prefix regardless of case (defence against LLM non-compliance)
            zh_name = re.sub(r"^no\s+name\s+", "", zh_name, flags=re.IGNORECASE).strip()
            if not zh_name:
                zh_name = name
            out[name] = {
                "category": cat,
                "emoji": emoji,
                "category_zh": zh,
                "zh_name": zh_name,
                "is_grocery": bool(obj.get("is_grocery", True)),
                "enriched": True,
            }
        return out
```

- [ ] **Step 5: 运行全部 enrich 测试**

```bash
cd apps/api && python -m pytest tests/test_enrich.py -v
```

期望：所有 10 个测试 PASS（包含新增的 3 个）。

- [ ] **Step 6: Commit**

```bash
git add apps/api/flipp/enrich.py apps/api/tests/test_enrich.py
git commit -m "fix(api): improve translation quality, strip NO NAME prefix, bump enrich cache to zh2:"
```

---

## Task 3: 清理 server.py 诊断 log

**Files:**
- Modify: `apps/api/server.py:175-178`

这四行是之前诊断 API key 问题时临时加入的，生产环境不需要。

- [ ] **Step 1: 删除 debug print 行**

在 `apps/api/server.py` 中，找到第 175–178 行：

```python
    print(f"[enrich] store={store} items={len(priced)} api_key={'set' if os.environ.get('ANTHROPIC_API_KEY') else 'MISSING'}", flush=True)
    enr = enricher.enrich([it["name"] for it in priced])
    enriched_count = sum(1 for v in enr.values() if v.get("enriched"))
    print(f"[enrich] enriched={enriched_count}/{len(priced)} neutral={len(priced)-enriched_count}", flush=True)
```

替换为只保留 enrich 调用：

```python
    enr = enricher.enrich([it["name"] for it in priced])
```

- [ ] **Step 2: 运行 server 测试**

```bash
cd apps/api && python -m pytest tests/test_server.py -v
```

期望：所有测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add apps/api/server.py
git commit -m "chore(api): remove enrichment debug logs"
```

---

## 部署

所有三个 task commit 完成后，推送到 main：

```bash
git push origin main
```

- Render 会自动重新部署 API（`zh2:` key 使 Render 上 SQLite 缓存的旧翻译全部失效，首次访问各超市传单时触发全量重新翻译）
- Vercel 会自动重新部署 Web（排序修复立即生效）
