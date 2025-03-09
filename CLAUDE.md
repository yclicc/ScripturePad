# ScripturePad Development Guide

## Project Purpose
ScripturePad is a pastebin specifically designed for translatable sermon notes with Bible reference integration. This fork of mdbin adds:
- Bible reference detection and integration with BibleBrain API
- Multi-language support for global ministry use
- Customized UI for better readability across languages

## Current Focus
- Completing Bible reference detection and integration
- Enhancing multi-language support
- Implementing automatic scripture insertion
- Improving UI for non-Latin scripts

## Commands
```bash
# Run the application
deno task start

# Run in development mode with file watching
deno task dev

# Format code
deno fmt

# Lint code
deno lint
```

## Code Style
- TypeScript with Deno conventions
- 2 space indentation
- 80 character line width
- Use double quotes (recent change from single quotes)
- Proper type annotations
- Follow Deno's recommended style

## Project Structure
- `main.ts` - Application entry point
- `router.ts` - HTTP routing logic
- `storage.ts` - Data persistence (Deno KV)
- `templates.ts` - HTML templates
- `static/` - Frontend assets
- `completebibles.json` - Cached Bible translation data

## Key Features
- Markdown editing with Bible reference integration
- Multi-language support
- Paste protection with edit codes