# ScripturePad

A pastebin for Markdown, intended for us for translateable sermon notes (etc). Allows creation and sharing of Markdown instantly, and locking documents with edit codes.

Easily and freely self-hostable on Deno Deploy.

A fork of [mdbin](https://github.com/kevinfiol/mdbin)

## Todo
- [ ] Change theme to make it a bit more cheerful
- [ ] Add detection of scripture references, and enforce that they must be present to submit a paste (just to avoid spam with irrelevant pastes)
- [ ] Insert scriptures automatically using the BibleBrain API
- [ ] Add a language/translation selector

## Original mdbin TODO
- [ ] Add SQLite for self-hosting on bare metal
- [ ] Docker/Podman file
- [x] Table of Contents support
- [x] Clickable anchor links
- [x] How-to + Source link
- [x] Set arbitrary paste limit
- [ ] Error handling for Deno KV/SQLite issues
- [ ] code highlighting
- [ ] TOC in preview
- [ ] use es6 modules for frontend js
- [ ] edit history
