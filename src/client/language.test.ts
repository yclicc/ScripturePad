import { describe, expect, it } from "vitest";
import { baseLanguage } from "./language.ts";

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
