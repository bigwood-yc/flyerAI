"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Surface the error to the user (simple alert is fine for now)
      console.error("Sign out failed:", error.message);
      alert("退出失败，请刷新页面重试");
      return;
    }
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-gray-500 hover:text-gray-800"
    >
      退出
    </button>
  );
}
