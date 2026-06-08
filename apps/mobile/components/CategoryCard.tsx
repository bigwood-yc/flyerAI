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
      {/* Category title */}
      <Text className="text-sm font-bold text-gray-900 mb-2">
        {guide.emoji} {guide.category_zh}
      </Text>

      {/* Store name + navigation button (left-aligned) */}
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

      {/* Deals list (left-aligned) */}
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
