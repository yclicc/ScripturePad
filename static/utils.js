// Bible book name mappings to USFM codes
export const bibleBooks = {
  Genesis: "GEN",
  Gen: "GEN",
  Exodus: "EXO",
  Exo: "EXO",
  Leviticus: "LEV",
  Lev: "LEV",
  Numbers: "NUM",
  Num: "NUM",
  Deuteronomy: "DEU",
  Deut: "DEU",
  Joshua: "JOS",
  Josh: "JOS",
  Judges: "JDG",
  Judg: "JDG",
  Ruth: "RUT",
  Ruth: "RUT",
  "1 Samuel": "1SA",
  "1Sam": "1SA",
  "2 Samuel": "2SA",
  "2Sam": "2SA",
  "1 Kings": "1KI",
  "1Kgs": "1KI",
  "2 Kings": "2KI",
  "2Kgs": "2KI",
  "1 Chronicles": "1CH",
  "1Chr": "1CH",
  "2 Chronicles": "2CH",
  "2Chr": "2CH",
  Ezra: "EZR",
  Ezra: "EZR",
  Nehemiah: "NEH",
  Neh: "NEH",
  Esther: "EST",
  Esth: "EST",
  Job: "JOB",
  Job: "JOB",
  Psalms: "PSA",
  Psalm: "PSA",
  Ps: "PSA",
  Proverbs: "PRO",
  Prov: "PRO",
  Ecclesiastes: "ECC",
  Ecc: "ECC",
  "Song of Solomon": "SNG",
  Song: "SNG",
  Isaiah: "ISA",
  Isa: "ISA",
  Jeremiah: "JER",
  Jer: "JER",
  Lamentations: "LAM",
  Lam: "LAM",
  Ezekiel: "EZK",
  Ezek: "EZK",
  Daniel: "DAN",
  Dan: "DAN",
  Hosea: "HOS",
  Hos: "HOS",
  Joel: "JOL",
  Joel: "JOL",
  Amos: "AMO",
  Amos: "AMO",
  Obadiah: "OBA",
  Obad: "OBA",
  Jonah: "JON",
  Jon: "JON",
  Micah: "MIC",
  Mic: "MIC",
  Nahum: "NAM",
  Nah: "NAM",
  Habakkuk: "HAB",
  Hab: "HAB",
  Zephaniah: "ZEP",
  Zeph: "ZEP",
  Haggai: "HAG",
  Hag: "HAG",
  Zechariah: "ZEC",
  Zech: "ZEC",
  Malachi: "MAL",
  Mal: "MAL",
  Matthew: "MAT",
  Matt: "MAT",
  Mark: "MRK",
  Mk: "MRK",
  Luke: "LUK",
  Lk: "LUK",
  John: "JHN",
  Jn: "JHN",
  Acts: "ACT",
  Acts: "ACT",
  Romans: "ROM",
  Rom: "ROM",
  "1 Corinthians": "1CO",
  "1Cor": "1CO",
  "2 Corinthians": "2CO",
  "2Cor": "2CO",
  Galatians: "GAL",
  Gal: "GAL",
  Ephesians: "EPH",
  Eph: "EPH",
  Philippians: "PHP",
  Phil: "PHP",
  Colossians: "COL",
  Col: "COL",
  "1 Thessalonians": "1TH",
  "1Thess": "1TH",
  "2 Thessalonians": "2TH",
  "2Thess": "2TH",
  "1 Timothy": "1TI",
  "1Tim": "1TI",
  "2 Timothy": "2TI",
  "2Tim": "2TI",
  Titus: "TIT",
  Titus: "TIT",
  Philemon: "PHM",
  Phlm: "PHM",
  Hebrews: "HEB",
  Heb: "HEB",
  James: "JAS",
  Jas: "JAS",
  "1 Peter": "1PE",
  "1Pet": "1PE",
  "2 Peter": "2PE",
  "2Pet": "2PE",
  "1 John": "1JN",
  "1Jn": "1JN",
  "2 John": "2JN",
  "2Jn": "2JN",
  "3 John": "3JN",
  "3Jn": "3JN",
  Jude: "JUD",
  Jude: "JUD",
  Revelation: "REV",
  Rev: "REV",
};

export const testamentLookup = {
  GEN: "OT",
  EXO: "OT",
  LEV: "OT",
  NUM: "OT",
  DEU: "OT",
  JOS: "OT",
  JDG: "OT",
  RUT: "OT",
  "1SA": "OT",
  "2SA": "OT",
  "1KI": "OT",
  "2KI": "OT",
  "1CH": "OT",
  "2CH": "OT",
  EZR: "OT",
  NEH: "OT",
  EST: "OT",
  JOB: "OT",
  PSA: "OT",
  PRO: "OT",
  ECC: "OT",
  SNG: "OT",
  ISA: "OT",
  JER: "OT",
  LAM: "OT",
  EZK: "OT",
  DAN: "OT",
  HOS: "OT",
  JOL: "OT",
  AMO: "OT",
  OBA: "OT",
  JON: "OT",
  MIC: "OT",
  NAM: "OT",
  HAB: "OT",
  ZEP: "OT",
  HAG: "OT",
  ZEC: "OT",
  MAL: "OT",
  MAT: "NT",
  MRK: "NT",
  LUK: "NT",
  JHN: "NT",
  ACT: "NT",
  ROM: "NT",
  "1CO": "NT",
  "2CO": "NT",
  GAL: "NT",
  EPH: "NT",
  PHP: "NT",
  COL: "NT",
  "1TH": "NT",
  "2TH": "NT",
  "1TI": "NT",
  "2TI": "NT",
  TIT: "NT",
  PHM: "NT",
  HEB: "NT",
  JAS: "NT",
  "1PE": "NT",
  "2PE": "NT",
  "1JN": "NT",
  "2JN": "NT",
  "3JN": "NT",
  JUD: "NT",
  REV: "NT",
};

export const scriptureReftagExtension = {
  name: "scriptureReference",
  level: "inline",
  tokenizer(src, tokens) {
    // More precise match for scripture references followed by an equals sign
    // Don't include whitespace after the equals sign
    const scriptureRegex =
      /^([A-Za-z1-3][A-Za-z1-3 ]+)\s(\d+)(?::(\d+)(?:-(\d+))?)?\s*=/;
    const match = scriptureRegex.exec(src);

    if (match) {
      const bookName = match[1].trim();
      // Make sure the book name is valid
      if (bibleBooks[bookName]) {
        const chapter = match[2];
        const startVerse = match[3] || null;
        const endVerse = match[4] || startVerse;

        // Get the reference text without the equals sign
        const referenceText = src.substring(0, match[0].length - 1).trim();

        return {
          type: "scriptureReference",
          raw: match[0], // The full match including the =
          book: bibleBooks[bookName],
          chapter: chapter,
          startVerse: startVerse,
          endVerse: endVerse,
          referenceText: referenceText,
        };
      }
    }
  },
  renderer(token) {
    // Generate the HTML for the scripture reference with the x-bibleref tag
    let tag = `${token.referenceText}<x-bibleref data-book="${token.book}" data-chapter="${token.chapter}"`;
    if (token.startVerse) {
      tag += ` data-start-verse="${token.startVerse}"`;
    }
    if (token.endVerse) {
      tag += ` data-end-verse="${token.endVerse}"`;
    }
    tag += `></x-bibleref>`;
    return tag;
  },
};

export const noTranslateExtension = {
  name: "noTranslate",
  level: "inline",
  // The tokenizer uses a regex that does the following:
  // • Captures any whitespace immediately before the opening "=" (Group 1)
  // • Matches an "=" only if it is immediately followed by a non-space ((?=\S))
  // • Lazily captures the inner content (Group 2) that must end with a non-space (enforced via a lookbehind)
  // • Matches the closing "=" only if it is immediately preceded by a non-space ((?<=\S))
  // • Captures any whitespace immediately after the closing "=" (Group 3)
  tokenizer(src, tokens) {
    const rule = /^(\s*)=(?=\S)([\s\S]*?)(?<=\S)=(\s*)/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: "noTranslate",
        raw: match[0],
        // Combine the whitespace before the opening "=" (if any),
        // the core content, and the whitespace after the closing "=".
        text: match[1] + match[2] + match[3],
      };
    }
  },
  // The renderer wraps the captured text in a span with translate="no"
  renderer(token) {
    return `<span translate="no">${token.text}</span>`;
  },
};
