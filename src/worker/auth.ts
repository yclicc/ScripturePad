import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env, SessionUser } from "./env.ts";

/**
 * PKCE is implemented here rather than taken from the SDK: the SDK's
 * `SignInWithYouVersionPKCEAuthorizationRequestBuilder` exists in the bundle
 * but is not exported from any public entry point, and reaching into its
 * internals would break on any release. The flow is small and standard.
 */
const AUTHORIZE_URL = "https://api.youversion.com/auth/authorize";
const TOKEN_URL = "https://api.youversion.com/auth/token";

/**
 * The OAuth `client_id` is the YouVersion **app key** — there is no separate
 * credential to obtain. `YOUVERSION_CLIENT_ID` exists only as an override for
 * the unlikely case they split the two later; normally it is left unset.
 *
 * What *does* have to be registered at platform.youversion.com is the callback
 * URL, which must match `redirect_uri` exactly or the authorize call is
 * rejected.
 */
function clientId(env: Env): string {
  const override = env.YOUVERSION_CLIENT_ID?.trim();
  if (override && override !== "your-client-id" && !override.startsWith("pending")) {
    return override;
  }
  return env.YOUVERSION_APP_KEY;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomUrlSafeString(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** S256 challenge: the SHA-256 of the verifier, base64url encoded. */
async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(digest);
}

/**
 * Sign in with YouVersion, using OAuth 2.0 authorization code flow with PKCE.
 *
 * The whole exchange happens in the Worker. The browser only ever holds an
 * opaque session cookie — access tokens never reach client JavaScript, where
 * an XSS would leak them.
 */

const SESSION_COOKIE = "sp_session";
const PKCE_COOKIE = "sp_pkce";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

interface PkceState {
  codeVerifier: string;
  state: string;
  /** Replay protection; echoed back in the id token and checked. */
  nonce: string;
  /** Where to send the user once signed in. */
  returnTo: string;
}

function cookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  // Secure breaks plain-HTTP localhost, so it is conditional on the origin.
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

/** Begin sign-in: build the authorize URL and stash the PKCE verifier. */
export async function startSignIn(
  request: Request,
  env: Env,
  returnTo: string,
): Promise<Response> {
  const url = new URL(request.url);
  const redirectUri = new URL("/auth/callback", url.origin).toString();

  const codeVerifier = randomUrlSafeString();
  const state = randomUrlSafeString(16);
  const nonce = randomUrlSafeString(16);

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId(env));
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("code_challenge", await codeChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const pkce: PkceState = { codeVerifier, state, nonce, returnTo };

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      // Short-lived: it only has to survive the round trip to YouVersion.
      "set-cookie": cookie(
        PKCE_COOKIE,
        btoa(JSON.stringify(pkce)),
        600,
        isSecure(request),
      ),
    },
  });
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

/**
 * YouVersion's public keys, used to verify token signatures.
 *
 * `createRemoteJWKSet` caches the key set and refetches on rotation, so this is
 * created once per isolate rather than per request.
 */
const JWKS = createRemoteJWKSet(
  new URL("https://api.youversion.com/.well-known/jwks.json"),
);

/**
 * Verify a token and return its claims.
 *
 * The signature must be checked: an unverified JWT is attacker-controlled
 * input, and its `yvp_id` is what we key document ownership on. Trusting a
 * decoded-but-unverified payload would let anyone forge any identity.
 */
async function verifyToken(
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://api.youversion.com",
    });
    return payload as Record<string, unknown>;
  } catch (error) {
    console.error("token verification failed", error);
    return null;
  }
}

/** Complete sign-in: exchange the code and create a session. */
export async function handleCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  // The provider reports its own failures here — most usefully
  // `redirect_uri_mismatch`, which means the callback registered in the
  // platform portal does not match what we sent, character for character.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description =
      url.searchParams.get("error_description") ?? "no description given";
    console.error("oauth error", { error: oauthError, description });
    return new Response(
      `Sign-in failed: ${oauthError}\n\n${description}\n\n` +
        `We requested this callback URL:\n  ` +
        `${new URL("/auth/callback", url.origin).toString()}\n\n` +
        `It must match the Callback URI registered at ` +
        `platform.youversion.com exactly.`,
      { status: 400, headers: { "content-type": "text/plain" } },
    );
  }

  const raw = readCookie(request, PKCE_COOKIE);
  if (!raw) return new Response("Sign-in expired. Please try again.", { status: 400 });

  let pkce: PkceState;
  try {
    pkce = JSON.parse(atob(raw)) as PkceState;
  } catch {
    return new Response("Malformed sign-in state.", { status: 400 });
  }

  // The state parameter is the CSRF defence; a mismatch means this callback
  // did not originate from the request we started.
  if (!returnedState || returnedState !== pkce.state) {
    return new Response("Invalid sign-in state.", { status: 400 });
  }

  if (!code) {
    return new Response("Sign-in was cancelled.", { status: 400 });
  }

  const redirectUri = new URL("/auth/callback", url.origin).toString();

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId(env),
      code_verifier: pkce.codeVerifier,
    }),
  });
  if (!tokenResponse.ok) {
    // Surface the provider's reason rather than a generic failure: a
    // mismatched redirect_uri or client_id shows up here, and the response
    // body names which.
    const detail = await tokenResponse.text().catch(() => "");
    console.error("token exchange failed", tokenResponse.status, detail);
    return new Response(
      `Could not complete sign-in (HTTP ${tokenResponse.status}).\n\n` +
        `${detail}\n\nredirect_uri sent: ${redirectUri}`,
      { status: 502, headers: { "content-type": "text/plain" } },
    );
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;
  const token = tokens.id_token ?? tokens.access_token;

  if (!token) {
    return new Response("Sign-in did not return a token.", { status: 502 });
  }

  const claims = await verifyToken(token);
  if (!claims) {
    return new Response("Could not verify sign-in.", { status: 502 });
  }

  // Replay protection: the id token must echo the nonce we generated. An id
  // token captured from an earlier sign-in carries a different one.
  if (tokens.id_token && claims.nonce && claims.nonce !== pkce.nonce) {
    return new Response("Sign-in could not be verified.", { status: 400 });
  }

  // `yvp_id` is documented as the stable primary identifier; `sub` is the
  // standard OIDC fallback.
  const yvpId =
    (claims.yvp_id as string | undefined) ?? (claims.sub as string | undefined);

  if (!yvpId) {
    return new Response("Sign-in did not return a user id.", { status: 502 });
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO sessions (id, yvp_id, display_name, avatar_url, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      yvpId,
      (claims?.name as string | undefined) ?? null,
      (claims?.picture as string | undefined) ?? null,
      expiresAt,
    )
    .run();

  return new Response(null, {
    status: 302,
    headers: {
      location: pkce.returnTo || "/",
      "set-cookie": [
        cookie(SESSION_COOKIE, sessionId, SESSION_TTL_SECONDS, isSecure(request)),
        // Clear the PKCE cookie; it is single-use.
        cookie(PKCE_COOKIE, "", 0, isSecure(request)),
      ].join(", "),
    },
  });
}

/** Resolve the signed-in user, if any. */
export async function getSessionUser(
  request: Request,
  env: Env,
): Promise<SessionUser | null> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;

  const row = await env.DB.prepare(
    `SELECT yvp_id, display_name, avatar_url, expires_at
     FROM sessions WHERE id = ?`,
  )
    .bind(sessionId)
    .first<{
      yvp_id: string;
      display_name: string | null;
      avatar_url: string | null;
      expires_at: number;
    }>();

  if (!row) return null;

  if (row.expires_at <= Math.floor(Date.now() / 1000)) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`)
      .bind(sessionId)
      .run();
    return null;
  }

  return {
    yvpId: row.yvp_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

export async function signOut(request: Request, env: Env): Promise<Response> {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`)
      .bind(sessionId)
      .run();
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: "/",
      "set-cookie": cookie(SESSION_COOKIE, "", 0, isSecure(request)),
    },
  });
}
