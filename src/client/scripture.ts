import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  formatReference,
  toQueryRef,
  type ScriptureReference,
} from "../shared/references.ts";
import { renderPassageLines } from "./reader.ts";
import { changeScriptureStyle } from "./detect.ts";
import type { ScriptureStyle } from "./schema.ts";
import { registerCitedVersion } from "./colophon.ts";

function attrsToReference(attrs: PMNode["attrs"]): ScriptureReference {
  return {
    book: String(attrs.book),
    chapter: Number(attrs.chapter),
    verseStart: attrs.verseStart === null ? null : Number(attrs.verseStart),
    // Falls back to `chapter` for citations stored before ranges could span.
    endChapter:
      attrs.endChapter == null ? Number(attrs.chapter) : Number(attrs.endChapter),
    verseEnd: attrs.verseEnd === null ? null : Number(attrs.verseEnd),
  };
}

interface PassageResponse {
  reference: string;
  content: string;
  lines: Array<{
    number: number | null;
    spans: Array<{ text: string; smallCaps?: boolean }>;
    indent: number;
  }>;
  copyright: string | null;
  versionTitle: string;
  versionAbbreviation: string;
}

/**
 * Renders a scripture citation in one of three styles.
 *
 * The node stores only the reference, so the text is fetched per view and can
 * be re-fetched when the reader changes translation.
 *
 * Copyright is NOT rendered here. Attribution is collected per page and shown
 * once in the colophon — repeating a licence string under every citation makes
 * sermon notes unreadable.
 */
export class ScriptureView implements NodeView {
  dom: HTMLElement;
  private controller = new AbortController();

  constructor(
    node: PMNode,
    private readonly getVersionId: () => number,
    private readonly onRestyle?: (style: ScriptureStyle | "text") => void,
  ) {
    const style = (node.attrs.style ?? "block") as ScriptureStyle;
    const inline = style !== "block";

    this.dom = document.createElement(inline ? "span" : "div");
    this.dom.className = `scripture scripture--${style}`;
    // Atom node: ProseMirror owns selection, the browser must not edit inside.
    this.dom.contentEditable = "false";

    if (this.onRestyle) this.addStyleControl(style);

    void this.render(attrsToReference(node.attrs), style);
  }

  /**
   * A citation's style must be changeable after the fact — the first choice is
   * a suggestion, not a commitment.
   */
  private addStyleControl(current: ScriptureStyle): void {
    const options: Array<{ value: ScriptureStyle | "text"; label: string }> = [
      { value: "block", label: "Quoted paragraph" },
      { value: "popover", label: "Show on hover" },
      { value: "inline", label: "In the sentence" },
      { value: "text", label: "Plain text" },
    ];

    const control = document.createElement("select");
    control.className = "scripture__style";
    control.setAttribute("aria-label", "Citation style");
    control.setAttribute("translate", "no");

    for (const option of options) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      el.selected = option.value === current;
      control.append(el);
    }

    control.addEventListener("change", () => {
      this.onRestyle?.(control.value as ScriptureStyle | "text");
    });
    // Keep clicks on the control from moving the editor selection.
    control.addEventListener("mousedown", (event) => event.stopPropagation());

    this.dom.append(control);
  }

  private async render(
    reference: ScriptureReference,
    style: ScriptureStyle,
  ): Promise<void> {
    const label = formatReference(reference);

    // Only the content is replaced; the style control (if any) stays put.
    this.dom.querySelector(".scripture__body")?.remove();

    const content = document.createElement("span");
    content.className = "scripture__body";

    // Reference labels are proper nouns; never machine-translate them.
    const ref = document.createElement("span");
    ref.className = "scripture__ref";
    ref.setAttribute("translate", "no");
    ref.textContent = label;

    const body = document.createElement("span");
    body.className = "scripture__text";
    body.textContent = "…";

    if (style === "inline") {
      content.append(body);
    } else {
      content.append(ref, body);
      // Reference visible, verse revealed on hover/tap — and always present in
      // the DOM so it survives printing and translation.
      if (style === "popover") this.dom.tabIndex = 0;
    }

    this.dom.prepend(content);

    try {
      const params = new URLSearchParams({
        ref: toQueryRef(reference),
        version: String(this.getVersionId()),
      });
      const res = await fetch(`/api/passage?${params}`, {
        signal: this.controller.signal,
      });

      if (!res.ok) {
        body.textContent = "Could not load this passage.";
        body.classList.add("scripture__text--error");
        return;
      }

      const passage = (await res.json()) as PassageResponse;

      if (style === "inline") {
        // Quoted so it reads as part of the sentence, with the reference
        // trailing in parentheses.
        body.textContent = `“${passage.content}” (${passage.reference})`;
      } else {
        // Verse numbers, poetry indentation, and small-caps preserved.
        renderPassageLines(body, passage.lines ?? [], false);
        ref.textContent = passage.reference;
      }

      // Feeds the page-level attribution block.
      registerCitedVersion({
        versionId: this.getVersionId(),
        title: passage.versionTitle,
        abbreviation: passage.versionAbbreviation,
        copyright: passage.copyright,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      body.textContent = "Could not load this passage.";
      body.classList.add("scripture__text--error");
    }
  }

  stopEvent(): boolean {
    return false;
  }

  ignoreMutation(): boolean {
    // The DOM is rebuilt asynchronously; ProseMirror must not try to read it.
    return true;
  }

  destroy(): void {
    this.controller.abort();
  }
}

/**
 * @param editable When true, each citation gets a control for changing its
 *   style or reverting it to plain text.
 */
export function createScriptureViewFactory(
  getVersionId: () => number,
  editable = false,
) {
  return (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
    new ScriptureView(
      node,
      getVersionId,
      editable
        ? (style) => {
            const pos = getPos();
            if (pos !== undefined) changeScriptureStyle(view, pos, style);
          }
        : undefined,
    );
}
