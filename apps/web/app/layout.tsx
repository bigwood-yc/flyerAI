import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "本周特价 / Grocery Deals",
  description: "加拿大杂货特价推荐 / Canadian Grocery Deals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto">
            <span className="text-xl font-bold"><span aria-hidden="true">🛒</span> 本周特价 / This Week's Deals</span>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
