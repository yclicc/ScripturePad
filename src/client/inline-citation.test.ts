import { describe, expect, it } from "vitest";
import { inlineCitationText } from "./reader.ts";

/**
 * The reference leads. "As it says in John 3:16, '…'" is how a citation is
 * spoken and written when it is part of a sentence; a trailing parenthesis
 * reads as a footnote instead.
 */
describe("inlineCitationText", () => {
  it("puts the reference before the quotation", () => {
    expect(inlineCitationText("John 3:16", "For God so loved the world")).toBe(
      "John 3:16, “For God so loved the world”",
    );
  });

  it("reads as part of the surrounding sentence", () => {
    const sentence = `as it says in ${inlineCitationText("Romans 8:28", "all things work together for good")}, we can be confident`;

    expect(sentence).toBe(
      "as it says in Romans 8:28, “all things work together for good”, " +
        "we can be confident",
    );
  });

  it("uses the localised reference the API returned", () => {
    // The API returns the reference in the Bible's own language — "Jean" for
    // a French version — so it is passed through rather than rebuilt here.
    expect(inlineCitationText("Jean 3:16", "Oui, Dieu a tant aimé")).toBe(
      "Jean 3:16, “Oui, Dieu a tant aimé”",
    );
  });

  it("uses curly quotes, not straight ones", () => {
    const out = inlineCitationText("Psalm 23:1", "The LORD is my shepherd");
    expect(out).toContain("“");
    expect(out).toContain("”");
    expect(out).not.toContain('"');
  });
});
