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
    <View className="bg-white border border-gray-200 rounded-2xl mb-3 flex-row items-stretch overflow-hidden">
      {/* Checkbox touch zone (left) */}
      <TouchableOpacity
        className={`w-16 items-center justify-center border-r ${
          selected ? "bg-blue-50 border-blue-200" : "border-gray-100"
        }`}
        onPress={onToggleSelect}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${selected ? "取消选择" : "选择"} ${merchant}`}
      >
        <View
          className={`w-7 h-7 rounded-md border-2 items-center justify-center ${
            selected ? "bg-brand border-brand" : "border-gray-300"
          }`}
        >
          {selected && <Text className="text-white text-body font-bold">✓</Text>}
        </View>
      </TouchableOpacity>

      {/* Store info + navigation (right) */}
      <TouchableOpacity
        className="flex-1 px-4 py-4 min-h-[64px] flex-row items-center justify-between"
        onPress={onNavigate}
        accessibilityRole="button"
        accessibilityLabel={`查看 ${merchant} 传单`}
      >
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          <Text className="text-headline" accessibilityElementsHidden>🏪</Text>
          <View className="flex-1 min-w-0">
            <Text className="text-title font-semibold text-ink" numberOfLines={1}>
              {merchant}
            </Text>
            {distanceKm != null && (
              <Text className="text-caption text-ink-soft mt-0.5" numberOfLines={1}>
                📍 ~{Number(distanceKm).toFixed(1)} km
                {address ? ` · ${address}` : ""}
              </Text>
            )}
            {distanceKm == null && address && (
              <Text className="text-caption text-ink-soft mt-0.5" numberOfLines={1}>
                {address}
              </Text>
            )}
          </View>
        </View>
        <Text className="text-brand text-body font-medium ml-2 flex-shrink-0">查看传单 →</Text>
      </TouchableOpacity>
    </View>
  );
}
