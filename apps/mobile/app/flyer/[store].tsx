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
  }, [store, navigation]);

  useEffect(() => {
    if (!store || !postal_code) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getFlyer(store, postal_code)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败，请重试");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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

      {/* Category filter chips */}
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

      {/* Item list */}
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
