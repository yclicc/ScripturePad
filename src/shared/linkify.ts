import { safeHref } from "./urls.ts";

/**
 * Finding web addresses written as plain text.
 *
 * Pastors type and paste addresses into their notes ("sign up at
 * ourchurch.org/camp") and expect them to work as links, the way Google Docs
 * makes them. Every target still goes through `safeHref`, so detection can only
 * ever produce an http, https or mailto link.
 */

export interface FoundLink {
  /** Offset of the first character, inclusive. */
  start: number;
  /** Offset past the last character. */
  end: number;
  href: string;
}

/**
 * Top-level domains recognised without a `www.` or scheme.
 *
 * Deliberately a short list rather than "any letters": sermon notes are full
 * of prose, and a bare `word.word` matcher would link every missing space
 * after a full stop. These cover what churches and ministries actually use.
 */
const BARE_TLDS = [
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "church",
  "bible",
  "faith",
  "ministries",
  "io",
  "co",
  "uk",
  "us",
  "ca",
  "au",
  "nz",
  "za",
  "ng",
  "ke",
  "gh",
  "ug",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "br",
  "info",
  "app",
  "dev",
  "online",
  "tv",
];

/**
 * Characters that can never be part of an address. U+FFFC stands in for an
 * inline citation or line break, which must end a link rather than be
 * swallowed by it.
 */
const URL_CHAR = `[^\\s<>"\\ufffc]`;
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";

const PATTERN = new RegExp(
  [
    // pastor@ourchurch.org
    `(?<email>(?<![\\w.+-])[\\w.+-]+@(?:${LABEL}\\.)+[a-z]{2,}(?![\\w-]))`,
    // https://ourchurch.org/camp
    `(?<scheme>(?<![\\w])https?://${URL_CHAR}+)`,
    // www.ourchurch.org/camp
    `(?<www>(?<![\\w@./:-])www\\.${URL_CHAR}+)`,
    // ourchurch.org/camp
    `(?<bare>(?<![\\w@./:-])(?:${LABEL}\\.)+(?:${BARE_TLDS.join("|")})` +
      `(?![\\w-])(?:[/?#]${URL_CHAR}*)?)`,
  ].join("|"),
  "giu",
);

/**
 * Drop punctuation that ends the sentence rather than the address.
 *
 * "See ourchurch.org." should not link the full stop. A closing bracket is
 * kept only when it balances one inside the address, so
 * `en.wikipedia.org/wiki/Mercy_(virtue)` survives and "(see ourchurch.org)"
 * does not take the bracket with it.
 */
function trimTrailing(text: string): string {
  let end = text.length;
  while (end > 0) {
    const last = text[end - 1]!;
    if (".,;:!?'\"‘’“”*_".includes(last)) {
      end--;
      continue;
    }
    const open = { ")": "(", "]": "[", "}": "{" }[last];
    if (open) {
      const body = text.slice(0, end);
      const opens = body.split(open).length - 1;
      const closes = body.split(last).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return text.slice(0, end);
}

function hrefFor(kind: string, text: string): string | null {
  if (kind === "email") return safeHref(`mailto:${text}`);

  const href = safeHref(kind === "scheme" ? text : `https://${text}`);
  if (!href) return null;
  // "https://" followed by nothing useful parses to a host with no dot.
  return new URL(href).hostname.includes(".") ? href : null;
}

/** Every address in `text`, with the link each should become. */
export function findLinks(text: string): FoundLink[] {
  const found: FoundLink[] = [];

  for (const match of text.matchAll(PATTERN)) {
    const groups = match.groups ?? {};
    const kind = Object.keys(groups).find((key) => groups[key] !== undefined);
    if (!kind) continue;

    const matched = kind === "email" ? match[0] : trimTrailing(match[0]);
    const href = hrefFor(kind, matched);
    if (!href) continue;

    found.push({ start: match.index, end: match.index + matched.length, href });
  }

  return found;
}
