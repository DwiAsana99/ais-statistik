import { formatNumber } from "../../utils/formatters";

interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
  valueText?: string;
  statusLabel?: string;
  statusColor?: string;
}

export default function KpiCard({
  title,
  value,
  icon,
  color = "var(--color-secondary)",
  subtitle,
  valueText,
  statusLabel,
  statusColor,
}: KpiCardProps) {
  const chipColor = statusColor || color;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-base-300 bg-base-100 p-5">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-base-content/60">{title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-2xl leading-tight font-bold text-base-content">
            {valueText !== undefined ? valueText : formatNumber(value)}
          </p>
          {statusLabel && (
            <span
              className="badge badge-sm h-5 border font-semibold"
              style={{ backgroundColor: `${chipColor}20`, color: chipColor, borderColor: `${chipColor}40` }}
            >
              {statusLabel}
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-base-content/60">{subtitle}</p>}
      </div>
    </div>
  );
}
