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
        className="text-6xl mb-4"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        🛒
      </Text>
      <Text className="text-display font-bold text-ink mb-2">本周特价</Text>
      <Text className="text-body text-ink-soft mb-8 text-center leading-7">
        输入邮编，找附近最便宜的超市
      </Text>
      <PostalCodeInput onSubmit={handleSubmit} />
    </View>
  );
}
