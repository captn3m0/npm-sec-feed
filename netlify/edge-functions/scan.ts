import type { Config, Context } from "https://edge.netlify.com";

const API = "https://agent.api.stepsecurity.io/v1/application/oss-packages/npm/ai-scan-results";
const LIMIT = 100;

interface ScanResult {
  package_name: string;
  version: string;
}
interface ApiPage {
  results?: ScanResult[];
  has_more?: boolean;
  next_token?: string;
}
interface Entry {
  name: string;
  version: string;
  purl: string;
}

function toPurl(name: string, version: string): string {
  const v = encodeURIComponent(version);
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    const namespace = encodeURIComponent(name.slice(0, slash));
    const pkg = encodeURIComponent(name.slice(slash + 1));
    return `pkg:npm/${namespace}/${pkg}@${v}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${v}`;
}

async function fetchAll(riskLevel: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  let token: string | undefined;
  do {
    const url = new URL(API);
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("risk_level", riskLevel);
    if (token) url.searchParams.set("next_token", token);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const page = (await res.json()) as ApiPage;
    for (const r of page.results ?? []) {
      entries.push({
        name: r.package_name,
        version: r.version,
        purl: toPurl(r.package_name, r.version),
      });
    }
    token = page.has_more ? page.next_token : undefined;
  } while (token);
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return entries;
}

export default async (request: Request, _context: Context): Promise<Response> => {
  const { pathname } = new URL(request.url);
  let entries: Entry[];
  if (pathname === "/critical.json") {
    entries = await fetchAll("CRITICAL");
  } else if (pathname === "/high.json") {
    const [critical, high] = await Promise.all([fetchAll("CRITICAL"), fetchAll("HIGH_RISK")]);
    entries = [...critical, ...high].sort(
      (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
  } else {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(JSON.stringify(entries, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: ["/critical.json", "/high.json"],
  cache: "manual",
};
