/** The NovaDrive mark rendered with plain positioned `div`s (not SVG) — `next/og`'s ImageResponse
 * (satori) only supports a constrained flexbox/CSS subset, not arbitrary SVG paths. Mirrors
 * src/components/logo.tsx's two-overlapping-rounded-square design for use in generated images
 * (favicon, apple touch icon, OG/Twitter share images). */
export function BrandIconMark({ size, color = "#fafafa" }: { size: number; color?: string }) {
  const radius = size * (3.5 / 24);
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex" }}>
      <div
        style={{
          position: "absolute",
          left: size * (3 / 24),
          top: size * (7 / 24),
          width: size * (14 / 24),
          height: size * (14 / 24),
          borderRadius: radius,
          background: color,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * (7 / 24),
          top: size * (3 / 24),
          width: size * (14 / 24),
          height: size * (14 / 24),
          borderRadius: radius,
          background: color,
        }}
      />
    </div>
  );
}

/** The mark on its dark rounded-square badge background, as used for favicons/app icons. */
export function BrandIconBadge({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#0a0a0a",
        borderRadius: size * (7 / 32),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandIconMark size={size * (20 / 32)} />
    </div>
  );
}
