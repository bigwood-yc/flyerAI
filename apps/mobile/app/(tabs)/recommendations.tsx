import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { usePostalCode } from "../../lib/PostalCodeContext";
import { useRecommendationsQuery, useSlowLoadHint } from "../../lib/queries";
import CategoryCard from "../../components/CategoryCard";

export default function RecommendationsScreen() {
  const { postalCode } = usePostalCode();
  const router = useRouter();
  const { stores: storesParam } = useLocalSearchParams<{ stores?: string | string[] }>();
  const [isNavigating, setIsNavigating] = useState(false);

  useFocusEffect(useCallback(() => { setIsNavigating(false); }, []));

  const storeFilter: string[] | undefined = storesParam
    ? (Array.isArray(storesParam) ? storesParam : storesParam.split(","))
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const { data, isLoading, isFetching, error, refetch } = useRecommendationsQuery(
    postalCode,
    storeFilter,
  );
  const slow = useSlowLoadHint(isLoading);

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
        <Text className="text-body text-ink-soft mt-4">正在加载本周特价...</Text>
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
          <Text className="text-white font-bold text-body">重新查找</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || data.weekly_guide.length === 0) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        <Text className="text-body text-ink-soft text-center leading-7">
          该地区暂无传单数据
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
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor="#2563eb" />
        }
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-title font-bold text-ink">
              本周推荐 · {postalCode}
            </Text>
            {storeFilter && storeFilter.length > 0 && (
              <Text className="text-caption text-brand mt-1">
                已筛选 {storeFilter.length} 家超市
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CategoryCard
            guide={item}
            postalCode={postalCode}
            onPress={() => {
              if (isNavigating) return;
              setIsNavigating(true);
              router.push({
                pathname: "/flyer/[store]",
                params: { store: item.best_store, postal_code: postalCode },
              });
            }}
          />
        )}
      />
    </View>
  );
}
