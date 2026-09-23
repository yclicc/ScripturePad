import { describe, expect, it } from "vitest";
import { findLinks } from "./linkify.ts";

function links(text: string): [string, string][] {
  return findLinks(text).map((l) => [text.slice(l.start, l.end), l.href]);
}

describe("findLinks", () => {
  it("finds addresses with a scheme, www, or a known domain", () => {
    expect(links("Go to https://ourchurch.org/camp?week=2 now")).toEqual([
      [
        "https://ourchurch.org/camp?week=2",
        "https://ourchurch.org/camp?week=2",
      ],
    ]);
    expect(links("see www.bible.com")).toEqual([
      ["www.bible.com", "https://www.bible.com/"],
    ]);
    expect(links("sign up at ourchurch.org/camp")).toEqual([
      ["ourchurch.org/camp", "https://ourchurch.org/camp"],
    ]);
    expect(links("st-marks.church.co.uk")).toEqual([
      ["st-marks.church.co.uk", "https://st-marks.church.co.uk/"],
    ]);
  });

  it("turns email addresses into mailto links", () => {
    expect(links("Email pastor@ourchurch.org.")).toEqual([
      ["pastor@ourchurch.org", "mailto:pastor@ourchurch.org"],
    ]);
  });

  it("leaves sentence punctuation outside the link", () => {
    expect(links("Visit ourchurch.org.")[0]![0]).toBe("ourchurch.org");
    expect(links("(see https://ourchurch.org/a)")[0]![0]).toBe(
      "https://ourchurch.org/a",
    );
    expect(links('"https://ourchurch.org",')[0]![0]).toBe(
      "https://ourchurch.org",
    );
    expect(links("en.wikipedia.org/wiki/Mercy_(virtue)")[0]![0]).toBe(
      "en.wikipedia.org/wiki/Mercy_(virtue)",
    );
  });

  it("ignores ordinary prose", () => {
    for (const text of [
      "He wept.Then he rose",
      "John 3.16 and Acts 2.38",
      "e.g. this, i.e. that",
      "version 1.2.3",
      "https:// is how it starts",
      "file.txt",
    ]) {
      expect(links(text)).toEqual([]);
    }
  });

  it("never produces a script-running link", () => {
    for (const text of [
      "javascript:alert(1)",
      "javascript://ourchurch.org/%0aalert(1)",
      "data:text/html,ourchurch.org",
      "vbscript:ourchurch.org",
    ]) {
      for (const [, href] of links(text)) {
        expect(href).toMatch(/^(https?|mailto):/);
      }
    }
  });

  it("stops at an inline citation or line break", () => {
    expect(links("ourchurch.org￼more")).toEqual([
      ["ourchurch.org", "https://ourchurch.org/"],
    ]);
  });
});
