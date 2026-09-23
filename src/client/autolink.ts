import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { findLinks } from "../shared/linkify.ts";
import { safeHref } from "../shared/urls.ts";
import { schema } from "./schema.ts";

/**
 * Turn addresses into links as the author types or pastes them.
 *
 * Unlike a scripture reference, a link is added without asking: that is what
 * every document editor does, it changes nothing about how the text reads, and
 * undo takes it back. Only text this transaction touched is considered, so an
 * address the author deliberately unlinked is not relinked by an edit
 * somewhere else in the paragraph.
 */

/** Stands in for inline atoms (citations, line breaks) when reading text. */
const LEAF = "￼";

interface Range {
  from: number;
  to: number;
}

/** What the transactions changed, expressed as positions in the final doc. */
function changedRanges(transactions: readonly Transaction[]): Range[] {
  const ranges: Range[] = [];
  transactions.forEach((tr, index) => {
    const later = transactions.slice(index + 1);
    const toFinal = (pos: number, assoc: number): number =>
      later.reduce((p, next) => next.mapping.map(p, assoc), pos);

    tr.mapping.maps.forEach((map, step) => {
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        const rest = tr.mapping.slice(step + 1);
        ranges.push({
          from: toFinal(rest.map(newStart, -1), -1),
          to: toFinal(rest.map(newEnd, 1), 1),
        });
      });
    });
  });
  return ranges;
}

/**
 * Link text that was written as an address, before this edit.
 *
 * Used to keep such a link honest: correcting a typo in "ourchruch.org" must
 * move the link too, or the text shows one address and the click goes to
 * another. A link whose text is not its own address ("register here") was
 * chosen deliberately and is never rewritten.
 */
function addressHrefs(doc: PMNode): Set<string> {
  const hrefs = new Set<string>();
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    for (const span of linkSpans(node, 0)) {
      if (exactLink(span.text) === span.href) hrefs.add(span.href);
    }
    return false;
  });
  return hrefs;
}

/** The href `text` would link to if it is one address and nothing else. */
function exactLink(text: string): string | null {
  const [only, ...others] = findLinks(text);
  if (!only || others.length > 0) return null;
  return only.start === 0 && only.end === text.length ? only.href : null;
}

interface LinkSpan extends Range {
  href: string;
  text: string;
}

/** Contiguous runs of the same link within a textblock at `pos`. */
function linkSpans(block: PMNode, pos: number): LinkSpan[] {
  const spans: LinkSpan[] = [];
  const link = schema.marks.link!;

  block.forEach((child, offset) => {
    const from = pos + 1 + offset;
    const mark = link.isInSet(child.marks);
    const last = spans[spans.length - 1];
    if (!mark || !child.isText) return;
    if (last && last.to === from && last.href === mark.attrs.href) {
      last.to = from + child.nodeSize;
      last.text += child.text;
    } else {
      spans.push({
        from,
        to: from + child.nodeSize,
        href: mark.attrs.href as string,
        text: child.text ?? "",
      });
    }
  });

  return spans;
}

function touches(range: Range, changed: Range[]): boolean {
  return changed.some((c) => c.from <= range.to && c.to >= range.from);
}

export function autolinkPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const changed = changedRanges(transactions);
      if (changed.length === 0) return null;

      // A paste or drop delivers finished addresses. Typing does not: until
      // the author moves past it, "ourchurch.or" is still being written.
      const finished = transactions.some((tr) => {
        const event = tr.getMeta("uiEvent") as string | undefined;
        return event === "paste" || event === "drop";
      });

      return linkify(oldState, newState, changed, finished);
    },
  });
}

function linkify(
  oldState: EditorState,
  newState: EditorState,
  changed: Range[],
  finished: boolean,
): Transaction | null {
  const { doc, selection } = newState;
  const link = schema.marks.link!;
  const tr = newState.tr;
  let previous: Set<string> | null = null;

  const lo = Math.max(0, Math.min(...changed.map((c) => c.from)));
  const hi = Math.min(doc.content.size, Math.max(...changed.map((c) => c.to)));

  doc.nodesBetween(lo, hi, (node, pos) => {
    if (!node.isTextblock) return true;
    if (!node.type.allowsMarkType(link)) return false;

    const blockRange = { from: pos, to: pos + node.nodeSize };
    if (!touches(blockRange, changed)) return false;

    // Edited address links follow their text.
    for (const span of linkSpans(node, pos)) {
      if (!touches(span, changed)) continue;
      const href = exactLink(span.text);
      if (!href || href === span.href) continue;
      previous ??= addressHrefs(oldState.doc);
      if (!previous.has(span.href)) continue;
      tr.removeMark(span.from, span.to, link);
      tr.addMark(span.from, span.to, link.create({ href }));
    }

    // Offsets in this string equal offsets into the block's content, because
    // every inline atom is one position and one LEAF character.
    const text = node.textBetween(0, node.content.size, undefined, LEAF);
    for (const found of findLinks(text)) {
      const range = {
        from: pos + 1 + found.start,
        to: pos + 1 + found.end,
      };
      if (!touches(range, changed)) continue;
      if (doc.rangeHasMark(range.from, range.to, link)) continue;
      if (!finished && selection.empty && selection.head === range.to) {
        continue;
      }
      // Belt and braces: `findLinks` already filtered through `safeHref`.
      const href = safeHref(found.href);
      if (href) tr.addMark(range.from, range.to, link.create({ href }));
    }

    return false;
  });

  return tr.docChanged ? tr : null;
}
