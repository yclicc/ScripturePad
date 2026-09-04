# ScripturePad

**[scripturepad.org](https://scripturepad.org)**

A pastebin for translatable sermon notes with Bible reference integration.
Write or paste your notes, cite scripture inline, and share a public link —
readers can view the notes in their own language, with the referenced passages
shown in a Bible translation of their choosing rather than a machine
translation of your English quotations.

## What it does

- **Paste from Google Docs and it just works.** A WYSIWYG editor with a
  deliberately small schema, so formatting survives and fonts, colours, and
  spacing junk do not. No Markdown to learn.
- **Scripture references are detected as you type** and can be inserted as a
  block quotation, a hover popover, or woven inline. Passages keep their verse
  numbers, poetry line breaks, and small-caps divine name.
- **Readers pick their own translation.** Quoted passages are stored as
  references, not text, so they re-render in whatever version the reader
  chooses — and translating the page swaps in a real Bible in that language.
- **Mark text as untranslatable** — names, transliterations, theological terms
  — so machine translation leaves it alone.
- **Sign in with YouVersion** for per-document ownership.

## Development

```bash
npm install
npm run dev     # http://localhost:8787
npm test
npm run deploy
```

Copy `.dev.vars.example` to `.dev.vars` and add a YouVersion Platform app key.
See [CLAUDE.md](CLAUDE.md) for architecture, API quirks, and deployment.

Built on Cloudflare Workers (D1 + KV), ProseMirror, and the
[YouVersion Platform API](https://developers.youversion.com).

## History

Originally a fork of [mdbin](https://github.com/kevinfiol/mdbin), rewritten in
2026 to move off the deprecated Deno Deploy and from Markdown to WYSIWYG. The
previous Deno + Bible Brain implementation is preserved on the
[`legacy-deno-biblebrain`](../../tree/legacy-deno-biblebrain) branch.

Originally created for
[Antioch Network Manchester](https://www.antiochnetwork.org.uk).

## License

[MIT](LICENSE) — ScripturePad © 2024-2026 yclicc, original mdbin © 2023
kevinfiol.

Bible text is supplied by the YouVersion Platform API and remains the copyright
of its respective publishers; each version's notice is displayed with the notes
that quote it.
