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
  it you only get the licence-free ones — for English that is 11 versions
  rather than 20, hiding the NIV, NASB, AMP, and NIrV.
- **Listed does not mean fetchable.** A licensed version appears in the list
  but its text returns **403** until the app key has agreed to that
  publisher's *fast-track licence* (e.g. "Biblica Fast-track Bible License"
  for the NIV). Agreement is a one-time action in the developer portal, not
  something the code can do. `GET /v1/licenses?bible_id=<id>` shows which
  licence governs a version; `agreed_dt: null` means it has not been accepted.
- The default English version is **NIVUK11 (id 113)** — licensed, so its
  copyright must appear wherever its text does. `FALLBACK_VERSION_ID` (BSB,
  3034) stays available as the licence-free option.
- **Passages return HTML by default.** Pass `format=text` when you want plain
  text rather than writing your own tag stripper.
- **References use USFM**, e.g. `JHN.3.16`. Version IDs are numeric (e.g. 3034).
- **Copyright attribution is mandatory** by the license agreement. Fetch it
  from the version metadata and cache it alongside the passage.
  Attribution is shown **once per page, in a colophon at the foot** — listing
  each version actually cited — rather than repeated under every passage.
  Repeating a long copyright string under each of a dozen citations makes
  sermon notes unreadable. One clear, complete credit per version satisfies the
  licence and reads better.
- Pagination uses `page_size` / `page_token`, returning `next_page_token`.

Verified against the live API with a real app key:

- **Language codes are normalised server-side.** `language_ranges[]` accepts
  both 2- and 3-letter codes (`en` and `eng` both work; `cmn` resolves to tag
  `zh`). Responses come back with a BCP-47 `language_tag` (`en`, not `eng`).
  The legacy app's hand-written ISO-639-3 remapping (`zh-CN`→`cmn`, `fa`→`pes`,
  `ara`→`arb`) is **not needed** — pass the browser language tag straight
  through.
- **`GET /v1/languages`** exists and returns `display_names` for each language
  in every other language, so a language picker can show each option in its own
  script without shipping a translation table.
- Version metadata carries `copyright` directly (BSB 3034 returns
  `"Public Domain"`), so attribution needs no extra request.
- **Passage ranges may not cross a chapter boundary.** The API accepts
  `SNG.2.1-5` (short form only) but 404s on every cross-chapter spelling —
  `SNG.2.1-SNG.3.5`, `SNG.2.1-3.5`, `SNG.2+SNG.3`. Even the redundant
  same-chapter form `SNG.2.1-SNG.2.5` fails. A reference like
  "Song of Songs 2:1-3:5" must therefore be **split into one request per
  chapter** and the results concatenated.
- `GET /v1/bibles/{id}/books/{book}/chapters` returns every chapter with its
  full verse list, which is where the per-chapter verse counts needed for that
  splitting come from. Cache it — it is static per version.
- **A language may have no Bibles at all.** `language_ranges[]=sw` returns
  **HTTP 204 with an empty body**, not a 200 with an empty array. Parsing the
  response as JSON without checking for 204 throws.
- **Rate limiting is aggressive and the penalty is long.** A handful of quick
  requests returns `429 Rate limit exceeded` with **`retry-after: 300`** — a
  five-minute lockout. No header advertises the actual quota. Consequences:
  aggressive KV caching is essential, multi-chapter spans are fetched
  **sequentially rather than with `Promise.all`**, and any bulk probing during
  development should be spaced out or it will lock the key for everyone.

### Known issue: Traditional Chinese

Traditional Chinese Bibles exist (ids **312** and **1392**, tagged
`zh-Hant-TW`), but filtering `language_ranges[]` on `zh-Hant-TW`, `zh-Hant`,
and `zh-TW` all returned empty during development, while plain `zh` returns
three Simplified versions. Verification was blocked by the rate limit above and
is **unfinished** — `baseLanguage()` currently maps Traditional locales to
`zh-Hant-TW` on the assumption the filter works once un-throttled. If it does
not, fetch those two ids directly rather than relying on the language filter.

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

### Remembered translation preferences

Once a user is signed in, remember their preferred Bible version **per
language**, keyed on `(yvp_id, language_tag)`. Preference is inherently
per-language: someone who reads BSB in English and a specific Swahili
translation should get both without re-picking each visit.

- Store in a `user_preferences` table, not in the document — the same document
  viewed by two people should honour each reader's own choice.
- Anonymous readers get the same behaviour backed by `localStorage`, so the
  feature degrades gracefully without a login and the signed-in path is a
  straight upgrade rather than a separate code path.
- Write the preference whenever the reader changes the version selector, not
  behind an explicit "save" action.

**A first-time visitor inherits the author's choice.** The document records the
version it was authored against (`documents.version_id`), so a congregation
member opening a share link gets the translation their pastor chose rather than
a generic default — which is almost always the one being preached from. It is
only a starting point: the moment the reader picks something else, their own
preference wins and is remembered.

Resolution order for which version to render:

1. The reader's own saved preference for that language (D1 if signed in,
   `localStorage` if not) — an explicit choice always wins.
2. The version the document was authored against, when it is available in the
   reader's language.
3. `DEFAULT_VERSION_ID` (BSB, license-free).

Step 2 is language-conditional: inheriting the author's English version is
wrong for a reader viewing the page in Swahili, so fall through to the default
for that language when the tags do not match.

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

A **custom ProseMirror node**, not a text convention.

**No sigil syntax of any kind.** The old app used `John 3:16 &`; an early draft
of the rewrite used `[John 3:16]`. Both are wrong for the same reason: asking a
non-technical pastor to type punctuation codes is exactly the "pseudo
programming" this rewrite exists to remove. If a feature needs a special
character to trigger it, that is a design failure.

Instead, references are **detected automatically** as the author types or
pastes. When one is found, an inline popup appears just beneath it offering
three citation styles:

| Style | Renders as |
| --- | --- |
| `block` | The passage as its own indented paragraph. **Default.** |
| `popover` | Reference stays inline; verse appears on hover or tap. |
| `inline` | Verse text flows into the sentence, in quotation marks. |

- Dismissing the popup (Esc, or clicking away) leaves the text as ordinary
  prose. Detection must never rewrite the document on its own.
- The same choice is available from a toolbar button for anyone who prefers to
  select text and act on it explicitly.
- Once dismissed for a given reference, do not re-prompt for it; nagging is
  worse than missing a citation.
- `popover` must degrade to visible text in print and in the static reader view
  — a hidden verse is useless on paper.

The node stores structured attributes (USFM book, chapter, verse range, and the
chosen `style`) — never the rendered text. Text is fetched at view time, so the
reader's chosen translation applies.

Book-name to USFM mapping lives in `src/shared/references.ts`, with the pattern
built as an alternation of known book names so ordinary prose cannot produce
false positives. It is unit-tested against `BOOK_IDS` from the YouVersion SDK.

### Translation support

The reader-facing goal is that notes can be machine-translated while certain
text is protected. The old app used `&`-delimited spans emitting
`translate="no"`. In the rewrite this should be an **editor mark** ("do not
translate") that renders to `translate="no"`, rather than punctuation syntax.

Also carry over from the legacy viewer: detect RTL and set `dir="rtl"` on the
document element.

#### The reader view must not be a ProseMirror instance

**Machine translation does not touch `contenteditable` regions.** Browser and
extension translators deliberately skip them, because rewriting text inside a
live editor would corrupt the document being edited. A read-only ProseMirror
view still mounts a `contenteditable` host, so a reader page built that way is
silently untranslatable — which defeats the point of the product.

Therefore the reader view renders **plain static DOM**, server-side, with no
editor attached. ProseMirror is loaded only when the author is actually
editing. Benefits beyond translation: readers do not download the editor
bundle, and the page has content in the initial HTML.

Two related requirements:

- **Content must be in the server-rendered HTML.** Translators scan the DOM on
  load; content injected later by JavaScript is missed even outside an editor.
- Keep `translate="no"` on scripture references, version names, and copyright
  strings — proper nouns and legal text should survive translation intact.
- **Mark the strings, not the container.** Our own UI wording — the colophon's
  "Scripture quotations" heading, button labels, empty states — *must* be
  translated along with the page; a French reader should see French chrome.
  Putting `translate="no"` on a wrapper to protect the version names inside it
  freezes that wording too. Apply the attribute to the individual proper nouns
  and licence notices only.

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
npm run dev        # http://localhost:8787 — Worker runs from source, hot reload
npm test
npm run build
npm run deploy     # build, then wrangler deploy
npm run lint
npm run format
```

**Use `npm run dev`, not `wrangler dev` directly.** `wrangler dev` serves the
built bundle in `dist/`, so worker edits appear to do nothing until a rebuild —
a confusing failure that looks like broken code. `vite dev` runs the Worker
from source instead.

The port is pinned to **8787** in two places, `vite.config.ts` (`server.port`,
with `strictPort`) and `wrangler.jsonc` (`dev.port`). Vite defaults to 5173 and
does not inherit the wrangler setting. The port must stay fixed because it is
half of the OAuth callback URL registered with YouVersion; a moving port breaks
sign-in.

## Code Style

- TypeScript throughout, `strict` enabled.
- 2 space indentation, 80 character line width, double quotes, semicolons.
- Prettier + ESLint (replacing the old `deno fmt` / `deno lint`).
- Explicit types on exported/public functions.

## Deployment

Target: **scripturepad.org**, on Cloudflare Workers.

```bash
npm run db:migrate:remote   # apply migrations to the live D1 database
npm run deploy              # build and publish the Worker
```

Bindings live in `wrangler.jsonc`; secrets are set with `wrangler secret put`
and are never committed.

### Putting the domain on Cloudflare

`scripturepad.org` is registered through Squarespace (which absorbed Google
Domains) and still resolves via `ns-cloud-*.googledomains.com`. A Worker cannot
serve a custom domain until Cloudflare is authoritative for the zone:

1. Cloudflare dashboard → **Add a domain** (older docs and the CLI still call
   this "add a site") → `scripturepad.org`. Choose the **Free** plan, which is
   below the paid tiers in the list, and let it scan the existing records.
2. Delete the two stale records it imports. Both are dead Deno Deploy
   endpoints — the apex `A 34.120.54.55` and `AAAA 2600:1901:0:6d85::` still
   answer with `server: deno/gcp-us-west4` and a 404.
3. Squarespace → **Domains → DNS → Nameservers** → replace the Google ones with
   the two Cloudflare gives you. Propagation is usually under an hour.
4. Once the zone is active, uncomment the `routes` block in `wrangler.jsonc`
   and `npm run deploy`.

The zone is currently clean: no MX, TXT, CNAME, or subdomain records, so
nothing else breaks in the move. Anything added later (email, domain
verification) must go in Cloudflare, not Google.

### OAuth registration

**There is no separate OAuth client id to obtain.** YouVersion uses the
**app key as the `client_id`** — the same value already used for the API. The
`YOUVERSION_CLIENT_ID` secret exists only as an override should they split the
two later; leave it blank and `clientId()` falls back to the app key.

What *does* need registering, in the app's settings at platform.youversion.com,
is the **callback URL**. It must match `redirect_uri` exactly or the authorize
call is rejected:

- `http://localhost:8787/auth/callback` (local development — this is why the
  dev port is pinned in `wrangler.jsonc`)
- `https://scripturepad.org/auth/callback` (production)

The authorize request must include `nonce` alongside `state`: `state` defends
against CSRF, `nonce` against replay, and the id token echoes the nonce back
for checking.

**`run_worker_first` is required for `/auth/*` and `/api/*`.** With
`not_found_handling: "single-page-application"`, Cloudflare's asset layer
answers browser *navigations* with `index.html` before the Worker runs, so
`/auth/signin` rendered the SPA's "no document at this address" page instead of
redirecting. The trap is that it only reproduces with browser headers —
`curl` without `Sec-Fetch-Mode: navigate` still sees the correct 302, so the
routes look fine from the command line. Reproduce it with:

```bash
curl -sID - -H 'Sec-Fetch-Mode: navigate' -H 'Accept: text/html' \
  http://localhost:8787/auth/signin
```

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
