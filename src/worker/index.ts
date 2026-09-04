import { Hono } from "hono";
import type { Env, SessionUser, Variables } from "./env.ts";
import {
  getSessionUser,
  handleCallback,
  purgeExpiredSessions,
  signOut,
  startSignIn,
} from "./auth.ts";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocumentsByOwner,
  updateDocument,
} from "./storage.ts";
import { getHttpStatus } from "@youversion/platform-core";
import { canEdit } from "./ownership.ts";
import {
  DEFAULT_VERSION_ID,
  fetchPassage,
  fetchReference,
  listVersions,
} from "./youversion.ts";
import { parseReference } from "../shared/references.ts";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Resolve the session once per request, before any route runs.
app.use("*", async (c, next) => {
  c.set("user", await getSessionUser(c.req.raw, c.env));
  await next();
});

app.get("/auth/signin", async (c) =>
  startSignIn(c.req.raw, c.env, c.req.query("return_to") ?? "/"),
);

app.get("/auth/callback", async (c) => {
  // Opportunistic cleanup, after the response so the user does not wait.
  c.executionCtx.waitUntil(purgeExpiredSessions(c.env));
  return handleCallback(c.req.raw, c.env);
});

app.post("/auth/signout", async (c) => signOut(c.req.raw, c.env));

/** Who is signed in, for the client to render the account control. */
app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json(
    user ? { signedIn: true, name: user.displayName, avatar: user.avatarUrl }
         : { signedIn: false },
  );
});

/**
 * The signed-in user's `yvp_id`, or null.
 *
 * Populated by middleware so every route sees the same resolved identity.
 */
function getUser(c: { get: (key: "user") => SessionUser | null }): string | null {
  return c.get("user")?.yvpId ?? null;
}

const api = new Hono<{ Bindings: Env; Variables: Variables }>();

api.get("/passage", async (c) => {
  const ref = c.req.query("ref");
  const versionParam = c.req.query("version");

  if (!ref) {
    return c.json({ error: "Missing `ref` query parameter" }, 400);
  }

  const versionId = versionParam ? Number(versionParam) : DEFAULT_VERSION_ID;
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return c.json({ error: "Invalid `version`" }, 400);
  }

  // A structured reference is preferred, because it can describe a range that
  // crosses a chapter — something a single USFM identifier cannot express.
  const parsed = parseReference(ref);

  try {
    if (parsed) {
      return c.json(await fetchReference(c.env, parsed, versionId));
    }

    // Fall back to a raw USFM identifier, e.g. "JHN.3.16".
    if (/^[A-Z0-9]{3}\.\d/i.test(ref)) {
      return c.json(await fetchPassage(c.env, ref.toUpperCase(), versionId));
    }

    return c.json({ error: `Could not parse reference: ${ref}` }, 400);
  } catch (error) {
    const status = getHttpStatus(error);
    if (status === 404) {
      return c.json({ error: `No such passage: ${ref}` }, 404);
    }
    if (status === 403) {
      // Listed but not licensed to this app key; see CLAUDE.md.
      return c.json(
        { error: "This translation is not licensed for use here." },
        403,
      );
    }
    if (status === 429) {
      return c.json({ error: "Too many requests — please retry." }, 429);
    }
    console.error("passage fetch failed", { ref, versionId, error });
    return c.json({ error: "Could not fetch passage" }, 502);
  }
});

api.get("/versions", async (c) => {
  // The API requires a language filter, so default rather than 422 the caller.
  const language = c.req.query("language") ?? "eng";

  try {
    // May legitimately be empty: some languages have no Bible on the platform.
    return c.json(await listVersions(c.env, language));
  } catch (error) {
    console.error("version list failed", { language, error });
    return c.json({ error: "Could not list versions" }, 502);
  }
});

/** The signed-in user's own documents, newest first. */
api.get("/documents", async (c) => {
  const owner = getUser(c);
  if (!owner) return c.json({ error: "Sign in to see your notes." }, 401);

  const documents = await listDocumentsByOwner(c.env, owner);

  // Content is deliberately omitted: a list view only needs the metadata, and
  // sending every document's full body would be wasteful.
  return c.json(
    documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
    })),
  );
});

api.get("/documents/:id", async (c) => {
  const doc = await getDocument(c.env, c.req.param("id"));
  if (!doc) return c.json({ error: "Not found" }, 404);

  return c.json({
    id: doc.id,
    title: doc.title,
    content: JSON.parse(doc.content),
    sourceLang: doc.sourceLang,
    // A first-time reader inherits the author's translation choice.
    versionId: doc.versionId,
    updatedAt: doc.updatedAt,
    canEdit: canEdit(doc.ownerId, getUser(c)),
  });
});

api.post("/documents", async (c) => {
  // Creation requires an account. An anonymous document would have a null
  // owner, which `canEdit` treats as locked — so it could never be edited or
  // deleted by anyone, leaving undeletable content and an open spam vector.
  const owner = getUser(c);
  if (!owner) {
    return c.json({ error: "Sign in to save notes." }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("content" in body)) {
    return c.json({ error: "Expected a JSON body with `content`" }, 400);
  }

  const { content, title, sourceLang, versionId } = body as {
    content: unknown;
    title?: unknown;
    sourceLang?: unknown;
    versionId?: unknown;
  };

  const doc = await createDocument(c.env, {
    ownerId: owner,
    title: typeof title === "string" ? title.slice(0, 300) : "",
    content: JSON.stringify(content),
    sourceLang: typeof sourceLang === "string" ? sourceLang : "en",
    // Recorded so readers inherit the translation the author wrote against.
    versionId:
      typeof versionId === "number" && Number.isInteger(versionId)
        ? versionId
        : null,
  });

  return c.json({ id: doc.id }, 201);
});

api.put("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const doc = await getDocument(c.env, id);
  if (!doc) return c.json({ error: "Not found" }, 404);

  if (!canEdit(doc.ownerId, getUser(c))) {
    return c.json({ error: "Not allowed to edit this document" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("content" in body)) {
    return c.json({ error: "Expected a JSON body with `content`" }, 400);
  }

  const { content, title } = body as { content: unknown; title?: unknown };

  await updateDocument(c.env, id, {
    title: typeof title === "string" ? title.slice(0, 300) : doc.title,
    content: JSON.stringify(content),
  });

  return c.json({ ok: true });
});

api.delete("/documents/:id", async (c) => {
  const id = c.req.param("id");
  const doc = await getDocument(c.env, id);
  if (!doc) return c.json({ error: "Not found" }, 404);

  if (!canEdit(doc.ownerId, getUser(c))) {
    return c.json({ error: "Not allowed to delete this document" }, 403);
  }

  await deleteDocument(c.env, id);
  return c.json({ ok: true });
});

app.route("/api", api);

// Anything not handled above is a client-side route; the SPA fallback in
// wrangler.jsonc serves index.html.
/** Escape text destined for an HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serve a document page with its title in the HTML.
 *
 * Link previews (WhatsApp, Slack, Discord, Facebook) fetch the page and never
 * run JavaScript, so setting `document.title` client-side leaves every shared
 * link showing a generic card. The tags have to be in the served markup.
 *
 * The Worker already runs on this route and the reader already loads the
 * document, so this adds no request the site was not making anyway.
 */
async function documentPage(
  c: { env: Env; req: { raw: Request } },
  id: string,
): Promise<Response | null> {
  const doc = await getDocument(c.env, id).catch(() => null);
  if (!doc) return null;

  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (!asset.ok) return asset;

  const title = doc.title.trim() || "Untitled note";
  const url = new URL(c.req.raw.url);
  const pageUrl = `${url.origin}/${doc.id}`;
  const description =
    "Sermon notes on ScripturePad — readable in your language, with " +
    "scripture shown in a published Bible translation.";

  return new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(`${title} — ScripturePad`);
      },
    })
    .on("head", {
      element(element) {
        const safeTitle = escapeAttribute(title);
        const safeDescription = escapeAttribute(description);
        element.append(
          `<meta property="og:title" content="${safeTitle}">` +
            `<meta property="og:description" content="${safeDescription}">` +
            `<meta property="og:type" content="article">` +
            `<meta property="og:url" content="${escapeAttribute(pageUrl)}">` +
            `<meta property="og:site_name" content="ScripturePad">` +
            `<meta name="twitter:card" content="summary">` +
            `<meta name="twitter:title" content="${safeTitle}">` +
            `<meta name="twitter:description" content="${safeDescription}">` +
            `<meta name="description" content="${safeDescription}">`,
          { html: true },
        );
      },
    })
    .transform(asset);
}

// Document pages get their title injected; everything else is served as-is.
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  // Only slug-shaped paths are documents; assets and files are not.
  if (!/^[a-z0-9]{4,16}$/.test(id)) return c.env.ASSETS.fetch(c.req.raw);

  return (await documentPage(c, id)) ?? c.env.ASSETS.fetch(c.req.raw);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
