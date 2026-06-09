import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export default function OnboardingScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const postalValid = !postalCode || POSTAL_RE.test(postalCode);

  async function complete(skip = false) {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { error: err } = await supabase
        .from("user_profiles")
        .update({
          phone: skip ? null : (phone.trim() || null),
          preferred_postal_code: skip
            ? null
            : (postalCode.trim().toUpperCase() || null),
          onboarding_done: true,
        })
        .eq("id", user.id);

      if (err) { setError(err.message); return; }
      router.replace("/(tabs)");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full space-y-6">
            <View className="space-y-1">
              <Text className="text-xl font-bold text-gray-900">完善资料</Text>
              <Text className="text-sm text-gray-500">
                仅需一次，随时可修改
              </Text>
            </View>

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            <View className="space-y-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  常用邮编{" "}
                  <Text className="text-gray-400 font-normal">（可选）</Text>
                </Text>
                <TextInput
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="L3R 0B1"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="常用邮编"
                />
                {postalCode !== "" && !postalValid && (
                  <Text className="text-red-500 text-xs mt-1">
                    格式应为 A1A 1A1
                  </Text>
                )}
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  手机号{" "}
                  <Text className="text-gray-400 font-normal">（可选）</Text>
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 416 000 0000"
                  keyboardType="phone-pad"
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="手机号"
                />
              </View>
            </View>

            <View className="space-y-2">
              <TouchableOpacity
                onPress={() => complete(false)}
                disabled={loading || !postalValid}
                className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                accessibilityRole="button"
                accessibilityLabel="开始使用"
              >
                <Text className="text-white font-semibold text-center">
                  {loading ? "保存中..." : "开始使用"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => complete(true)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="跳过"
              >
                <Text className="text-gray-400 text-sm text-center py-1">
                  跳过
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
