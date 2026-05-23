# npm-sec-feed

Data by [StepSecurity](https://www.stepsecurity.io/) — this is a thin
re-publication of their [npm AI scan
results](https://agent.api.stepsecurity.io/v1/application/oss-packages/npm/ai-scan-results)
as stable JSON endpoints, suitable for use in package-manager hooks (e.g.
pnpm's `readPackage` / `auditPolicy`) or any tool that wants a current list of
known-malicious npm packages.

Currently, only yarn and pnpm support hooks, but these are only "workspace-specific", so
global installs can bypass this.

## Endpoints

Hosted at `https://npm-sec-feed.captnemo.in`.

| URL | Contents |
| --- | --- |
| [`/critical.json`](https://npm-sec-feed.captnemo.in/critical.json) | Packages flagged `CRITICAL` |
| [`/high.json`](https://npm-sec-feed.captnemo.in/high.json) | Packages flagged `CRITICAL` **and** `HIGH_RISK` |

Each response is a JSON array sorted by name then version:

```json
[
  {
    "name": "wallet-backup-verifier",
    "version": "1.0.6",
    "purl": "pkg:npm/wallet-backup-verifier@1.0.6"
  }
]
```

- `name` — the npm package name
- `version` — the specific malicious version
- `purl` — a [Package URL](https://github.com/package-url/purl-spec) for the
  same `name@version`

Only the specific `name@version` pairs listed are flagged. Other versions of
the same package are not implicated by this feed.

## Usage with pnpm

Drop a `.pnpmfile.mjs` next to your `pnpm-lock.yaml` (project root, or the
workspace root in a monorepo). The hook below fetches the feed once when pnpm
loads, then aborts any install that touches a flagged `name@version`:

```js
// .pnpmfile.mjs
const blocked = await fetch("https://npm-sec-feed.captnemo.in/high.json")
  .then((r) => r.json());

export const hooks = {
  readPackage(pkg) {
    if (blocked.some((b) => b.name === pkg.name && b.version === pkg.version)) {
      throw new Error(`Refusing to install ${pkg.name}@${pkg.version}: flagged by Step Security`);
    }
    return pkg;
  },
};
```

Swap `high.json` for `critical.json` if you only want the highest-confidence
malicious set.

## Caching

Responses carry `Cache-Control: public, max-age=60` and
`Netlify-CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=300`,
so the origin function runs at most once per minute per region. Expect new
malicious packages to take up to a minute to appear after StepSecurity
publishes them.

CORS is open (`Access-Control-Allow-Origin: *`).

## Implementation

A single Netlify Deno edge function (`netlify/edge-functions/scan.ts`) fans
out to the StepSecurity API, paginates until exhausted, and serves the
combined JSON. There is no build step and no stored state.

## License & attribution

The scan data is produced and owned by StepSecurity. This repo is just the
hosting layer; please credit and link them when you use the feed.
