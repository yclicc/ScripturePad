import { describe, expect, it } from "vitest";
import { parseSyncPath, parseVersionIds, syncPath } from "./sync-path.ts";

describe("parseSyncPath", () => {
  it("reads a passage written as people say it", () => {
    expect(parseSyncPath("/sync/John+3:16-21")).toEqual({
      reference: {
        book: "JHN",
        chapter: 3,
        verseStart: 16,
        endChapter: 3,
        verseEnd: 21,
      },
      versionIds: [],
    });
  });

  it("accepts encoded spaces and numbered books", () => {
    const { reference } = parseSyncPath("/sync/1%20Cor%2013:4-7");
    expect(reference).toMatchObject({ book: "1CO", chapter: 13 });
  });

  it("accepts USFM, including books the prose table lacks", () => {
    expect(parseSyncPath("/sync/SNG.2.1-3.5").reference).toEqual({
      book: "SNG",
      chapter: 2,
      verseStart: 1,
      endChapter: 3,
      verseEnd: 5,
    });
    expect(parseSyncPath("/sync/jhn.3.16").reference).toMatchObject({
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
    expect(parseSyncPath("/sync").reference).toBeNull();
    expect(parseSyncPath("/sync/").reference).toBeNull();
    expect(parseSyncPath("/sync/hello").reference).toBeNull();
    expect(parseSyncPath("/sync/%E0%A4%A").reference).toBeNull();
  });

  it("rejects backwards USFM ranges and unknown books", () => {
    expect(parseSyncPath("/sync/JHN.3.21-16").reference).toBeNull();
    expect(parseSyncPath("/sync/XYZ.3.16").reference).toBeNull();
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
    const path = syncPath(reference, [113, 93]);
    expect(path).toBe("/sync/Song+of+Songs+2:1-3:5/113,93");
    expect(parseSyncPath(path)).toEqual({ reference, versionIds: [113, 93] });
  });

  it("round-trips a range of whole chapters", () => {
    const { reference } = parseSyncPath("/sync/Luke+2-3/187,101");
    expect(reference).toEqual({
      book: "LUK",
      chapter: 2,
      verseStart: null,
      endChapter: 3,
      verseEnd: null,
    });
    expect(syncPath(reference!, [187])).toBe("/sync/Luke+2-3/187");
  });
});
