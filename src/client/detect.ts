import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { findReferences, type ScriptureReference } from "../shared/references.ts";
import type { ScriptureStyle } from "./schema.ts";

/**
 * Automatic scripture detection.
 *
 * References are found as the author types or pastes — no sigil, no bracket
 * syntax. A detected reference is only underlined; nothing is inserted until
 * the author explicitly picks a citation style, so detection can never rewrite
 * the document on its own.
 */

export interface Candidate {
  reference: ScriptureReference;
  from: number;
  to: number;
  text: string;
}

interface DetectState {
  candidates: Candidate[];
  decorations: DecorationSet;
  /** References the author dismissed; never prompt for these again. */
  dismissed: Set<string>;
}

export const detectKey = new PluginKey<DetectState>("scriptureDetect");

/**
 * Identity of a dismissed reference.
 *
 * Keyed on the reference alone, not its position: typing earlier in the
 * document shifts every later offset, and a position-keyed id would make
 * dismissed prompts reappear on the next keystroke.
 */
function candidateId(candidate: Candidate): string {
  const { book, chapter, verseStart, endChapter, verseEnd } =
    candidate.reference;
  return `${book}.${chapter}.${verseStart ?? ""}-${endChapter}.${verseEnd ?? ""}`;
}

function scanDocument(state: EditorState, dismissed: Set<string>): Candidate[] {
  const candidates: Candidate[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    // The block's text is scanned as a whole — a reference may be split across
    // formatting marks ("**Romans** 8:28" is two text nodes) — but offsets are
    // mapped back through a table built from the children, because:
    //
    //  - A paragraph may hold several citations, so the block cannot simply be
    //    skipped once it contains one.
    //  - Atom nodes occupy a position while contributing no text, so an inline
    //    citation earlier in the paragraph shifts every later position. Naive
    //    `textContent` offsets would replace the wrong span.
    let text = "";
    /** For each character of `text`, its position in the document. */
    const positions: number[] = [];

    node.forEach((child, offset) => {
      const base = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) positions.push(base + i);
        text += child.text;
      }
      // Atoms contribute no characters, so nothing is recorded for them and
      // the following run's positions pick up after their nodeSize.
    });

    for (const found of findReferences(text)) {
      const from = positions[found.start];
      // `end` is exclusive: take the last character's position and step past it.
      const lastCharPos = positions[found.end - 1];
      if (from === undefined || lastCharPos === undefined) continue;

      const candidate = {
        reference: found.reference,
        from,
        to: lastCharPos + 1,
        text: text.slice(found.start, found.end),
      };
      if (!dismissed.has(candidateId(candidate))) candidates.push(candidate);
    }

    return false;
  });

  return candidates;
}

function buildDecorations(candidates: Candidate[]): Decoration[] {
  return candidates.map((candidate) =>
    Decoration.inline(candidate.from, candidate.to, {
      class: "scripture-detected",
    }),
  );
}

export interface DetectOptions {
  /** Called when the set of detected references changes. */
  onCandidates: (candidates: Candidate[], view: EditorView) => void;
  /** Called when the author clicks a detected reference. */
  onPick?: (candidate: Candidate, view: EditorView) => void;
}

/** The detected reference covering a document position, if any. */
export function candidateAt(
  state: EditorState,
  pos: number,
): Candidate | null {
  const found = detectKey.getState(state)?.candidates ?? [];
  return found.find((c) => pos >= c.from && pos <= c.to) ?? null;
}

export function scriptureDetectPlugin(options: DetectOptions): Plugin {
  return new Plugin<DetectState>({
    key: detectKey,

    state: {
      init(_config, state) {
        const dismissed = new Set<string>();
        const candidates = scanDocument(state, dismissed);
        return {
          candidates,
          decorations: DecorationSet.create(
            state.doc,
            buildDecorations(candidates),
          ),
          dismissed,
        };
      },

      apply(tr, value, _oldState, newState) {
        const meta = tr.getMeta(detectKey) as
          | { dismiss?: string; undismissAll?: boolean }
          | undefined;

        const dismissed = meta?.undismissAll
          ? new Set<string>()
          : meta?.dismiss
            ? new Set([...value.dismissed, meta.dismiss])
            : value.dismissed;

        if (!tr.docChanged && !meta) return { ...value, dismissed };

        const candidates = scanDocument(newState, dismissed);
        return {
          candidates,
          decorations: DecorationSet.create(
            newState.doc,
            buildDecorations(candidates),
          ),
          dismissed,
        };
      },
    },

    props: {
      decorations(state) {
        return detectKey.getState(state)?.decorations;
      },

      /**
       * Clicking an underlined reference offers it.
       *
       * Without this, only the candidate nearest the cursor was ever offered,
       * and the prompt only reappeared when the set of candidates changed — so
       * any other detected reference was underlined but impossible to act on.
       */
      handleClick(view, pos) {
        const candidate = candidateAt(view.state, pos);
        if (!candidate) return false;
        options.onPick?.(candidate, view);
        // Let the click through so the caret still lands where it was aimed.
        return false;
      },
    },

    view(view) {
      let previous = "";

      const notify = (v: EditorView) => {
        const found = detectKey.getState(v.state)?.candidates ?? [];
        // Only fire when the candidate set actually changes, or the popup
        // would re-open on every keystroke. Position is part of this
        // signature (unlike the dismissal id) so the popup repositions when a
        // reference moves.
        const signature = found
          .map((candidate) => `${candidateId(candidate)}@${candidate.from}`)
          .join("|");
        if (signature === previous) return;
        previous = signature;
        options.onCandidates(found, v);
      };

      notify(view);

      return {
        update: (v) => notify(v),
      };
    },
  });
}

/** Mark a reference as dismissed so it stops being offered. */
export function dismissCandidate(
  view: EditorView,
  candidate: Candidate,
): void {
  view.dispatch(
    view.state.tr.setMeta(detectKey, { dismiss: candidateId(candidate) }),
  );
}

/**
 * Change an existing citation's style, or turn it back into plain text.
 *
 * A choice made once must not be permanent — `block` and `popover` live in
 * different nodes, so switching between them is a node replacement rather than
 * an attribute change.
 */
export function changeScriptureStyle(
  view: EditorView,
  pos: number,
  style: ScriptureStyle | "text",
): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !node.type.name.startsWith("scripture")) return;

  const { schema } = view.state;
  const attrs = node.attrs;

  if (style === "text") {
    // Back to prose: leave the reference behind as ordinary text.
    //
    // The text must become a detectable candidate again, or reverting would be
    // one-way — there is no node view left to carry the style control, so
    // without clearing dismissals the author could never cite it a second
    // time.
    const label = String(attrs.label || "");
    const tr = view.state.tr.replaceWith(
      pos,
      pos + node.nodeSize,
      schema.text(label || " "),
    );
    tr.setMeta(detectKey, { undismissAll: true });
    view.dispatch(tr);
    return;
  }

  const target =
    style === "block" ? schema.nodes.scripture! : schema.nodes.scripture_inline!;

  const replacement = target.create({ ...attrs, style });

  // An inline node cannot sit where a block one did, and vice versa, so the
  // surrounding paragraph is adjusted as part of the same transaction.
  const tr = view.state.tr;
  const $pos = tr.doc.resolve(pos);

  if (target.isInline && !node.type.isInline) {
    // Block to inline: wrap the new node in a paragraph.
    tr.replaceWith(
      pos,
      pos + node.nodeSize,
      schema.nodes.paragraph!.create(null, replacement),
    );
  } else if (!target.isInline && node.type.isInline) {
    // Inline to block: lift it out of its paragraph.
    const parent = $pos.parent;
    const parentPos = $pos.before();
    const onlyChild = parent.childCount === 1;

    if (onlyChild) {
      tr.replaceWith(parentPos, parentPos + parent.nodeSize, replacement);
    } else {
      tr.delete(pos, pos + node.nodeSize);
      tr.insert(tr.mapping.map($pos.after()), replacement);
    }
  } else {
    tr.replaceWith(pos, pos + node.nodeSize, replacement);
  }

  view.dispatch(tr);
}

/** Replace the detected text with a scripture node in the chosen style. */
export function insertScripture(
  view: EditorView,
  candidate: Candidate,
  style: ScriptureStyle,
): void {
  const { schema } = view.state;
  const { reference } = candidate;

  const attrs = {
    book: reference.book,
    chapter: reference.chapter,
    verseStart: reference.verseStart,
    endChapter: reference.endChapter,
    verseEnd: reference.verseEnd,
    label: candidate.text,
    style,
  };

  // A block citation becomes its own paragraph; the inline styles stay in the
  // sentence where the reference was written.
  const node =
    style === "block"
      ? schema.nodes.scripture!.create(attrs)
      : schema.nodes.scripture_inline!.create(attrs);

  const tr = view.state.tr;

  if (style === "block") {
    // Drop the reference text and place the quotation after its paragraph.
    const $from = tr.doc.resolve(candidate.from);
    const end = $from.end();
    tr.delete(candidate.from, candidate.to);
    tr.insert(tr.mapping.map(end), node);
  } else {
    tr.replaceWith(candidate.from, candidate.to, node);
  }

  view.dispatch(tr.scrollIntoView());
}
