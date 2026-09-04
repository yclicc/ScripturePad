/**
 * Bible reference parsing.
 *
 * Book names map to USFM codes (GEN, JHN, ...), which is what the YouVersion
 * API expects. The code list is validated against BOOK_IDS exported by
 * @youversion/platform-core.
 *
 * Shared by the editor (to detect references as the user types) and the Worker
 * (to validate before hitting the API).
 */

export interface ScriptureReference {
  /** USFM book code, e.g. "JHN". */
  book: string;
  /** First chapter of the range. */
  chapter: number;
  verseStart: number | null;
  /**
   * Last chapter of the range. Equals `chapter` for a reference inside one
   * chapter; greater for a span like "Song of Songs 2:1-3:5".
   *
   * Ranges never cross a book boundary — "Malachi 4 to Matthew 1" must be
   * written as two references.
   */
  endChapter: number;
  verseEnd: number | null;
}

/**
 * Book names and common abbreviations, longest-match-first at lookup time.
 * Keys are lowercased; punctuation in the input is normalised away before
 * lookup, so "1 Cor." and "1cor" both resolve.
 */
const BOOK_NAMES: Record<string, string> = {
  genesis: "GEN", gen: "GEN",
  exodus: "EXO", exo: "EXO", ex: "EXO",
  leviticus: "LEV", lev: "LEV",
  numbers: "NUM", num: "NUM",
  deuteronomy: "DEU", deut: "DEU", deu: "DEU",
  joshua: "JOS", josh: "JOS", jos: "JOS",
  judges: "JDG", judg: "JDG", jdg: "JDG",
  ruth: "RUT", rut: "RUT",
  "1 samuel": "1SA", "1 sam": "1SA", "1sa": "1SA",
  "2 samuel": "2SA", "2 sam": "2SA", "2sa": "2SA",
  "1 kings": "1KI", "1 kgs": "1KI", "1ki": "1KI",
  "2 kings": "2KI", "2 kgs": "2KI", "2ki": "2KI",
  "1 chronicles": "1CH", "1 chr": "1CH", "1ch": "1CH",
  "2 chronicles": "2CH", "2 chr": "2CH", "2ch": "2CH",
  ezra: "EZR", ezr: "EZR",
  nehemiah: "NEH", neh: "NEH",
  esther: "EST", esth: "EST", est: "EST",
  job: "JOB",
  psalms: "PSA", psalm: "PSA", ps: "PSA", psa: "PSA",
  proverbs: "PRO", prov: "PRO", pro: "PRO",
  ecclesiastes: "ECC", eccl: "ECC", ecc: "ECC",
  "song of solomon": "SNG", "song of songs": "SNG", song: "SNG",
  isaiah: "ISA", isa: "ISA",
  jeremiah: "JER", jer: "JER",
  lamentations: "LAM", lam: "LAM",
  ezekiel: "EZK", ezek: "EZK", ezk: "EZK",
  daniel: "DAN", dan: "DAN",
  hosea: "HOS", hos: "HOS",
  joel: "JOL", jol: "JOL",
  amos: "AMO", amo: "AMO",
  obadiah: "OBA", obad: "OBA", oba: "OBA",
  jonah: "JON", jon: "JON",
  micah: "MIC", mic: "MIC",
  nahum: "NAM", nah: "NAM", nam: "NAM",
  habakkuk: "HAB", hab: "HAB",
  zephaniah: "ZEP", zeph: "ZEP", zep: "ZEP",
  haggai: "HAG", hag: "HAG",
  zechariah: "ZEC", zech: "ZEC", zec: "ZEC",
  malachi: "MAL", mal: "MAL",
  matthew: "MAT", matt: "MAT", mat: "MAT",
  mark: "MRK", mrk: "MRK", mk: "MRK",
  luke: "LUK", luk: "LUK", lk: "LUK",
  john: "JHN", jhn: "JHN", jn: "JHN",
  acts: "ACT", act: "ACT",
  romans: "ROM", rom: "ROM",
  "1 corinthians": "1CO", "1 cor": "1CO", "1co": "1CO",
  "2 corinthians": "2CO", "2 cor": "2CO", "2co": "2CO",
  galatians: "GAL", gal: "GAL",
  ephesians: "EPH", eph: "EPH",
  philippians: "PHP", phil: "PHP", php: "PHP",
  colossians: "COL", col: "COL",
  "1 thessalonians": "1TH", "1 thess": "1TH", "1th": "1TH",
  "2 thessalonians": "2TH", "2 thess": "2TH", "2th": "2TH",
  "1 timothy": "1TI", "1 tim": "1TI", "1ti": "1TI",
  "2 timothy": "2TI", "2 tim": "2TI", "2ti": "2TI",
  titus: "TIT", tit: "TIT",
  philemon: "PHM", phlm: "PHM", phm: "PHM",
  hebrews: "HEB", heb: "HEB",
  james: "JAS", jas: "JAS",
  "1 peter": "1PE", "1 pet": "1PE", "1pe": "1PE",
  "2 peter": "2PE", "2 pet": "2PE", "2pe": "2PE",
  "1 john": "1JN", "1 jn": "1JN", "1jn": "1JN",
  "2 john": "2JN", "2 jn": "2JN", "2jn": "2JN",
  "3 john": "3JN", "3 jn": "3JN", "3jn": "3JN",
  jude: "JUD", jud: "JUD",
  revelation: "REV", rev: "REV",
};

/** Normalise "1 Cor." / "1st Corinthians" / "I Corinthians" to a lookup key. */
function normaliseBookName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^i{1,3}\s+/, (m) => `${m.trim().length} `)
    .replace(/^(\d)(st|nd|rd|th)\s+/, "$1 ")
    .replace(/^(\d)\s*/, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupBook(name: string): string | null {
  const key = normaliseBookName(name);
  return BOOK_NAMES[key] ?? BOOK_NAMES[key.replace(/\s/g, "")] ?? null;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Alternation of every known book spelling, longest first so "Song of Songs"
 * wins over "Song" and "1 John" over "John".
 *
 * Building the pattern from the book table (rather than matching any word and
 * validating afterwards) is what keeps matching unambiguous: an ordinary word
 * like "See" simply cannot match, so "See 1 Cor 13:4" can never be misread as
 * book "See" + chapter 1 with the numeral stolen from "1 Cor".
 */
const BOOK_ALTERNATION = Object.keys(BOOK_NAMES)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  // Allow "1Cor"/"1 Cor" and an optional trailing period on abbreviations.
  .map((name) => name.replace(/\\?\s/g, "\\s*"))
  .join("|");

// Roman numerals and ordinals are normalised to digits before lookup, so the
// alternation only needs to cover the digit spellings; these prefixes are
// matched separately and folded in by `normaliseBookName`.
const NUMBERED_PREFIX = "(?:[123]|I{1,3})\\s*(?:st|nd|rd|th)?\\s*";

/**
 * Matches a reference anywhere in prose.
 *
 * Groups: 1 book, 2 chapter, 3 start verse, 4 end chapter, 5 end verse.
 * The end of a range may name a chapter ("2:1-3:5") or just a verse
 * ("3:16-18"), so group 4 is only present in the spanning form.
 */
const REFERENCE_PATTERN = new RegExp(
  `((?:${NUMBERED_PREFIX})?(?:${BOOK_ALTERNATION})\\.?)` +
    `\\s+(\\d{1,3})` +
    `(?::(\\d{1,3})(?:\\s*[-–]\\s*(?:(\\d{1,3})\\s*:\\s*)?(\\d{1,3}))?)?`,
  "gi",
);

/**
 * Parse a single reference, e.g. "John 3:16" or "1 Cor 13:4-7".
 *
 * Returns the first reference found, so leading prose is tolerated.
 */
export function parseReference(input: string): ScriptureReference | null {
  return findReferences(input)[0]?.reference ?? null;
}

/**
 * Find every reference in a block of prose, with the exact offsets of each
 * match so the editor can replace the span in place.
 */
export function findReferences(
  text: string,
): Array<{ reference: ScriptureReference; start: number; end: number }> {
  const found: Array<{
    reference: ScriptureReference;
    start: number;
    end: number;
  }> = [];

  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const bookRaw = match[1];
    const chapterRaw = match[2];
    if (!bookRaw || !chapterRaw || match.index === undefined) continue;

    // The alternation only matches known spellings, so this should always
    // resolve; guard anyway rather than assert a non-null.
    const book = lookupBook(bookRaw);
    if (!book) continue;

    const startRaw = match[3];
    const endChapterRaw = match[4];
    const endRaw = match[5];

    const chapter = Number(chapterRaw);
    const verseStart = startRaw ? Number(startRaw) : null;
    const verseEnd = endRaw ? Number(endRaw) : verseStart;
    // Absent end chapter means the range stays inside the opening chapter.
    const endChapter = endChapterRaw ? Number(endChapterRaw) : chapter;

    // Backwards ranges are typos, not references — in either dimension.
    if (endChapter < chapter) continue;
    if (
      endChapter === chapter &&
      verseStart !== null &&
      verseEnd !== null &&
      verseEnd < verseStart
    ) {
      continue;
    }

    found.push({
      reference: { book, chapter, verseStart, endChapter, verseEnd },
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return found;
}

/**
 * Render a reference as USFM.
 *
 * For a range spanning chapters this returns only the opening segment — the
 * API cannot express such a range in one identifier. Use `toUsfmSegments` to
 * fetch a spanning reference.
 */
export function toUsfm(ref: ScriptureReference): string {
  if (ref.verseStart === null) return `${ref.book}.${ref.chapter}`;
  if (
    ref.endChapter === ref.chapter &&
    ref.verseEnd !== null &&
    ref.verseEnd !== ref.verseStart
  ) {
    return `${ref.book}.${ref.chapter}.${ref.verseStart}-${ref.verseEnd}`;
  }
  return `${ref.book}.${ref.chapter}.${ref.verseStart}`;
}

/** True when the reference covers more than one chapter. */
export function spansChapters(ref: ScriptureReference): boolean {
  return ref.endChapter > ref.chapter;
}

/**
 * Split a reference into USFM identifiers the API will actually accept.
 *
 * The passages endpoint rejects every cross-chapter spelling, so
 * "Song of Songs 2:1-3:5" has to be fetched as SNG.2.1-17 plus SNG.3.1-5 and
 * the results joined. Single-chapter references yield exactly one segment.
 *
 * @param versesInChapter Verse count for a chapter, from the version's chapter
 *   metadata. When it returns 0 (unknown), the segment falls back to the whole
 *   chapter rather than risk an invalid or truncated range.
 */
export function toUsfmSegments(
  ref: ScriptureReference,
  versesInChapter: (book: string, chapter: number) => number,
): string[] {
  if (!spansChapters(ref)) return [toUsfm(ref)];

  const segments: string[] = [];

  for (let chapter = ref.chapter; chapter <= ref.endChapter; chapter++) {
    const isFirst = chapter === ref.chapter;
    const isLast = chapter === ref.endChapter;

    if (isFirst) {
      const from = ref.verseStart ?? 1;
      const total = versesInChapter(ref.book, chapter);
      // From the start verse to the end of the chapter. Starting at verse 1 is
      // the whole chapter, which is also the right identifier when the verse
      // count is unknown.
      segments.push(
        from > 1 && total > 0
          ? `${ref.book}.${chapter}.${from}-${total}`
          : `${ref.book}.${chapter}`,
      );
    } else if (isLast) {
      const to = ref.verseEnd;
      segments.push(
        to === null ? `${ref.book}.${chapter}` : `${ref.book}.${chapter}.1-${to}`,
      );
    } else {
      // Whole chapters in between.
      segments.push(`${ref.book}.${chapter}`);
    }
  }

  return segments;
}

/**
 * Canonical display spellings.
 *
 * Written out rather than derived from the lookup table: title-casing every
 * word produces "Song Of Solomon", and picking the longest spelling gives
 * "Psalms 23" where "Psalm 23" is what people say.
 */
const DISPLAY_NAMES: Record<string, string> = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers",
  DEU: "Deuteronomy", JOS: "Joshua", JDG: "Judges", RUT: "Ruth",
  "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
  "1CH": "1 Chronicles", "2CH": "2 Chronicles", EZR: "Ezra",
  NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalm",
  PRO: "Proverbs", ECC: "Ecclesiastes", SNG: "Song of Songs",
  ISA: "Isaiah", JER: "Jeremiah", LAM: "Lamentations", EZK: "Ezekiel",
  DAN: "Daniel", HOS: "Hosea", JOL: "Joel", AMO: "Amos", OBA: "Obadiah",
  JON: "Jonah", MIC: "Micah", NAM: "Nahum", HAB: "Habakkuk",
  ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi",
  MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John", ACT: "Acts",
  ROM: "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians",
  GAL: "Galatians", EPH: "Ephesians", PHP: "Philippians",
  COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon",
  HEB: "Hebrews", JAS: "James", "1PE": "1 Peter", "2PE": "2 Peter",
  "1JN": "1 John", "2JN": "2 John", "3JN": "3 John", JUD: "Jude",
  REV: "Revelation",
};

/** Human-readable form, e.g. "John 3:16-18" or "Song of Songs 2:1-3:5". */
export function formatReference(ref: ScriptureReference): string {
  const book = DISPLAY_NAMES[ref.book] ?? ref.book;

  if (ref.verseStart === null) {
    return spansChapters(ref)
      ? `${book} ${ref.chapter}-${ref.endChapter}`
      : `${book} ${ref.chapter}`;
  }

  if (spansChapters(ref)) {
    return `${book} ${ref.chapter}:${ref.verseStart}-${ref.endChapter}:${ref.verseEnd ?? 1}`;
  }

  if (ref.verseEnd !== null && ref.verseEnd !== ref.verseStart) {
    return `${book} ${ref.chapter}:${ref.verseStart}-${ref.verseEnd}`;
  }

  return `${book} ${ref.chapter}:${ref.verseStart}`;
}
