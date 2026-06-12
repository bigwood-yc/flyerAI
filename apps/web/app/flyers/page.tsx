import Link from "next/link";
import StoreSelector from "@/components/StoreSelector";
import { getFlyers } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

interface Props {
  searchParams: Promise<{ postal_code?: string }>;
}

export default async function FlyersPage({ searchParams }: Props) {
  const { postal_code } = await searchParams;
  const pc = postal_code ?? "";

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  if (!pc) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-body text-ink-soft">请先输入邮编</p>
        <Link href="/" className="text-brand text-body underline">返回首页</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getFlyers(pc, token);
  } catch {
    return (
      <div className="text-center py-12 text-red-600">
        无法获取传单，请稍后重试 / Could not retrieve flyers
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-display font-bold text-ink">邮编 {data.postal_code} 的传单</h2>
        <p className="text-body text-ink-soft">
          共 {data.flyers.length} 家超市
        </p>
      </div>

      {data.stale && (
        <p className="text-warn text-body bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg">
          数据来自缓存，可能不是最新
        </p>
      )}

      <StoreSelector flyers={data.flyers} postalCode={pc} />
    </div>
  );
}
