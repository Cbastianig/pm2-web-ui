import { cn } from "@/lib/utils";

export function AppLogo({
  className,
  withGlow = true,
  size = "default",
}: {
  className?: string;
  withGlow?: boolean;
  size?: "sm" | "default" | "lg";
}) {
  const sizes = {
    sm: { box: "size-7", icon: "size-3.5" },
    default: { box: "size-8", icon: "size-4" },
    lg: { box: "size-10", icon: "size-5" },
  } as const;
  const s = sizes[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-brand",
        s.box,
        withGlow && "shadow-[0_4px_18px_-4px_oklch(0.6_0.22_264/0.55)]",
        className,
      )}
    >
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("relative text-white drop-shadow-sm", s.icon)}
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    </div>
  );
}
