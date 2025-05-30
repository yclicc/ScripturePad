import xss from "xss";
import { Marked } from "marked";
import { load } from "std/dotenv/mod.ts";
import { resolve } from "std/path/mod.ts";
import { walk } from "std/fs/mod.ts";
import { Router } from "./router.ts";
import { Paste, storage } from "./storage.ts";
import {
  deletePage,
  editPage,
  errorPage,
  guidePage,
  homePage,
  pastePage,
} from "./templates.ts";
import {
  scriptureReftagExtension,
  noTranslateExtension,
} from "./static/utils.js";

interface TocItem {
  level: number;
  text: string;
  anchor: string;
  subitems: TocItem[];
}

await load({ export: true });

const SERVER_PORT = Deno.env.get("SERVER_PORT") ?? 8000;
const API_KEY = Deno.env.get("API_KEY");
const API_URL = "https://4.dbt.io/api/";
const API_VERSION_NUMBER = 4;
const STATIC_ROOT = resolve("./static");
// Flag to refresh cache instead of using cached values
const REFRESH_CACHE = Deno.env.get("REFRESH_CACHE") === "true";

// Get allowed edit codes from environment
const ALLOWED_EDIT_CODES_STR = Deno.env.get("ALLOWED_EDIT_CODES") ?? "";
const ALLOWED_EDIT_CODES = ALLOWED_EDIT_CODES_STR.split(",").map((code) =>
  code.trim(),
);

// Function to check if an edit code is in the allowed list
function isAllowedEditCode(editCode: string): boolean {
  return ALLOWED_EDIT_CODES.includes(editCode);
}
const FILES = new Map<string, string>();
const MIMES: Record<string, string> = {
  js: "text/javascript",
  css: "text/css",
  ico: "image/vnd.microsoft.icon",
};

const XSS_OPTIONS = {
  whiteList: {
    ...xss.whiteList,
    // allow heading elements to have `id=` attributes
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
    input: ["disabled", "type", "checked"],
    span: ["translate"],
    "x-bibleref": [
      "data-book",
      "data-chapter",
      "data-start-verse",
      "data-end-verse",
    ],
  },
};

for await (const file of walk(STATIC_ROOT)) {
  if (file.isFile) {
    FILES.set("/" + file.name.normalize(), file.path);
  }
}

const generateId = uid();
const app = new Router();

app.get("*", async (req) => {
  const url = new URL(req.url);
  const filepath = FILES.get(url.pathname);

  if (filepath) {
    const [ext] = filepath.split(".").slice(-1);
    const contentType = MIMES[ext] ?? "text/plain";
    const file = await Deno.open(filepath, { read: true });
    const readableStream = file.readable;
    return new Response(readableStream, {
      status: 200,
      headers: {
        "content-type": contentType,
      },
    });
  }
});

app.get("/", () => {
  return new Response(homePage(), {
    status: 200,
    headers: { "content-type": "text/html" },
  });
});

app.get("/guide", async () => {
  const guideMd = await Deno.readTextFile("./guide.md");
  const parse = createParser();
  const { html, title } = parse(guideMd, { toc: false });

  return new Response(guidePage({ html, title }), {
    status: 200,
    headers: { "content-type": "text/html" },
  });
});

app.get("/:id", async (_req, params) => {
  let contents = "";
  let status = 200;
  const id = (params.id as string) ?? "";
  const res = await storage.get(id);

  if (res.value !== null) {
    const parse = createParser();
    const { paste } = res.value;

    let { html, title } = parse(paste);
    html = xss(html, XSS_OPTIONS);
    if (!title) title = id;

    contents = pastePage({ id, html, title });
    status = 200;
  } else {
    contents = errorPage();
    status = 404;
  }

  return new Response(contents, {
    status,
    headers: {
      "content-type": "text/html",
    },
  });
});

app.get("/:id/edit", async (_req, params) => {
  let contents = "";
  let status = 200;
  const id = (params.id as string) ?? "";
  const res = await storage.get(id);

  if (res.value !== null) {
    const { editCode, paste } = res.value;
    const hasEditCode = Boolean(editCode);
    contents = editPage({ id, paste, hasEditCode });
    status = 200;
  } else {
    contents = errorPage();
    status = 404;
  }

  return new Response(contents, {
    status,
    headers: {
      "content-type": "text/html",
    },
  });
});

app.get("/:id/delete", async (_req, params) => {
  let contents = "";
  let status = 200;

  const id = (params.id as string) ?? "";
  const res = await storage.get(id);

  if (res.value !== null) {
    const { editCode } = res.value;
    const hasEditCode = Boolean(editCode);
    contents = deletePage({ id, hasEditCode });
  } else {
    contents = errorPage();
    status = 404;
  }

  return new Response(contents, {
    status,
    headers: {
      "content-type": "text/html",
    },
  });
});

app.get("/:id/raw", async (_req, params) => {
  let contents = "";
  let status = 200;
  const id = (params.id as string) ?? "";
  const res = await storage.get(id);

  if (res.value !== null) {
    const { paste } = res.value;
    contents = paste;
    status = 200;
  } else {
    contents = errorPage();
    status = 404;
  }

  return new Response(contents, {
    status,
    headers: {
      "content-type": "text/plain",
    },
  });
});

app.post("/save", async (req) => {
  let status = 302;
  let contents = "";
  const headers = new Headers({
    "content-type": "text/html",
  });

  const form = await req.formData();
  const customUrl = form.get("url") as string;
  const paste = form.get("paste") as string;
  const slug = createSlug(customUrl);

  let editCode: string | undefined = form.get("editcode") as string;
  if (typeof editCode === "string") {
    editCode = editCode.trim() || undefined;
  }

  // Check if the edit code is in the allowed list
  if (!editCode || !isAllowedEditCode(editCode)) {
    status = 422;

    contents = homePage({
      paste,
      url: customUrl,
      errors: {
        editCode:
          "Invalid edit code. You must provide an authorized edit code to create content.",
      },
    });

    return new Response(contents, {
      status,
      headers,
    });
  }

  if (slug.length > 0) {
    const res = await storage.get(slug);

    if (slug === "guide" || res.value !== null) {
      status = 422;

      contents = homePage({
        paste,
        url: customUrl,
        errors: { url: `url unavailable: ${customUrl}` },
      });
    } else {
      await storage.set(slug, { paste, editCode });
      status = 302;
      headers.set("location", "/" + slug.trim());
    }
  } else {
    let id = "";
    let exists = true;

    for (; exists; ) {
      id = generateId();
      exists = await storage.get(id).then((r) => r.value !== null);
    }

    await storage.set(id, { paste, editCode });
    status = 302;
    headers.set("location", "/" + id.trim());
  }

  return new Response(contents, {
    status,
    headers,
  });
});

app.post("/:id/save", async (req, params) => {
  let contents = "302";
  let status = 302;

  const id = (params.id as string) ?? "";
  const form = await req.formData();
  const paste = form.get("paste") as string;
  let editCode: string | undefined = form.get("editcode") as string;
  if (typeof editCode === "string") {
    editCode = editCode.trim() || undefined;
  }

  const headers = new Headers({
    "content-type": "text/html",
  });

  if (id.trim().length === 0) {
    headers.set("location", "/");
  } else {
    const res = await storage.get(id);
    const existing = res.value as Paste;
    const hasEditCode = Boolean(existing.editCode);

    // First check if edit code is in the allowed list for new edits
    if (!editCode || !isAllowedEditCode(editCode)) {
      status = 400;
      contents = editPage({
        id,
        paste,
        hasEditCode,
        errors: {
          editCode:
            "Invalid edit code. You must provide an authorized edit code to edit content.",
        },
      });
    }
    // Then check if it matches the original edit code (if there was one)
    else if (hasEditCode && existing.editCode !== editCode) {
      // editCode mismatch with the original
      status = 400;
      contents = editPage({
        id,
        paste,
        hasEditCode,
        errors: {
          editCode:
            "Invalid edit code. This doesn't match the code used to create this content.",
        },
      });
    } else {
      // Edit code is valid and matches (if required)
      await storage.set(id, { ...existing, paste });
      headers.set("location", "/" + id);
    }
  }

  return new Response(contents, {
    status,
    headers,
  });
});

app.post("/:id/delete", async (req, params) => {
  let contents = "302";
  let status = 302;
  const headers = new Headers({
    "content-type": "text/html",
  });

  const id = (params.id as string) ?? "";
  const form = await req.formData();
  let editCode: string | undefined = form.get("editcode") as string;
  if (typeof editCode === "string") {
    editCode = editCode.trim() || undefined;
  }

  if (id.trim().length === 0) {
    headers.set("location", "/");
  } else {
    const res = await storage.get(id);
    const existing = res.value as Paste;
    const hasEditCode = Boolean(existing.editCode);

    // First check if edit code is in the allowed list
    if (!editCode || !isAllowedEditCode(editCode)) {
      status = 400;
      contents = deletePage({
        id,
        hasEditCode,
        errors: {
          editCode:
            "Invalid edit code. You must provide an authorized edit code to delete content.",
        },
      });
    }
    // Then check if it matches the original edit code (if there was one)
    else if (hasEditCode && existing.editCode !== editCode) {
      // editCode mismatch with the original
      status = 400;
      contents = deletePage({
        id,
        hasEditCode,
        errors: {
          editCode:
            "Invalid edit code. This doesn't match the code used to create this content.",
        },
      });
    } else {
      // Edit code is valid and matches (if required)
      await storage.delete(id);
      headers.set("location", "/");
    }
  }

  return new Response(contents, {
    status,
    headers,
  });
});

function sortByKey(array: any[], key) {
  console.log(array);
  return array.sort((a, b) => {
    if (a[key] < b[key]) {
      return -1;
    }
    if (a[key] > b[key]) {
      return 1;
    }
    return 0; // values are equal
  });
}

async function get_paginated(url, sortKey?: string, pageSize = 10) {
  let allResults: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const fullUrl = `${url}&limit=${pageSize}&page=${page}`;
    console.log(fullUrl);
    const externalResponse = await fetch(fullUrl, {
      method: "GET",
    });
    const data = await externalResponse.json();
    console.log(data);
    allResults = allResults.concat(data.data);

    // Check if there are more pages
    const total_pages =
      data.meta.pagination.total_pages || data.meta.pagination.last_page;
    hasMore = total_pages > page;
    page += 1;
  }

  if (typeof sortKey !== "undefined") {
    allResults = sortByKey(allResults, sortKey);
  }

  const responseBody = JSON.stringify(allResults);
  return new Response(responseBody, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function hasWholeBible(bible) {
  let hasOt = false;
  let hasNt = false;

  const filesets = bible.filesets?.["dbp-prod"] || [{ type: null }];

  for (let item of filesets) {
    if (["text_format", "text_plain"].includes(item.type)) {
      let size = item.size;
      if (size.includes("OT") && !size.includes("OTP")) {
        hasOt = true;
      } else if (size.includes("NT") && !size.includes("NTP")) {
        hasNt = true;
      } else if (size === "C") {
        hasOt = true;
        hasNt = true;
      }
    }
  }

  return hasOt && hasNt;
}

function collectCompleteBibles(data) {
  const completeBibles = {};

  for (let bible of data) {
    const { language, autonym, iso, name, vname, filesets } = bible;

    if (hasWholeBible(bible)) {
      if (!completeBibles[language]) {
        completeBibles[language] = {
          autonym: autonym,
          iso: iso,
          bibles: {},
        };
      }

      const storedName =
        vname !== null && vname !== name ? `${name} (${vname})` : name;

      // Add the Bible name and its filesets to the appropriate language
      completeBibles[language].bibles[storedName] = filesets;
    }
  }

  // Sort languages alphabetically
  const sortedLanguages = Object.keys(completeBibles).sort();

  const sortedCompleteBibles = {};

  // Sort the Bibles for each language alphabetically by Bible name
  for (let lang of sortedLanguages) {
    const bibles = completeBibles[lang].bibles;
    const sortedBibles = Object.keys(bibles)
      .sort()
      .reduce((sorted, bibleName) => {
        sorted[bibleName] = bibles[bibleName];
        return sorted;
      }, {});

    sortedCompleteBibles[lang] = {
      autonym: completeBibles[lang].autonym,
      iso: completeBibles[lang].iso,
      bibles: sortedBibles,
    };
  }

  return sortedCompleteBibles;
}

app.get("/api/completebibles", async (req) => {
  const cache = await caches.open("data-cache");
  const cached = await cache.match(req);
  if (cached && !REFRESH_CACHE) {
    return cached;
  }

  var responseBody;
  if (false) {
    responseBody = await Deno.readFile("./completebibles.json");
  } else {
    const intermediate_response = await get_paginated(
      `${API_URL}bibles?key=${API_KEY}&v=${API_VERSION_NUMBER}&media=text_plain`,
      undefined,
      10,
    );
    const data = await intermediate_response.clone().json();

    const sortedCompleteBibles = collectCompleteBibles(data);
    responseBody = JSON.stringify(sortedCompleteBibles);
  }

  const res = new Response(responseBody, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  await cache.put(req, res.clone());
  return res;
});

app.get(
  "/api/defaultbible",
  async (req, params, query) => {
    const language = query.get("language_code");
    const externalResponse = await fetch(
      `${API_URL}bibles/defaults/types?language_code=${language}&key=${API_KEY}&v=${API_VERSION_NUMBER}`,
      {
        method: "GET",
      },
    );

    const responseBody = await externalResponse.text();
    return new Response(responseBody, {
      status: externalResponse.status,
      headers: { "content-type": "application/json" },
    });
  },
  true,
);

app.get(
  "/api/bibletext/:fileset_id/:book/:chapter",
  async (req, params, query) => {
    const fileset_id = params.fileset_id as string;
    const book = params.book as string;
    const chapter = params.chapter as string;
    const verse_start = query.get("verse_start");
    const verse_end = query.get("verse_end");

    // Construct the DBT API URL
    let url = `${API_URL}bibles/filesets/${fileset_id}/${book}/${chapter}?key=${API_KEY}&v=${API_VERSION_NUMBER}`;

    // Add optional verse parameters if they exist
    if (verse_start) {
      url += `&verse_start=${verse_start}`;

      // If no end verse specified but start verse is specified, use start verse as end verse too
      // This ensures we only get the single verse when only one is requested
      if (!verse_end) {
        url += `&verse_end=${verse_start}`;
      } else {
        url += `&verse_end=${verse_end}`;
      }
    }

    console.log(`Fetching scripture from: ${url}`);

    const externalResponse = await fetch(url, {
      method: "GET",
    });

    const responseBody = await externalResponse.text();
    return new Response(responseBody, {
      status: externalResponse.status,
      headers: { "content-type": "application/json" },
    });
  },
  true,
);

app.get(
  "/api/copyright/:bible_id",
  async (req, params, query) => {
    const bible_id = params.bible_id as string;
    const iso = query.get("iso") || "eng"; // Default to English if no language specified

    // Construct the DBT API URL for copyright information
    // The DBT API expects only the bible_id parameter
    const url = `${API_URL}bibles/${bible_id}/copyright?key=${API_KEY}&v=${API_VERSION_NUMBER}&iso=${iso}`;

    console.log(`Fetching copyright from: ${url}`);

    try {
      const externalResponse = await fetch(url, {
        method: "GET",
      });

      // Log the response for debugging
      const responseText = await externalResponse.text();
      console.log(`Copyright API response for ${bible_id}: ${responseText}`);

      // Create a new response with the same content
      return new Response(responseText, {
        status: externalResponse.status,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      console.error(`Error fetching copyright: ${error.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch copyright information" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  },
  true,
);

Deno.serve({ port: Number(SERVER_PORT) }, app.handler.bind(app));

function createParser() {
  const tocItems: TocItem[] = [];

  const renderer = {
    heading(text: string, level: number) {
      const anchor = createSlug(text);
      const newItem = { level, text, anchor, subitems: [] };

      tocItems.push(newItem);
      return `<h${level} id="${anchor}"><a href="#${anchor}">${text}</a></h${level}>`;
    },
  };

  const marked = new Marked({ renderer, breaks: true });
  marked.use({ extensions: [scriptureReftagExtension, noTranslateExtension] });
  const parse = (markdown: string, { toc = true } = {}) => {
    let html = marked.parse(markdown) as string;
    const title = tocItems[0] ? tocItems[0].text : "";

    if (toc) {
      const tocHtml = buildToc(tocItems);
      if (tocHtml) html = html.replace(/\[\[\[TOC\]\]\]/g, tocHtml);
    }

    return { title, html };
  };

  return parse;
}

function createSlug(text = "") {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const slug = lines[i]
      .toString()
      .toLowerCase()
      .replace(/\s+/g, "-") // Replace spaces with -
      .replace(/[^\w\-]+/g, "") // Remove all non-word chars
      .replace(/\-\-+/g, "-") // Replace multiple - with single -
      .replace(/^-+/, "") // Trim - from start of text
      .replace(/-+$/, ""); // Trim - from end of text

    if (slug.length > 0) return slug;
  }

  return "";
}

function uid() {
  // https://github.com/lukeed/uid
  // MIT License
  // Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
  let IDX = 36,
    HEX = "";
  while (IDX--) HEX += IDX.toString(36);

  return () => {
    let str = "",
      num = 6;
    while (num--) str += HEX[(Math.random() * 36) | 0];
    return str;
  };
}

function buildToc(items: TocItem[] = []) {
  let html = "";

  while (items.length > 0) {
    html += buildNestedList(items, 1);
  }

  return html ? `<div class="toc">${html}</div>` : html;
}

function buildNestedList(items: TocItem[] = [], level: number) {
  let html = "<ul>";

  while (items.length > 0 && items[0].level === level) {
    const item = items.shift();
    if (item) html += `<li><a href="#${item.anchor}">${item.text}</a></li>`;
  }

  while (items.length > 0 && items[0].level > level) {
    html += buildNestedList(items, level + 1);
  }

  return html + "</ul>";
}
