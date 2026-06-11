interface PieChartItem {
  label: string;
  value: number;
  color: string;
}

interface SimplePieChartProps {
  title: string;
  items: PieChartItem[];
  currency?: string;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function createArcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

export default function SimplePieChart({
  title,
  items,
  currency = "USD"
}: SimplePieChartProps) {
  const filteredItems = items.filter((item) => item.value > 0);
  const total = filteredItems.reduce((sum, item) => sum + item.value, 0);

  let currentAngle = 0;
  const slices = filteredItems.map((item) => {
    const angle = total ? (item.value / total) * 360 : 0;
    const slice = {
      ...item,
      startAngle: currentAngle,
      endAngle: currentAngle + angle
    };
    currentAngle += angle;
    return slice;
  });

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      {!filteredItems.length ? (
        <p className="mt-4 text-sm text-gray-500">No data for this chart.</p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
          <svg viewBox="0 0 220 220" className="mx-auto h-[220px] w-[220px]">
            {slices.map((slice) => (
              <path
                key={slice.label}
                d={createArcPath(110, 110, 88, slice.startAngle, slice.endAngle)}
                fill={slice.color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            ))}
            <circle cx="110" cy="110" r="48" fill="#ffffff" />
            <text x="110" y="106" textAnchor="middle" fontSize="11" fill="#6b7280">
              Total
            </text>
            <text x="110" y="124" textAnchor="middle" fontSize="13" fill="#111827">
              {currency} {total.toFixed(0)}
            </text>
          </svg>
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-black">
                  {currency} {item.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
