/**
 * Sync's remembered settings, held in the `sp_sync` cookie.
 *
 * Two kinds of thing live here:
 *
 * - **Display settings** — font size, margins, theme. These belong to the
 *   screen being projected on, not to the passage, so they are remembered
 *   rather than put in a link.
 * - **Preferred versions** — used only when a link names none. The link's own
 *   versions always win, so a link passed to someone else shows them what the
 *   sender saw rather than whatever that person last picked.
 *
 * Nothing is written until a setting is actually changed, and the cookie
 * holds only these values: no identifier, nothing that profiles anyone. It is
 * scoped to `/sync`, so it is not even sent with the rest of the site's
 * requests, and the server never reads it. See the privacy notes in CLAUDE.md.
 */

import { MAX_SYNC_VERSIONS, parseVersionIds } from "../../shared/sync-path.ts";

export const COOKIE_NAME = "sp_sync";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type Theme = "system" | "light" | "dark";

/** Space kept clear at each edge of the screen, in CSS pixels. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SyncSettings {
  versionIds: number[];
  /** Base verse size in CSS pixels, before balancing or fitting. */
  fontSize: number;
  margins: Margins;
  theme: Theme;
  /** Even out column lengths by scaling each column's text. */
  balance: boolean;
}

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 120;
export const MARGIN_MAX = 1000;

export const DEFAULT_SETTINGS: SyncSettings = {
  versionIds: [],
  fontSize: 36,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  theme: "system",
  balance: true,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

/** Validate untrusted settings, filling anything missing from the defaults. */
export function normaliseSettings(input: unknown): SyncSettings {
  const raw = (
    typeof input === "object" && input !== null ? input : {}
  ) as Record<string, unknown>;
  const margins = (
    typeof raw.margins === "object" && raw.margins !== null ? raw.margins : {}
  ) as Record<string, unknown>;
  const margin = (side: keyof Margins) =>
    clamp(margins[side], 0, MARGIN_MAX, 0);

  return {
    versionIds: Array.isArray(raw.versionIds)
      ? parseVersionIds(raw.versionIds.join(",")).slice(0, MAX_SYNC_VERSIONS)
      : [],
    fontSize: Math.round(
      clamp(
        raw.fontSize,
        FONT_SIZE_MIN,
        FONT_SIZE_MAX,
        DEFAULT_SETTINGS.fontSize,
      ),
    ),
    margins: {
      top: margin("top"),
      right: margin("right"),
      bottom: margin("bottom"),
      left: margin("left"),
    },
    theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : "system",
    balance: typeof raw.balance === "boolean" ? raw.balance : true,
  };
}

/** The raw value of a cookie in a `document.cookie` string, or null. */
export function readCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

/** Parse a stored cookie value; null when absent or unreadable. */
export function parseSettings(value: string | null): SyncSettings | null {
  if (!value) return null;
  try {
    return normaliseSettings(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

export function serialiseSettings(settings: SyncSettings): string {
  return encodeURIComponent(JSON.stringify(settings));
}

/** Saved settings, or null if this browser has none. */
export function loadSettings(): SyncSettings | null {
  return parseSettings(readCookie(document.cookie, COOKIE_NAME));
}

function writeCookie(value: string, maxAge: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/sync; ` +
    `SameSite=Lax${secure}`;
}

export function saveSettings(settings: SyncSettings): void {
  writeCookie(serialiseSettings(settings), MAX_AGE_SECONDS);
}

export function forgetSettings(): void {
  writeCookie("", 0);
}
