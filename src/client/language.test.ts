import { describe, expect, it } from "vitest";
import { baseLanguage, pickVersion } from "./language.ts";

describe("baseLanguage", () => {
  it("drops the region for languages where it does not change the script", () => {
    expect(baseLanguage("fr-CA")).toBe("fr");
    expect(baseLanguage("en-GB")).toBe("en");
    expect(baseLanguage("pt-BR")).toBe("pt");
    expect(baseLanguage("es")).toBe("es");
  });

  it("maps Traditional Chinese to the tag the platform actually uses", () => {
    // The platform tags its Traditional Bibles zh-Hant-TW and matches that
    // exactly; a truncated "zh-Hant" returns an empty list, and plain "zh"
    // returns Simplified.
    expect(baseLanguage("zh-TW")).toBe("zh-Hant-TW");
    expect(baseLanguage("zh-HK")).toBe("zh-Hant-TW");
    expect(baseLanguage("zh-MO")).toBe("zh-Hant-TW");
    expect(baseLanguage("zh-Hant")).toBe("zh-Hant-TW");
    expect(baseLanguage("zh-Hant-TW")).toBe("zh-Hant-TW");
    expect(baseLanguage("zh-hant")).toBe("zh-Hant-TW");
  });

  it("maps Simplified Chinese regions to plain zh", () => {
    expect(baseLanguage("zh-CN")).toBe("zh");
    expect(baseLanguage("zh-SG")).toBe("zh");
    expect(baseLanguage("zh-Hans")).toBe("zh");
    expect(baseLanguage("zh")).toBe("zh");
  });

  it("falls back to English for empty input", () => {
    expect(baseLanguage("")).toBe("en");
  });

  it("modernises the ISO codes translators still emit", () => {
    // Chrome's translator writes Google's superseded spellings into
    // `<html lang>`. The Bible API knows only the modern codes, so leaving
    // these unmapped finds no versions and silently leaves scripture in the
    // original language.
    expect(baseLanguage("iw")).toBe("he");
    expect(baseLanguage("jw")).toBe("jv");
    expect(baseLanguage("in")).toBe("id");
    expect(baseLanguage("tl")).toBe("fil");
  });

  it("still handles Chinese after legacy remapping", () => {
    // Translators write zh-CN and zh-TW; the remapping must not disturb the
    // script distinction, which is the one that actually changes the Bible.
    expect(baseLanguage("zh-CN")).toBe("zh");
    expect(baseLanguage("zh-TW")).toBe("zh-Hant-TW");
  });
});

describe("pickVersion", () => {
  const version = (id: number, languageTag: string) => ({
    id,
    title: "",
    abbreviation: String(id),
    languageTag,
    copyright: null,
  });
  // As the platform lists them: Roman-script Urdu first.
  const urdu = [
    version(1887, "ur-Latn"),
    version(3327, "ur"),
    version(187, "ur"),
    version(1885, "ur-Deva"),
  ];

  it("defaults Urdu to the Urdu-script version, not the first listed", () => {
    expect(pickVersion("ur", urdu, null)?.id).toBe(187);
    expect(pickVersion("ur-PK", urdu, null)?.id).toBe(187);
  });

  it("lets a reader's own choice win over the default", () => {
    expect(pickVersion("ur", urdu, 1887)?.id).toBe(1887);
  });

  it("falls back to the first listed when the default is unavailable", () => {
    expect(pickVersion("ur", urdu.slice(0, 2), null)?.id).toBe(1887);
    expect(pickVersion("fr", [version(93, "fr")], 999)?.id).toBe(93);
  });

  it("returns null for a language with no Bibles", () => {
    expect(pickVersion("sw", [], null)).toBeNull();
  });
});
