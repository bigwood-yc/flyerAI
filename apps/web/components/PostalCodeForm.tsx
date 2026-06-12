"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PostalCodeForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(trimmed)) {
      setError("请输入有效的加拿大邮编，例如 L3R 0B1");
      return;
    }
    setError("");
    const pc = trimmed.replace(/\s/g, "").toUpperCase();
    router.push(`/flyers?postal_code=${pc}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="postal-code" className="block text-body text-ink-soft">
        邮政编码 / Postal Code
      </label>
      <div className="flex gap-2">
        <input
          id="postal-code"
          type="text"
          autoComplete="postal-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例如 L3R 0B1"
          maxLength={7}
          className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 text-title
                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          type="submit"
          className="bg-brand text-white px-6 min-h-[52px] rounded-xl text-body
                     hover:bg-blue-700 active:bg-blue-800 font-semibold flex-shrink-0"
        >
          查找
        </button>
      </div>
      {error && <p className="text-red-600 text-body">{error}</p>}
    </form>
  );
}
