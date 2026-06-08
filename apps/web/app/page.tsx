import PostalCodeForm from "@/components/PostalCodeForm";

export default function HomePage() {
  return (
    <div className="space-y-8 pt-4">
      <div>
        <h2 className="text-2xl font-bold mb-1">查找附近特价</h2>
        <p className="text-gray-500 text-sm">Find the best grocery deals near you</p>
      </div>
      <PostalCodeForm />
    </div>
  );
}
