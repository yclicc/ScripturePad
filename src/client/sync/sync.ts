/**
 * ScripturePad Sync: one passage in several translations, side by side, for
 * projecting while it is read aloud. Several readings may follow one another
 * like a playlist; each starts on a fresh screen, with its own reference
 * above the columns.
 *
 * Each verse is one row with every translation inside it, so a verse starts
 * at the same height in every column. The reader (or whoever holds the
 * clicker) steps through the verses; the current one is highlighted across
 * every column, so someone following in a second language can always see
 * where the reading has got to. When the last verse on screen has been read,
 * the next press brings up the next screenful.
 *
 * Scripture only: nothing here is meant to be machine-translated, so every
 * column is `translate="no"` and carries its own `lang`.
 */

import "./sync.css";
import {
  toQueryRef,
  type ScriptureReference,
} from "../../shared/references.ts";
import {
  formatReadings,
  MAX_SYNC_READINGS,
  parseReadings,
  parseSyncPath,
  syncPath,
} from "../../shared/sync-path.ts";
import { DEFAULT_VERSION_ID } from "../preferences.ts";
import { defaultVersionFor } from "../language.ts";
import {
  alignVerses,
  balanceFactors,
  paginate,
  toVerses,
  type PassageLine,
  type Row,
  type Screen,
  type SyncPassage,
} from "./align.ts";
import { createPanel, type PanelVersion } from "./panel.ts";
import {
  DEFAULT_SETTINGS,
  forgetSettings,
  loadSettings,
  saveSettings,
  type SyncSettings,
} from "./settings.ts";

type ColumnResult =
  { ok: true; passage: SyncPassage } | { ok: false; error: string };

/** A row of the whole playlist, knowing which reading it belongs to. */
type PlacedRow = Row & { reading: number };

/** Passages per reading and version. Failures are retried. */
const passages = new Map<string, ColumnResult>();

const passageKey = (reference: ScriptureReference, versionId: number) =>
  `${toQueryRef(reference)}|${versionId}`;

async function loadColumn(
  reference: ScriptureReference,
  versionId: number,
): Promise<ColumnResult> {
  const key = passageKey(reference, versionId);
  const cached = passages.get(key);
  if (cached?.ok) return cached;

  let result: ColumnResult;
  try {
    const res = await fetch(
      `/api/passage?ref=${encodeURIComponent(toQueryRef(reference))}` +
        `&version=${versionId}`,
    );
    const body = (await res.json().catch(() => null)) as
      (SyncPassage & { error?: string }) | null;
    result =
      res.ok && body
        ? { ok: true, passage: body }
        : {
            ok: false,
            error: body?.error ?? `Could not load (HTTP ${res.status}).`,
          };
  } catch {
    result = { ok: false, error: "Could not reach ScripturePad." };
  }

  passages.set(key, result);
  return result;
}

/** The readings typed into a passage field, or why they cannot be shown. */
function readPassageField(text: string): ScriptureReference[] | string {
  const references = parseReadings(text);
  if (!references) return "That does not look like a Bible reference.";
  if (references.length > MAX_SYNC_READINGS) {
    return `Sync shows at most ${MAX_SYNC_READINGS} readings at a time.`;
  }
  return references;
}

/** The versions to start with when neither the link nor a cookie names any. */
async function defaultVersions(): Promise<number[]> {
  const ids = [DEFAULT_VERSION_ID];
  // A second column in the viewer's own language, when that is not English.
  const language = navigator.language;
  if (!/^en\b/i.test(language)) {
    const version = await defaultVersionFor(language, null);
    if (version && version.id !== DEFAULT_VERSION_ID) ids.push(version.id);
  }
  return ids;
}

/** True for Urdu in Arabic script, which is set in Nastaliq (sync.css). */
function isNastaliq(passage: SyncPassage): boolean {
  const tag = (passage.languageTag ?? "").toLowerCase();
  return /^ur(-|$)/.test(tag) && !/-(latn|deva)\b/.test(tag);
}

/** Direction of a string's first strongly-directional character. */
function textDirection(text: string): "rtl" | "ltr" {
  const strong =
    /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]|([\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF])/.exec(
      text,
    );
  return strong?.[1] ? "rtl" : "ltr";
}

/**
 * @param chapter Given for the first verse of a chapter in a passage that
 *   spans several, which is then numbered "53:1" rather than a bare "1".
 */
function renderLine(line: PassageLine, chapter?: number): HTMLElement {
  const element = document.createElement("div");
  element.className = "sync__line";
  if (line.indent > 0) {
    element.classList.add("sync__line--poetry");
    element.style.setProperty("--indent", String(line.indent));
  }

  if (line.number !== null) {
    const number = document.createElement("sup");
    number.className = "sync__num";
    const verses =
      line.numberEnd === undefined
        ? String(line.number)
        : `${line.number}–${line.numberEnd}`;
    number.textContent =
      chapter === undefined ? verses : `${chapter}:${verses}`;
    element.append(number);
  }

  for (const span of line.spans) {
    if (span.smallCaps) {
      const caps = document.createElement("span");
      caps.className = "sync__caps";
      caps.textContent = span.text;
      element.append(caps);
    } else {
      element.append(span.text);
    }
  }

  return element;
}

/** Landing form for `/sync` with no passage, or one that did not parse. */
function renderLanding(
  root: HTMLElement,
  attempted: string,
  versionIds: number[],
): void {
  const landing = document.createElement("div");
  landing.className = "sync__landing";
  landing.innerHTML = `
    <h1>ScripturePad Sync</h1>
    <p>
      Project a Bible passage in several translations side by side, verse by
      verse. As each verse is read, press Next — or a presentation clicker —
      and it is highlighted in every language, so everyone can follow along.
    </p>
    <form class="sync-panel__row">
      <input class="sync-panel__input" type="text" required
        placeholder="e.g. John 3:16-21, Romans 8:28-39"
        aria-label="Bible passage" />
      <button class="sync-button sync-button--primary" type="submit">
        Show
      </button>
    </form>
    <p class="sync-panel__error" hidden></p>
    <p class="sync-panel__hint">
      For several readings one after another, separate them with commas.
    </p>
  `;
  const input = landing.querySelector("input")!;
  const error = landing.querySelector<HTMLElement>(".sync-panel__error")!;
  input.value = attempted;
  if (attempted) {
    error.hidden = false;
    error.textContent = `“${attempted}” does not look like a Bible reference.`;
  }
  landing.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const references = readPassageField(input.value);
    if (typeof references === "string") {
      error.hidden = false;
      error.textContent = references;
      return;
    }
    window.location.assign(syncPath(references, versionIds));
  });
  root.append(landing);
  input.focus();
}

export async function mountSync(mount: HTMLElement): Promise<void> {
  const path = parseSyncPath(window.location.pathname);
  const saved = loadSettings();
  let settings: SyncSettings = saved ?? { ...DEFAULT_SETTINGS };

  const root = document.createElement("div");
  root.className = "sync";
  mount.replaceChildren(root);

  const applyAppearance = () => {
    root.dataset.theme = settings.theme;
    const { top, right, bottom, left } = settings.margins;
    root.style.setProperty("--m-top", `${top}px`);
    root.style.setProperty("--m-right", `${right}px`);
    root.style.setProperty("--m-bottom", `${bottom}px`);
    root.style.setProperty("--m-left", `${left}px`);
    root.style.setProperty("--sync-font", `${settings.fontSize}px`);
  };
  applyAppearance();

  /**
   * This device's preferred versions, changed only by choosing translations
   * here. Kept apart from `versionIds` so that adjusting the text size while
   * viewing someone else's link does not quietly adopt their translations.
   */
  let preferredIds = settings.versionIds;

  // The link's versions win; then this device's preference; then defaults.
  let versionIds = path.versionIds.length
    ? path.versionIds
    : settings.versionIds.length
      ? settings.versionIds
      : await defaultVersions();

  const references = path.references;
  if (references.length === 0) {
    document.title = "ScripturePad Sync";
    const attempted = decodeURIComponent(
      window.location.pathname.replace(/^\/sync\/?/, "").split("/")[0] ?? "",
    ).replace(/[+_]/g, " ");
    renderLanding(root, attempted, path.versionIds);
    return;
  }

  document.title = `${formatReadings(references)} — ScripturePad Sync`;
  // Name the versions in the address, so a copied link shows the same.
  window.history.replaceState(null, "", syncPath(references, versionIds));

  root.innerHTML = `
    <div class="sync__stage">
      <header class="sync__labels" translate="no"></header>
      <div class="sync__viewport">
        <div class="sync__body"></div>
      </div>
    </div>
    <div class="sync__blank" hidden></div>
    <nav class="sync__controls" aria-label="Sync controls">
      <button type="button" class="sync-button" data-action="prev"
        aria-label="Previous verse">‹</button>
      <span class="sync__status" aria-live="polite"></span>
      <button type="button" class="sync-button" data-action="next"
        aria-label="Next verse">›</button>
      <button type="button" class="sync-button" data-action="fullscreen">
        Full screen
      </button>
      <button type="button" class="sync-button" data-action="settings"
        aria-controls="sync-panel">Settings</button>
    </nav>
  `;

  const stage = root.querySelector<HTMLElement>(".sync__stage")!;
  const labels = root.querySelector<HTMLElement>(".sync__labels")!;
  const viewport = root.querySelector<HTMLElement>(".sync__viewport")!;
  const body = root.querySelector<HTMLElement>(".sync__body")!;
  const blank = root.querySelector<HTMLElement>(".sync__blank")!;
  const controls = root.querySelector<HTMLElement>(".sync__controls")!;
  const status = root.querySelector<HTMLElement>(".sync__status")!;

  // Layout state -----------------------------------------------------------

  /** Each reading's columns, in reading order then column order. */
  let readings: ColumnResult[][] = [];
  let rows: PlacedRow[] = [];
  /** Cells per row, per column, so fonts can be set without a DOM query. */
  let cells: HTMLElement[][] = [];
  /** Every row, then the colophon last. */
  let items: HTMLElement[] = [];
  let screens: Screen[] = [];
  /** The reading whose references the labels show; -1 for none yet. */
  let labelled = -1;
  /**
   * Which item is highlighted: -1 before the first verse, `rows.length` for
   * the colophon (the end, with nothing highlighted).
   */
  let cursor = -1;

  /**
   * Text sizes are CSS variables on the body — a scale per column and one
   * fit factor — rather than an inline size on every cell. Changing one is a
   * single write, and an unchanged value is not written at all.
   *
   * That matters because every change of size makes the browser reshape all
   * the text it affects, and some scripts are slow to shape: with a column of
   * Nastaliq Urdu, re-measuring a passage a handful of times per layout froze
   * the page for over a second.
   */
  const setVariable = (name: string, value: number) => {
    const text = value.toFixed(4);
    if (body.style.getPropertyValue(name) !== text) {
      body.style.setProperty(name, text);
    }
  };
  const setScales = (scales: readonly number[]) =>
    scales.forEach((scale, column) =>
      setVariable(`--scale-${column + 1}`, scale),
    );
  const setFit = (fit: number) => setVariable("--fit", fit);

  /** Show the screen holding the cursor, shrinking it if it overflows. */
  const show = () => {
    if (items.length === 0) return;
    const target = Math.max(0, cursor);
    const index = screens.findIndex(
      (screen) => target >= screen.start && target < screen.end,
    );
    const screen = screens[Math.max(0, index)] ?? { start: 0, end: 0 };

    // The labels name the reading on screen; the colophon goes with the last.
    const reading = (rows[screen.start] ?? rows[rows.length - 1])?.reading;
    if (reading !== undefined && reading !== labelled) renderLabels(reading);

    items.forEach((item, i) => {
      const hidden = i < screen.start || i >= screen.end;
      if (item.hidden !== hidden) item.hidden = hidden;
    });

    // Only a screen holding a single over-long verse can overflow. Text area
    // scales with the square of the font size, hence the square root.
    let fit = 1;
    setFit(fit);
    const available = viewport.clientHeight;
    for (let i = 0; i < 6 && body.offsetHeight > available + 1; i++) {
      fit *= Math.sqrt(available / body.offsetHeight) * 0.97;
      setFit(fit);
    }

    rows.forEach((_, i) =>
      items[i]?.classList.toggle("is-current", i === cursor),
    );
    stage.classList.toggle("has-cursor", cursor >= 0 && cursor < rows.length);

    status.textContent =
      cursor < 0
        ? "Start"
        : cursor >= rows.length
          ? "End"
          : `${cursor + 1} / ${rows.length}`;
  };

  /** Viewport size at the last layout, so an unchanged size is not redone. */
  let laidOutAt = "";

  /**
   * Measure everything and split it into screens.
   *
   * Two full measurements — column heights at an even size, then row
   * positions at the balanced size — and one of the visible screen in
   * `show`. Each is a full layout of the passage, so keep it at that.
   */
  const relayout = () => {
    if (items.length === 0) return;
    laidOutAt = `${viewport.clientWidth}x${viewport.clientHeight}`;
    for (const item of items) item.hidden = false;
    setFit(1);

    const even = versionIds.map(() => 1);
    setScales(even);
    const loaded = versionIds.filter((_, column) =>
      readings.some((columns) => columns[column]?.ok),
    );
    if (settings.balance && loaded.length > 1) {
      // Every cell is read before anything is written, so this is one
      // layout rather than one per cell.
      const heights = versionIds.map((_, column) =>
        cells.reduce((sum, row) => sum + (row[column]?.offsetHeight ?? 0), 0),
      );
      setScales(balanceFactors(heights));
    }

    screens = paginate(
      items.map((item) => ({
        top: item.offsetTop,
        bottom: item.offsetTop + item.offsetHeight,
      })),
      viewport.clientHeight,
      // Each reading after the first starts on a screen of its own.
      new Set(
        rows.flatMap((row, i) =>
          i > 0 && row.reading !== rows[i - 1]!.reading ? [i] : [],
        ),
      ),
    );
    show();
  };

  let pendingFrame = 0;
  let pendingTimer = 0;
  const requestRelayout = () => {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(relayout);
  };
  /**
   * For settings changes. Dragging the size slider fires many input events a
   * second; laying out after each one queued work faster than it finished.
   */
  const requestRelayoutSoon = () => {
    clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(requestRelayout, 150);
  };

  // Rendering --------------------------------------------------------------

  /** Any reading's passage for a version, for what is true of them all. */
  const versionPassage = (id: number): SyncPassage | null => {
    for (const reference of references) {
      const result = passages.get(passageKey(reference, id));
      if (result?.ok) return result.passage;
    }
    return null;
  };

  const panelVersions = (): PanelVersion[] =>
    versionIds.map((id) => {
      const passage = versionPassage(id);
      // A version may lack some readings — an Old Testament passage in a New
      // Testament — so the first failure is worth reporting.
      const failed = references
        .map((reference) => passages.get(passageKey(reference, id)))
        .find((result) => result && !result.ok);
      return {
        id,
        abbreviation: passage?.versionAbbreviation ?? null,
        title: passage?.versionTitle ?? null,
        language: passage?.languageTag ?? null,
        error: failed && !failed.ok ? failed.error : null,
      };
    });

  const renderLabels = (reading: number) => {
    labelled = reading;
    labels.replaceChildren();
    (readings[reading] ?? []).forEach((column, index) => {
      const label = document.createElement("div");
      label.className = "sync__label";
      if (column.ok) {
        const { passage } = column;
        const reference = document.createElement("span");
        reference.className = "sync__label-ref";
        reference.lang = passage.languageTag ?? "";
        reference.dir = "auto";
        reference.textContent = passage.reference;
        // Aligned with its column, which follows the reference's script.
        // `dir="auto"` on the label itself would skip the isolated reference
        // and settle on the Latin abbreviation instead.
        label.dir = textDirection(passage.reference);
        const version = document.createElement("span");
        version.className = "sync__label-version";
        version.textContent = passage.versionAbbreviation;
        label.append(reference, " ", version);
      } else {
        label.classList.add("sync__label--error");
        label.textContent = `#${versionIds[index]}: ${column.error}`;
      }
      labels.append(label);
    });
  };

  const renderColophon = (): HTMLElement => {
    const colophon = document.createElement("footer");
    colophon.className = "sync__colophon";
    // Our own wording stays translatable; only names and notices are not.
    const heading = document.createElement("p");
    heading.className = "sync__colophon-heading";
    heading.textContent = "Scripture quotations";
    colophon.append(heading);

    for (const id of versionIds) {
      const passage = versionPassage(id);
      if (!passage) continue;
      const entry = document.createElement("p");
      const name = document.createElement("strong");
      name.setAttribute("translate", "no");
      name.textContent = `${passage.versionTitle} (${passage.versionAbbreviation})`;
      entry.append(name);
      if (passage.copyright) {
        const notice = document.createElement("span");
        notice.setAttribute("translate", "no");
        notice.lang = passage.languageTag ?? "";
        notice.textContent = ` — ${passage.copyright}`;
        entry.append(notice);
      }
      colophon.append(entry);
    }
    return colophon;
  };

  const render = () => {
    const previous = rows[cursor];

    rows = readings.flatMap((columns, reading) =>
      alignVerses(
        columns.map((column) =>
          column.ok
            ? toVerses(column.passage, references[reading]!.chapter)
            : [],
        ),
      ).map((row) => ({ ...row, reading })),
    );
    stage.style.setProperty("--cols", String(Math.max(1, versionIds.length)));

    renderLabels(0);
    body.replaceChildren();
    cells = [];

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sync__message";
      empty.textContent = readings.flat().some((column) => column.ok)
        ? "This passage has no verses in the chosen translations."
        : "The passage could not be loaded. Check the reference and " +
          "translations in Settings, or try again in a few minutes.";
      body.append(empty);
      items = [];
      return;
    }

    // Verse numbers start again at each chapter, so in a passage covering
    // several, the first verse of each says which chapter it opens.
    const spansChapters = new Set(
      rows.flatMap((row, i) =>
        i > 0 &&
        row.reading === rows[i - 1]!.reading &&
        row.chapter !== rows[i - 1]!.chapter
          ? [row.reading]
          : [],
      ),
    );

    for (const [index, row] of rows.entries()) {
      const before = rows[index - 1];
      const opensChapter =
        spansChapters.has(row.reading) &&
        (before?.reading !== row.reading || before.chapter !== row.chapter);
      const element = document.createElement("div");
      element.className = "sync__row";
      element.dataset.index = String(index);
      const rowCells = row.cells.map((lines, column) => {
        const cell = document.createElement("div");
        cell.className = "sync__cell";
        cell.setAttribute("translate", "no");
        const result = readings[row.reading]?.[column];
        const tag = result?.ok ? (result.passage.languageTag ?? "") : "";
        cell.lang = tag;
        // From the text, not the language: Urdu, for one, is published in
        // both Arabic and Roman script, and a Roman-script Urdu Bible laid
        // out right-to-left puts every full stop at the wrong end.
        cell.dir = "auto";
        const first = lines.findIndex((line) => line.number !== null);
        cell.append(
          ...lines.map((line, i) =>
            renderLine(
              line,
              opensChapter && i === first ? row.chapter : undefined,
            ),
          ),
        );
        element.append(cell);
        return cell;
      });
      cells.push(rowCells);
      body.append(element);
    }

    items = [...body.querySelectorAll<HTMLElement>(".sync__row")];
    items.push(body.appendChild(renderColophon()));

    // Keep the place across a change of translations.
    if (previous) {
      const found = rows.findIndex(
        (row) =>
          row.reading === previous.reading &&
          row.chapter === previous.chapter &&
          row.verseStart <= previous.verseStart &&
          row.verseEnd >= previous.verseStart,
      );
      cursor = found;
    } else {
      cursor = Math.min(cursor, rows.length);
    }

    relayout();
  };

  /** Fetch every column, one at a time to respect the API's rate limit. */
  const load = async () => {
    body.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "sync__message";
    loading.textContent = "Loading…";
    body.append(loading);
    items = [];

    const ids = versionIds;
    const results: ColumnResult[][] = [];
    for (const reference of references) {
      const columns: ColumnResult[] = [];
      for (const id of ids) columns.push(await loadColumn(reference, id));
      results.push(columns);
    }

    // Fetch Nastaliq before the first layout, not after it. Otherwise the
    // passage is laid out in a fallback font, then again — the slow part —
    // when Nastaliq arrives, and the projected text visibly jumps. Capped,
    // so a slow connection still gets the text.
    if (
      results.flat().some((result) => result.ok && isNastaliq(result.passage))
    ) {
      await Promise.race([
        document.fonts?.load('16px "Noto Nastaliq Urdu"', "اردو"),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]).catch(() => {});
    }

    // A newer choice of versions superseded this load.
    if (ids !== versionIds) return;

    readings = results;
    panel.setVersions(panelVersions());
    render();
  };

  // Settings ---------------------------------------------------------------

  const persist = () => {
    saveSettings({ ...settings, versionIds: preferredIds });
  };

  const setVersions = (ids: number[]) => {
    versionIds = ids;
    preferredIds = ids;
    persist();
    // Keep the address in step, so the link copied from here shows the same.
    window.history.replaceState(null, "", syncPath(references, ids));
    panel.setVersions(panelVersions());
    void load();
  };

  const panel = createPanel({
    settings,
    passage: formatReadings(references),
    onSettings: (next) => {
      // The panel owns display settings only; versions come via onVersions.
      settings = next;
      persist();
      applyAppearance();
      requestRelayoutSoon();
    },
    onVersions: setVersions,
    onPassage: (text) => {
      const next = readPassageField(text);
      if (typeof next === "string") return next;
      window.location.assign(syncPath(next, versionIds));
      return null;
    },
    onForget: () => {
      forgetSettings();
      preferredIds = [];
      settings = { ...DEFAULT_SETTINGS };
      panel.setSettings(settings);
      applyAppearance();
      requestRelayout();
    },
    onClose: () => togglePanel(false),
  });
  root.append(panel.element);
  panel.setVersions(panelVersions());

  const settingsButton = controls.querySelector<HTMLButtonElement>(
    '[data-action="settings"]',
  )!;
  const togglePanel = (open = !panel.isOpen()) => {
    if (open) panel.open();
    else panel.close();
    settingsButton.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-panel-open", open);
    if (!open) settingsButton.focus();
  };

  // Navigation -------------------------------------------------------------

  const go = (next: number) => {
    cursor = Math.max(-1, Math.min(rows.length, next));
    show();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const toggleBlank = () => {
    blank.hidden = !blank.hidden;
  };

  controls.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-action]",
    )?.dataset.action;
    if (action === "prev") go(cursor - 1);
    if (action === "next") go(cursor + 1);
    if (action === "fullscreen") toggleFullscreen();
    if (action === "settings") togglePanel();
  });

  body.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      ".sync__row",
    );
    if (row?.dataset.index) go(Number(row.dataset.index));
  });

  blank.addEventListener("click", toggleBlank);

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape" && panel.isOpen()) {
      togglePanel(false);
      return;
    }
    // Arrow keys belong to whatever form control has focus, and Space or
    // Enter on a button presses it. Otherwise a button clicked a moment ago
    // must not swallow the clicker's next press.
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, .sync-panel")) return;
    if (
      target.closest("button") &&
      (event.key === " " || event.key === "Enter")
    ) {
      return;
    }

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "Enter":
      case "n":
        go(cursor + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
      case "Backspace":
      case "p":
        go(cursor - 1);
        break;
      case "Home":
        go(-1);
        break;
      case "End":
        go(rows.length);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      // Clickers' "blank screen" button sends B or full stop.
      case "b":
      case "B":
      case ".":
        toggleBlank();
        break;
      case "s":
      case "S":
        togglePanel();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // Keep the controls out of the projected picture until the mouse moves.
  let idle = 0;
  const wake = () => {
    root.classList.remove("is-idle");
    clearTimeout(idle);
    idle = window.setTimeout(() => {
      if (!panel.isOpen()) root.classList.add("is-idle");
    }, 2500);
  };
  root.addEventListener("pointermove", wake);
  root.addEventListener("pointerdown", wake);
  wake();

  // Margins, full screen and window size all change the viewport. The
  // observer also fires once on attaching, when nothing has changed.
  new ResizeObserver(() => {
    const size = `${viewport.clientWidth}x${viewport.clientHeight}`;
    if (size !== laidOutAt) requestRelayout();
  }).observe(viewport);
  // Without a saved setup there is nothing chosen yet; open the panel so the
  // translations can be picked, with the notice about saving in view.
  if (!saved && path.versionIds.length === 0) togglePanel(true);

  await load();

  // A web font arriving later changes every measurement. Attached only now:
  // `load` already waited for Nastaliq, and listening sooner would lay the
  // whole passage out a second time as that font finished. `loadingdone`
  // rather than `fonts.ready`, which may resolve before a font is requested.
  document.fonts?.addEventListener("loadingdone", requestRelayout);
}
