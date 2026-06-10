"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Step = "email" | "sent";

export default function LoginPage() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMagicLink() {
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(error.message); return; }
      setStep("sent");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发送失败，请重试 / Send failed, please retry");
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
              : `登录链接已发送至 ${email}`}
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
              onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
              autoFocus
            />
            <button
              onClick={sendMagicLink}
              disabled={loading || !email.includes("@")}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "发送中..." : "发送登录链接 / Send magic link"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="text-4xl" aria-hidden="true">📬</div>
            <p className="text-sm text-gray-600">
              点击邮件中的登录链接即可完成登录。
              <br />
              <span className="text-gray-400">Click the link in your email to sign in.</span>
            </p>
            <button
              onClick={() => { setStep("email"); setError(""); }}
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
