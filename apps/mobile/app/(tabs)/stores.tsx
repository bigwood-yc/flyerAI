import { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { useFlyersQuery, useSlowLoadHint } from "../../lib/queries";
import StoreItem from "../../components/StoreItem";

export default function StoresScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const { data, isLoading, isFetching, error, refetch } = useFlyersQuery(postalCode);
  const slow = useSlowLoadHint(isLoading);
  const [isNavigating, setIsNavigating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => { setIsNavigating(false); }, []));

  // Deduplicate by merchant (API sorts by distance asc, so first = closest).
  const flyers = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return data.flyers.filter((f) => {
      if (seen.has(f.merchant)) return false;
      seen.add(f.merchant);
      return true;
    });
  }, [data]);

  // Reset selection when the area changes (not on background refetch).
  useEffect(() => { setSelected(new Set()); }, [postalCode]);

  const allSelected = flyers.length > 0 && selected.size === flyers.length;

  const toggleStore = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) next.delete(merchant);
      else next.add(merchant);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(flyers.map((f) => f.merchant)));
  };

  const handleRecommend = () => {
    if (flyers.length === 0 || isNavigating) return;
    setIsNavigating(true);
    const selectedArr = Array.from(selected);
    const params: Record<string, string> = {};
    if (selectedArr.length > 0 && selectedArr.length < flyers.length) {
      params.stores = selectedArr.join(",");
    }
    router.push({ pathname: "/(tabs)/recommendations", params });
  };

  if (!postalCode) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-title text-ink-soft text-center leading-8">
          请先在首页输入邮编
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-8">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="text-body text-ink-soft mt-4">正在加载超市列表...</Text>
        {slow && (
          <Text className="text-caption text-ink-soft mt-2 text-center leading-6">
            首次启动服务器需 30–60 秒，请耐心等待，不要离开此页面
          </Text>
        )}
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-body text-red-600 text-center mb-5 leading-7">
          {error instanceof Error ? error.message : "加载失败，请重试"}
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
      {data?.stale && (
        <View className="bg-amber-100 px-4 py-2">
          <Text className="text-warn text-caption text-center">
            显示的是缓存数据，可能不是最新传单
          </Text>
        </View>
      )}

      <FlatList
        data={flyers}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor="#2563eb" />
        }
        ListHeaderComponent={
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-title font-bold text-ink">
              附近超市 · {postalCode}
            </Text>
            {flyers.length > 0 && (
              <TouchableOpacity onPress={toggleAll} className="min-h-[44px] justify-center px-1">
                <Text className="text-brand text-body font-medium">
                  {allSelected ? "取消全选" : "全选"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text className="text-body text-ink-soft text-center mt-10">
            该地区暂无传单
          </Text>
        }
        renderItem={({ item }) => (
          <StoreItem
            merchant={item.merchant}
            distanceKm={item.distance_km}
            address={item.address}
            selected={selected.has(item.merchant)}
            onToggleSelect={() => toggleStore(item.merchant)}
            onNavigate={() => {
              if (isNavigating) return;
              setIsNavigating(true);
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.merchant, postal_code: postalCode },
              });
            }}
          />
        )}
      />

      {/* Sticky bottom: Generate Recommendations button */}
      {flyers.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <TouchableOpacity
            className={`rounded-2xl min-h-[56px] items-center justify-center ${
              selected.size === 0 ? "bg-gray-300" : "bg-price"
            }`}
            onPress={handleRecommend}
            disabled={selected.size === 0 || isNavigating}
          >
            <Text className="text-white font-bold text-title">
              {selected.size === 0
                ? "请选择至少一家超市"
                : `本周推荐 · ${selected.size}家超市 →`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
