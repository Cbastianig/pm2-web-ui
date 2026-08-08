import { cn } from "@/lib/utils";

type StatusVariant =
  "online" | "stopped" | "error" | "warning" | "info" | "violet" | "neutral";

const variantStyles: Record<
  StatusVariant,
  { dot: string; text: string; glow: string }
> = {
  online: {
    dot: "bg-[oklch(0.78_0.19_155)]",
    text: "text-[oklch(0.85_0.19_155)]",
    glow: "shadow-[0_0_12px_-2px_oklch(0.78_0.19_155/0.6)]",
  },
  stopped: {
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
    glow: "",
  },
  error: {
    dot: "bg-[oklch(0.72_0.22_25)]",
    text: "text-[oklch(0.82_0.18_25)]",
    glow: "shadow-[0_0_12px_-2px_oklch(0.72_0.22_25/0.6)]",
  },
  warning: {
    dot: "bg-[oklch(0.82_0.17_75)]",
    text: "text-[oklch(0.88_0.16_75)]",
    glow: "shadow-[0_0_12px_-2px_oklch(0.82_0.17_75/0.6)]",
  },
  info: {
    dot: "bg-[oklch(0.78_0.16_220)]",
    text: "text-[oklch(0.85_0.16_220)]",
    glow: "shadow-[0_0_12px_-2px_oklch(0.78_0.16_220/0.6)]",
  },
  violet: {
    dot: "bg-[oklch(0.72_0.2_295)]",
    text: "text-[oklch(0.82_0.18_295)]",
    glow: "shadow-[0_0_12px_-2px_oklch(0.72_0.2_295/0.6)]",
  },
  neutral: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    glow: "",
  },
};

export function StatusDot({
  variant = "neutral",
  pulse = false,
  size = "default",
  className,
}: {
  variant?: StatusVariant;
  pulse?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "size-1.5",
    default: "size-2",
    lg: "size-2.5",
  } as const;
  const styles = variantStyles[variant];

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      data-status={variant}
    >
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex animate-pulse-glow rounded-full",
            sizeClasses[size],
            styles.dot,
            styles.glow,
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full",
          sizeClasses[size],
          styles.dot,
          pulse && styles.glow,
        )}
      />
    </span>
  );
}

export function StatusPill({
  variant = "neutral",
  children,
  className,
}: {
  variant?: StatusVariant;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = variantStyles[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-2 py-0.5 text-xs font-medium",
        styles.text,
        className,
      )}
    >
      <StatusDot
        variant={variant}
        size="sm"
        pulse={variant === "online" || variant === "error"}
      />
      {children}
    </span>
  );
}
