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
    const storePart = guide.best_store.replace(/ /g, "+");
    const postalPart = postalCode.replace(/ /g, "+");
    const url = `https://www.google.com/maps/search/${storePart}+near+${postalPart}`;
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
    <View className="bg-white rounded-2xl mb-4 border border-gray-200 overflow-hidden">
      {/* Category title */}
      <View className="px-4 pt-4 pb-1 flex-row items-center gap-2">
        <Text className="text-headline" accessibilityElementsHidden>{guide.emoji}</Text>
        <Text className="text-title font-bold text-ink">{guide.category_zh}</Text>
      </View>

      {/* Best store + map button */}
      <View className="px-4 pb-3 flex-row items-center justify-between">
        <View className="flex-1 min-w-0 pr-3">
          <Text className="text-caption text-ink-soft">最优超市</Text>
          <Text className="text-title font-semibold text-brand" numberOfLines={1}>
            {guide.best_store}
          </Text>
        </View>
        <TouchableOpacity
          className="bg-price rounded-xl px-4 min-h-[48px] items-center justify-center flex-shrink-0"
          onPress={openMaps}
          accessibilityRole="button"
          accessibilityLabel={`在地图中查找 ${guide.best_store}`}
        >
          <Text className="text-white text-body font-semibold">🗺 门店地图</Text>
        </TouchableOpacity>
      </View>

      {/* Deals list */}
      <View className="border-t border-gray-100 px-4 py-1.5">
        {guide.deals.map((deal) => {
          const unit = parsePriceUnit(deal.price_text);
          return (
            <View key={deal.name} className="flex-row items-center justify-between py-2">
              <Text className="text-body text-ink flex-1 min-w-0 pr-3" numberOfLines={1}>
                {deal.zh_name}
              </Text>
              <Text className="text-headline font-bold text-price flex-shrink-0">
                ${deal.price.toFixed(2)}
                {unit ? <Text className="text-caption text-ink-soft">/{unit}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Footer: clear call-to-action to open the full flyer */}
      <TouchableOpacity
        className="border-t border-gray-100 min-h-[52px] items-center justify-center bg-gray-50"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`查看 ${guide.best_store} 的全部特价`}
      >
        <Text className="text-body font-semibold text-brand">查看全部特价 →</Text>
      </TouchableOpacity>
    </View>
  );
}
