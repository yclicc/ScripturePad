import { describe, expect, it } from "vitest";
import {
  alignVerses,
  balanceFactors,
  paginate,
  toVerses,
  type PassageLine,
  type SyncPassage,
} from "./align.ts";

function line(number: number | null, text: string, indent = 0): PassageLine {
  return { number, spans: [{ text }], indent };
}

function passage(
  lines: PassageLine[],
  segments?: SyncPassage["segments"],
): SyncPassage {
  return {
    reference: "",
    lines,
    segments,
    versionId: 1,
    versionTitle: "",
    versionAbbreviation: "",
    copyright: null,
  };
}

const text = (lines: PassageLine[]) =>
  lines.map((l) => l.spans.map((s) => s.text).join("")).join(" / ");

describe("toVerses", () => {
  it("keeps poetry continuation lines with their verse", () => {
    const verses = toVerses(
      passage([line(1, "a", 1), line(null, "b", 2), line(2, "c", 1)]),
      23,
    );
    expect(verses.map((v) => [v.chapter, v.verse, text(v.lines)])).toEqual([
      [23, 1, "a / b"],
      [23, 2, "c"],
    ]);
  });

  it("takes chapters from the server's segments", () => {
    const verses = toVerses(
      passage(
        [line(16, "a"), line(17, "b"), line(1, "c")],
        [
          { chapter: 2, lines: 2 },
          { chapter: 3, lines: 1 },
        ],
      ),
      2,
    );
    expect(verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual([
      "2:16",
      "2:17",
      "3:1",
    ]);
  });

  it("infers a chapter break when verse numbers restart", () => {
    const verses = toVerses(
      passage([line(16, "a"), line(17, "b"), line(1, "c")]),
      2,
    );
    expect(verses.map((v) => `${v.chapter}:${v.verse}`)).toEqual([
      "2:16",
      "2:17",
      "3:1",
    ]);
  });

  it("joins text before the first marker onto the first verse", () => {
    const verses = toVerses(passage([line(null, "title"), line(1, "a")]), 1);
    expect(verses).toHaveLength(1);
    expect(text(verses[0]!.lines)).toBe("title / a");
  });
});

describe("alignVerses", () => {
  const verses = (...numbers: number[]) =>
    numbers.map((verse) => ({
      chapter: 3,
      verse,
      lines: [line(verse, `v${verse}`)],
    }));

  it("puts the same verse in the same row", () => {
    const rows = alignVerses([verses(16, 17), verses(16, 17)]);
    expect(rows.map((r) => r.cells.map(text))).toEqual([
      ["v16", "v16"],
      ["v17", "v17"],
    ]);
  });

  it("folds a bridged verse together with the verses it covers", () => {
    // The second version prints 16–17 as one verse, numbered 17.
    const rows = alignVerses([verses(15, 16, 17, 18), verses(15, 17, 18)]);
    expect(
      rows.map((r) => [r.verseStart, r.verseEnd, r.cells.map(text)]),
    ).toEqual([
      [15, 15, ["v15", "v15"]],
      [16, 17, ["v16 / v17", "v17"]],
      [18, 18, ["v18", "v18"]],
    ]);
  });

  it("folds a gap in the last row backwards", () => {
    const rows = alignVerses([verses(1, 2), verses(1)]);
    expect(rows.map((r) => r.cells.map(text))).toEqual([["v1 / v2", "v1"]]);
  });

  it("ignores a column that failed to load", () => {
    const rows = alignVerses([verses(1, 2, 3), []]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.cells[1]).toEqual([]);
  });
});

describe("balanceFactors", () => {
  it("grows short columns and shrinks long ones", () => {
    const [short, long] = balanceFactors([400, 900]);
    expect(short).toBeGreaterThan(1);
    expect(long).toBeLessThan(1);
    // Height scales with the square of the factor, so the results meet.
    expect(400 * short! ** 2).toBeCloseTo(900 * long! ** 2);
  });

  it("stays within limits", () => {
    expect(balanceFactors([100, 10000])).toEqual([1.25, 0.8]);
  });

  it("leaves a lone or empty column alone", () => {
    expect(balanceFactors([500])).toEqual([1]);
    expect(balanceFactors([500, 0])).toEqual([1, 1]);
  });
});

describe("paginate", () => {
  const extents = (...heights: number[]) => {
    let top = 0;
    return heights.map((height) => {
      const extent = { top, bottom: top + height };
      top += height;
      return extent;
    });
  };

  it("fills each screen greedily", () => {
    expect(paginate(extents(40, 40, 40, 40, 40), 100)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
  });

  it("gives an oversized item a screen of its own", () => {
    expect(paginate(extents(30, 250, 30), 100)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });
});
