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
