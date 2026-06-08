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
      <label htmlFor="postal-code" className="block text-sm text-gray-600">
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
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded-lg
                     hover:bg-blue-700 active:bg-blue-800 font-medium"
        >
          查找
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
