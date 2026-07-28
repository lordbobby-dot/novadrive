import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";
import { BrandIconMark } from "@/lib/brand-icon";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <BrandIconMark size={96} />
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2, marginTop: 32 }}>
          {SITE_NAME}
        </div>
        <div style={{ fontSize: 32, color: "#a1a1aa", marginTop: 16 }}>
          Enterprise Cloud Storage for Teams
        </div>
      </div>
    ),
    { ...size },
  );
}
