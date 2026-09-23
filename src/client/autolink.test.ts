import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "./schema.ts";
import { autolinkPlugin } from "./autolink.ts";

function stateWith(text: string): EditorState {
  const paragraph = schema.nodes.paragraph!.create(
    null,
    text ? schema.text(text) : undefined,
  );
  const doc = schema.nodes.doc!.create(null, [paragraph]);
  return EditorState.create({
    doc,
    plugins: [autolinkPlugin()],
    selection: TextSelection.create(doc, 1 + text.length),
  });
}

function type(state: EditorState, text: string): EditorState {
  for (const char of text) state = state.apply(state.tr.insertText(char));
  return state;
}

function paste(state: EditorState, text: string): EditorState {
  return state.apply(state.tr.insertText(text).setMeta("uiEvent", "paste"));
}

/** Each linked run of text, with its target. */
function linksIn(state: EditorState): [string, string][] {
  const found: [string, string][] = [];
  state.doc.descendants((node) => {
    const mark = schema.marks.link!.isInSet(node.marks);
    if (node.isText && mark) found.push([node.text!, mark.attrs.href]);
  });
  return found;
}

describe("autolinkPlugin", () => {
  it("links an address once the author types past it", () => {
    let state = type(stateWith(""), "see ourchurch.org");
    expect(linksIn(state)).toEqual([]);

    state = type(state, ". ");
    expect(linksIn(state)).toEqual([
      ["ourchurch.org", "https://ourchurch.org/"],
    ]);
  });

  it("links a pasted address straight away", () => {
    const state = paste(stateWith("Camp: "), "https://ourchurch.org/camp");
    expect(linksIn(state)).toEqual([
      ["https://ourchurch.org/camp", "https://ourchurch.org/camp"],
    ]);
  });

  it("does not link text nobody touched", () => {
    // Loading a document, or an author having removed a link, must not
    // produce one; only fresh edits are considered.
    let state = stateWith("ourchurch.org and ");
    state = type(state, "more");
    expect(linksIn(state)).toEqual([]);
  });

  it("keeps an address link pointing where its text says", () => {
    let state = type(stateWith(""), "ourchruch.org ");
    expect(linksIn(state)[0]![1]).toBe("https://ourchruch.org/");

    // Fix the typo: "chruch" -> "church".
    const at = 1 + "ourch".length;
    state = state.apply(state.tr.insertText("ur", at, at + 2));
    expect(linksIn(state)).toEqual([
      ["ourchurch.org", "https://ourchurch.org/"],
    ]);
  });

  it("leaves a deliberately named link alone", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(
        null,
        schema.text("ourchurch.org", [
          schema.marks.link!.create({ href: "https://example.org/camp" }),
        ]),
      ),
    ]);
    let state = EditorState.create({ doc, plugins: [autolinkPlugin()] });
    state = state.apply(state.tr.insertText("x", 2, 3));
    expect(linksIn(state)[0]![1]).toBe("https://example.org/camp");
  });
});
