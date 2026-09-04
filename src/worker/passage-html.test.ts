import { describe, expect, it } from "vitest";
import {
  linesToText,
  parsePassageHtml,
  parsePassageLines,
  versesToText,
} from "./passage-html.ts";

// Fixtures are real responses from the YouVersion API (BSB, version 3034).

const JOHN_3_16_18 =
  '<div><div class="p"><span class="yv-v" v="16"></span>' +
  '<span class="yv-vlbl">16</span>For God so loved the world that He gave ' +
  "His one and only Son. " +
  '<span class="yv-v" v="17"></span><span class="yv-vlbl">17</span>' +
  "For God did not send His Son into the world to condemn the world. " +
  '<span class="yv-v" v="18"></span><span class="yv-vlbl">18</span>' +
  "Whoever believes in Him is not condemned.</div></div>";

const PSALM_23_POETRY =
  '<div><div class="d"><span class="yv-v" v="1"></span>' +
  '<span class="yv-vlbl">1</span>A Psalm of David.</div>' +
  '<div class="q1">The <span class="nd">Lord</span> is my shepherd;</div>' +
  '<div class="q2">I shall not want.</div>' +
  '<div class="q1"><span class="yv-v" v="2"></span>' +
  '<span class="yv-vlbl">2</span>He makes me lie down in green pastures;</div>' +
  "</div>";

const WITH_HEADING =
  '<div><div class="s1 yv-h">The Bride’s Admiration</div>' +
  '<div class="q1"><span class="yv-v" v="1"></span>' +
  '<span class="yv-vlbl">1</span>I am a rose of Sharon,</div></div>';

describe("parsePassageHtml", () => {
  it("extracts verse numbers, which format=text discards entirely", () => {
    const verses = parsePassageHtml(JOHN_3_16_18);

    expect(verses.map((v) => v.number)).toEqual([16, 17, 18]);
    expect(verses[0]!.text).toBe(
      "For God so loved the world that He gave His one and only Son.",
    );
  });

  it("does not repeat the number inside the verse text", () => {
    // The printed label span duplicates the `v` attribute; including it would
    // render "16 16For God so loved...".
    const verses = parsePassageHtml(JOHN_3_16_18);

    for (const verse of verses) {
      expect(verse.text).not.toMatch(/^\d/);
    }
  });

  it("keeps text that precedes the first verse marker", () => {
    // A psalm superscription belongs to the passage but has no verse number.
    const verses = parsePassageHtml(PSALM_23_POETRY);

    expect(verses[0]!.number).toBe(1);
    expect(verses[0]!.text).toContain("A Psalm of David.");
  });

  it("keeps poetry line text and inline styling content", () => {
    const text = versesToText(parsePassageHtml(PSALM_23_POETRY));

    expect(text).toContain("The Lord is my shepherd");
    expect(text).toContain("I shall not want");
  });

  it("drops section headings by default", () => {
    const text = versesToText(parsePassageHtml(WITH_HEADING));

    expect(text).not.toContain("Admiration");
    expect(text).toContain("I am a rose of Sharon");
  });

  it("keeps section headings when asked", () => {
    const verses = parsePassageHtml(WITH_HEADING, true);

    expect(verses[0]!.number).toBeNull();
    expect(verses[0]!.text).toBe("The Bride’s Admiration");
  });

  it("decodes HTML entities", () => {
    const verses = parsePassageHtml(
      '<div class="p"><span class="yv-v" v="1"></span>' +
        "<span class=\"yv-vlbl\">1</span>Shadrach &amp; Meshach said &quot;no&quot;.</div>",
    );

    expect(verses[0]!.text).toBe('Shadrach & Meshach said "no".');
  });

  it("returns nothing for empty input", () => {
    expect(parsePassageHtml("")).toEqual([]);
    expect(parsePassageHtml("<div></div>")).toEqual([]);
  });
});

describe("parsePassageLines", () => {
  it("keeps poetry as separate lines with indent levels", () => {
    // Flattening this to one paragraph would lose the shape that makes a
    // psalm recognisable.
    const lines = parsePassageLines(PSALM_23_POETRY);

    expect(lines.map((l) => l.indent)).toEqual([0, 1, 2, 1]);
    expect(lines[1]!.spans.map((s) => s.text).join("")).toBe(
      "The Lord is my shepherd;",
    );
    expect(lines[2]!.spans.map((s) => s.text).join("")).toBe(
      "I shall not want.",
    );
  });

  it("marks the divine name as small caps rather than shouted capitals", () => {
    const lines = parsePassageLines(PSALM_23_POETRY);
    const spans = lines[1]!.spans;

    expect(spans.find((s) => s.smallCaps)?.text).toBe("Lord");
    // Surrounding words must not inherit the styling.
    expect(spans.filter((s) => s.smallCaps).length).toBe(1);
  });

  it("attaches a verse number to the line that starts the verse", () => {
    const lines = parsePassageLines(PSALM_23_POETRY);

    expect(lines[0]!.number).toBe(1);
    // Continuation lines carry no number of their own.
    expect(lines[1]!.number).toBeNull();
    expect(lines[2]!.number).toBeNull();
    expect(lines[3]!.number).toBe(2);
  });

  it("treats prose as a single line per verse", () => {
    const lines = parsePassageLines(JOHN_3_16_18);

    expect(lines.map((l) => l.number)).toEqual([16, 17, 18]);
    expect(lines.every((l) => l.indent === 0)).toBe(true);
  });

  it("flattens to readable prose", () => {
    const text = linesToText(parsePassageLines(PSALM_23_POETRY));

    expect(text).toBe(
      "A Psalm of David. The Lord is my shepherd; I shall not want. " +
        "He makes me lie down in green pastures;",
    );
  });
});
