import { inlineCitationText } from "./reader.ts";

/**
 * Copying from the reader.
 *
 * The browser's own copy is lossy here, in ways that hit exactly the parts of
 * a sermon note that matter:
 *
 * - **List numbers vanish.** An `<ol>` numbers its items with CSS markers,
 *   which are not text, so a numbered list pasted into WhatsApp arrives as
 *   bare lines.
 * - **Popover passages vanish.** Their text is `visibility: hidden` until
 *   hovered, and hidden text is left out of what is copied — so the reference
 *   survives and the scripture it points to does not.
 * - **Verse numbers run into the verse**, "16For God so loved", because the
 *   gap is a CSS margin rather than a space.
 *
 * So the reader writes the clipboard itself. The selection is cloned (the DOM
 * range includes hidden text even though the browser's serialiser skips it),
 * normalised into plain structure, and offered as both plain text — what a
 * messaging app takes — and HTML, for pasting into a document.
 */

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "DIV",
  "HR",
]);

/** Passage text with verse numbers dropped and lines run together. */
function flattenPassage(body: Element): string {
  const clone = body.cloneNode(true) as Element;
  for (const number of clone.querySelectorAll(".verse__number")) {
    number.remove();
  }
  const verses = Array.from(clone.querySelectorAll(".verse"));
  const text = verses.length
    ? verses.map((verse) => verse.textContent ?? "").join(" ")
    : (clone.textContent ?? "");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Rewrite citations in a cloned selection into structure that survives
 * without our stylesheet, which is absent wherever the text is pasted.
 */
export function normaliseCitations(root: DocumentFragment | Element): void {
  const doc = root.ownerDocument ?? document;

  // A popover becomes an inline citation: the passage is what the reader
  // wants to share, and there is no hover in a chat message.
  for (const popover of root.querySelectorAll(".scripture--popover")) {
    const ref = popover.querySelector(".scripture__ref")?.textContent ?? "";
    const body = popover.querySelector(".scripture__text");
    const passage =
      body && !body.classList.contains("scripture__text--error")
        ? flattenPassage(body)
        : "";
    const span = doc.createElement("span");
    span.textContent =
      passage && passage !== "…" ? inlineCitationText(ref, passage) : ref;
    popover.replaceWith(span);
  }

  // Verse numbers keep their superscript in HTML but need a real space after
  // them, or plain text reads "16For God".
  for (const number of root.querySelectorAll(".verse__number")) {
    number.after(doc.createTextNode(" "));
  }

  // A block passage becomes a quotation with the reference leading and one
  // line per verse — its layout otherwise lives entirely in CSS.
  for (const block of root.querySelectorAll(".scripture--block")) {
    const quote = doc.createElement("blockquote");
    const ref = block.querySelector(".scripture__ref");
    if (ref?.textContent) {
      const strong = doc.createElement("strong");
      strong.textContent = ref.textContent;
      quote.append(strong);
    }
    const body = block.querySelector(".scripture__text");
    const lines = body
      ? Array.from(body.querySelectorAll(".verse")).map((verse) =>
          Array.from(verse.childNodes),
        )
      : [];
    // A passage that has not loaded, or failed, is a single run of text.
    if (!lines.length && body) lines.push(Array.from(body.childNodes));

    for (const line of lines) {
      if (quote.childNodes.length) quote.append(doc.createElement("br"));
      quote.append(...line);
    }
    block.replaceWith(quote);
  }
}

/** Where a list item sits: its own `value`, else its position. */
function listMarker(item: Element): string {
  const list = item.parentElement;
  if (list?.tagName !== "OL") return "•";
  const value = Number(item.getAttribute("value"));
  if (value) return `${value}.`;
  const start = Number(list.getAttribute("start")) || 1;
  const index = Array.from(list.children).indexOf(item);
  return `${start + index}.`;
}

/**
 * Plain text for a normalised fragment.
 *
 * Output is a stream of text and break requests; runs of breaks collapse to
 * the strongest one, so nested blocks do not stack up blank lines.
 */
export function toPlainText(root: DocumentFragment | Element): string {
  let out = "";
  /** 0 = none, 1 = new line, 2 = blank line. Pending until text follows. */
  let pendingBreak = 0;
  /** Just wrote a list marker: its item's paragraph must stay on its line. */
  let afterMarker = false;

  const requestBreak = (strength: number) => {
    if (afterMarker) return;
    pendingBreak = Math.max(pendingBreak, strength);
  };

  const write = (text: string) => {
    if (!text) return;
    // Whitespace between blocks must not consume, or add to, a line break.
    if (!text.trim() && (pendingBreak || !out || out.endsWith("\n"))) return;
    if (out && pendingBreak) {
      out = out.replace(/[ \t]+$/, "");
      out += pendingBreak === 2 ? "\n\n" : "\n";
    }
    pendingBreak = 0;
    afterMarker = false;
    // Leading spaces at the start of a line are layout, not content.
    out += /\n$|^$/.test(out) ? text.replace(/^[ \t]+/, "") : text;
  };

  const walk = (node: Node, listDepth: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      write((node.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (!(node instanceof Element)) {
      for (const child of node.childNodes) walk(child, listDepth);
      return;
    }

    const tag = node.tagName;
    if (tag === "BR") {
      requestBreak(1);
      return;
    }

    const block = BLOCK_TAGS.has(tag);
    // Inside a list, blocks are lines, not paragraphs.
    const strength = listDepth > 0 || tag === "LI" ? 1 : 2;
    if (block) requestBreak(strength);

    if (tag === "LI") {
      write(`${"  ".repeat(Math.max(listDepth - 1, 0))}${listMarker(node)} `);
      afterMarker = true;
    }

    const depth = tag === "UL" || tag === "OL" ? listDepth + 1 : listDepth;
    for (const child of node.childNodes) walk(child, depth);

    // A link's address is lost in plain text unless it is written out.
    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      const text = node.textContent?.trim() ?? "";
      if (/^https?:/i.test(href) && text && !href.includes(text)) {
        write(` (${href})`);
      }
    }

    if (block) requestBreak(strength);
  };

  walk(root, 0);
  return out.trim();
}

/**
 * Widen a range so it never cuts through a popover citation.
 *
 * Its passage is hidden, so a selection cannot end partway into it on
 * purpose; including the whole citation is the only sensible reading. A
 * selection made entirely inside an open popover is left alone.
 */
function widenAroundPopovers(range: Range): Range {
  const wide = range.cloneRange();
  const popoverOf = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest(
      ".scripture--popover",
    ) ?? null;

  const start = popoverOf(range.startContainer);
  const end = popoverOf(range.endContainer);
  if (start && start === end) return wide;
  if (start) wide.setStartBefore(start);
  if (end) wide.setEndAfter(end);
  return wide;
}

/** Keep only the part of `range` that lies inside `root`, or null. */
function clampTo(range: Range, root: HTMLElement): Range | null {
  if (!range.intersectsNode(root)) return null;
  const clamped = range.cloneRange();
  if (!root.contains(range.startContainer)) clamped.setStart(root, 0);
  if (!root.contains(range.endContainer)) {
    clamped.setEnd(root, root.childNodes.length);
  }
  return clamped;
}

/**
 * Take over copying from `root`. Selections that do not touch it are left to
 * the browser. Returns a teardown function.
 */
export function attachCopyBehaviour(root: HTMLElement): () => void {
  const onCopy = (event: ClipboardEvent) => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !event.clipboardData) return;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = clampTo(selection.getRangeAt(i), root);
      if (range) fragment.append(widenAroundPopovers(range).cloneContents());
    }
    if (!fragment.childNodes.length) return;

    normaliseCitations(fragment);
    const text = toPlainText(fragment);
    if (!text) return;

    const holder = document.createElement("div");
    holder.append(fragment);

    event.clipboardData.setData("text/plain", text);
    event.clipboardData.setData("text/html", holder.innerHTML);
    event.preventDefault();
  };

  document.addEventListener("copy", onCopy);
  return () => document.removeEventListener("copy", onCopy);
}
