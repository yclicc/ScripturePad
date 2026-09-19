import { EditorState, Plugin } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { DOMParser as PMDOMParser } from "prosemirror-model";
import {
  baseKeymap,
  chainCommands,
  lift,
  setBlockType,
  toggleMark,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";
import {
  inputRules,
  smartQuotes,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import {
  splitListItem,
  liftListItem,
  sinkListItem,
} from "prosemirror-schema-list";
import { schema } from "./schema.ts";
import { createScriptureViewFactory } from "./scripture.ts";
import { scriptureDetectPlugin } from "./detect.ts";
import { ScripturePrompt } from "./prompt.ts";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-gapcursor/style/gapcursor.css";

/**
 * Strip Google Docs cruft before ProseMirror parses it.
 *
 * The schema already drops unknown tags, but a few Docs quirks need handling
 * before parsing rather than after.
 */
export function transformPastedHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Docs marks list items with a class and renders the bullet as literal text
  // inside the item; strip it or every bullet doubles up.
  for (const li of doc.querySelectorAll("li")) {
    li.innerHTML = li.innerHTML.replace(/^\s*[•·▪◦‣⁃]\s*/, "");
  }

  // Docs emits empty paragraphs containing only <br> for spacing.
  for (const p of doc.querySelectorAll("p")) {
    if (!p.textContent?.trim() && !p.querySelector("img")) {
      p.remove();
    }
  }

  // Comment anchors and suggestion markup leak in as superscript links.
  for (const a of doc.querySelectorAll('a[href^="#cmnt"], sup a')) {
    a.closest("sup")?.remove() ?? a.remove();
  }

  return doc.body.innerHTML;
}

const headingRule = textblockTypeInputRule(
  /^(#{1,3})\s$/,
  schema.nodes.heading!,
  (match) => ({ level: match[1]!.length }),
);

const blockquoteRule = wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote!);

const bulletRule = wrappingInputRule(
  /^\s*([-+*])\s$/,
  schema.nodes.bullet_list!,
);

const orderedRule = wrappingInputRule(
  /^(\d+)\.\s$/,
  schema.nodes.ordered_list!,
  (match) => ({ order: Number(match[1]) }),
);

/**
 * Shows guidance in an empty document.
 *
 * A decoration rather than real content, so it is never part of the document
 * and can never be saved or translated as if the author had written it.
 */
/**
 * Keep a paragraph after a block that cannot hold a cursor.
 *
 * A block scripture citation is an atom: it has no text position inside it, so
 * when one ends the document there is nowhere to put the caret and no way to
 * carry on writing. `gapCursor()` solves this on desktop, where an arrow key
 * or a click on a one-pixel gap reaches the space after the node. Touch has
 * neither — there is no arrow key, and the gap is far too small to tap — so on
 * a phone the citation was simply a dead end, which is what was reported.
 *
 * Appending the paragraph is the fix rather than a larger tap target, because
 * it needs no aiming at all: the tap lands where the author already expects to
 * write. An empty trailing paragraph is also what every other editor leaves
 * behind, and it costs nothing — `toHTML` emits nothing visible for it, and
 * the next citation appended after it reuses it.
 */
export function trailingParagraphPlugin(): Plugin {
  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      const { doc, tr } = newState;
      const last = doc.lastChild;
      // `isTextblock` covers paragraphs and headings; only an atom such as a
      // citation or a horizontal rule leaves the author stranded.
      if (!last || last.isTextblock || !last.isAtom) return null;

      return tr.insert(doc.content.size, schema.nodes.paragraph!.create());
    },
  });
}

function placeholderPlugin(text: string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        const isEmpty =
          doc.childCount === 1 &&
          doc.firstChild?.isTextblock &&
          doc.firstChild.content.size === 0;

        if (!isEmpty) return null;

        return DecorationSet.create(doc, [
          Decoration.node(0, doc.firstChild!.nodeSize, {
            class: "is-empty",
            "data-placeholder": text,
          }),
        ]);
      },
    },
  });
}

export interface EditorOptions {
  mount: HTMLElement;
  initialContent?: unknown;
  editable?: boolean;
  getVersionId: () => number;
  onChange?: () => void;
  /**
   * Called after every transaction, including ones that only move the cursor.
   *
   * Distinct from `onChange`, which fires only when the document changes: the
   * toolbar's active state depends on where the selection *is*, so moving the
   * caret out of bold text must update it even though nothing was edited.
   */
  onStateChange?: () => void;
  /** Guidance shown while the document is empty. */
  placeholder?: string;
}

export function createEditor(options: EditorOptions): EditorView {
  const { mount, initialContent, editable = true, getVersionId } = options;
  const { placeholder } = options;

  const doc = initialContent
    ? schema.nodeFromJSON(initialContent)
    : PMDOMParser.fromSchema(schema).parse(
        document.createRange().createContextualFragment("<p></p>"),
      );

  // Positioned against the mount, which the stylesheet makes a containing
  // block, so the popup tracks the reference as the page scrolls.
  const prompt = new ScripturePrompt(mount);

  const state = EditorState.create({
    doc,
    plugins: [
      history(),
      keymap({
        "Mod-z": undo,
        "Mod-y": redo,
        "Mod-Shift-z": redo,
        "Mod-b": toggleMark(schema.marks.strong!),
        "Mod-i": toggleMark(schema.marks.em!),
        // Mark text as untranslatable — names, transliterations, terms.
        "Mod-Shift-t": toggleMark(schema.marks.no_translate!),
        "Shift-Ctrl-1": setBlockType(schema.nodes.heading!, { level: 1 }),
        "Shift-Ctrl-2": setBlockType(schema.nodes.heading!, { level: 2 }),
        "Shift-Ctrl-0": setBlockType(schema.nodes.paragraph!),
        Enter: splitListItem(schema.nodes.list_item!),
        // Outdent must always have a way out. `liftListItem` only works when
        // the selection is still inside a list item — turning a list item into
        // a heading leaves the block nested but no longer liftable that way,
        // so `lift` is chained as the fallback. Without it such a block is
        // trapped at its indent level with no keystroke that frees it.
        Tab: sinkListItem(schema.nodes.list_item!),
        "Shift-Tab": chainCommands(liftListItem(schema.nodes.list_item!), lift),
        "Mod-[": chainCommands(liftListItem(schema.nodes.list_item!), lift),
        "Mod-]": sinkListItem(schema.nodes.list_item!),
      }),
      keymap(baseKeymap),
      // Puts a cursor beside block nodes that cannot hold one — chiefly a
      // scripture citation ending the document. Arrow keys and clicks reach
      // it; `trailingParagraphPlugin` covers touch, which has neither.
      gapCursor(),
      trailingParagraphPlugin(),
      // No scripture input rule: references are detected automatically rather
      // than triggered by typed punctuation. See CLAUDE.md.
      inputRules({
        rules: [
          headingRule,
          blockquoteRule,
          bulletRule,
          orderedRule,
          ...smartQuotes,
        ],
      }),
      ...(placeholder ? [placeholderPlugin(placeholder)] : []),
      scriptureDetectPlugin({
        onCandidates: (candidates, view) => {
          // Offer the reference nearest the cursor, so the popup follows the
          // author's attention rather than jumping to the top of the document.
          const cursor = view.state.selection.from;
          const nearest = candidates
            .slice()
            .sort(
              (a, b) => Math.abs(a.to - cursor) - Math.abs(b.to - cursor),
            )[0];

          if (nearest) prompt.show(view, nearest);
          else prompt.hide();
        },
        // Any underlined reference can be cited by clicking it, not just the
        // one nearest the cursor.
        onPick: (candidate, view) => prompt.show(view, candidate),
      }),
    ],
  });

  const view = new EditorView(mount, {
    state,
    editable: () => editable,
    transformPastedHTML,
    nodeViews: {
      scripture: createScriptureViewFactory(getVersionId, editable),
      scripture_inline: createScriptureViewFactory(getVersionId, editable),
    },
    dispatchTransaction(transaction) {
      const self = this as unknown as EditorView;
      self.updateState(self.state.apply(transaction));
      if (transaction.docChanged) options.onChange?.();
      options.onStateChange?.();
    },
  });

  // Tear the popup's document-level listeners down with the editor.
  const destroy = view.destroy.bind(view);
  view.destroy = () => {
    prompt.destroy();
    destroy();
  };

  return view;
}
