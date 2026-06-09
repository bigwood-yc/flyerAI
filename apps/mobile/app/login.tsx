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

type Step = "email" | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setStep("otp");
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });
      if (error) { setError(error.message); return; }
      if (!data.user) { setError("登录失败，请重试"); return; }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_done")
        .eq("id", data.user.id)
        .single();

      router.replace(profile?.onboarding_done ? "/(tabs)" : "/onboarding");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登录失败，请重试");
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
              <Text className="text-2xl font-bold text-gray-900">
                🛒 Grocery AI
              </Text>
              <Text className="text-sm text-gray-500">
                {step === "email"
                  ? "输入邮箱登录"
                  : `验证码已发送至\n${email}`}
              </Text>
            </View>

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            {step === "email" ? (
              <View className="space-y-3">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm"
                  accessibilityLabel="邮箱地址"
                />
                <TouchableOpacity
                  onPress={sendOtp}
                  disabled={loading || !email.includes("@")}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                  accessibilityRole="button"
                  accessibilityLabel="发送验证码"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "发送中..." : "发送验证码"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="space-y-3">
                <TextInput
                  value={otp}
                  onChangeText={(t) => setOtp(t.replace(/\D/g, ""))}
                  placeholder="6 位验证码"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="w-full border border-gray-300 bg-white rounded-xl px-4 py-4 text-xl text-center font-mono tracking-widest"
                  accessibilityLabel="验证码"
                />
                <TouchableOpacity
                  onPress={verifyOtp}
                  disabled={loading || otp.length < 6}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                  accessibilityRole="button"
                  accessibilityLabel="登录"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "验证中..." : "登录"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setStep("email"); setOtp(""); setError(""); }}
                  accessibilityRole="button"
                >
                  <Text className="text-gray-400 text-sm text-center">
                    ← 重新输入邮箱
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
