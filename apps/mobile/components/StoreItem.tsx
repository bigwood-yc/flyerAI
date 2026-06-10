import { TouchableOpacity, View, Text } from "react-native";

interface Props {
  merchant: string;
  distanceKm?: number | null;
  address?: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onNavigate: () => void;
}

export default function StoreItem({
  merchant,
  distanceKm,
  address,
  selected,
  onToggleSelect,
  onNavigate,
}: Props) {
  return (
    <View className="bg-white border border-gray-200 rounded-lg mb-3 flex-row items-stretch overflow-hidden">
      {/* Checkbox touch zone (left) */}
      <TouchableOpacity
        className={`w-14 items-center justify-center border-r ${
          selected ? "bg-blue-50 border-blue-200" : "border-gray-100"
        }`}
        onPress={onToggleSelect}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${selected ? "取消选择" : "选择"} ${merchant}`}
      >
        <View
          className={`w-5 h-5 rounded border-2 items-center justify-center ${
            selected ? "bg-blue-500 border-blue-500" : "border-gray-300"
          }`}
        >
          {selected && (
            <Text className="text-white text-xs font-bold">✓</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Store info + navigation (right) */}
      <TouchableOpacity
        className="flex-1 px-4 py-4 flex-row items-center justify-between"
        onPress={onNavigate}
        accessibilityRole="button"
        accessibilityLabel={`查看 ${merchant} 传单`}
      >
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <Text className="text-2xl" accessibilityElementsHidden>🏪</Text>
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
              {merchant}
            </Text>
            {distanceKm != null && (
              <Text className="text-xs text-gray-400 mt-0.5">
                📍 ~{Number(distanceKm).toFixed(1)} km
                {address ? `  ${address}` : ""}
              </Text>
            )}
            {distanceKm == null && address && (
              <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
                {address}
              </Text>
            )}
          </View>
        </View>
        <Text className="text-blue-500 text-sm ml-2">查看传单 →</Text>
      </TouchableOpacity>
    </View>
  );
}
