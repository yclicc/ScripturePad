/**
 * The Sync settings panel: passage, translations, and how the screen looks.
 *
 * A side sheet over the stage rather than a separate page, so whoever is
 * setting up can see each change land on the projected text as they make it.
 */

import { MAX_SYNC_VERSIONS } from "../../shared/sync-path.ts";
import { baseLanguage, fetchVersionsForLanguage } from "../language.ts";
import { LANGUAGE_CHOICES, localName, selfName } from "./languages.ts";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  MARGIN_MAX,
  type Margins,
  type SyncSettings,
  type Theme,
} from "./settings.ts";

/** A chosen translation, as far as the page knows it so far. */
export interface PanelVersion {
  id: number;
  abbreviation: string | null;
  title: string | null;
  language: string | null;
  error: string | null;
}

export interface PanelOptions {
  settings: SyncSettings;
  /** The passage as currently shown, to prefill the passage field. */
  passage: string;
  /** Display settings changed; versions are reported separately. */
  onSettings: (next: SyncSettings) => void;
  onVersions: (ids: number[]) => void;
  /** Returns why the text cannot be shown, or null when it can. */
  onPassage: (text: string) => string | null;
  onForget: () => void;
  onClose: () => void;
}

export interface Panel {
  element: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** Re-render the translation list, e.g. once passages have loaded. */
  setVersions: (versions: PanelVersion[]) => void;
  /** Reflect settings changed from outside, e.g. after forgetting them. */
  setSettings: (settings: SyncSettings) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}

/** Languages to list first: the viewer's own, then the fixed choices. */
function languageOrder(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const tag of [...navigator.languages, ...LANGUAGE_CHOICES]) {
    const base = baseLanguage(tag);
    if (seen.has(base.toLowerCase())) continue;
    seen.add(base.toLowerCase());
    ordered.push(base);
  }
  return ordered;
}

function languageLabel(tag: string): string {
  const own = selfName(tag);
  const local = localName(tag);
  return local ? `${own} — ${local}` : own;
}

export function createPanel(options: PanelOptions): Panel {
  let settings = options.settings;
  let versions: PanelVersion[] = [];

  const panel = el("aside", {
    className: "sync-panel",
    id: "sync-panel",
  });
  panel.setAttribute("aria-label", "Sync settings");
  // Closed panels must not be tabbable; `inert` handles that and clicks.
  panel.inert = true;

  const close = el("button", {
    type: "button",
    className: "sync-panel__close",
    textContent: "Close",
  });
  close.addEventListener("click", () => options.onClose());

  const header = el(
    "header",
    { className: "sync-panel__header" },
    el("h2", { textContent: "ScripturePad Sync" }),
    close,
  );

  const intro = el("p", {
    className: "sync-panel__hint",
    textContent:
      "Shows a passage in several translations side by side, verse by " +
      "verse, for projecting. Press → or a clicker's Next button to " +
      "highlight each verse as it is read; the next screen follows on.",
  });

  // Passage --------------------------------------------------------------

  const passageInput = el("input", {
    type: "text",
    value: options.passage,
    placeholder: "e.g. John 3:16-21, Romans 8:28-39",
    className: "sync-panel__input",
  });
  passageInput.setAttribute("aria-label", "Bible passage");
  const passageError = el("p", {
    className: "sync-panel__error",
    hidden: true,
    textContent: "That does not look like a Bible reference.",
  });
  const passageForm = el(
    "form",
    { className: "sync-panel__row" },
    passageInput,
    el("button", {
      type: "submit",
      className: "sync-button sync-button--primary",
      textContent: "Show",
    }),
  );
  passageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = options.onPassage(passageInput.value);
    passageError.hidden = error === null;
    if (error !== null) passageError.textContent = error;
  });

  // Translations ----------------------------------------------------------

  const list = el("ol", { className: "sync-picker__list" });

  const move = (index: number, by: number) => {
    const ids = versions.map((version) => version.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(index + by, 0, moved);
    options.onVersions(ids);
  };

  const renderList = () => {
    list.replaceChildren();
    versions.forEach((version, index) => {
      const name = el("span", {
        className: "sync-picker__name",
        textContent: version.abbreviation ?? `#${version.id}`,
      });
      name.setAttribute("translate", "no");

      const detail = el("span", { className: "sync-picker__detail" });
      if (version.error) {
        detail.classList.add("sync-picker__detail--error");
        detail.textContent = version.error;
      } else {
        const title = el("span", { textContent: version.title ?? "Loading…" });
        title.setAttribute("translate", "no");
        detail.append(title);
        if (version.language) {
          detail.append(` · ${selfName(baseLanguage(version.language))}`);
        }
      }

      const button = (label: string, text: string, onClick: () => void) => {
        const b = el("button", {
          type: "button",
          className: "sync-button sync-button--icon",
          textContent: text,
          title: label,
        });
        b.setAttribute("aria-label", label);
        b.addEventListener("click", onClick);
        return b;
      };

      const up = button("Move left", "↑", () => move(index, -1));
      up.disabled = index === 0;
      const down = button("Move right", "↓", () => move(index, 1));
      down.disabled = index === versions.length - 1;
      const remove = button("Remove", "✕", () =>
        options.onVersions(
          versions.filter((v) => v.id !== version.id).map((v) => v.id),
        ),
      );
      // The page needs at least one column to show anything.
      remove.disabled = versions.length === 1;

      list.append(
        el(
          "li",
          { className: "sync-picker__item" },
          el(
            "span",
            { className: "sync-picker__text" },
            name,
            index === 0
              ? el("span", {
                  className: "sync-picker__badge",
                  textContent: "Primary",
                })
              : "",
            detail,
          ),
          el("span", { className: "sync-picker__actions" }, up, down, remove),
        ),
      );
    });

    const full = versions.length >= MAX_SYNC_VERSIONS;
    addButton.disabled = full || !versionSelect.value;
    addHint.textContent = full
      ? `Up to ${MAX_SYNC_VERSIONS} translations fit side by side.`
      : "";
  };

  const languageSelect = el("select", { className: "sync-panel__input" });
  languageSelect.setAttribute("aria-label", "Language");
  languageSelect.append(
    el("option", { value: "", textContent: "Choose a language…" }),
  );
  for (const tag of languageOrder()) {
    const option = el("option", {
      value: tag,
      textContent: languageLabel(tag),
    });
    // Language names are their own proper nouns, already in their own script.
    option.setAttribute("translate", "no");
    languageSelect.append(option);
  }
  languageSelect.append(
    el("option", { value: "other", textContent: "Another language (code)…" }),
  );

  const codeInput = el("input", {
    type: "text",
    className: "sync-panel__input",
    placeholder: "Language code, e.g. tl or ckb",
    hidden: true,
  });
  codeInput.setAttribute("aria-label", "Language code");

  const versionSelect = el("select", {
    className: "sync-panel__input",
    disabled: true,
  });
  versionSelect.setAttribute("aria-label", "Translation");
  versionSelect.setAttribute("translate", "no");

  const addButton = el("button", {
    type: "button",
    className: "sync-button sync-button--primary",
    textContent: "Add",
    disabled: true,
  });
  const addHint = el("p", { className: "sync-panel__hint" });
  const retry = el("button", {
    type: "button",
    className: "sync-button",
    textContent: "Try again",
    hidden: true,
  });

  /** Guards against a slow list landing after a newer choice. */
  let request = 0;

  const loadVersions = async (language: string) => {
    const ticket = ++request;
    versionSelect.replaceChildren(
      el("option", { value: "", textContent: "Loading…" }),
    );
    versionSelect.disabled = true;
    addButton.disabled = true;
    retry.hidden = true;
    if (!language) {
      versionSelect.replaceChildren();
      return;
    }

    let found;
    try {
      found = await fetchVersionsForLanguage(language);
    } catch {
      if (ticket !== request) return;
      // Not "no translations": that would be a false statement about the
      // language, and is how a rate-limited request for English once read.
      versionSelect.replaceChildren(
        el("option", {
          value: "",
          textContent: "Could not load translations",
        }),
      );
      retry.hidden = false;
      return;
    }
    if (ticket !== request) return;

    versionSelect.replaceChildren();
    if (found.length === 0) {
      versionSelect.append(
        el("option", {
          value: "",
          textContent: "No translations found for this language",
        }),
      );
      return;
    }

    for (const version of found) {
      versionSelect.append(
        el("option", {
          value: String(version.id),
          textContent: version.abbreviation
            ? `${version.abbreviation} — ${version.title}`
            : version.title,
          disabled: versions.some((chosen) => chosen.id === version.id),
        }),
      );
    }
    // Land on the first one not already chosen.
    const firstFree = [...versionSelect.options].find((o) => !o.disabled);
    if (firstFree) firstFree.selected = true;
    versionSelect.disabled = false;
    addButton.disabled = !firstFree || versions.length >= MAX_SYNC_VERSIONS;
  };

  const chosenLanguage = () =>
    languageSelect.value === "other"
      ? codeInput.value.trim()
      : languageSelect.value;
  retry.addEventListener("click", () => void loadVersions(chosenLanguage()));

  languageSelect.addEventListener("change", () => {
    const other = languageSelect.value === "other";
    codeInput.hidden = !other;
    if (other) {
      codeInput.focus();
      void loadVersions(codeInput.value.trim());
    } else {
      void loadVersions(languageSelect.value);
    }
  });
  codeInput.addEventListener("change", () => {
    void loadVersions(codeInput.value.trim());
  });
  versionSelect.addEventListener("change", () => {
    addButton.disabled =
      !versionSelect.value || versions.length >= MAX_SYNC_VERSIONS;
  });
  addButton.addEventListener("click", () => {
    const id = Number(versionSelect.value);
    if (!Number.isInteger(id) || id <= 0) return;
    if (versions.some((version) => version.id === id)) return;
    options.onVersions([...versions.map((version) => version.id), id]);
  });

  // Display ---------------------------------------------------------------

  const update = (patch: Partial<SyncSettings>) => {
    settings = { ...settings, ...patch };
    options.onSettings(settings);
  };

  const fontOutput = el("output", { className: "sync-panel__value" });
  const fontInput = el("input", {
    type: "range",
    min: String(FONT_SIZE_MIN),
    max: String(FONT_SIZE_MAX),
    step: "1",
    className: "sync-panel__range",
  });
  fontInput.setAttribute("aria-label", "Text size");
  fontInput.addEventListener("input", () => {
    fontOutput.textContent = `${fontInput.value}px`;
    update({ fontSize: Number(fontInput.value) });
  });

  const marginInputs = {} as Record<keyof Margins, HTMLInputElement>;
  const marginGrid = el("div", { className: "sync-panel__margins" });
  for (const [side, label] of [
    ["top", "Top"],
    ["bottom", "Bottom"],
    ["left", "Left"],
    ["right", "Right"],
  ] as const) {
    const input = el("input", {
      type: "number",
      min: "0",
      max: String(MARGIN_MAX),
      step: "1",
      className: "sync-panel__input sync-panel__number",
    });
    input.addEventListener("input", () => {
      const value = Math.min(MARGIN_MAX, Math.max(0, Number(input.value) || 0));
      update({ margins: { ...settings.margins, [side]: value } });
    });
    marginInputs[side] = input;
    marginGrid.append(
      el("label", {}, el("span", { textContent: label }), input, "px"),
    );
  }

  const themeInputs = {} as Record<Theme, HTMLInputElement>;
  const themeGroup = el("div", { className: "sync-panel__segmented" });
  themeGroup.setAttribute("role", "radiogroup");
  themeGroup.setAttribute("aria-label", "Theme");
  for (const [value, label] of [
    ["system", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ] as const) {
    const input = el("input", { type: "radio", name: "sync-theme", value });
    input.addEventListener("change", () => {
      if (input.checked) update({ theme: value });
    });
    themeInputs[value] = input;
    themeGroup.append(
      el("label", {}, input, el("span", { textContent: label })),
    );
  }

  const balanceInput = el("input", { type: "checkbox" });
  balanceInput.addEventListener("change", () =>
    update({ balance: balanceInput.checked }),
  );

  // Privacy ---------------------------------------------------------------

  const forget = el("button", {
    type: "button",
    className: "sync-button",
    textContent: "Forget my settings",
  });
  forget.addEventListener("click", () => options.onForget());

  const section = (title: string, ...children: Array<Node | string>) =>
    el(
      "section",
      { className: "sync-panel__section" },
      el("h3", { textContent: title }),
      ...children,
    );

  panel.append(
    header,
    intro,
    section("Passage", passageForm, passageError),
    section(
      "Translations",
      el("p", {
        className: "sync-panel__hint",
        textContent:
          "The first is the one being read aloud. Each column shows the " +
          "same verses, lined up. The translations are part of this " +
          "page's address, so a copied link shows the same columns.",
      }),
      list,
      el(
        "div",
        { className: "sync-picker__add" },
        languageSelect,
        codeInput,
        el(
          "div",
          { className: "sync-panel__row" },
          versionSelect,
          retry,
          addButton,
        ),
      ),
      addHint,
    ),
    section(
      "Text size",
      el("div", { className: "sync-panel__row" }, fontInput, fontOutput),
      el(
        "label",
        { className: "sync-panel__check" },
        balanceInput,
        el("span", {
          textContent:
            "Even out column lengths — slightly enlarge compact languages " +
            "and shrink long ones, so more verses fit on each screen",
        }),
      ),
    ),
    section(
      "Margins",
      el("p", {
        className: "sync-panel__hint",
        textContent:
          "Leave space, in pixels, for anything else shown on the " + "screen.",
      }),
      marginGrid,
    ),
    section("Theme", themeGroup),
    section(
      "Keys",
      el("p", {
        className: "sync-panel__hint",
        textContent:
          "Next verse: → ↓ Space Page Down. Back: ← ↑ Page Up. " +
          "F: full screen. B: blank the screen. S: these settings. " +
          "Home / End: start / end. Click a verse to jump to it.",
      }),
    ),
    section(
      "Your settings are saved on this device",
      el("p", {
        className: "sync-panel__hint",
        textContent:
          "When you change a setting here, it is stored in a cookie on " +
          "this device (sp_sync, kept for a year) so the screen is set up " +
          "the same way next time. It holds only these settings and your " +
          "preferred translations — nothing that identifies you — and is " +
          "not used for tracking or shared with anyone. Nothing is stored " +
          "until you change something.",
      }),
      forget,
    ),
  );

  const setSettings = (next: SyncSettings) => {
    settings = next;
    fontInput.value = String(next.fontSize);
    fontOutput.textContent = `${next.fontSize}px`;
    for (const side of Object.keys(marginInputs) as Array<keyof Margins>) {
      marginInputs[side].value = String(next.margins[side]);
    }
    themeInputs[next.theme].checked = true;
    balanceInput.checked = next.balance;
  };
  setSettings(settings);

  return {
    element: panel,
    open: () => {
      panel.classList.add("is-open");
      panel.inert = false;
      close.focus();
    },
    close: () => {
      panel.classList.remove("is-open");
      panel.inert = true;
    },
    isOpen: () => panel.classList.contains("is-open"),
    setVersions: (next) => {
      versions = next;
      settings = { ...settings, versionIds: next.map((v) => v.id) };
      renderList();
      // Grey out anything just added in the version list on screen.
      for (const option of versionSelect.options) {
        option.disabled = versions.some((v) => String(v.id) === option.value);
      }
    },
    setSettings,
  };
}
