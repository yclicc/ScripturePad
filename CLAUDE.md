# ScripturePad Development Guide

## Project Purpose

ScripturePad is a pastebin for translatable sermon notes with Bible reference
integration. A pastor writes or pastes notes, references scripture inline, and
shares a public link. Readers can view the notes in their own language, with the
referenced passages rendered in a Bible translation of their choosing.

This repository is currently a **full rewrite in progress**. The previous
implementation (Deno + Deno Deploy + Bible Brain/DBT API + Markdown/CodeMirror)
is preserved on the `legacy-deno-biblebrain` branch for reference. Nothing on
`master` should be assumed to carry over from it.

## The Rewrite: What Is Changing And Why

| Area | Was | Now |
| --- | --- | --- |
| Bible text | Bible Brain / DBT (`4.dbt.io`) | YouVersion Platform API |
| Hosting | Deno Deploy (deprecated) | Cloudflare Workers |
| Storage | Deno KV | Cloudflare D1 |
| Editing | Markdown in CodeMirror | WYSIWYG via ProseMirror |
| Auth | Shared edit codes in env var | Sign in with YouVersion (OAuth) |

The driving goal is that a pastor should be able to **paste straight out of
Google Docs and have it just work** — no Markdown syntax to learn, no broken
formatting.

### Why Cloudflare Workers

Deno Deploy is deprecated, so hosting had to move. Cloudflare Workers is the
recommendation because the whole app fits inside one vendor with a usable free
tier: Workers for the server, D1 for pastes, KV for caching YouVersion metadata,
and static assets served from the same Worker. It also keeps the YouVersion app
key server-side, which is required (see below).

D1 over KV for paste storage: KV's free tier allows only ~1,000 writes/day,
which a document editor would exhaust; D1 allows ~100,000 writes/day and gives
real queries (e.g. "list documents owned by this user"), which the ownership
model needs. KV is still the right tool for caching Bible version metadata,
which is read-heavy and rarely written.

## Architecture

```
Browser (ProseMirror editor + reader view)
   |
   |  same-origin fetch; no API keys ever reach the client
   v
Cloudflare Worker  ──── D1      (pastes, ownership)
   |               ──── KV      (cached YouVersion version/language metadata)
   |
   |  X-YVP-App-Key (server-side secret)
   v
YouVersion Platform API
```

### Why the Worker must proxy YouVersion

The YouVersion app key is a server-side secret sent in the `X-YVP-App-Key`
header. It must **never** be shipped to the browser. All Bible text and metadata
requests go through our own Worker routes, which attach the key and cache the
response. This also lets us normalise responses and stay within rate limits.

## YouVersion Platform API Notes

Base URL: `https://api.youversion.com/v1`
Auth header: `X-YVP-App-Key: <secret>`

Hard-won details that will otherwise cost time:

- **`/v1/bibles` requires a language filter.** Omitting `language_ranges[]`
  returns HTTP 422. The bracket in the parameter name is literal.
- **`all_available=true`** is needed to see all platform translations. Without
  it you only get the versions enabled for your specific app key.
- **Passages return HTML by default.** Pass `format=text` when you want plain
  text rather than writing your own tag stripper.
- **References use USFM**, e.g. `JHN.3.16`. Version IDs are numeric (e.g. 3034).
- **Copyright attribution is mandatory** by the license agreement. Every rendered
  passage must display its version's copyright. Fetch it from the version
  metadata and cache it alongside.
- Pagination uses `page_size` / `page_token`, returning `next_page_token`.

The JavaScript SDK (`@youversion/platform-core`) wraps this:

```javascript
import { ApiClient, BibleClient } from "@youversion/platform-core";

const apiClient = new ApiClient({ appKey: env.YOUVERSION_APP_KEY });
const bibleClient = new BibleClient(apiClient);

const passage = await bibleClient.getPassage(3034, "JHN.3.16", "text");
const version = await bibleClient.getVersion(3034); // version.copyright
```

Use the SDK inside the Worker if it runs cleanly on workerd; otherwise call the
REST endpoints directly. Do not use it in the browser — that would leak the key.

## Authentication & Ownership

Sign in with YouVersion, using **OAuth 2.0 authorization code flow with PKCE**.
This replaces the old shared `ALLOWED_EDIT_CODES` scheme entirely.

- Authorize: `https://api.youversion.com/auth/authorize`
- Token: `POST https://api.youversion.com/auth/token`
- JWKS: `https://api.youversion.com/.well-known/jwks.json`
- Scopes: `openid` (required), `profile`, `email`

Rules:

- **`yvp_id` is the primary user identifier.** It is stable and unique. Store it
  as the owner key on each document; never key ownership off email, which can
  change.
- Verify token signatures against the JWKS endpoint. Do not trust unverified JWT
  claims.
- Only the owning `yvp_id` may edit or delete a document.
- Reading a public document requires no login at all — share links must work for
  a congregation member with no account.
- The token exchange happens in the Worker. Session state goes in an
  `HttpOnly`, `Secure`, `SameSite=Lax` cookie; access tokens never touch
  `localStorage`.

Chosen deliberately: users are pastors who largely already have YouVersion
accounts, and we already depend on YouVersion for Bible text, so this adds no
new vendor relationship.

### Storage decision

Paste content lives in **our own D1 database**. Storing documents in the user's
Google Drive was considered and rejected: it would break anonymous public share
links (the core of a pastebin), force a second identity provider, and require
the server to proxy Drive with a stored token anyway.

## The Editor

ProseMirror, targeting "paste from Google Docs and it looks right".

- Define a **deliberately small schema**. Headings, bold/italic, lists,
  blockquote, links, and the custom scripture node. Everything outside the
  schema is dropped on paste, which is what keeps Google Docs output clean.
- **Google Docs paste gotcha:** Docs wraps the entire clipboard payload in
  `<b style="font-weight:normal">`. Naively treating `<b>` as bold turns the
  whole paste bold. `prosemirror-schema-basic` already guards against this —
  keep that guard if the schema is customised. Docs also encodes bold/italic as
  inline styles rather than tags, so those must be converted to real marks
  before font styling is discarded.
- Use `transformPastedHTML` for any additional cleanup.
- Prefer standard ProseMirror packages (`prosemirror-state`, `-view`, `-model`,
  `-schema-list`, `-history`, `-keymap`, `-inputrules`) over hand-rolled
  equivalents.

### Scripture references

A **custom ProseMirror node**, not a text convention. The old app used a `&`
sigil (`John 3:16 &`) parsed by a marked.js extension; that was a Markdown
workaround and should not be recreated. Instead:

- Detect references as the user types (input rule) and offer to insert a
  scripture node.
- The node stores structured attributes (USFM book, chapter, verse range) — not
  the rendered text. Text is fetched and rendered at view time, so the reader's
  chosen translation applies.
- Book-name to USFM mapping can be lifted from
  `static/utils.js` on the `legacy-deno-biblebrain` branch, which has a complete
  table. Verify it against YouVersion's USFM codes before trusting it.

### Translation support

The reader-facing goal is that notes can be machine-translated while certain
text is protected. The old app used `&`-delimited spans emitting
`translate="no"`. In the rewrite this should be an **editor mark** ("do not
translate") that renders to `translate="no"`, rather than punctuation syntax.

Also carry over from the legacy viewer: detect RTL and set `dir="rtl"` on the
document element.

## UI Direction

Modern and clean, in the spirit of Google Docs or Office 365 — but deliberately
minimal. A small, well-executed feature set beats a crowded toolbar.

- Content-first: a centred document surface, generous whitespace, a real
  typographic scale.
- One slim toolbar with only what the schema supports. No feature the editor
  can't actually do.
- Must read well in non-Latin scripts and RTL — this is a global-ministry tool,
  so font stacks and line height need to survive Amharic, Arabic, and CJK.
- Light and dark themes.
- Use standard, well-maintained libraries rather than bespoke widgets.

## Commands

The toolchain is being established as part of the rewrite. Expected shape
(Workers + Vite + Wrangler):

```bash
npm install
npm run dev        # local dev via wrangler/vite
npm run build
npm run deploy     # wrangler deploy
npm run lint
npm run format
```

Update this section once `package.json` actually exists.

## Code Style

- TypeScript throughout, `strict` enabled.
- 2 space indentation, 80 character line width, double quotes, semicolons.
- Prettier + ESLint (replacing the old `deno fmt` / `deno lint`).
- Explicit types on exported/public functions.

## Secrets

Never commit secrets. Local values go in `.dev.vars` (gitignored); deployed
values are set with `wrangler secret put`.

- `YOUVERSION_APP_KEY` — Platform API key, server-side only
- `YOUVERSION_CLIENT_ID` / OAuth redirect URL
- `SESSION_SECRET` — for signing session cookies

The legacy `.env` on disk still holds the old Bible Brain `API_KEY` and
`ALLOWED_EDIT_CODES`; both are obsolete in the new design.

## Reference: The Legacy Implementation

Branch `legacy-deno-biblebrain` holds the complete previous app. Useful pieces:

- `static/utils.js` — Bible book name → USFM mapping, testament lookup
- `static/viewer.js` — language detection, RTL handling, translation dropdown
- `main.ts` — route shape (`/`, `/:id`, `/:id/edit`, `/:id/delete`, `/:id/raw`)
- `guide.md` — user-facing docs, mostly Markdown syntax that no longer applies

Large untracked data files from the Bible Brain era (`bibles.json`,
`bibles_text.json`, `completebibles.json`, `eda.ipynb`) were moved to
`../ScripturePad-legacy-untracked/`. They are DBT-shaped and not useful against
YouVersion, but were preserved rather than deleted.

## Build Order

1. Scaffold Worker + Vite + TypeScript; hello-world deploy to Cloudflare.
2. D1 schema and storage layer (documents, ownership by `yvp_id`).
3. YouVersion proxy routes + KV caching; confirm the API quirks above.
4. ProseMirror editor with the minimal schema and Google Docs paste handling.
5. Scripture node: detection, insertion, view-time rendering with copyright.
6. YouVersion OAuth and per-document ownership.
7. Reader view: translation switching, RTL, `translate="no"` handling.
8. UI polish pass.
