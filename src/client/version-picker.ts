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
}

export function createVersionPicker(
  container: HTMLElement,
  options: PickerOptions,
): VersionPicker {
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

  container.append(select);
  void populate(options.initialLanguage, options.initialVersionId);

  return {
    setLanguage: (language, versionId) => void populate(language, versionId),
  };
}
