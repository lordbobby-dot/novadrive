import { cn } from "@/lib/utils";

/** The NovaDrive mark: two overlapping rounded squares (stacked files/layers). Pure `currentColor`
 * so it inherits the right shade in either theme without a separate light/dark asset. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-6 text-primary", className)}
      aria-hidden
    >
      <rect x="3" y="7" width="14" height="14" rx="3.5" fill="currentColor" opacity="0.35" />
      <rect x="7" y="3" width="14" height="14" rx="3.5" fill="currentColor" />
    </svg>
  );
}

export function LogoWordmark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Logo className={iconClassName} />
      NovaDrive
    </span>
  );
}
