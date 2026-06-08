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
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!postalCode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getFlyers(postalCode)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败，请重试");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postalCode, retryKey]);

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
