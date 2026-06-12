import { View, Text } from "react-native";
import { parsePriceUnit, type FlyerItem } from "../lib/api";

interface Props {
  item: FlyerItem;
}

export default function FlyerItemRow({ item }: Props) {
  const unit = parsePriceUnit(item.price_text);
  return (
    <View className="bg-white border border-gray-200 rounded-2xl px-4 py-3 mb-2 min-h-[64px] flex-row items-center gap-3">
      <Text className="text-3xl w-10 text-center" accessibilityElementsHidden>
        {item.emoji}
      </Text>
      <View className="flex-1 min-w-0">
        <Text className="text-title font-semibold text-ink" numberOfLines={2}>
          {item.zh_name}
        </Text>
        <Text className="text-caption text-ink-soft" numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View className="items-end flex-shrink-0">
        <Text className="text-headline font-bold text-price">
          ${item.price.toFixed(2)}
        </Text>
        {unit ? <Text className="text-caption text-ink-soft">/{unit}</Text> : null}
      </View>
    </View>
  );
}
