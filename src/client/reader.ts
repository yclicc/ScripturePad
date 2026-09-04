import { toUsfm, type ScriptureReference } from "../shared/references.ts";
import { registerCitedVersion } from "./colophon.ts";

/**
 * Read-only rendering of a document, as plain DOM.
 *
 * Deliberately NOT a ProseMirror view. Machine translation skips
 * `contenteditable` regions — browsers refuse to rewrite text inside a live
 * editor — so a reader page built on ProseMirror is silently untranslatable,
 * which defeats the point of the product. Readers also avoid downloading the
 * editor bundle entirely.
 */

interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function renderText(node: PMNode): Node {
  let out: Node = document.createTextNode(node.text ?? "");

  // Marks wrap outward, so the innermost is applied first.
  for (const mark of node.marks ?? []) {
    let wrapper: HTMLElement;
    switch (mark.type) {
      case "strong":
        wrapper = document.createElement("strong");
        break;
      case "em":
        wrapper = document.createElement("em");
        break;
      case "link": {
        const anchor = document.createElement("a");
        anchor.href = String(mark.attrs?.href ?? "#");
        anchor.rel = "noopener noreferrer";
        wrapper = anchor;
        break;
      }
      case "no_translate":
        wrapper = document.createElement("span");
        wrapper.setAttribute("translate", "no");
        wrapper.className = "no-translate";
        break;
      default:
        continue;
    }
    wrapper.append(out);
    out = wrapper;
  }

  return out;
}

function referenceFrom(attrs: Record<string, unknown>): ScriptureReference {
  return {
    book: String(attrs.book),
    chapter: Number(attrs.chapter),
    verseStart: attrs.verseStart == null ? null : Number(attrs.verseStart),
    // Falls back to `chapter` for citations stored before ranges could span.
    endChapter:
      attrs.endChapter == null ? Number(attrs.chapter) : Number(attrs.endChapter),
    verseEnd: attrs.verseEnd == null ? null : Number(attrs.verseEnd),
  };
}

interface PassageSpan {
  text: string;
  smallCaps?: boolean;
}

interface PassageLine {
  number: number | null;
  spans: PassageSpan[];
  indent: number;
}

interface PassageResponse {
  reference: string;
  content: string;
  lines: PassageLine[];
  copyright: string | null;
  versionTitle: string;
  versionAbbreviation: string;
}

/**
 * Render passage lines, preserving verse numbers, poetry indentation, and the
 * small-caps divine name.
 */
export function renderPassageLines(
  target: HTMLElement,
  lines: PassageLine[],
  inline: boolean,
): void {
  target.innerHTML = "";

  if (inline) {
    // Inline citations flow inside a sentence, so structure is flattened.
    target.textContent = lines
      .map((line) => line.spans.map((span) => span.text).join(""))
      .join(" ");
    return;
  }

  for (const line of lines) {
    const el = document.createElement("span");
    el.className = "verse";
    if (line.indent > 0) el.classList.add(`verse--indent-${line.indent}`);

    if (line.number !== null) {
      const number = document.createElement("sup");
      number.className = "verse__number";
      // Verse numbers are notation, not prose: never translate them.
      number.setAttribute("translate", "no");
      number.textContent = String(line.number);
      el.append(number);
    }

    for (const span of line.spans) {
      if (span.smallCaps) {
        const caps = document.createElement("span");
        caps.className = "small-caps";
        caps.textContent = span.text;
        el.append(caps);
      } else {
        el.append(document.createTextNode(span.text));
      }
    }

    target.append(el);
  }
}

async function fillScripture(
  el: HTMLElement,
  reference: ScriptureReference,
  style: string,
  versionId: number,
): Promise<void> {
  const body = el.querySelector<HTMLElement>(".scripture__text");
  const ref = el.querySelector<HTMLElement>(".scripture__ref");
  if (!body) return;

  try {
    const params = new URLSearchParams({
      ref: toUsfm(reference),
      version: String(versionId),
    });
    const res = await fetch(`/api/passage?${params}`);
    if (!res.ok) {
      body.textContent = "Could not load this passage.";
      body.classList.add("scripture__text--error");
      return;
    }

    const passage = (await res.json()) as PassageResponse;

    if (style === "inline") {
      body.textContent = `“${passage.content}” (${passage.reference})`;
    } else {
      renderPassageLines(body, passage.lines ?? [], false);
      if (ref) ref.textContent = passage.reference;
    }

    registerCitedVersion({
      versionId,
      title: passage.versionTitle,
      abbreviation: passage.versionAbbreviation,
      copyright: passage.copyright,
    });
  } catch {
    body.textContent = "Could not load this passage.";
    body.classList.add("scripture__text--error");
  }
}

function renderNode(
  node: PMNode,
  pending: Array<() => Promise<void>>,
  versionId: number,
): Node | null {
  switch (node.type) {
    case "paragraph": {
      const p = document.createElement("p");
      appendChildren(p, node.content, pending, versionId);
      return p;
    }

    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 3);
      const h = document.createElement(`h${level}`);
      appendChildren(h, node.content, pending, versionId);
      return h;
    }

    case "blockquote": {
      const quote = document.createElement("blockquote");
      appendChildren(quote, node.content, pending, versionId);
      return quote;
    }

    case "bullet_list":
    case "ordered_list": {
      const list = document.createElement(
        node.type === "bullet_list" ? "ul" : "ol",
      );
      appendChildren(list, node.content, pending, versionId);
      return list;
    }

    case "list_item": {
      const item = document.createElement("li");
      appendChildren(item, node.content, pending, versionId);
      return item;
    }

    case "horizontal_rule":
      return document.createElement("hr");

    case "text":
      return renderText(node);

    case "scripture":
    case "scripture_inline": {
      const attrs = node.attrs ?? {};
      const style = String(attrs.style ?? "block");
      const inline = node.type === "scripture_inline";

      const el = document.createElement(inline ? "span" : "div");
      el.className = `scripture scripture--${style}`;

      if (style !== "inline") {
        const ref = document.createElement("span");
        ref.className = "scripture__ref";
        ref.setAttribute("translate", "no");
        ref.textContent = String(attrs.label ?? "");
        el.append(ref);
      }

      const body = document.createElement("span");
      body.className = "scripture__text";
      body.textContent = "…";
      el.append(body);

      if (style === "popover") el.tabIndex = 0;

      const reference = referenceFrom(attrs);
      pending.push(() => fillScripture(el, reference, style, versionId));
      return el;
    }

    default:
      return null;
  }
}

function appendChildren(
  parent: HTMLElement,
  children: PMNode[] | undefined,
  pending: Array<() => Promise<void>>,
  versionId: number,
): void {
  for (const child of children ?? []) {
    const rendered = renderNode(child, pending, versionId);
    if (rendered) parent.append(rendered);
  }
}

/**
 * Render a document into `container`. Passage text is fetched after the
 * structure is in the DOM, so the page has content immediately.
 *
 * Returns a function that re-fetches every passage in a different version —
 * used when the reader (or a machine translator) changes the page language.
 */
export function renderDocument(
  container: HTMLElement,
  doc: PMNode,
  versionId: number,
): (nextVersionId: number) => void {
  const render = (version: number) => {
    container.innerHTML = "";
    const pending: Array<() => Promise<void>> = [];
    appendChildren(container, doc.content, pending, version);
    for (const load of pending) void load();
  };

  render(versionId);
  return render;
}
