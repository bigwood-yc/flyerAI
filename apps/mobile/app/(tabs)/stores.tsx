import { useEffect, useState, useMemo } from "react";
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
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!postalCode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getFlyers(postalCode)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          // Select all stores by default
          setSelected(new Set(d.flyers.map((f) => f.merchant)));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败，请重试");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postalCode, retryKey]);

  const allSelected = useMemo(
    () => data != null && selected.size === data.flyers.length,
    [selected, data]
  );

  const toggleStore = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) {
        next.delete(merchant);
      } else {
        next.add(merchant);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    setSelected(
      allSelected ? new Set() : new Set(data.flyers.map((f) => f.merchant))
    );
  };

  const handleRecommend = () => {
    if (!data) return;
    const selectedArr = Array.from(selected);
    const params: Record<string, string> = {};
    // Only pass stores param when it's a subset (not all selected)
    if (selectedArr.length > 0 && selectedArr.length < data.flyers.length) {
      params.stores = selectedArr.join(",");
    }
    router.push({
      pathname: "/(tabs)/recommendations",
      params,
    });
  };

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
          onPress={() => setRetryKey((k) => k + 1)}
        >
          <Text className="text-white font-bold">重新加载</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const flyers = data?.flyers ?? [];

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
        data={flyers}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-gray-900">
              附近超市 · {postalCode}
            </Text>
            {flyers.length > 0 && (
              <TouchableOpacity onPress={toggleAll}>
                <Text className="text-blue-500 text-sm">
                  {allSelected ? "取消全选" : "全选"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text className="text-gray-400 text-center mt-8">
            该地区暂无传单 / No flyers available
          </Text>
        }
        renderItem={({ item }) => (
          <StoreItem
            merchant={item.merchant}
            distanceKm={item.distance_km}
            selected={selected.has(item.merchant)}
            onToggleSelect={() => toggleStore(item.merchant)}
            onNavigate={() =>
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.merchant, postal_code: postalCode },
              })
            }
          />
        )}
      />

      {/* Sticky bottom: Generate Recommendations button */}
      {flyers.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
          <TouchableOpacity
            className={`rounded-xl py-3 items-center ${
              selected.size === 0 ? "bg-gray-300" : "bg-green-600"
            }`}
            onPress={handleRecommend}
            disabled={selected.size === 0}
          >
            <Text className="text-white font-bold text-base">
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
