# ScripturePad

A pastebin for translatable sermon notes with Bible reference integration.
Write or paste your notes, cite scripture inline, and share a public link —
readers can view the notes in their own language with the referenced passages
in a translation of their choosing.

Originally a fork of [mdbin](https://github.com/kevinfiol/mdbin).

## Status: rewrite in progress

`master` is being rebuilt from scratch. The previous version — Deno on Deno
Deploy, using the Bible Brain API with a Markdown editor — is preserved on the
[`legacy-deno-biblebrain`](../../tree/legacy-deno-biblebrain) branch.

What is changing:

- **Bible text:** Bible Brain / DBT → YouVersion Platform API
- **Hosting:** Deno Deploy (deprecated) → Cloudflare Workers
- **Editor:** Markdown / CodeMirror → WYSIWYG via ProseMirror, so notes can be
  pasted straight out of Google Docs
- **Auth:** shared edit codes → Sign in with YouVersion, with real per-document
  ownership

See [CLAUDE.md](CLAUDE.md) for the full plan and architecture.

## License

See [LICENSE](LICENSE).
