"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Tab = "signin" | "signup" | "magic";
type SignupStep = "form" | "verify";

export default function LoginPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("signin");

  // Sign-in state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign-up state
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [signupStep, setSignupStep] = useState<SignupStep>("form");

  // Magic link state
  const [mlEmail, setMlEmail] = useState("");
  const [mlSent, setMlSent] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchTab(t: Tab) {
    setTab(t);
    setError("");
  }

  async function handleSignIn() {
    if (!siEmail || !siPassword) { setError("请填写邮箱和密码"); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: siEmail,
        password: siPassword,
      });
      if (error) { setError(error.message); return; }
      window.location.href = "/";
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
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(error.message); return; }
      setSignupStep("verify");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!mlEmail.includes("@")) { setError("请输入有效邮箱"); return; }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: mlEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(error.message); return; }
      setMlSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "发送失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  const tabClass = (t: Tab) =>
    `flex-1 py-2 text-sm font-medium rounded-lg transition ${
      tab === t
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span aria-hidden="true">🛒</span> Grocery AI
          </h1>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button className={tabClass("signin")} onClick={() => switchTab("signin")}>登录</button>
          <button className={tabClass("signup")} onClick={() => switchTab("signup")}>注册</button>
          <button className={tabClass("magic")} onClick={() => switchTab("magic")}>链接</button>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Sign-in tab */}
        {tab === "signin" && (
          <div className="space-y-3">
            <input
              type="email"
              value={siEmail}
              onChange={(e) => setSiEmail(e.target.value)}
              placeholder="邮箱"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="password"
              value={siPassword}
              onChange={(e) => setSiPassword(e.target.value)}
              placeholder="密码"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
            />
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </div>
        )}

        {/* Sign-up tab */}
        {tab === "signup" && signupStep === "form" && (
          <div className="space-y-3">
            <input
              type="email"
              value={suEmail}
              onChange={(e) => setSuEmail(e.target.value)}
              placeholder="邮箱"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="password"
              value={suPassword}
              onChange={(e) => setSuPassword(e.target.value)}
              placeholder="密码（至少 8 位）"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              value={suConfirm}
              onChange={(e) => setSuConfirm(e.target.value)}
              placeholder="再次输入密码"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
            />
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "注册中..." : "注册"}
            </button>
          </div>
        )}

        {tab === "signup" && signupStep === "verify" && (
          <div className="space-y-4 text-center">
            <div className="text-4xl" aria-hidden="true">📬</div>
            <p className="text-sm text-gray-600">
              验证邮件已发送至 <span className="font-medium">{suEmail}</span>。
              <br />
              请点击邮件中的链接完成验证，之后即可登录。
            </p>
            <button
              onClick={() => { setSignupStep("form"); setError(""); }}
              className="w-full text-gray-400 text-sm hover:text-gray-600"
            >
              ← 返回
            </button>
          </div>
        )}

        {/* Magic link tab */}
        {tab === "magic" && !mlSent && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">发送一次性登录链接到邮箱，无需密码。</p>
            <input
              type="email"
              value={mlEmail}
              onChange={(e) => setMlEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
              autoFocus
            />
            <button
              onClick={handleMagicLink}
              disabled={loading || !mlEmail.includes("@")}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "发送中..." : "发送登录链接"}
            </button>
          </div>
        )}

        {tab === "magic" && mlSent && (
          <div className="space-y-4 text-center">
            <div className="text-4xl" aria-hidden="true">📬</div>
            <p className="text-sm text-gray-600">
              登录链接已发送至 {mlEmail}。<br />
              <span className="text-gray-400">Click the link in your email to sign in.</span>
            </p>
            <button
              onClick={() => { setMlSent(false); setError(""); }}
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
