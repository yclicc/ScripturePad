import { ApiClient, BibleClient } from "@youversion/platform-core";
import type { Env } from "./env.ts";
import {
  linesToText,
  parsePassageLines,
  type PassageLine,
} from "./passage-html.ts";
import {
  formatReference,
  spansChapters,
  toUsfm,
  toUsfmSegments,
  type ScriptureReference,
} from "../shared/references.ts";

/**
 * Wraps the YouVersion Platform SDK.
 *
 * The app key is a server-side secret sent as `X-YVP-App-Key`, so every call
 * must originate here in the Worker — never from the browser.
 */
export function createBibleClient(env: Env): BibleClient {
  const api = new ApiClient({ appKey: env.YOUVERSION_APP_KEY });
  return new BibleClient(api);
}

/**
 * New International Version (Anglicised) — the default for English readers.
 *
 * Requires the Biblica fast-track licence, which this app key has agreed to.
 * Its copyright must be displayed wherever its text appears; the colophon
 * handles that.
 */
export const DEFAULT_VERSION_ID = 113;

/** Berean Standard Bible: licence-free, used when no licensed version fits. */
export const FALLBACK_VERSION_ID = 3034;

const VERSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSAGE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface PassageResult {
  reference: string;
  /** Plain text of the whole passage, for previews and copying. */
  content: string;
  /**
   * Line-by-line, carrying verse numbers, poetry indentation, and small-caps
   * so quoted passages keep the shape they have in a printed Bible.
   */
  lines: PassageLine[];
  versionId: number;
  /** Attribution is required by the YouVersion license agreement. */
  copyright: string | null;
  versionTitle: string;
  versionAbbreviation: string;
}

export interface VersionSummary {
  id: number;
  title: string;
  abbreviation: string;
  languageTag: string;
  copyright: string | null;
  /**
   * False when the version is listed on the platform but this app key has not
   * agreed to its licence — the text endpoint returns 403. Surfaced so the UI
   * can explain rather than render a broken citation.
   */
  licensed?: boolean;
}

/**
 * Bible text is immutable, so responses are cached aggressively in KV to stay
 * well inside rate limits.
 */
export async function fetchPassage(
  env: Env,
  usfm: string,
  versionId: number = DEFAULT_VERSION_ID,
): Promise<PassageResult> {
  // Bump this version whenever PassageResult's shape changes: entries cached
  // under an older shape would otherwise be served missing their new fields,
  // which fails silently as an empty citation rather than as an error.
  const cacheKey = `passage:v3:${versionId}:${usfm}`;
  const cached = await env.BIBLE_CACHE.get<PassageResult>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);

  // HTML rather than text: `format=text` strips verse numbers entirely, and
  // sermon notes need them. `transform: false` is also deliberate — the SDK's
  // transformer depends on jsdom, which does not run on workerd, so the markup
  // is reduced by our own parser instead.
  const [passage, version] = await Promise.all([
    bible.getPassage(versionId, usfm, "html", false, false, false),
    getVersion(env, versionId),
  ]);

  const lines = parsePassageLines(passage.content);

  const result: PassageResult = {
    reference: passage.reference,
    content: linesToText(lines),
    lines,
    versionId,
    copyright: version.copyright,
    versionTitle: version.title,
    versionAbbreviation: version.abbreviation,
  };

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(result), {
    expirationTtl: PASSAGE_TTL_SECONDS,
  });

  return result;
}

/**
 * Verse counts per chapter for a book, used to split cross-chapter ranges.
 * Static per version, so cached for a long time.
 */
export async function getChapterVerseCounts(
  env: Env,
  versionId: number,
  book: string,
): Promise<Record<number, number>> {
  const cacheKey = `chapters:v1:${versionId}:${book}`;
  const cached = await env.BIBLE_CACHE.get<Record<number, number>>(
    cacheKey,
    "json",
  );
  if (cached) return cached;

  const bible = createBibleClient(env);
  const chapters = await bible.getChapters(versionId, book);

  const counts: Record<number, number> = {};
  for (const chapter of chapters.data) {
    const number = Number(chapter.id);
    if (Number.isInteger(number)) {
      counts[number] = chapter.verses?.length ?? 0;
    }
  }

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(counts), {
    expirationTtl: VERSION_TTL_SECONDS,
  });

  return counts;
}

export async function getVersion(
  env: Env,
  versionId: number,
): Promise<VersionSummary> {
  const cacheKey = `version:v2:${versionId}`;
  const cached = await env.BIBLE_CACHE.get<VersionSummary>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);
  const version = await bible.getVersion(versionId);

  const summary: VersionSummary = {
    id: version.id,
    title: version.title,
    abbreviation: version.abbreviation,
    languageTag: version.language_tag,
    copyright: version.copyright ?? null,
  };

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(summary), {
    expirationTtl: VERSION_TTL_SECONDS,
  });

  return summary;
}

/**
 * Fetch a reference, transparently handling ranges that cross a chapter.
 *
 * The passages endpoint rejects every cross-chapter identifier, so a spanning
 * reference is fetched one chapter at a time and joined. Callers get a single
 * passage back either way.
 */
export async function fetchReference(
  env: Env,
  reference: ScriptureReference,
  versionId: number = DEFAULT_VERSION_ID,
): Promise<PassageResult> {
  if (!spansChapters(reference)) {
    return fetchPassage(env, toUsfm(reference), versionId);
  }

  const counts = await getChapterVerseCounts(env, versionId, reference.book)
    // Without counts a range starting mid-chapter degrades to whole chapters,
    // which is wrong but readable — better than failing outright.
    .catch(() => ({}) as Record<number, number>);

  const segments = toUsfmSegments(
    reference,
    (_book, chapter) => counts[chapter] ?? 0,
  );

  // Sequential, not Promise.all: a long span is many chapters, and firing them
  // all at once trips the API's rate limit (observed: HTTP 429 from a handful
  // of quick requests). Each segment is cached individually, so a re-read of
  // the same passage costs nothing.
  const parts: PassageResult[] = [];
  for (const usfm of segments) {
    parts.push(await fetchPassage(env, usfm, versionId));
  }

  const first = parts[0]!;
  const lines = parts.flatMap((part) => part.lines);

  return {
    ...first,
    // Present the span as one citation rather than the segment references.
    reference: formatReference(reference),
    lines,
    content: linesToText(lines),
  };
}

/**
 * List available versions for a language.
 *
 * `language_ranges` is required by the API — omitting it returns HTTP 422 —
 * which is why the language argument here is not optional.
 *
 * The API accepts both 2- and 3-letter codes and normalises them itself
 * (verified: "eng" and "en" both work; "cmn" resolves to tag "zh"), so callers
 * can pass a browser language tag straight through. The legacy app's manual
 * ISO-639-3 remapping table is not needed.
 */
/**
 * Versions the `language_ranges` filter cannot find, listed by id.
 *
 * Verified against the live API: Bibles 312 (CSBT) and 1392 (CCBT) report
 * `language_tag: "zh-Hant-TW"` and fetch correctly by id, but every filter
 * spelling returns **HTTP 204** — `zh-Hant-TW`, `zh-Hant`, `zh-TW`,
 * `zh-Hant-*`, even `zh-*`. Plain `zh` returns only the three Simplified
 * versions. They are absent from the filter index, so a Traditional reader
 * would otherwise be offered Simplified Bibles or nothing at all.
 *
 * Revisit if YouVersion fixes the index; the ids remain correct either way.
 */
const UNINDEXED_VERSIONS: Record<string, number[]> = {
  "zh-hant-tw": [312, 1392],
};

/** Ids to add for a language range the filter under-reports. */
function unindexedFor(languageRange: string): number[] {
  return UNINDEXED_VERSIONS[languageRange.toLowerCase()] ?? [];
}

export async function listVersions(
  env: Env,
  languageRange: string,
): Promise<VersionSummary[]> {
  // v3: now includes licensed versions, so older cached lists are incomplete.
  // v4: lists can now include versions injected by id that the filter index
  // omits, so entries cached under v3 are missing them.
  const cacheKey = `versions:v4:${languageRange}`;
  const cached = await env.BIBLE_CACHE.get<VersionSummary[]>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);

  // `all_available` surfaces every version on the platform, not just the
  // licence-free ones — for English that is 20 rather than 11, including the
  // NIV, NASB, and AMP. Their text is only served once the app key has agreed
  // to the relevant fast-track licence in the developer portal; without that
  // the passages endpoint returns 403.
  //
  // A language with no Bibles returns HTTP 204 with an empty body, which the
  // SDK surfaces as a missing collection rather than an empty one.
  const collection = await bible
    .getVersions(languageRange, undefined, { all_available: true })
    .catch(() => null);

  const summaries: VersionSummary[] = (collection?.data ?? []).map((version) => ({
    id: version.id,
    title: version.title,
    abbreviation: version.abbreviation,
    languageTag: version.language_tag,
    copyright: version.copyright ?? null,
  }));

  // Add anything the filter index omits, fetched by id. Failures are ignored:
  // a missing extra should not empty an otherwise good list.
  const extraIds = unindexedFor(languageRange).filter(
    (id) => !summaries.some((version) => version.id === id),
  );

  if (extraIds.length > 0) {
    const extras = await Promise.all(
      extraIds.map((id) => getVersion(env, id).catch(() => null)),
    );
    for (const extra of extras) {
      if (extra) summaries.push(extra);
    }
  }

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(summaries), {
    expirationTtl: VERSION_TTL_SECONDS,
  });

  return summaries;
}
