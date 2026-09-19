import {
  baseLanguage,
  versionsForLanguage,
  type VersionSummary,
} from "./language.ts";

/**
 * Lets the reader choose which Bible translation the quoted passages use.
 *
 * The list is scoped to the current page language, so translating the page to
 * French offers French Bibles rather than English ones.
 */

interface PickerOptions {
  initialLanguage: string;
  initialVersionId: number;
  onChange: (version: VersionSummary) => void;
}

export interface VersionPicker {
  /** Repopulate for a new page language, e.g. after machine translation. */
  setLanguage: (language: string, versionId: number) => void;
  /**
   * Say that a Bible was picked automatically, and invite a change when there
   * is more than one to pick from. Call after a machine translation.
   */
  announceAutoSelection: (language: string, versionId: number) => Promise<void>;
}

/**
 * Tell the reader a Bible was chosen for them, and invite them to change it.
 *
 * Shown only after the page has been machine-translated, because that is the
 * moment the swap actually happens and the moment it is least obvious: the
 * prose turned Amharic and so did the scripture, but for different reasons —
 * the notes by machine, the verses by fetching a real published Amharic Bible.
 * Readers have told us they do not perceive that difference, so it is said
 * explicitly rather than left to be inferred.
 *
 * The wording is ordinary text in the DOM, deliberately not marked
 * `translate="no"`, so the same translator that just translated the page
 * translates this too and the reader gets it in their own language.
 */
function buildNotice(): HTMLParagraphElement {
  const notice = document.createElement("p");
  notice.className = "version-notice";
  notice.hidden = true;
  // Announced when it appears, for a reader who cannot see the pulse.
  notice.setAttribute("role", "status");
  return notice;
}

export function createVersionPicker(
  container: HTMLElement,
  options: PickerOptions,
): VersionPicker {
  // The notice sits under the select, so the two need a column of their own
  // inside the toolbar's flex row.
  const wrapper = document.createElement("div");
  wrapper.className = "version-picker__wrapper";

  const notice = buildNotice();

  const select = document.createElement("select");
  select.className = "version-picker";
  select.setAttribute("aria-label", "Bible translation");
  // Version names are proper nouns; leave them in their own language.
  select.setAttribute("translate", "no");

  const populate = async (language: string, versionId: number) => {
    const versions = await versionsForLanguage(language);
    select.innerHTML = "";

    if (versions.length === 0) {
      // Some languages have no Bible on the platform at all.
      const option = document.createElement("option");
      option.textContent = "No translations available";
      option.disabled = true;
      select.append(option);
      select.disabled = true;
      return;
    }

    select.disabled = false;

    for (const version of versions) {
      const option = document.createElement("option");
      option.value = String(version.id);
      option.textContent = version.abbreviation
        ? `${version.abbreviation} — ${version.title}`
        : version.title;
      option.selected = version.id === versionId;
      select.append(option);
    }
  };

  select.addEventListener("change", async () => {
    const chosen = Number(select.value);
    const versions = await versionsForLanguage(
      baseLanguage(document.documentElement.lang || options.initialLanguage),
    );
    const version = versions.find((candidate) => candidate.id === chosen);
    if (version) options.onChange(version);
  });

  wrapper.append(select, notice);
  container.append(wrapper);
  void populate(options.initialLanguage, options.initialVersionId);

  /** Dismissed once the reader engages — the point has been made. */
  const clearNotice = () => {
    notice.hidden = true;
    wrapper.classList.remove("is-highlighted");
  };
  select.addEventListener("focus", clearNotice);
  select.addEventListener("change", clearNotice);

  return {
    setLanguage: (language, versionId) => void populate(language, versionId),

    async announceAutoSelection(language, versionId): Promise<void> {
      const versions = await versionsForLanguage(language);
      if (versions.length === 0) return;

      // Matched on the id passed in rather than read from `select.value`:
      // `setLanguage` repopulates the options asynchronously, so the select
      // may still hold the previous language's selection at this point.
      const chosen = versions.find((version) => version.id === versionId);
      const name = chosen?.abbreviation || chosen?.title || "";

      notice.innerHTML = "";

      // Built from nodes rather than one string because the version name is a
      // proper noun that must survive translation intact — "NASV" translated
      // is nonsense. Marking the whole sentence `translate="no"` would freeze
      // the wording we *want* translated, so only the name carries it.
      //
      // The name goes at the end of the sentence, so only a full stop follows
      // it — the less unprotected punctuation sits against the span, the less
      // a translator can disturb.
      notice.append(
        document.createTextNode(
          "These Bible verses are not machine translated. They come from a " +
            "published translation",
        ),
      );

      if (name) {
        const abbr = document.createElement("span");
        abbr.setAttribute("translate", "no");
        abbr.className = "version-notice__name";
        // The separator lives *inside* the protected span, not in the text
        // node before it. A translator rewrites the surrounding text nodes and
        // does not reliably keep a trailing separator, which is how Amharic
        // rendered as "ናቸውNASV" with the words welded together. Carried inside
        // the span it is protected along with the name.
        //
        // A non-breaking space, so the name is never orphaned onto a line of
        // its own.
        abbr.textContent = `\u00a0${name}`;
        notice.append(abbr);
      }

      // Prompting someone to choose when there is nothing to choose between is
      // noise, and invites a pointless tap.
      notice.append(
        document.createTextNode(
          versions.length > 1 ? ". Pick another above if you prefer." : ".",
        ),
      );

      notice.hidden = false;
      wrapper.classList.add("is-highlighted");
    },
  };
}
