/**
 * Addresses for ScripturePad Sync: `/sync/<passage>[/<version ids>]`.
 *
 * The passage is written as people say it, with `+` for spaces so the link
 * stays readable when pasted — `/sync/John+3:16-21/113,93`. USFM such as
 * `JHN.3.16-21` is accepted too.
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
  /** Null when the path names no passage, or one that does not parse. */
  reference: ScriptureReference | null;
  /** Empty when the path names no versions. */
  versionIds: number[];
}

/** Most columns a projected screen can carry legibly. */
export const MAX_SYNC_VERSIONS = 4;

/** `BOOK.C[.V[-V | -C.V]]`, the USFM spelling. */
const USFM =
  /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3})(?:\.(\d{1,3}))?)?)?$/i;

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

  if (endChapter < chapter) return null;
  if (
    endChapter === chapter &&
    verseStart !== null &&
    verseEnd !== null &&
    verseEnd < verseStart
  ) {
    return null;
  }

  return {
    book: match[1]!.toUpperCase(),
    chapter,
    verseStart,
    endChapter,
    verseEnd,
  };
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

  const text = decode(passage).replace(/[+_]/g, " ").trim();
  const reference = text
    ? (parseUsfm(text.replace(/\s+/g, "")) ?? parseReference(text))
    : null;

  return { reference, versionIds: parseVersionIds(decode(versions)) };
}

/** Build the address for a passage and its columns. */
export function syncPath(
  reference: ScriptureReference,
  versionIds: readonly number[] = [],
): string {
  // Formatted references hold only letters, digits, spaces, ":" and "-", all
  // safe in a path once spaces are written as "+".
  const passage = formatReference(reference).replace(/ /g, "+");
  return versionIds.length > 0
    ? `/sync/${passage}/${versionIds.join(",")}`
    : `/sync/${passage}`;
}
