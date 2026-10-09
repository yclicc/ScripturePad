import { describe, expect, it } from "vitest";
import {
  formatReadings,
  MAX_SYNC_READINGS,
  parseSyncPath,
  parseVersionIds,
  syncPath,
} from "./sync-path.ts";

/** The first reading a path names, or null. */
const first = (pathname: string) =>
  parseSyncPath(pathname).references[0] ?? null;

describe("parseSyncPath", () => {
  it("reads a passage written as people say it", () => {
    expect(parseSyncPath("/sync/John+3:16-21")).toEqual({
      references: [
        {
          book: "JHN",
          chapter: 3,
          verseStart: 16,
          endChapter: 3,
          verseEnd: 21,
        },
      ],
      versionIds: [],
    });
  });

  it("accepts encoded spaces and numbered books", () => {
    expect(first("/sync/1%20Cor%2013:4-7")).toMatchObject({
      book: "1CO",
      chapter: 13,
    });
  });

  it("accepts USFM, including books the prose table lacks", () => {
    expect(first("/sync/SNG.2.1-3.5")).toEqual({
      book: "SNG",
      chapter: 2,
      verseStart: 1,
      endChapter: 3,
      verseEnd: 5,
    });
    expect(first("/sync/jhn.3.16")).toMatchObject({
      book: "JHN",
      verseStart: 16,
      verseEnd: 16,
    });
  });

  it("reads the versions from the second segment", () => {
    expect(parseSyncPath("/sync/Psalm+23/113,93").versionIds).toEqual([
      113, 93,
    ]);
  });

  it("returns no reference for a bare or unreadable path", () => {
    expect(first("/sync")).toBeNull();
    expect(first("/sync/")).toBeNull();
    expect(first("/sync/hello")).toBeNull();
    expect(first("/sync/%E0%A4%A")).toBeNull();
  });

  it("reads several readings, like a playlist", () => {
    expect(
      parseSyncPath("/sync/Ezekiel+1,Revelation+1:5-2:7/187,110,101"),
    ).toEqual({
      references: [
        {
          book: "EZK",
          chapter: 1,
          verseStart: null,
          endChapter: 1,
          verseEnd: null,
        },
        {
          book: "REV",
          chapter: 1,
          verseStart: 5,
          endChapter: 2,
          verseEnd: 7,
        },
      ],
      versionIds: [187, 110, 101],
    });
  });

  it("accepts spaces, semicolons and USFM between readings", () => {
    const { references } = parseSyncPath(
      "/sync/" + encodeURIComponent("John 3:16 ; ROM.8.28-39,"),
    );
    expect(references.map((r) => [r.book, r.chapter, r.verseStart])).toEqual([
      ["JHN", 3, 16],
      ["ROM", 8, 28],
    ]);
  });

  it("continues the previous reading's book when a part names none", () => {
    const read = (text: string) =>
      formatReadings(
        parseSyncPath(`/sync/${encodeURIComponent(text)}`).references,
      );
    expect(read("John 3:16, 18")).toBe("John 3:16, John 3:18");
    expect(read("John 3:16, 18-21")).toBe("John 3:16, John 3:18-21");
    expect(read("Isaiah 52:13-15, 53:1-12")).toBe(
      "Isaiah 52:13-15, Isaiah 53:1-12",
    );
    expect(read("Psalm 23, 24")).toBe("Psalm 23, Psalm 24");
    expect(read("Psalm 23, 24-25")).toBe("Psalm 23, Psalm 24-25");
    expect(read("Luke 2:1, 3-4:2")).toBe("Luke 2:1, Luke 2:3-4:2");
  });

  it("rejects the whole list when any reading does not parse", () => {
    expect(parseSyncPath("/sync/John+3:16,hello").references).toEqual([]);
    expect(parseSyncPath("/sync/18,John+3:16").references).toEqual([]);
    expect(parseSyncPath("/sync/John+3:16,15-12").references).toEqual([]);
  });

  it("caps the number of readings", () => {
    const many = Array(MAX_SYNC_READINGS + 3)
      .fill("Psalm+1")
      .join(",");
    expect(parseSyncPath(`/sync/${many}`).references).toHaveLength(
      MAX_SYNC_READINGS,
    );
  });

  it("rejects backwards USFM ranges and unknown books", () => {
    expect(first("/sync/JHN.3.21-16")).toBeNull();
    expect(first("/sync/XYZ.3.16")).toBeNull();
  });
});

describe("parseVersionIds", () => {
  it("drops junk and duplicates, and caps the column count", () => {
    expect(parseVersionIds("113,abc,113,-4,0,93,1,2,3")).toEqual([
      113, 93, 1, 2,
    ]);
  });
});

describe("syncPath", () => {
  it("round-trips through parseSyncPath", () => {
    const reference = {
      book: "SNG",
      chapter: 2,
      verseStart: 1,
      endChapter: 3,
      verseEnd: 5,
    };
    const path = syncPath([reference], [113, 93]);
    expect(path).toBe("/sync/Song+of+Songs+2:1-3:5/113,93");
    expect(parseSyncPath(path)).toEqual({
      references: [reference],
      versionIds: [113, 93],
    });
  });

  it("joins a playlist with commas", () => {
    const { references } = parseSyncPath("/sync/EZK.1,REV.1.5-2.7");
    expect(syncPath(references, [187])).toBe(
      "/sync/Ezekiel+1,Revelation+1:5-2:7/187",
    );
  });

  it("round-trips a range of whole chapters", () => {
    const reference = first("/sync/Luke+2-3/187,101");
    expect(reference).toEqual({
      book: "LUK",
      chapter: 2,
      verseStart: null,
      endChapter: 3,
      verseEnd: null,
    });
    expect(syncPath([reference!], [187])).toBe("/sync/Luke+2-3/187");
  });
});
