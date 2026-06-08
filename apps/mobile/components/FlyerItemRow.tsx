import { View, Text } from "react-native";
import { parsePriceUnit, type FlyerItem } from "../lib/api";

interface Props {
  item: FlyerItem;
}

export default function FlyerItemRow({ item }: Props) {
  const unit = parsePriceUnit(item.price_text);
  return (
    <View className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-2 flex-row items-center justify-between">
      <View className="flex-1 mr-3">
        <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
          {item.zh_name}
        </Text>
        <Text className="text-xs text-gray-400" numberOfLines={1}>
          {item.name}
          {" · "}
          <Text>{item.emoji}</Text>
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-base font-bold text-green-600">
          ${item.price.toFixed(2)}
        </Text>
        {unit ? (
          <Text className="text-xs text-gray-400">/{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}
