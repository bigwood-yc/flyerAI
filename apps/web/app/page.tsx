import PostalCodeForm from "@/components/PostalCodeForm";

export default function HomePage() {
  return (
    <div className="space-y-8 pt-4">
      <div>
        <h2 className="text-display font-bold mb-1 text-ink">查找附近特价</h2>
        <p className="text-ink-soft text-body">输入邮编，找附近最便宜的超市</p>
      </div>
      <PostalCodeForm />
    </div>
  );
}
