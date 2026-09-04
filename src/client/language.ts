/**
 * Keeping scripture in the reader's language.
 *
 * Machine translation rewrites the page and updates `<html lang>`, but it
 * cannot know that our quoted passages should be swapped for a real
 * translation in that language — it would just translate the English text,
 * which is exactly what this product exists to avoid. So the page watches for
 * a language change and re-fetches passages from a Bible in the new language.
 */

export interface VersionSummary {
  id: number;
  title: string;
  abbreviation: string;
  languageTag: string;
  copyright: string | null;
}

const versionCache = new Map<string, VersionSummary[]>();

/**
 * Normalise a BCP-47 tag for the API's `language_ranges` filter.
 *
 * The region is normally dropped ("fr-CA" to "fr"), but Chinese is special:
 * the script *is* the distinction, and collapsing "zh-TW" to "zh" hands a
 * Traditional reader Simplified Bibles.
 *
 * The platform tags its Traditional Bibles `zh-Hant-TW` (ids 312 and 1392) and
 * matches that tag exactly — filtering on a truncated "zh-Hant" returns
 * nothing — so the full tag is used, region included.
 */
const CHINESE_TAGS: Record<string, string> = {
  tw: "zh-Hant-TW",
  hk: "zh-Hant-TW",
  mo: "zh-Hant-TW",
  hant: "zh-Hant-TW",
  cn: "zh",
  sg: "zh",
  my: "zh",
  hans: "zh",
};

export function baseLanguage(tag: string): string {
  const lower = tag.toLowerCase();
  const parts = lower.split("-");
  // Splitting "" yields [""], not [], so an empty primary needs handling.
  const primary = parts[0] || "en";

  if (primary === "zh") {
    // Match on script or region, whichever the browser supplied.
    for (const part of parts.slice(1)) {
      const mapped = CHINESE_TAGS[part];
      if (mapped) return mapped;
    }
    // Bare "zh" means Simplified on this platform.
    return "zh";
  }

  return primary;
}

export async function versionsForLanguage(
  language: string,
): Promise<VersionSummary[]> {
  const key = baseLanguage(language);
  const cached = versionCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `/api/versions?language=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return [];

    const versions = (await res.json()) as VersionSummary[];
    versionCache.set(key, versions);
    return versions;
  } catch {
    return [];
  }
}

/**
 * Pick a version for a language: the reader's saved choice if it is in that
 * language, else the first available version, else null when the language has
 * no Bible on the platform.
 */
export async function defaultVersionFor(
  language: string,
  preferred: number | null,
): Promise<VersionSummary | null> {
  const versions = await versionsForLanguage(language);
  if (versions.length === 0) return null;

  const saved = preferred
    ? versions.find((version) => version.id === preferred)
    : undefined;

  return saved ?? versions[0]!;
}

/**
 * Watch for the page language changing — a machine translator swapping
 * `<html lang>`, or the reader picking a language directly.
 *
 * Also mirrors the RTL class that translators add onto `dir`, which the
 * legacy app did too.
 */
export function watchPageLanguage(
  onChange: (language: string) => void,
): () => void {
  const element = document.documentElement;
  let previous = baseLanguage(element.lang || "en");

  const observer = new MutationObserver(() => {
    // Google Translate marks RTL languages with a class rather than `dir`.
    if (element.classList.contains("translated-rtl")) {
      element.setAttribute("dir", "rtl");
    } else if (element.getAttribute("dir") === "rtl") {
      element.removeAttribute("dir");
    }

    const current = baseLanguage(element.lang || "en");
    if (current !== previous) {
      previous = current;
      onChange(current);
    }
  });

  observer.observe(element, {
    attributes: true,
    attributeFilter: ["lang", "class"],
  });

  return () => observer.disconnect();
}
