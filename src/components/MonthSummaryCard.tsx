interface MonthSummaryCardProps {
  title: string;
  amount: number;
  currency: string;
  subtitle: string;
}

export default function MonthSummaryCard({
  title,
  amount,
  currency,
  subtitle
}: MonthSummaryCardProps) {
  const amountLabel = currency ? `${currency} ${amount.toFixed(2)}` : amount.toFixed(0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-black">{amountLabel}</p>
      <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
