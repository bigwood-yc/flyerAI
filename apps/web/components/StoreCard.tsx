import Link from "next/link";

interface Props {
  merchant: string;
  postalCode: string;
}

export default function StoreCard({ merchant, postalCode }: Props) {
  const href = `/flyers/${encodeURIComponent(merchant)}?postal_code=${postalCode}`;
  return (
    <Link href={href}>
      <div className="bg-white border border-gray-200 rounded-xl p-4
                      hover:shadow-md hover:border-blue-400 transition cursor-pointer">
        <div className="text-title font-semibold text-ink">{merchant}</div>
        <div className="text-body text-brand mt-1">查看传单 →</div>
      </div>
    </Link>
  );
}
