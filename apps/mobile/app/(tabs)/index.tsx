import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import PostalCodeInput from "../../components/PostalCodeInput";
import { usePostalCode } from "../../lib/PostalCodeContext";

export default function HomeScreen() {
  const router = useRouter();
  const { setPostalCode } = usePostalCode();

  const handleSubmit = (pc: string) => {
    setPostalCode(pc);
    router.push("/(tabs)/recommendations");
  };

  return (
    <View className="flex-1 bg-gray-50 items-center justify-center px-6">
      <Text
        className="text-4xl mb-3"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        🛒
      </Text>
      <Text className="text-2xl font-bold text-gray-900 mb-1">本周特价</Text>
      <Text className="text-sm text-gray-500 mb-8">
        找附近最低价超市 / Find This Week's Best Deals
      </Text>
      <PostalCodeInput onSubmit={handleSubmit} />
    </View>
  );
}
