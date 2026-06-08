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
