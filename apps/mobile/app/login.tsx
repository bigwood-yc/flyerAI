import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

type Tab = "signin" | "signup" | "otp";
type SignupStep = "form" | "verify";

export default function LoginScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");

  // Sign-in state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign-up state
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [signupStep, setSignupStep] = useState<SignupStep>("form");

  // OTP state
  const [otpEmail, setOtpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchTab(t: Tab) {
    setTab(t);
    setError("");
  }

  async function redirectAfterLogin(userId: string) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarding_done")
      .eq("id", userId)
      .single();
    router.replace(profile?.onboarding_done ? "/(tabs)" : "/onboarding");
  }

  async function handleSignIn() {
    if (!siEmail || !siPassword) { setError("请填写邮箱和密码"); return; }
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: siEmail,
        password: siPassword,
      });
      if (error) { setError(error.message); return; }
      if (!data.user) { setError("登录失败，请重试"); return; }
      await redirectAfterLogin(data.user.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    if (!suEmail || !suPassword) { setError("请填写邮箱和密码"); return; }
    if (suPassword !== suConfirm) { setError("两次密码不一致"); return; }
    if (suPassword.length < 8) { setError("密码至少 8 位"); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signUp({
        email: suEmail,
        password: suPassword,
      });
      if (error) { setError(error.message); return; }
      setSignupStep("verify");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    if (!otpEmail.includes("@")) { setError("请输入有效邮箱"); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: otpEmail,
        options: { shouldCreateUser: true },
      });
      if (error) { setError(error.message); return; }
      setOtpSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发送失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otp,
        type: "email",
      });
      if (error) { setError(error.message); return; }
      if (!data.user) { setError("验证失败，请重试"); return; }
      await redirectAfterLogin(data.user.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "验证失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  const tabStyle = (t: Tab) =>
    `flex-1 py-2 items-center rounded-lg ${tab === t ? "bg-white shadow" : ""}`;
  const tabTextStyle = (t: Tab) =>
    `text-xs font-medium ${tab === t ? "text-gray-900" : "text-gray-500"}`;

  const inputClass = "w-full border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm";

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full space-y-6">
            <View className="space-y-1">
              <Text className="text-2xl font-bold text-gray-900">🛒 Grocery AI</Text>
            </View>

            {/* Tab switcher */}
            <View className="flex-row bg-gray-100 rounded-xl p-1 gap-1">
              <TouchableOpacity className={tabStyle("signin")} onPress={() => switchTab("signin")}>
                <Text className={tabTextStyle("signin")}>登录</Text>
              </TouchableOpacity>
              <TouchableOpacity className={tabStyle("signup")} onPress={() => switchTab("signup")}>
                <Text className={tabTextStyle("signup")}>注册</Text>
              </TouchableOpacity>
              <TouchableOpacity className={tabStyle("otp")} onPress={() => switchTab("otp")}>
                <Text className={tabTextStyle("otp")}>验证码</Text>
              </TouchableOpacity>
            </View>

            {!!error && (
              <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            )}

            {/* Sign-in */}
            {tab === "signin" && (
              <View className="space-y-3">
                <TextInput
                  value={siEmail}
                  onChangeText={setSiEmail}
                  placeholder="邮箱"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className={inputClass}
                />
                <TextInput
                  value={siPassword}
                  onChangeText={setSiPassword}
                  placeholder="密码"
                  secureTextEntry
                  className={inputClass}
                />
                <TouchableOpacity
                  onPress={handleSignIn}
                  disabled={loading}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "登录中..." : "登录"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sign-up */}
            {tab === "signup" && signupStep === "form" && (
              <View className="space-y-3">
                <TextInput
                  value={suEmail}
                  onChangeText={setSuEmail}
                  placeholder="邮箱"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className={inputClass}
                />
                <TextInput
                  value={suPassword}
                  onChangeText={setSuPassword}
                  placeholder="密码（至少 8 位）"
                  secureTextEntry
                  className={inputClass}
                />
                <TextInput
                  value={suConfirm}
                  onChangeText={setSuConfirm}
                  placeholder="再次输入密码"
                  secureTextEntry
                  className={inputClass}
                />
                <TouchableOpacity
                  onPress={handleSignUp}
                  disabled={loading}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "注册中..." : "注册"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {tab === "signup" && signupStep === "verify" && (
              <View className="space-y-4 items-center">
                <Text className="text-4xl">📬</Text>
                <Text className="text-sm text-gray-600 text-center">
                  验证邮件已发送至{"\n"}
                  <Text className="font-medium">{suEmail}</Text>
                  {"\n\n"}请在浏览器中点击邮件链接完成验证，
                  然后切换到「登录」Tab 用密码登录。
                </Text>
                <TouchableOpacity onPress={() => { setSignupStep("form"); setError(""); }}>
                  <Text className="text-gray-400 text-sm">← 返回</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* OTP (magic link) */}
            {tab === "otp" && !otpSent && (
              <View className="space-y-3">
                <Text className="text-xs text-gray-500">发送 6 位验证码到邮箱，无需密码。</Text>
                <TextInput
                  value={otpEmail}
                  onChangeText={setOtpEmail}
                  placeholder="邮箱"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className={inputClass}
                  accessibilityLabel="邮箱地址"
                />
                <TouchableOpacity
                  onPress={sendOtp}
                  disabled={loading || !otpEmail.includes("@")}
                  className="w-full bg-blue-600 rounded-xl py-3 disabled:opacity-50"
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "发送中..." : "发送验证码"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {tab === "otp" && otpSent && (
              <View className="space-y-3">
                <Text className="text-xs text-gray-500 text-center">
                  验证码已发至 {otpEmail}
                </Text>
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
                >
                  <Text className="text-white font-semibold text-center">
                    {loading ? "验证中..." : "登录"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(""); setError(""); }}>
                  <Text className="text-gray-400 text-sm text-center">← 重新输入邮箱</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
