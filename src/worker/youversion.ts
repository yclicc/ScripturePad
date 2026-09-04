import { ApiClient, BibleClient } from "@youversion/platform-core";
import type { Env } from "./env.ts";

/**
 * Wraps the YouVersion Platform SDK.
 *
 * The app key is a server-side secret sent as `X-YVP-App-Key`, so every call
 * must originate here in the Worker — never from the browser.
 */
export function createBibleClient(env: Env): BibleClient {
  const api = new ApiClient({ appKey: env.YOUVERSION_APP_KEY });
  return new BibleClient(api);
}

/** Berean Standard Bible — license-free, so it is a safe default. */
export const DEFAULT_VERSION_ID = 3034;

const VERSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSAGE_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface PassageResult {
  reference: string;
  content: string;
  versionId: number;
  /** Attribution is required by the YouVersion license agreement. */
  copyright: string | null;
  versionTitle: string;
  versionAbbreviation: string;
}

export interface VersionSummary {
  id: number;
  title: string;
  abbreviation: string;
  languageTag: string;
  copyright: string | null;
}

/**
 * Bible text is immutable, so responses are cached aggressively in KV to stay
 * well inside rate limits.
 */
export async function fetchPassage(
  env: Env,
  usfm: string,
  versionId: number = DEFAULT_VERSION_ID,
): Promise<PassageResult> {
  const cacheKey = `passage:v2:${versionId}:${usfm}`;
  const cached = await env.BIBLE_CACHE.get<PassageResult>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);

  // `transform: false` is deliberate. The SDK's HTML transformer pulls in
  // jsdom, which does not run on workerd. We request plain text and do our own
  // rendering anyway.
  const [passage, version] = await Promise.all([
    bible.getPassage(versionId, usfm, "text", false, false, false),
    getVersion(env, versionId),
  ]);

  const result: PassageResult = {
    reference: passage.reference,
    content: passage.content,
    versionId,
    copyright: version.copyright,
    versionTitle: version.title,
    versionAbbreviation: version.abbreviation,
  };

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(result), {
    expirationTtl: PASSAGE_TTL_SECONDS,
  });

  return result;
}

export async function getVersion(
  env: Env,
  versionId: number,
): Promise<VersionSummary> {
  const cacheKey = `version:v2:${versionId}`;
  const cached = await env.BIBLE_CACHE.get<VersionSummary>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);
  const version = await bible.getVersion(versionId);

  const summary: VersionSummary = {
    id: version.id,
    title: version.title,
    abbreviation: version.abbreviation,
    languageTag: version.language_tag,
    copyright: version.copyright ?? null,
  };

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(summary), {
    expirationTtl: VERSION_TTL_SECONDS,
  });

  return summary;
}

/**
 * List available versions for a language.
 *
 * `language_ranges` is required by the API — omitting it returns HTTP 422 —
 * which is why the language argument here is not optional.
 */
export async function listVersions(
  env: Env,
  languageRange: string,
): Promise<VersionSummary[]> {
  const cacheKey = `versions:v2:${languageRange}`;
  const cached = await env.BIBLE_CACHE.get<VersionSummary[]>(cacheKey, "json");
  if (cached) return cached;

  const bible = createBibleClient(env);
  const collection = await bible.getVersions(languageRange);

  const summaries: VersionSummary[] = collection.data.map((version) => ({
    id: version.id,
    title: version.title,
    abbreviation: version.abbreviation,
    languageTag: version.language_tag,
    copyright: version.copyright ?? null,
  }));

  await env.BIBLE_CACHE.put(cacheKey, JSON.stringify(summaries), {
    expirationTtl: VERSION_TTL_SECONDS,
  });

  return summaries;
}
