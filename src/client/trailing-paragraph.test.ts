import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "./schema.ts";
import { trailingParagraphPlugin } from "./editor.ts";

/**
 * A block citation is an atom, so it holds no cursor position. Ending the
 * document with one left a phone author with nowhere to tap and no way to
 * keep writing — `gapCursor()` rescues desktop, but touch has no arrow key.
 */
function citation() {
  return schema.nodes.scripture!.create({
    book: "JHN",
    chapter: 3,
    verseStart: 16,
    label: "John 3:16",
  });
}

function stateWith(...nodes: ReturnType<typeof schema.node>[]) {
  return EditorState.create({
    doc: schema.nodes.doc!.create(null, nodes),
    plugins: [trailingParagraphPlugin()],
  });
}

/** Run the plugin's `appendTransaction` the way the editor would. */
function settle(state: EditorState): EditorState {
  const tr = state.tr.setMeta("test", true);
  return state.apply(tr);
}

describe("trailingParagraphPlugin", () => {
  it("adds a paragraph after a citation that ends the document", () => {
    const after = settle(
      stateWith(schema.nodes.paragraph!.create(), citation()),
    );

    const last = after.doc.lastChild!;
    expect(last.type.name).toBe("paragraph");
    expect(last.content.size).toBe(0);
  });

  it("leaves a document already ending in a paragraph alone", () => {
    const before = stateWith(citation(), schema.nodes.paragraph!.create());
    const after = settle(before);

    expect(after.doc.childCount).toBe(before.doc.childCount);
    expect(after.doc.lastChild!.type.name).toBe("paragraph");
  });

  it("does not stack paragraphs when applied repeatedly", () => {
    let state = settle(stateWith(citation()));
    const size = state.doc.childCount;

    state = settle(state);
    state = settle(state);

    expect(state.doc.childCount).toBe(size);
  });

  it("rescues a horizontal rule too, being equally uncursorable", () => {
    const after = settle(stateWith(schema.nodes.horizontal_rule!.create()));
    expect(after.doc.lastChild!.type.name).toBe("paragraph");
  });

  it("leaves a heading at the end alone — it holds a cursor already", () => {
    const after = settle(stateWith(schema.nodes.heading!.create({ level: 2 })));
    expect(after.doc.lastChild!.type.name).toBe("heading");
  });
});
