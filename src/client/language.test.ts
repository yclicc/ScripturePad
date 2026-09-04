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
});
