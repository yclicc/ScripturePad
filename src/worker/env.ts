export interface Env {
  DB: D1Database;
  BIBLE_CACHE: KVNamespace;
  ASSETS: Fetcher;

  /** YouVersion Platform app key. Server-side only — never send to a client. */
  YOUVERSION_APP_KEY: string;
  /** OAuth client id for Sign in with YouVersion. */
  YOUVERSION_CLIENT_ID: string;
  /** Secret used to sign session cookies. */
  SESSION_SECRET: string;
}

export interface SessionUser {
  yvpId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Hono context variables set by middleware. */
export interface Variables {
  user: SessionUser | null;
}
