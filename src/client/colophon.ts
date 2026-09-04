/**
 * Page-level scripture attribution.
 *
 * The YouVersion licence requires the copyright of every version whose text is
 * displayed. It does not require repeating that notice under each citation —
 * and doing so makes sermon notes unreadable, especially when a page quotes a
 * dozen passages from the same translation.
 *
 * So each citation registers the version it used, and one colophon at the foot
 * of the page credits each distinct version exactly once.
 */

export interface CitedVersion {
  versionId: number;
  title: string;
  abbreviation: string;
  copyright: string | null;
}

const cited = new Map<number, CitedVersion>();
const listeners = new Set<(versions: CitedVersion[]) => void>();

export function registerCitedVersion(version: CitedVersion): void {
  const existing = cited.get(version.versionId);
  if (existing && existing.copyright === version.copyright) return;

  cited.set(version.versionId, version);
  const all = [...cited.values()];
  for (const listener of listeners) listener(all);
}

/** Reset when navigating between documents. */
export function clearCitedVersions(): void {
  cited.clear();
  for (const listener of listeners) listener([]);
}

export function onCitedVersionsChange(
  listener: (versions: CitedVersion[]) => void,
): () => void {
  listeners.add(listener);
  listener([...cited.values()]);
  return () => listeners.delete(listener);
}

/**
 * Renders the credit block, and keeps it in sync as citations load.
 * Returns an unsubscribe function.
 */
export function mountColophon(container: HTMLElement): () => void {
  return onCitedVersionsChange((versions) => {
    container.innerHTML = "";

    if (versions.length === 0) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    // Our own wording, so it should be translated along with the page — a
    // reader in French should see this heading in French. Only the version
    // names and the publishers' copyright text are marked untranslatable
    // below, since those are proper nouns and legal strings.
    const heading = document.createElement("h2");
    heading.className = "colophon__heading";
    heading.textContent = "Scripture quotations";
    container.append(heading);

    const list = document.createElement("ul");
    list.className = "colophon__list";

    for (const version of versions) {
      const item = document.createElement("li");

      const name = document.createElement("span");
      name.className = "colophon__version";
      name.setAttribute("translate", "no");
      name.textContent = `${version.title} (${version.abbreviation})`;
      item.append(name);

      if (version.copyright) {
        const credit = document.createElement("span");
        credit.className = "colophon__credit";
        // Publishers require their notice verbatim.
        credit.setAttribute("translate", "no");
        // Copyright notices are multi-line (NIV's runs to three); preserve the
        // breaks rather than collapsing them into a run-on sentence.
        credit.textContent = version.copyright;
        item.append(credit);
      }

      list.append(item);
    }

    container.append(list);
  });
}
