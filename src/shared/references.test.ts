import { describe, expect, it } from "vitest";
import { BOOK_IDS } from "@youversion/platform-core";
import {
  findReferences,
  formatReference,
  lookupBook,
  parseReference,
  toUsfm,
} from "./references.ts";

describe("lookupBook", () => {
  it("resolves full names, abbreviations, and punctuation", () => {
    expect(lookupBook("John")).toBe("JHN");
    expect(lookupBook("john")).toBe("JHN");
    expect(lookupBook("Jn")).toBe("JHN");
    expect(lookupBook("Phil.")).toBe("PHP");
    expect(lookupBook("Song of Songs")).toBe("SNG");
  });

  it("resolves numbered books across notation styles", () => {
    // These four all mean the same book and all appear in real sermon notes.
    expect(lookupBook("1 Corinthians")).toBe("1CO");
    expect(lookupBook("1 Cor")).toBe("1CO");
    expect(lookupBook("1Cor")).toBe("1CO");
    expect(lookupBook("1st Corinthians")).toBe("1CO");
    expect(lookupBook("I Corinthians")).toBe("1CO");
    expect(lookupBook("II Timothy")).toBe("2TI");
    expect(lookupBook("III John")).toBe("3JN");
  });

  it("rejects things that are not books", () => {
    expect(lookupBook("Hello")).toBeNull();
    expect(lookupBook("")).toBeNull();
  });
});

describe("book codes", () => {
  it("only emits USFM codes the YouVersion SDK recognises", () => {
    // Guards against typos in the book table silently 404ing at the API.
    const canon = new Set<string>(BOOK_IDS);
    const names = [
      "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
      "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
      "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
      "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah",
      "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
      "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
      "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
      "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
      "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
      "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
      "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
      "3 John", "Jude", "Revelation",
    ];

    for (const name of names) {
      const code = lookupBook(name);
      expect(code, `${name} should resolve`).not.toBeNull();
      expect(canon.has(code!), `${name} -> ${code} not in BOOK_IDS`).toBe(true);
    }
  });

  it("covers all 66 protestant canon books", () => {
    const codes = new Set(
      [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua",
        "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
        "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
        "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah",
        "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
        "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
        "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
        "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
        "Galatians", "Ephesians", "Philippians", "Colossians",
        "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
        "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
        "1 John", "2 John", "3 John", "Jude", "Revelation",
      ].map((n) => lookupBook(n)),
    );
    expect(codes.size).toBe(66);
  });
});

describe("parseReference", () => {
  it("parses a verse, a range, and a whole chapter", () => {
    expect(parseReference("John 3:16")).toEqual({
      book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16,
    });
    expect(parseReference("1 Cor 13:4-7")).toEqual({
      book: "1CO", chapter: 13, verseStart: 4, verseEnd: 7,
    });
    expect(parseReference("Genesis 1")).toEqual({
      book: "GEN", chapter: 1, verseStart: null, verseEnd: null,
    });
  });

  it("accepts an en dash as a range separator", () => {
    // Word and Google Docs autocorrect hyphens into en dashes.
    expect(parseReference("Matthew 5:3–12")).toEqual({
      book: "MAT", chapter: 5, verseStart: 3, verseEnd: 12,
    });
  });

  it("rejects a backwards range", () => {
    expect(parseReference("John 3:18-16")).toBeNull();
  });

  it("rejects prose with no reference", () => {
    expect(parseReference("Hello there")).toBeNull();
    expect(parseReference("Meeting at 7:30")).toBeNull();
  });

  it("is not derailed by a preceding word", () => {
    // "See 1" looks like book + chapter to a greedy matcher, which would eat
    // the numeral belonging to "1 Cor".
    expect(parseReference("See 1 Cor 13:4-7")).toEqual({
      book: "1CO", chapter: 13, verseStart: 4, verseEnd: 7,
    });
    expect(parseReference("Read John 3:16")).toEqual({
      book: "JHN", chapter: 3, verseStart: 16, verseEnd: 16,
    });
  });
});

describe("toUsfm", () => {
  it("formats verses, ranges, and chapters", () => {
    expect(toUsfm(parseReference("John 3:16")!)).toBe("JHN.3.16");
    expect(toUsfm(parseReference("1 Cor 13:4-7")!)).toBe("1CO.13.4-7");
    expect(toUsfm(parseReference("Genesis 1")!)).toBe("GEN.1");
  });
});

describe("formatReference", () => {
  it("round-trips to a human-readable form", () => {
    expect(formatReference(parseReference("Jn 3:16")!)).toBe("John 3:16");
    expect(formatReference(parseReference("Genesis 1")!)).toBe("Genesis 1");
    expect(formatReference(parseReference("Matthew 5:3-12")!)).toBe(
      "Matthew 5:3-12",
    );
  });
});

describe("findReferences", () => {
  it("finds every reference in prose with its offsets", () => {
    const text = "Turn to John 3:16 and then Romans 8:28 today.";
    const found = findReferences(text);

    expect(found.map((f) => toUsfm(f.reference))).toEqual([
      "JHN.3.16",
      "ROM.8.28",
    ]);
    expect(text.slice(found[0]!.start, found[0]!.end)).toBe("John 3:16");
  });

  it("reports exact offsets for numbered books", () => {
    // The leading numeral must be inside the match and no leading space may
    // leak in, or replacing the matched span in the editor is off by one.
    const text = "See 1 Cor 13:4-7 for love.";
    const [found] = findReferences(text);

    expect(found).toBeDefined();
    expect(text.slice(found!.start, found!.end)).toBe("1 Cor 13:4-7");
  });

  it("returns nothing for prose without references", () => {
    expect(findReferences("Welcome to the service this morning.")).toEqual([]);
  });

  it("ignores numbers in ordinary prose", () => {
    // Building the pattern from real book names means ordinary words and
    // times of day cannot be mistaken for references.
    expect(findReferences("We have 3 points and 2 songs.")).toEqual([]);
    expect(findReferences("The service starts at 10:30 sharp.")).toEqual([]);
    expect(findReferences("Call me on 555 1234.")).toEqual([]);
  });

  it("prefers the longest book name", () => {
    // "Song of Songs" must beat "Song"; "1 John" must beat "John".
    expect(parseReference("Song of Songs 2:1")?.book).toBe("SNG");
    expect(parseReference("1 John 4:8")?.book).toBe("1JN");
    expect(parseReference("2 Timothy 3:16")?.book).toBe("2TI");
  });

  it("finds references embedded mid-sentence", () => {
    const text = "As Paul writes in 1 Cor 13:4-7, love is patient.";
    const [found] = findReferences(text);

    expect(found).toBeDefined();
    expect(text.slice(found!.start, found!.end)).toBe("1 Cor 13:4-7");
    expect(toUsfm(found!.reference)).toBe("1CO.13.4-7");
  });
});
