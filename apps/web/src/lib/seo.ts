/** Falls back to the real production origin so metadata resolves correctly even if
 * NEXT_PUBLIC_APP_URL isn't set for a given build (e.g. local dev). */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://novadrive.novitasweb.works";

export const SITE_NAME = "NovaDrive";

export const SITE_DESCRIPTION =
  "NovaDrive is enterprise-grade cloud storage for teams — resumable virus-scanned uploads, full-text search, granular permissions, and public share links, all with a complete audit trail.";

export const SITE_KEYWORDS = [
  "cloud storage",
  "team file sharing",
  "enterprise file storage",
  "secure file sharing",
  "document management",
  "file permissions",
  "virus scanning uploads",
];
