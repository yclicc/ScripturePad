import { toggleMark, setBlockType } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import type { EditorView } from "prosemirror-view";
import { schema } from "./schema.ts";
import { parseReference } from "../shared/references.ts";
import { insertScripture } from "./detect.ts";
import type { SaveState } from "./save.ts";

/**
 * A deliberately short toolbar: only what the schema can actually express.
 *
 * Every action here is also a keyboard shortcut. The buttons exist because a
 * pastor should not have to know shortcuts to use the editor.
 */

interface ToolbarOptions {
  getVersionId: () => number;
  setVersionId: (id: number) => void;
  language: string;
  onSave?: () => void;
}

export interface Toolbar {
  /** Reflect save progress in the button and status text. */
  setSaveState: (state: SaveState, message?: string) => void;
}

function button(
  label: string,
  title: string,
  onClick: () => void,
  className = "",
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `toolbar__button ${className}`.trim();
  el.title = title;
  el.setAttribute("aria-label", title);
  el.textContent = label;
  el.addEventListener("mousedown", (event) => {
    // Keep the selection: focus must not leave the document.
    event.preventDefault();
  });
  el.addEventListener("click", onClick);
  return el;
}

/**
 * Cite the selected text as scripture.
 *
 * The counterpart to automatic detection, for authors who would rather act
 * explicitly than wait to be offered.
 */
function citeSelection(view: EditorView): void {
  const { from, to } = view.state.selection;
  if (from === to) {
    window.alert("Select a Bible reference first, for example “John 3:16”.");
    return;
  }

  const text = view.state.doc.textBetween(from, to, " ");
  const reference = parseReference(text);

  if (!reference) {
    window.alert(`“${text}” does not look like a Bible reference.`);
    return;
  }

  insertScripture(view, { reference, from, to, text }, "block");
}

export function createToolbar(
  container: HTMLElement,
  view: EditorView,
  options: ToolbarOptions,
): Toolbar {
  const group = document.createElement("div");
  group.className = "toolbar__group";

  group.append(
    button("B", "Bold (Ctrl+B)", () => {
      toggleMark(schema.marks.strong!)(view.state, view.dispatch);
      view.focus();
    }, "toolbar__button--bold"),

    button("I", "Italic (Ctrl+I)", () => {
      toggleMark(schema.marks.em!)(view.state, view.dispatch);
      view.focus();
    }, "toolbar__button--italic"),

    button("H", "Heading (Ctrl+Shift+2)", () => {
      setBlockType(schema.nodes.heading!, { level: 2 })(
        view.state,
        view.dispatch,
      );
      view.focus();
    }),

    button("•", "Bullet list", () => {
      wrapInList(schema.nodes.bullet_list!)(view.state, view.dispatch);
      view.focus();
    }),

    button("❝", "Quote", () => {
      setBlockType(schema.nodes.paragraph!)(view.state, view.dispatch);
      view.focus();
    }),
  );

  const scriptureGroup = document.createElement("div");
  scriptureGroup.className = "toolbar__group";
  scriptureGroup.append(
    button("Scripture", "Insert the selected reference as scripture", () => {
      citeSelection(view);
    }, "toolbar__button--wide"),

    button(
      "Aa",
      "Mark as do-not-translate (Ctrl+Shift+T)",
      () => {
        toggleMark(schema.marks.no_translate!)(view.state, view.dispatch);
        view.focus();
      },
    ),
  );

  container.append(group, scriptureGroup);

  // Save ------------------------------------------------------------------

  const saveGroup = document.createElement("div");
  saveGroup.className = "toolbar__group";

  const status = document.createElement("span");
  status.className = "toolbar__status";
  status.setAttribute("role", "status");

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "toolbar__button toolbar__button--primary";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", () => options.onSave?.());

  saveGroup.append(status, saveButton);
  container.append(saveGroup);

  return {
    setSaveState(state, message) {
      switch (state) {
        case "clean":
          status.textContent = "";
          saveButton.disabled = true;
          break;
        case "dirty":
          status.textContent = "Unsaved changes";
          status.className = "toolbar__status";
          saveButton.disabled = false;
          break;
        case "saving":
          status.textContent = "Saving…";
          status.className = "toolbar__status";
          saveButton.disabled = true;
          break;
        case "saved":
          status.textContent = "Saved";
          status.className = "toolbar__status toolbar__status--ok";
          saveButton.disabled = true;
          break;
        case "error":
          status.textContent = message ?? "Could not save";
          status.className = "toolbar__status toolbar__status--error";
          saveButton.disabled = false;
          break;
      }
    },
  };
}
