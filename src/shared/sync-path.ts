/**
 * Addresses for ScripturePad Sync: `/sync/<passage>[/<version ids>]`.
 *
 * The passage is written as people say it, with `+` for spaces so the link
 * stays readable when pasted — `/sync/John+3:16-21/113,93`. USFM such as
 * `JHN.3.16-21` is accepted too.
 *
 * Several readings can follow one another, separated by commas, like a
 * playlist: `/sync/Ezekiel+1,Revelation+1:5-2:7`. A part without a book
 * continues the one before it, as people write them — "John 3:16, 18" or
 * "Isaiah 52:13-15, 53:1-12".
 *
 * The versions live in the path rather than a cookie so a link handed to
 * someone else reproduces exactly the columns the sender saw. A cookie only
 * supplies them when the link names none.
 */

import {
  formatReference,
  isBookCode,
  parseReference,
  type ScriptureReference,
} from "./references.ts";

export interface SyncPath {
  /**
   * The readings, in order. Empty when the path names none, or when any of
   * them does not parse — a playlist quietly missing a reading is worse than
   * being told.
   */
  references: ScriptureReference[];
  /** Empty when the path names no versions. */
  versionIds: number[];
}

/** Most columns a projected screen can carry legibly. */
export const MAX_SYNC_VERSIONS = 4;

/**
 * Most readings in one playlist. Every reading is fetched in every version,
 * one request at a time, and the API locks the key for minutes when pressed.
 */
export const MAX_SYNC_READINGS = 10;

/** `BOOK.C[.V[-V | -C.V]]`, the USFM spelling. */
const USFM =
  /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3})(?:\.(\d{1,3}))?)?)?$/i;

/** The reference, or null when its range runs backwards. */
function forwards(reference: ScriptureReference): ScriptureReference | null {
  const { chapter, verseStart, endChapter, verseEnd } = reference;
  if (endChapter < chapter) return null;
  if (
    endChapter === chapter &&
    verseStart !== null &&
    verseEnd !== null &&
    verseEnd < verseStart
  ) {
    return null;
  }
  return reference;
}

function parseUsfm(text: string): ScriptureReference | null {
  const match = USFM.exec(text);
  if (!match || !isBookCode(match[1]!)) return null;

  const chapter = Number(match[2]);
  const verseStart = match[3] ? Number(match[3]) : null;
  // "-3.5" names an end chapter and verse; "-18" only an end verse.
  const endChapter = match[5] ? Number(match[4]) : chapter;
  const verseEnd = match[5]
    ? Number(match[5])
    : match[4]
      ? Number(match[4])
      : verseStart;

  return forwards({
    book: match[1]!.toUpperCase(),
    chapter,
    verseStart,
    endChapter,
    verseEnd,
  });
}

/** `C:V[-[C:]V]`, `V[-V]` or `C[-C]`: a reading that names no book. */
const CONTINUATION = /^(\d{1,3})(?::(\d{1,3}))?(?:-(\d{1,3})(?::(\d{1,3}))?)?$/;

/**
 * A reading without a book, read against the one before it. A bare number
 * is a verse after a reading of verses ("John 3:16, 18"), but a chapter after
 * a reading of whole chapters ("Psalm 23, 24").
 */
function parseContinuation(
  text: string,
  previous: ScriptureReference,
): ScriptureReference | null {
  const match = CONTINUATION.exec(text);
  if (!match) return null;
  const [, first, second, third, fourth] = match.map(
    (group) => group && Number(group),
  ) as Array<number | undefined>;
  const { book } = previous;

  if (second !== undefined) {
    // "4:1-5", "4:1-5:2" or "4:1".
    return forwards({
      book,
      chapter: first!,
      verseStart: second,
      endChapter: fourth !== undefined ? third! : first!,
      verseEnd: fourth ?? third ?? second,
    });
  }

  if (previous.verseStart !== null) {
    // "18", "18-20", or "18-4:2" running on into a later chapter.
    return forwards({
      book,
      chapter: previous.endChapter,
      verseStart: first!,
      endChapter: fourth !== undefined ? third! : previous.endChapter,
      verseEnd: fourth ?? third ?? first!,
    });
  }

  if (fourth !== undefined) return null;
  return forwards({
    book,
    chapter: first!,
    verseStart: null,
    endChapter: third ?? first!,
    verseEnd: null,
  });
}

/**
 * Read a list of readings separated by commas or semicolons.
 *
 * Null when any part is not a reference, so the caller can say so rather
 * than show fewer readings than were asked for.
 */
export function parseReadings(text: string): ScriptureReference[] | null {
  const references: ScriptureReference[] = [];

  for (const part of text.split(/[,;]/)) {
    const trimmed = part.replace(/[+_]/g, " ").trim();
    if (!trimmed) continue;

    const compact = trimmed.replace(/\s+/g, "");
    const previous = references[references.length - 1];
    const reference =
      parseUsfm(compact) ??
      (previous ? parseContinuation(compact, previous) : null) ??
      parseReference(trimmed);
    if (!reference) return null;
    references.push(reference);
  }

  return references.length > 0 ? references : null;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A stray `%` is not worth a broken page; read it as written.
    return segment;
  }
}

/** Parse a comma-separated list of version ids, dropping anything invalid. */
export function parseVersionIds(text: string): number[] {
  const ids: number[] = [];
  for (const part of text.split(/[,+\s]+/)) {
    const id = Number(part);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_SYNC_VERSIONS);
}

/** Read a pathname such as `/sync/John+3:16-21/113,93`. */
export function parseSyncPath(pathname: string): SyncPath {
  const [, passage = "", versions = ""] =
    pathname.replace(/^\/sync\/?/, "").match(/^([^/]*)\/?([^/]*)/) ?? [];

  const references = parseReadings(decode(passage)) ?? [];

  return {
    references: references.slice(0, MAX_SYNC_READINGS),
    versionIds: parseVersionIds(decode(versions)),
  };
}

/** The readings as people write them, for titles and the passage field. */
export function formatReadings(
  references: readonly ScriptureReference[],
): string {
  return references.map(formatReference).join(", ");
}

/** Build the address for a list of readings and their columns. */
export function syncPath(
  references: readonly ScriptureReference[],
  versionIds: readonly number[] = [],
): string {
  // Formatted references hold only letters, digits, spaces, ":" and "-", all
  // safe in a path once spaces are written as "+".
  const passage = references
    .map((reference) => formatReference(reference).replace(/ /g, "+"))
    .join(",");
  return versionIds.length > 0
    ? `/sync/${passage}/${versionIds.join(",")}`
    : `/sync/${passage}`;
}
