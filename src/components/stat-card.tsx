import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Gradient = "brand" | "success" | "warm" | "violet" | "info";

const gradientStyles: Record<
  Gradient,
  { bg: string; text: string; ring: string; glow: string }
> = {
  brand: {
    bg: "bg-gradient-brand",
    text: "text-[oklch(0.78_0.18_255)]",
    ring: "ring-[oklch(0.72_0.18_255/0.25)]",
    glow: "shadow-[0_8px_28px_-12px_oklch(0.6_0.22_264/0.55)]",
  },
  success: {
    bg: "bg-gradient-success",
    text: "text-[oklch(0.85_0.19_155)]",
    ring: "ring-[oklch(0.78_0.19_155/0.25)]",
    glow: "shadow-[0_8px_28px_-12px_oklch(0.6_0.22_155/0.55)]",
  },
  warm: {
    bg: "bg-gradient-warm",
    text: "text-[oklch(0.88_0.17_75)]",
    ring: "ring-[oklch(0.82_0.17_75/0.25)]",
    glow: "shadow-[0_8px_28px_-12px_oklch(0.7_0.18_75/0.55)]",
  },
  violet: {
    bg: "bg-gradient-violet",
    text: "text-[oklch(0.82_0.2_295)]",
    ring: "ring-[oklch(0.72_0.2_295/0.25)]",
    glow: "shadow-[0_8px_28px_-12px_oklch(0.55_0.22_295/0.55)]",
  },
  info: {
    bg: "bg-gradient-to-br from-[oklch(0.7_0.17_220)] to-[oklch(0.72_0.18_255)]",
    text: "text-[oklch(0.85_0.16_220)]",
    ring: "ring-[oklch(0.78_0.16_220/0.25)]",
    glow: "shadow-[0_8px_28px_-12px_oklch(0.6_0.18_220/0.55)]",
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  gradient = "brand",
  className,
  iconClassName,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  description?: ReactNode;
  trend?: { value: string; positive?: boolean };
  gradient?: Gradient;
  className?: string;
  iconClassName?: string;
}) {
  const g = gradientStyles[gradient];

  return (
    <Card
      className={cn(
        "group relative overflow-hidden card-elevated transition-all duration-300 hover:-translate-y-0.5 hover:glow",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 size-40 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-40",
          g.bg,
        )}
      />
      <CardContent className="relative flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-lg ring-1 transition-transform duration-300 group-hover:scale-110",
              g.ring,
              g.bg,
            )}
          >
            <Icon
              className={cn("size-4 text-white drop-shadow-sm", iconClassName)}
            />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                trend.positive
                  ? "text-[oklch(0.85_0.19_155)]"
                  : "text-[oklch(0.82_0.18_25)]",
              )}
            >
              {trend.positive ? "+" : ""}
              {trend.value}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
