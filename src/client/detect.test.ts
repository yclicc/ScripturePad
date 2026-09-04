import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "./schema.ts";
import { candidateAt, detectKey, scriptureDetectPlugin } from "./detect.ts";

/**
 * Detection is exercised through the plugin's own state, which is what the
 * editor actually reads.
 */
function candidatesFor(doc: ReturnType<typeof schema.node>) {
  const state = EditorState.create({
    doc,
    plugins: [scriptureDetectPlugin({ onCandidates: () => {} })],
  });
  return detectKey.getState(state)?.candidates ?? [];
}

function inlineCitation(label: string) {
  return schema.nodes.scripture_inline!.create({
    book: "JHN",
    chapter: 3,
    verseStart: 16,
    endChapter: 3,
    verseEnd: 16,
    label,
    style: "popover",
  });
}

describe("scripture detection", () => {
  it("finds several references in one paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Read Romans 8:28 and then 1 Cor 13:4 and Psalm 23."),
      ]),
    ]);

    expect(candidatesFor(doc).map((c) => c.text)).toEqual([
      "Romans 8:28",
      "1 Cor 13:4",
      "Psalm 23",
    ]);
  });

  it("keeps detecting after a paragraph already holds a citation", () => {
    // The block used to be skipped wholesale once it contained any scripture
    // node, so a second reference could never be cited.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("See "),
        inlineCitation("John 3:16"),
        schema.text(" and also Romans 8:28 today."),
      ]),
    ]);

    expect(candidatesFor(doc).map((c) => c.text)).toEqual(["Romans 8:28"]);
  });

  it("reports positions that survive an atom node earlier in the block", () => {
    // An inline citation occupies a position but contributes no text, so
    // offsets taken from textContent were shifted and replaced the wrong span.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("See "),
        inlineCitation("John 3:16"),
        schema.text(" and also Romans 8:28 today."),
      ]),
    ]);

    const [found] = candidatesFor(doc);
    expect(found).toBeDefined();
    expect(doc.textBetween(found!.from, found!.to)).toBe("Romans 8:28");
  });

  it("handles two citations with a reference between them", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("First "),
        inlineCitation("John 3:16"),
        schema.text(" then Romans 8:28 then "),
        inlineCitation("Psalm 23"),
        schema.text(" and finally 1 Cor 13:4."),
      ]),
    ]);

    const found = candidatesFor(doc);
    expect(found.map((c) => c.text)).toEqual(["Romans 8:28", "1 Cor 13:4"]);

    for (const candidate of found) {
      expect(doc.textBetween(candidate.from, candidate.to)).toBe(candidate.text);
    }
  });

  it("finds references across separate paragraphs", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("Romans 8:28 first.")]),
      schema.node("paragraph", null, [schema.text("Then Psalm 23 later.")]),
    ]);

    const found = candidatesFor(doc);
    expect(found.map((c) => c.text)).toEqual(["Romans 8:28", "Psalm 23"]);

    for (const candidate of found) {
      expect(doc.textBetween(candidate.from, candidate.to)).toBe(candidate.text);
    }
  });

  it("reports correct positions inside a list item", () => {
    const doc = schema.node("doc", null, [
      schema.node("bullet_list", null, [
        schema.node("list_item", null, [
          schema.node("paragraph", null, [schema.text("See Romans 8:28 here.")]),
        ]),
      ]),
    ]);

    const [found] = candidatesFor(doc);
    expect(found).toBeDefined();
    expect(doc.textBetween(found!.from, found!.to)).toBe("Romans 8:28");
  });

  it("resolves the candidate under a click position", () => {
    // The prompt only auto-offers one candidate, so every other detected
    // reference is reached by clicking it. That lookup must be exact.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Read Romans 8:28 and Psalm 23 today."),
      ]),
    ]);

    const state = EditorState.create({
      doc,
      plugins: [scriptureDetectPlugin({ onCandidates: () => {} })],
    });

    const [first, second] = detectKey.getState(state)!.candidates;
    expect(first!.text).toBe("Romans 8:28");
    expect(second!.text).toBe("Psalm 23");

    // A position inside the second reference must resolve to it, not the first.
    const inside = second!.from + 2;
    expect(candidateAt(state, inside)?.text).toBe("Psalm 23");

    // A position in plain prose resolves to nothing.
    expect(candidateAt(state, 1)).toBeNull();
  });

  it("does not span a citation sitting mid-reference", () => {
    // "Romans" + [atom] + " 8:28" reads as one reference in flattened text,
    // but replacing that span would swallow the existing citation.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Romans"),
        inlineCitation("John 3:16"),
        schema.text(" 8:28 today."),
      ]),
    ]);

    for (const candidate of candidatesFor(doc)) {
      // Whatever is offered must be exactly the text it claims to be.
      expect(doc.textBetween(candidate.from, candidate.to)).toBe(candidate.text);
    }
  });

  it("finds a reference split across formatting marks", () => {
    // "Romans" bold, the rest plain — ProseMirror stores these as separate
    // text nodes, so per-run scanning must not lose the reference.
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("Read ", []),
        schema.text("Romans", [schema.marks.strong!.create()]),
        schema.text(" 8:28 today."),
      ]),
    ]);

    const [found] = candidatesFor(doc);
    expect(found, "reference split across marks should still be found")
      .toBeDefined();
    expect(doc.textBetween(found!.from, found!.to)).toBe("Romans 8:28");
  });
});
