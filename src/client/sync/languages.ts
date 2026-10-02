/**
 * Languages offered by the Sync translation picker.
 *
 * A fixed list rather than `GET /v1/languages`: naming languages through the
 * API costs one request each, which is exactly the fan-out that trips the
 * rate limit (see CLAUDE.md). The browser names them instead, in their own
 * script, through `Intl.DisplayNames` — no request at all. Only the language
 * actually chosen costs a call, to list its Bibles, and that is cached.
 *
 * Anything not listed can still be typed as a code.
 */

// prettier-ignore
export const LANGUAGE_CHOICES: readonly string[] = [
  "en", "es", "fr", "de", "pt", "it", "nl", "pl", "ro", "ru", "uk", "cs",
  "sk", "hu", "el", "bg", "sr", "hr", "sv", "no", "da", "fi", "lt", "lv",
  "tr", "ar", "he", "fa", "ur", "hi", "bn", "pa", "ta", "te", "ml", "kn",
  "mr", "gu", "ne", "si", "my", "th", "vi", "id", "ms", "fil", "ko", "ja",
  "zh", "zh-Hant-TW", "sw", "am", "ti", "om", "so", "yo", "ig", "ha", "zu",
  "xh", "af", "rw", "lg", "mg", "ln", "sn", "ny", "tw",
];

/** Chinese is named by script, which is the distinction that matters. */
const SPECIAL_NAMES: Record<string, string> = {
  zh: "中文（简体）",
  "zh-hant-tw": "中文（繁體）",
};

/** One formatter per locale: constructing them is the costly part. */
const formatters = new Map<string, Intl.DisplayNames>();

function displayName(tag: string, inLocale: string): string | null {
  try {
    let formatter = formatters.get(inLocale);
    if (!formatter) {
      formatter = new Intl.DisplayNames([inLocale], { type: "language" });
      formatters.set(inLocale, formatter);
    }
    const name = formatter.of(tag);
    // Unknown codes come back unchanged, which is no name at all.
    return name && name.toLowerCase() !== tag.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

/** A language's name in its own script, e.g. "français". */
export function selfName(tag: string): string {
  return SPECIAL_NAMES[tag.toLowerCase()] ?? displayName(tag, tag) ?? tag;
}

/** The name in the viewer's language, when it differs from the self-name. */
export function localName(tag: string): string | null {
  const local = displayName(tag, navigator.language);
  return local && local !== selfName(tag) ? local : null;
}
