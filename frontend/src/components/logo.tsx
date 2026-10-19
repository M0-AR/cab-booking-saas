import { CarIcon } from "@/components/Icons";
import { cn } from "@/lib/utils";

/**
 * Tenant logo mark. Renders the tenant's uploaded logo when available;
 * otherwise a brand-colored tile with the CabDesk car glyph.
 */
export function LogoMark({
  size = 28,
  logoUrl,
  className,
}: {
  size?: number;
  logoUrl?: string | null;
  className?: string;
}) {
  const dim = { width: size, height: size };

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        style={dim}
        className={cn(
          "shrink-0 rounded-lg border border-border bg-surface object-contain",
          className,
        )}
      />
    );
  }

  return (
    <span
      style={dim}
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-brand text-brand-fg",
        className,
      )}
    >
      <CarIcon size={Math.round(size * 0.58)} />
    </span>
  );
}
