import { ImageResponse } from "next/og";
import { BrandIconBadge } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandIconBadge size={180} />, { ...size });
}
