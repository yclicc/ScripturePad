/**
 * Lining up the same verses across translations.
 *
 * Kept free of the DOM so the rules can be tested on their own. The page
 * renders one row per aligned verse, every column inside the row, so a verse
 * starts at the same height in every language whatever its length.
 */

export interface PassageSpan {
  text: string;
  smallCaps?: boolean;
}

/** As produced by `parsePassageLines` on the server. */
export interface PassageLine {
  number: number | null;
  spans: PassageSpan[];
  indent: number;
}

/** The parts of `/api/passage`'s response this page reads. */
export interface SyncPassage {
  reference: string;
  lines: PassageLine[];
  segments?: Array<{ chapter: number; lines: number }>;
  languageTag?: string;
  versionId: number;
  versionTitle: string;
  versionAbbreviation: string;
  copyright: string | null;
}

export interface Verse {
  chapter: number;
  verse: number;
  lines: PassageLine[];
}

/** One aligned row: the same verse (or verses) in every column. */
export interface Row {
  chapter: number;
  verseStart: number;
  verseEnd: number;
  /** Lines per column, in column order. Empty where a column has none. */
  cells: PassageLine[][];
}

/** Chapter of each line, from the server's segments or inferred. */
function lineChapters(passage: SyncPassage, firstChapter: number): number[] {
  const { lines, segments } = passage;
  const total = segments?.reduce((sum, segment) => sum + segment.lines, 0);

  if (segments && total === lines.length) {
    return segments.flatMap((segment) =>
      Array<number>(segment.lines).fill(segment.chapter),
    );
  }

  // Without segments, a verse number going backwards means a new chapter.
  const chapters: number[] = [];
  let chapter = firstChapter;
  let previous = 0;
  for (const line of lines) {
    if (line.number !== null) {
      if (line.number < previous) chapter += 1;
      previous = line.number;
    }
    chapters.push(chapter);
  }
  return chapters;
}

/** Group a passage's lines into verses keyed by chapter and number. */
export function toVerses(passage: SyncPassage, firstChapter: number): Verse[] {
  const chapters = lineChapters(passage, firstChapter);
  const verses: Verse[] = [];
  /** Text before the first verse marker joins the first verse. */
  let pending: PassageLine[] = [];

  passage.lines.forEach((line, index) => {
    const chapter = chapters[index] ?? firstChapter;
    const last = verses[verses.length - 1];

    if (line.number === null) {
      if (last) last.lines.push(line);
      else pending.push(line);
      return;
    }

    // The same number twice in a row continues the verse.
    if (last && last.chapter === chapter && last.verse === line.number) {
      last.lines.push(line);
      return;
    }

    verses.push({ chapter, verse: line.number, lines: [...pending, line] });
    pending = [];
  });

  if (pending.length > 0) {
    verses.push({ chapter: firstChapter, verse: 0, lines: pending });
  }

  return verses;
}

function combine(first: Row, second: Row): Row {
  return {
    chapter: first.chapter,
    verseStart: first.verseStart,
    verseEnd: second.verseEnd,
    cells: first.cells.map((cell, column) => [
      ...cell,
      ...(second.cells[column] ?? []),
    ]),
  };
}

/**
 * Align columns of verses into rows.
 *
 * Translations do not always divide the text identically: one may print
 * "16–17" as a single bridged verse where another has two. A row that some
 * column has no text for is therefore folded into its neighbour, so the
 * bridged verse sits beside both of the verses it covers rather than leaving
 * a hole and pushing everything after it out of step.
 *
 * It folds forward, because the passage parser numbers a bridged verse by its
 * *last* marker — "16–17" arrives as verse 17 with 16 missing. A gap in the
 * final row folds back instead.
 *
 * A column with no verses at all (it failed to load) is ignored for this, or
 * every row would fold into one.
 */
export function alignVerses(columns: Verse[][]): Row[] {
  const key = (chapter: number, verse: number) => chapter * 1000 + verse;

  const maps = columns.map((verses) => {
    const map = new Map<number, PassageLine[]>();
    for (const verse of verses) {
      const k = key(verse.chapter, verse.verse);
      map.set(k, [...(map.get(k) ?? []), ...verse.lines]);
    }
    return map;
  });

  const keys = [...new Set(maps.flatMap((map) => [...map.keys()]))].sort(
    (a, b) => a - b,
  );

  const rows: Row[] = keys.map((k) => ({
    chapter: Math.floor(k / 1000),
    verseStart: k % 1000,
    verseEnd: k % 1000,
    cells: maps.map((map) => map.get(k) ?? []),
  }));

  const present = columns.map((verses) => verses.length > 0);
  const hasGap = (row: Row) =>
    row.cells.some((cell, column) => present[column] && cell.length === 0);

  const aligned: Row[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const next = rows[index + 1];

    if (hasGap(row) && next) {
      rows[index + 1] = combine(row, next);
      continue;
    }

    const previous = aligned[aligned.length - 1];
    if (hasGap(row) && previous) {
      aligned[aligned.length - 1] = combine(previous, row);
      continue;
    }

    aligned.push(row);
  }

  return aligned;
}

/**
 * Per-column font scale that evens out how tall each column runs.
 *
 * The same verses take very different room in different languages — Chinese
 * is far more compact than German. Rows keep verses level whatever happens,
 * but a short column next to a long one wastes the screen and fits fewer
 * verses on it. Scaling each column towards the geometric mean of the heights
 * lets the short ones grow and the long ones shrink, within limits so no
 * column becomes hard to read.
 *
 * Text height grows roughly with the square of the font size at a fixed width
 * (taller lines, fewer words per line), hence the square root.
 */
export function balanceFactors(
  heights: readonly number[],
  min = 0.8,
  max = 1.25,
): number[] {
  const measured = heights.filter((height) => height > 0);
  if (measured.length < 2) return heights.map(() => 1);

  const target = Math.exp(
    measured.reduce((sum, height) => sum + Math.log(height), 0) /
      measured.length,
  );

  return heights.map((height) =>
    height > 0 ? Math.min(max, Math.max(min, Math.sqrt(target / height))) : 1,
  );
}

export interface Extent {
  top: number;
  bottom: number;
}

/** A screenful: items `start` up to but not including `end`. */
export interface Screen {
  start: number;
  end: number;
}

/**
 * Split laid-out items into screens of at most `available` height.
 *
 * Greedy, and never splits an item: a verse is read as a unit. An item taller
 * than a whole screen gets one to itself, and the caller shrinks it to fit.
 */
export function paginate(
  extents: readonly Extent[],
  available: number,
): Screen[] {
  const screens: Screen[] = [];
  let start = 0;

  while (start < extents.length) {
    const top = extents[start]!.top;
    let end = start + 1;
    while (end < extents.length && extents[end]!.bottom - top <= available) {
      end += 1;
    }
    screens.push({ start, end });
    start = end;
  }

  return screens;
}
