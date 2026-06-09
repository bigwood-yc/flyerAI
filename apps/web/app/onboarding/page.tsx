"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const postalValid = !postalCode || POSTAL_RE.test(postalCode);

  async function save(skip = false) {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error: err } = await supabase
      .from("user_profiles")
      .update({
        phone: skip ? null : (phone.trim() || null),
        preferred_postal_code: skip ? null : (postalCode.trim().toUpperCase() || null),
        onboarding_done: true,
      })
      .eq("id", user.id);

    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">完善资料</h1>
          <p className="text-sm text-gray-500 mt-1">
            仅需一次 / Fill in once, edit any time
          </p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="postal" className="block text-sm font-medium text-gray-700 mb-1">
              常用邮编 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              id="postal"
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="L3R 0B1"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {postalCode && !postalValid && (
              <p className="text-red-500 text-xs mt-1">
                格式应为 A1A 1A1 / Format: A1A 1A1
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              手机号 <span className="text-gray-400 font-normal">（可选）</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (416) 000-0000"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => save(false)}
            disabled={loading || !postalValid}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "保存中..." : "开始使用 / Get started"}
          </button>
          <button
            onClick={() => save(true)}
            className="w-full text-gray-400 text-sm hover:text-gray-600 py-1"
          >
            跳过 / Skip
          </button>
        </div>
      </div>
    </div>
  );
}
