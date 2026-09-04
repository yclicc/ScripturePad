import {
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type NodeSpec,
} from "prosemirror-model";
import { addListNodes } from "prosemirror-schema-list";

/**
 * A deliberately small schema.
 *
 * Keeping it small is the mechanism that makes "paste from Google Docs" work:
 * anything with no node or mark here is dropped on paste, so Docs' font tags,
 * colours, and spacing never survive into the document.
 */

const paragraphDOM: DOMOutputSpec = ["p", 0];

/** How a citation is presented. See CLAUDE.md "Scripture references". */
export type ScriptureStyle = "block" | "popover" | "inline";

/**
 * Shared by the block and inline scripture nodes. The rendered verse text is
 * deliberately absent — only the reference is stored, so changing translation
 * re-renders rather than rewriting the document.
 */
const SCRIPTURE_ATTRS = {
  book: {},
  chapter: {},
  verseStart: { default: null },
  /** Last chapter of a range; equals `chapter` unless the range spans. */
  endChapter: { default: null },
  verseEnd: { default: null },
  /** Human-readable reference, e.g. "John 3:16". */
  label: { default: "" },
  style: { default: "block" as ScriptureStyle },
};

function parseScriptureAttrs(dom: HTMLElement) {
  return {
    book: dom.getAttribute("data-book"),
    chapter: Number(dom.getAttribute("data-chapter")),
    verseStart: dom.getAttribute("data-verse-start")
      ? Number(dom.getAttribute("data-verse-start"))
      : null,
    endChapter: dom.getAttribute("data-end-chapter")
      ? Number(dom.getAttribute("data-end-chapter"))
      : null,
    verseEnd: dom.getAttribute("data-verse-end")
      ? Number(dom.getAttribute("data-verse-end"))
      : null,
    label: dom.getAttribute("data-label") ?? "",
    style: (dom.getAttribute("data-style") ?? "block") as ScriptureStyle,
  };
}

function scriptureDataAttrs(
  attrs: Record<string, unknown>,
  style: string,
): Record<string, string> {
  return {
    "data-scripture": "true",
    "data-book": String(attrs.book),
    "data-chapter": String(attrs.chapter),
    ...(attrs.verseStart !== null && {
      "data-verse-start": String(attrs.verseStart),
    }),
    ...(attrs.endChapter != null && {
      "data-end-chapter": String(attrs.endChapter),
    }),
    ...(attrs.verseEnd !== null && {
      "data-verse-end": String(attrs.verseEnd),
    }),
    "data-label": String(attrs.label),
    "data-style": style,
  };
}

const baseNodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },

  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM: () => paragraphDOM,
  },

  heading: {
    attrs: { level: { default: 2 } },
    content: "inline*",
    group: "block",
    defining: true,
    // Docs uses h1 for the title; map the full range but render only 1-3.
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 3 } },
      { tag: "h5", attrs: { level: 3 } },
      { tag: "h6", attrs: { level: 3 } },
    ],
    toDOM: (node) => [`h${node.attrs.level}`, 0] as DOMOutputSpec,
  },

  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM: () => ["blockquote", 0] as DOMOutputSpec,
  },

  horizontal_rule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM: () => ["hr"] as DOMOutputSpec,
  },

  /**
   * A scripture citation set as its own paragraph — the default style, and the
   * right one for a passage being preached from.
   *
   * Stores the reference structurally rather than the rendered verse text, so
   * the passage can be re-fetched in whatever translation the reader picks.
   */
  scripture: {
    inline: false,
    group: "block",
    atom: true,
    draggable: true,
    attrs: SCRIPTURE_ATTRS,
    parseDOM: [
      {
        tag: "div[data-scripture]",
        getAttrs: (dom: HTMLElement) => parseScriptureAttrs(dom),
      },
    ],
    toDOM: (node) =>
      ["div", scriptureDataAttrs(node.attrs, "block")] as DOMOutputSpec,
  },

  /**
   * An inline citation: either a hoverable reference (`popover`) or the verse
   * text woven into the sentence (`inline`). Both must sit inside a paragraph,
   * which is why they cannot share the block node above.
   */
  scripture_inline: {
    inline: true,
    group: "inline",
    atom: true,
    draggable: true,
    attrs: SCRIPTURE_ATTRS,
    parseDOM: [
      {
        tag: "span[data-scripture]",
        getAttrs: (dom: HTMLElement) => parseScriptureAttrs(dom),
      },
    ],
    toDOM: (node) =>
      [
        "span",
        scriptureDataAttrs(node.attrs, node.attrs.style as string),
      ] as DOMOutputSpec,
  },

  text: { group: "inline" },
};

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [
      { tag: "strong" },
      // Google Docs wraps the ENTIRE clipboard payload in
      // <b style="font-weight:normal">. Treating that as bold turns the whole
      // paste bold, so a normal font-weight must explicitly cancel the mark.
      {
        tag: "b",
        getAttrs: (node: HTMLElement) =>
          node.style.fontWeight !== "normal" && null,
      },
      // Docs also encodes bold as an inline style rather than a tag.
      {
        style: "font-weight",
        getAttrs: (value: string) =>
          /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null,
      },
    ],
    toDOM: () => ["strong", 0] as DOMOutputSpec,
  },

  em: {
    parseDOM: [
      { tag: "i" },
      { tag: "em" },
      { style: "font-style=italic" },
      // Docs emits font-style:normal on spans inside italic runs.
      {
        style: "font-style=normal",
        clearMark: (m: { type: { name: string } }) => m.type.name === "em",
      },
    ],
    toDOM: () => ["em", 0] as DOMOutputSpec,
  },

  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom: HTMLElement) => {
          const href = dom.getAttribute("href");
          // Docs routes links through a redirector; unwrap to the real target.
          if (href?.startsWith("https://www.google.com/url?q=")) {
            const real = new URL(href).searchParams.get("q");
            if (real) return { href: real };
          }
          return { href };
        },
      },
    ],
    toDOM: (node) =>
      [
        "a",
        { href: node.attrs.href, rel: "noopener noreferrer" },
        0,
      ] as DOMOutputSpec,
  },

  /**
   * Text that must not be machine-translated: names, transliterations,
   * theological terms. Renders `translate="no"`, which Google Translate and
   * friends respect. Replaces the legacy `&`-delimited syntax.
   */
  no_translate: {
    parseDOM: [{ tag: "span[translate=no]" }],
    toDOM: () =>
      ["span", { translate: "no", class: "no-translate" }, 0] as DOMOutputSpec,
  },
};

// Lists come from prosemirror-schema-list rather than being hand-rolled, so
// splitting, lifting, and sinking behave the way every other editor does.
const nodesWithLists = addListNodes(
  new Schema({ nodes: baseNodes, marks }).spec.nodes,
  "paragraph block*",
  "block",
);

export const schema = new Schema({ nodes: nodesWithLists, marks });
