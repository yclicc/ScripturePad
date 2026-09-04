/**
 * Which Bible version to render, per language.
 *
 * Resolution order (see CLAUDE.md):
 *   1. The reader's own saved preference for that language — an explicit
 *      choice always wins.
 *   2. The version the document was authored against, so a first-time visitor
 *      inherits the translation their pastor was preaching from.
 *   3. The license-free default.
 *
 * Signed-in users will have step 1 backed by D1; until auth lands it is
 * localStorage, which keeps the anonymous path working unchanged.
 */

/**
 * New International Version (Anglicised) — the default for English readers.
 *
 * A reader viewing the page in another language gets that language's default
 * instead; see `defaultVersionFor` in language.ts.
 */
export const DEFAULT_VERSION_ID = 113;

const STORAGE_KEY = "scripturepad:versions";

type VersionsByLanguage = Record<string, number>;

function readAll(): VersionsByLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as VersionsByLanguage;
  } catch {
    // Private browsing or corrupt data — fall back to defaults rather than
    // breaking the page.
    return {};
  }
}

export function getPreferredVersion(language: string): number | null {
  return readAll()[language] ?? null;
}

export function setPreferredVersion(language: string, versionId: number): void {
  try {
    const all = readAll();
    all[language] = versionId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Preference is a convenience; failing to persist must not break reading.
  }
}

/**
 * @param language   Reader's language tag.
 * @param authorPick Version the document was authored against, if recorded.
 */
export function resolveVersionId(
  language: string,
  authorPick: number | null,
): number {
  return getPreferredVersion(language) ?? authorPick ?? DEFAULT_VERSION_ID;
}
