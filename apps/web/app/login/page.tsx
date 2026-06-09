"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Step = "email" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) { setError(error.message); return; }
      setStep("otp");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发送失败，请重试 / Send failed, please retry");
    } finally {
      setLoading(false);
    }
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
      if (!data.user) { setError("登录失败，请重试 / Login failed, please try again"); return; }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_done")
        .eq("id", data.user.id)
        .single();

      router.push(profile?.onboarding_done ? "/" : "/onboarding");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span aria-hidden="true">🛒</span> Grocery AI
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {step === "email"
              ? "输入邮箱登录 / Enter your email to sign in"
              : `验证码已发送至 ${email} / Check your inbox`}
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {step === "email" ? (
          <div className="space-y-3">
            <label htmlFor="email" className="sr-only">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              autoFocus
            />
            <button
              onClick={sendOtp}
              disabled={loading || !email.includes("@")}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "发送中..." : "发送验证码 / Send code"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label htmlFor="otp" className="sr-only">验证码</label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="6 位验证码"
              maxLength={6}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && verifyOtp()}
              autoFocus
            />
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length < 6}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "验证中..." : "登录 / Verify"}
            </button>
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              className="w-full text-gray-400 text-sm hover:text-gray-600"
            >
              ← 重新输入邮箱 / Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
