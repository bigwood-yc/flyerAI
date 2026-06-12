import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { type FlyerItem } from "../../lib/api";
import { useFlyerQuery, useSlowLoadHint } from "../../lib/queries";
import FlyerItemRow from "../../components/FlyerItemRow";

const CATEGORY_CHIPS = [
  { key: "all",     label: "全部" },
  { key: "meat",    label: "🥩 肉类" },
  { key: "seafood", label: "🐟 海鲜" },
  { key: "produce", label: "🥦 蔬果" },
  { key: "dairy",   label: "🥛 奶制品" },
  { key: "bakery",  label: "🥖 烘焙" },
  { key: "frozen",  label: "🧊 冷冻" },
  { key: "pantry",  label: "🥫 干货" },
];

export default function FlyerDetailScreen() {
  const { store, postal_code } = useLocalSearchParams<{
    store: string;
    postal_code: string;
  }>();
  const navigation = useNavigation();
  const { data, isLoading, isFetching, error, refetch } = useFlyerQuery(store, postal_code);
  const slow = useSlowLoadHint(isLoading);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    if (store) {
      navigation.setOptions({ title: `${store} 本周特价` });
    }
  }, [store, navigation]);

  const filteredItems = useMemo<FlyerItem[]>(() => {
    if (!data) return [];
    const groceryItems = data.items.filter((i) => i.is_grocery);
    const categoryFiltered =
      activeCategory === "all"
        ? groceryItems
        : groceryItems.filter((i) => i.category === activeCategory);
    // Sort by price ascending within the active filter
    return [...categoryFiltered].sort((a, b) => Number(a.price) - Number(b.price));
  }, [data, activeCategory]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-8">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-body text-ink-soft mt-4">正在加载传单...</Text>
        {slow && (
          <Text className="text-caption text-ink-soft mt-2 text-center leading-6">
            首次启动服务器需 30–60 秒，请耐心等待，不要离开此页面
          </Text>
        )}
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-body text-red-600 text-center mb-5 leading-7">
          {error instanceof Error ? error.message : "该超市暂无传单"}
        </Text>
        <TouchableOpacity
          className="bg-brand rounded-xl px-8 min-h-[52px] items-center justify-center"
          onPress={() => refetch()}
        >
          <Text className="text-white font-bold text-body">重新加载</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {data.stale && (
        <View className="bg-amber-100 px-4 py-2">
          <Text className="text-warn text-caption text-center">
            显示的是缓存数据，可能不是最新传单
          </Text>
        </View>
      )}

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 border-b border-gray-200 bg-white"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 10, alignItems: "center" }}
      >
        {CATEGORY_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip.key}
            className={`rounded-full px-4 min-h-[44px] justify-center ${
              activeCategory === chip.key ? "bg-brand" : "bg-gray-100"
            }`}
            onPress={() => setActiveCategory(chip.key)}
          >
            <Text
              className={`text-body font-medium ${
                activeCategory === chip.key ? "text-white" : "text-ink-soft"
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
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <Text className="text-body text-ink-soft text-center mt-10">
            暂无商品数据
          </Text>
        }
        renderItem={({ item }) => <FlyerItemRow item={item} />}
      />
    </View>
  );
}
