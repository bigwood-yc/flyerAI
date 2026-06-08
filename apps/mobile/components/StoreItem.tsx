import { TouchableOpacity, View, Text } from "react-native";

interface Props {
  merchant: string;
  onPress: () => void;
}

export default function StoreItem({ merchant, onPress }: Props) {
  return (
    <TouchableOpacity
      className="bg-white border border-gray-200 rounded-lg px-4 py-4 mb-3 flex-row items-center justify-between"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`查看 ${merchant} 传单`}
    >
      <View className="flex-row items-center gap-3">
        <Text className="text-2xl" accessibilityElementsHidden>
          🏪
        </Text>
        <Text className="text-sm font-semibold text-gray-900">{merchant}</Text>
      </View>
      <Text className="text-blue-500 text-sm">查看传单 →</Text>
    </TouchableOpacity>
  );
}
