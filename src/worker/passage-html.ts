/**
 * Parse YouVersion passage HTML into structured verses.
 *
 * `format=text` drops verse numbers entirely, so passages are fetched as HTML
 * and reduced here. The SDK ships a transformer for this, but it depends on
 * jsdom, which does not run on workerd — hence this small regex reducer, done
 * on the server so the client receives clean data rather than markup.
 *
 * Relevant markers in the source HTML:
 *   <span class="yv-v" v="16">      verse boundary, number in `v`
 *   <span class="yv-vlbl">16</span> printed verse label (dropped; redundant)
 *   <div class="q1">/<div class="q2">  poetry lines
 *   <div class="s1 yv-h">           section heading
 */

/**
 * A run of text within a line. Most are plain; `smallCaps` carries the divine
 * name convention (printed "LORD" in small capitals), which is a translation
 * convention worth preserving rather than flattening to shouted caps.
 */
export interface PassageSpan {
  text: string;
  smallCaps?: boolean;
}

/**
 * One line of a passage.
 *
 * Prose is one line per verse. Poetry is one line per printed line, with
 * `indent` giving the q1/q2 level, so Psalms keep their shape.
 */
export interface PassageLine {
  /** Verse number when this line starts a verse; null when it continues one. */
  number: number | null;
  spans: PassageSpan[];
  /** 0 for prose, 1+ for poetry indent levels. */
  indent: number;
}

export interface PassageVerse {
  /** Verse number, or null for text before the first marker. */
  number: number | null;
  text: string;
  /** True when the source marked this as a poetry line. */
  poetry: boolean;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => {
      const named = ENTITIES[entity.toLowerCase()];
      if (named) return named;
      const numeric = /^&#(\d+);$/.exec(entity);
      return numeric ? String.fromCharCode(Number(numeric[1])) : entity;
    })
    .replace(/\s+/g, " ");
}

/**
 * Reduce passage HTML to lines.
 *
 * Poetry line breaks and small-caps are preserved; translator-added section
 * headings are dropped by default, being editorial rather than scripture.
 *
 * @param includeHeadings Keep section headings as their own lines.
 */
export function parsePassageLines(
  html: string,
  includeHeadings = false,
): PassageLine[] {
  const lines: PassageLine[] = [];

  let current: PassageLine | null = null;
  let indent = 0;
  let smallCaps = 0;
  let skipDepth = 0;
  /** Number waiting to be attached to the next line that receives text. */
  let pendingNumber: number | null = null;

  const startLine = (): PassageLine => {
    const line: PassageLine = { number: pendingNumber, spans: [], indent };
    pendingNumber = null;
    lines.push(line);
    return line;
  };

  // Walk tags and text in order; only a few tags carry meaning.
  const token = /<([a-z0-9]+)([^>]*)>|<\/([a-z0-9]+)>|([^<]+)/gi;

  for (const match of html.matchAll(token)) {
    const [, openTag, attrs, closeTag, text] = match;

    if (openTag) {
      const attributes = attrs ?? "";
      const className = /class="([^"]*)"/.exec(attributes)?.[1] ?? "";

      if (skipDepth > 0) {
        skipDepth += 1;
        continue;
      }

      // The printed label duplicates the number already read from `v`.
      if (className.includes("yv-vlbl")) {
        skipDepth = 1;
        continue;
      }

      // Footnotes and cross-references are not part of the text.
      if (/\byv-f\b|\bnote\b|\bf\b|\bx\b/.test(className)) {
        skipDepth = 1;
        continue;
      }

      if (className.includes("yv-h")) {
        if (includeHeadings) {
          indent = 0;
          current = startLine();
        } else {
          skipDepth = 1;
        }
        continue;
      }

      // Verse boundary: the number attaches to whichever line takes text next,
      // so a verse starting mid-poetry lands on the right line.
      const verseAttr = /\sv="(\d+)"/.exec(attributes);
      if (className.includes("yv-v") && verseAttr) {
        pendingNumber = Number(verseAttr[1]);
        current = null;
        continue;
      }

      // Small caps: the divine name convention.
      if (/\bnd\b|\bsc\b/.test(className)) {
        smallCaps += 1;
        continue;
      }

      // Poetry line — q1, q2, ... give the indent level.
      const poetry = /\bq(\d)?\b/.exec(className);
      if (poetry) {
        indent = poetry[1] ? Number(poetry[1]) : 1;
        current = null;
        continue;
      }

      // Any other block resets to prose.
      if (openTag.toLowerCase() === "div" || openTag.toLowerCase() === "p") {
        indent = 0;
        current = null;
      }

      continue;
    }

    if (closeTag) {
      if (skipDepth > 0) {
        skipDepth -= 1;
        continue;
      }
      if (/^(span)$/i.test(closeTag) && smallCaps > 0) smallCaps -= 1;
      continue;
    }

    if (text && skipDepth === 0) {
      const decoded = decodeEntities(text);
      if (!decoded.trim()) {
        // Keep a separating space inside a line already in progress.
        if (current && current.spans.length > 0) {
          const last = current.spans[current.spans.length - 1]!;
          if (!last.text.endsWith(" ")) last.text += " ";
        }
        continue;
      }

      current ??= startLine();

      const isSmallCaps = smallCaps > 0;
      const last = current.spans[current.spans.length - 1];

      if (last && Boolean(last.smallCaps) === isSmallCaps) {
        last.text += decoded;
      } else {
        current.spans.push(
          isSmallCaps ? { text: decoded, smallCaps: true } : { text: decoded },
        );
      }
    }
  }

  // Tidy whitespace and drop lines that ended up empty.
  return lines
    .map((line) => ({
      ...line,
      spans: line.spans
        .map((span, index, all) => ({
          ...span,
          text:
            index === 0
              ? span.text.replace(/^\s+/, "")
              : index === all.length - 1
                ? span.text.replace(/\s+$/, "")
                : span.text,
        }))
        .filter((span) => span.text.length > 0),
    }))
    .filter((line) => line.spans.length > 0);
}

/** Flatten lines to plain prose, for previews and copying. */
export function linesToText(lines: PassageLine[]): string {
  return lines
    .map((line) => line.spans.map((span) => span.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verse-level view of a passage, for callers that do not need line structure.
 */
export function parsePassageHtml(
  html: string,
  includeHeadings = false,
): PassageVerse[] {
  const verses: PassageVerse[] = [];

  for (const line of parsePassageLines(html, includeHeadings)) {
    const text = line.spans.map((span) => span.text).join("").trim();
    if (!text) continue;

    const previous = verses[verses.length - 1];
    if (line.number === null && previous) {
      // A continuation line belongs to the verse it follows.
      previous.text += ` ${text}`;
      continue;
    }

    verses.push({
      number: line.number,
      text,
      poetry: line.indent > 0,
    });
  }

  return verses;
}

/** Flatten verses to plain prose, for previews and copying. */
export function versesToText(verses: PassageVerse[]): string {
  return verses.map((verse) => verse.text).join(" ");
}
