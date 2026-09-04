import type { EditorView } from "prosemirror-view";
import { formatReference } from "../shared/references.ts";
import {
  dismissCandidate,
  insertScripture,
  type Candidate,
} from "./detect.ts";
import type { ScriptureStyle } from "./schema.ts";

/**
 * The suggestion popup shown under a detected reference.
 *
 * Modelled on a spell-checker suggestion: it offers, it never acts on its own,
 * and ignoring it costs nothing. Block is listed first because it is the
 * default and the common case for a passage being preached from.
 */

const CHOICES: Array<{
  style: ScriptureStyle;
  label: string;
  hint: string;
}> = [
  { style: "block", label: "Quote it", hint: "The passage as its own paragraph" },
  { style: "popover", label: "On hover", hint: "Show the verse on hover or tap" },
  { style: "inline", label: "In the sentence", hint: "Weave the words into your text" },
];

export class ScripturePrompt {
  private el: HTMLDivElement;
  private candidate: Candidate | null = null;
  private view: EditorView | null = null;

  constructor(private readonly container: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "prompt";
    this.el.hidden = true;
    // The popup is chrome, not content: keep it out of translation and out of
    // the copied document.
    this.el.setAttribute("translate", "no");
    this.container.append(this.el);

    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("mousedown", this.onClickAway, true);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !this.el.hidden) {
      event.preventDefault();
      this.dismiss();
    }
  };

  private onClickAway = (event: MouseEvent): void => {
    if (this.el.hidden) return;
    if (!this.el.contains(event.target as Node)) this.hide();
  };

  /** Dismiss permanently: the author does not want this one cited. */
  private dismiss(): void {
    if (this.view && this.candidate) {
      dismissCandidate(this.view, this.candidate);
    }
    this.hide();
  }

  hide(): void {
    this.el.hidden = true;
    this.candidate = null;
  }

  show(view: EditorView, candidate: Candidate): void {
    this.view = view;
    this.candidate = candidate;

    const label = formatReference(candidate.reference);
    this.el.innerHTML = "";

    const title = document.createElement("div");
    title.className = "prompt__title";
    title.textContent = label;
    this.el.append(title);

    const list = document.createElement("div");
    list.className = "prompt__choices";

    for (const choice of CHOICES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prompt__choice";
      button.innerHTML = `<span class="prompt__choice-label"></span>
        <span class="prompt__choice-hint"></span>`;
      button.querySelector(".prompt__choice-label")!.textContent = choice.label;
      button.querySelector(".prompt__choice-hint")!.textContent = choice.hint;

      button.addEventListener("click", () => {
        insertScripture(view, candidate, choice.style);
        this.hide();
        view.focus();
      });

      list.append(button);
    }

    this.el.append(list);

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "prompt__skip";
    skip.textContent = "Leave as text";
    skip.addEventListener("click", () => {
      this.dismiss();
      view.focus();
    });
    this.el.append(skip);

    this.position(view, candidate);
    this.el.hidden = false;
  }

  private position(view: EditorView, candidate: Candidate): void {
    const start = view.coordsAtPos(candidate.from);
    const bounds = this.container.getBoundingClientRect();

    this.el.style.visibility = "hidden";
    this.el.hidden = false;
    const height = this.el.offsetHeight;
    this.el.hidden = true;
    this.el.style.visibility = "";

    // Prefer below the reference; flip above when it would run off-screen.
    const below = start.bottom - bounds.top + 6;
    const wouldOverflow = start.bottom + height + 12 > window.innerHeight;

    this.el.style.top = wouldOverflow
      ? `${start.top - bounds.top - height - 6}px`
      : `${below}px`;
    this.el.style.insetInlineStart = `${start.left - bounds.left}px`;
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("mousedown", this.onClickAway, true);
    this.el.remove();
  }
}
