/*
 * Compliance expiry presentation. The backend stores plain dates and
 * deliberately keeps no status column — "expiring soon" is a presentation
 * concern with a single window (30 days) that matches the dashboard's
 * attention feed, so both stay consistent.
 */

export const EXPIRY_SOON_DAYS = 30;

export type ExpiryLevel = "ok" | "soon" | "expired";

export interface ExpiryInfo {
  level: ExpiryLevel;
  daysLeft: number;
  date: string;
}

export function expiryInfo(dateStr: string | null | undefined): ExpiryInfo | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((target.getTime() - today.getTime()) / 86400000);
  const level: ExpiryLevel =
    daysLeft < 0 ? "expired" : daysLeft <= EXPIRY_SOON_DAYS ? "soon" : "ok";
  return { level, daysLeft, date: dateStr };
}

/** Badge tone for `soon`/`expired` (matches standard status tones). */
export function expiryTone(info: ExpiryInfo): "cancelled" | "pending" {
  return info.level === "expired" ? "cancelled" : "pending";
}

/**
 * Short badge text for a document expiry: "expires 6d", "expired 3d",
 * "expires today". Only meaningful for `soon`/`expired` levels.
 */
export function expiryBadgeText(info: ExpiryInfo): string {
  if (info.level === "expired") return `expired ${Math.abs(info.daysLeft)}d`;
  if (info.daysLeft === 0) return "expires today";
  return `expires ${info.daysLeft}d`;
}
