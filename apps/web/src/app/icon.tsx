import { ImageResponse } from "next/og";
import { BrandIconBadge } from "@/lib/brand-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BrandIconBadge size={32} />, { ...size });
}
