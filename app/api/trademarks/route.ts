import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiPerson = { name?: string };
type ApiResult = {
  applicationNumber?: string;
  applicationDate?: string;
  registrationDate?: string;
  status?: string;
  niceClasses?: number[];
  wordMarkSpecification?: { verbalElement?: string };
  applicants?: ApiPerson[];
};
type ApiPage = {
  trademarks?: ApiResult[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
};
type TokenResponse = { access_token?: string; expires_in?: number };

let cachedToken: { value: string; expiresAt: number } | null = null;
const PAGE_SIZE = 10;
const TIMEOUT_MS = 15_000;

function isConfigured() {
  return Boolean(process.env.EUIPO_CLIENT_ID && process.env.EUIPO_CLIENT_SECRET);
}

function endpoints() {
  const sandbox = process.env.EUIPO_ENV === "sandbox";
  return sandbox
    ? { api: "https://api-sandbox.euipo.europa.eu/trademark-search", token: "https://auth-sandbox.euipo.europa.eu/oidc/accessToken" }
    : { api: "https://api.euipo.europa.eu/trademark-search", token: "https://euipo.europa.eu/cas-server-webapp/oidc/accessToken" };
}

async function getToken(signal: AbortSignal): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { token } = endpoints();
  const form = new URLSearchParams({
    client_id: process.env.EUIPO_CLIENT_ID!,
    client_secret: process.env.EUIPO_CLIENT_SECRET!,
    grant_type: "client_credentials",
    scope: "uid",
  });
  const response = await fetch(token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new UpstreamError(502, "EUIPO rejected the sandbox Client ID or Client Secret. Check that both values come from the same sandbox app, then restart the dev server.");
    }
    if (response.status === 403) {
      throw new UpstreamError(502, "EUIPO denied sandbox API access. Check that this app has an approved Trademark Search subscription.");
    }
    throw new UpstreamError(response.status === 429 ? 429 : 502, "EUIPO authentication failed (HTTP " + response.status + "). Please verify the sandbox app credentials and access.");
  }
  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) throw new UpstreamError(502, "EUIPO returned an invalid authentication response.");
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

class UpstreamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function escapeRsql(value: string) {
  return value.replace(/[\\'"(),;=!~<>]/g, "\\$&");
}

function normalize(page: ApiPage) {
  const records = (page.trademarks ?? []).map((item) => ({
    name: item.wordMarkSpecification?.verbalElement || "—",
    number: item.applicationNumber || "—",
    owner: item.applicants?.map((person) => person.name).filter(Boolean).join(", ") || "—",
    status: item.status?.replaceAll("_", " ") || "—",
    classes: item.niceClasses?.length ? item.niceClasses.join(", ") : "—",
    jurisdiction: "EUIPO register",
    filingDate: item.applicationDate ? new Date(item.applicationDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—",
  }));
  return {
    records,
    page: page.page ?? 0,
    totalPages: page.totalPages ?? (records.length ? 1 : 0),
    totalElements: page.totalElements ?? records.length,
    mode: process.env.EUIPO_ENV === "sandbox" ? "sandbox" as const : "live" as const,
  };
}

const DEMO_RECORDS = [
  { name: "Illustrative sample mark", number: "SAMPLE-0001", owner: "Sample applicant", status: "Demo only", classes: "Sample class", jurisdiction: "Demo only", filingDate: "Not applicable" },
  { name: "Example word mark", number: "SAMPLE-0002", owner: "Example owner", status: "Demo only", classes: "Sample class", jurisdiction: "Demo only", filingDate: "Not applicable" },
];

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const page = Number(request.nextUrl.searchParams.get("page") ?? "0");
  if (!name) return NextResponse.json({ error: "Enter a trademark or brand name to search." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "Search terms must be 120 characters or fewer." }, { status: 400 });
  if (!Number.isInteger(page) || page < 0) return NextResponse.json({ error: "Page must be a non-negative number." }, { status: 400 });
  const id = process.env.EUIPO_CLIENT_ID;
  const secret = process.env.EUIPO_CLIENT_SECRET;
  if (Boolean(id) !== Boolean(secret)) return NextResponse.json({ error: "EUIPO setup is incomplete. Configure both server credentials." }, { status: 503 });
  if (!isConfigured()) {
    return NextResponse.json({ records: DEMO_RECORDS, page: 0, totalPages: 1, totalElements: DEMO_RECORDS.length, mode: "demo" });
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const token = await getToken(timeout);
    const { api } = endpoints();
    const url = new URL(api + "/trademarks");
    url.searchParams.set("query", "wordMarkSpecification.verbalElement==*" + escapeRsql(name) + "*");
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(PAGE_SIZE));
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + token, "X-IBM-Client-Id": id!, Accept: "application/json" },
      signal: timeout,
      cache: "no-store",
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      return NextResponse.json({ error: retryAfter ? "EUIPO rate limit reached. Try again in " + retryAfter + " seconds." : "EUIPO rate limit reached. Please try again shortly." }, { status: 429 });
    }
    if (response.status === 401 || response.status === 403) return NextResponse.json({ error: "EUIPO rejected this API request. Check that the application is subscribed and approved for Trademark Search." }, { status: 502 });
    if (!response.ok) return NextResponse.json({ error: "EUIPO could not complete the search (HTTP " + response.status + "). Please try again." }, { status: 502 });
    return NextResponse.json(normalize((await response.json()) as ApiPage));
  } catch (cause) {
    if (cause instanceof UpstreamError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    if (cause instanceof Error && cause.name === "TimeoutError") return NextResponse.json({ error: "EUIPO took too long to respond. Please try again." }, { status: 504 });
    return NextResponse.json({ error: "Could not connect to EUIPO. Please try again shortly." }, { status: 502 });
  }
}
