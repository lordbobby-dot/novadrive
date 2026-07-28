# SEO

Technical SEO for `apps/web`'s public marketing surface (`/`, `/sign-in`, `/sign-up`), plus keeping
authenticated app pages and ephemeral personal links out of Google's index entirely.

## What's implemented

| Concern | File |
|---|---|
| Title/description templates, Open Graph, Twitter cards, canonical URL | [`src/app/layout.tsx`](../apps/web/src/app/layout.tsx) |
| `robots.txt` | [`src/app/robots.ts`](../apps/web/src/app/robots.ts) |
| `sitemap.xml` | [`src/app/sitemap.ts`](../apps/web/src/app/sitemap.ts) |
| Web app manifest | [`src/app/manifest.ts`](../apps/web/src/app/manifest.ts) |
| Dynamically generated OG/Twitter share image | [`src/app/opengraph-image.tsx`](../apps/web/src/app/opengraph-image.tsx), [`src/app/twitter-image.tsx`](../apps/web/src/app/twitter-image.tsx) |
| `SoftwareApplication` structured data (JSON-LD) | [`src/app/page.tsx`](../apps/web/src/app/page.tsx) |
| Shared site constants (URL/name/description/keywords) | [`src/lib/seo.ts`](../apps/web/src/lib/seo.ts) |

All of the above use Next.js's file-convention Metadata API (`robots.ts`, `sitemap.ts`,
`manifest.ts`, `opengraph-image.tsx`) rather than hand-rolled `<head>` tags — Next generates the
correct routes (`/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/opengraph-image`) and
wires them into every page's `<head>` automatically.

## What's deliberately kept out of the index

Only `/`, `/sign-in`, and `/sign-up` are meant to appear in search results. Everything behind
Clerk auth, and every ephemeral personal link, sets `robots: { index: false, follow: false }` on
its own metadata export:

- `/dashboard`, `/drive/*` ([`drive/layout.tsx`](../apps/web/src/app/drive/layout.tsx)), `/admin/*`
  ([`admin/layout.tsx`](../apps/web/src/app/admin/layout.tsx)) — behind auth, redirect an
  anonymous crawler to sign-in, no content to offer search.
- `/share/[token]`, `/invitations/[token]` — reachable without auth (that's the point of a share
  link), but single-use/personal, not canonical content anyone should find via search.

`robots.txt` additionally disallows `/dashboard`, `/drive`, and `/admin` as a crawl-budget
optimization. It deliberately does **not** disallow `/share` or `/invitations` — a `robots.txt`
disallow stops Googlebot from ever fetching the page, which means it never sees the page's own
`noindex` meta tag either. For URLs you want excluded from the index specifically (as opposed to
just uncrawled), the meta tag is the correct and sufficient mechanism on its own.

## Getting indexed by Google

1. **Search Console**: verify the production origin as a property at
   [search.google.com/search-console](https://search.google.com/search-console). Either method
   works:
   - **DNS TXT record** (no deploy needed) — add the TXT record Search Console gives you to the
     domain's DNS zone.
   - **HTML tag** — Search Console gives you a verification code; set it as
     `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and redeploy. `layout.tsx` only renders the
     `google-site-verification` meta tag when this env var is present.
2. **Submit the sitemap**: `https://<production-origin>/sitemap.xml`, under Search Console's
   Sitemaps section.
3. **Request indexing**: use Search Console's URL Inspection tool on the homepage and ask for
   indexing — this is the fastest way to get the first crawl, rather than waiting for Google to
   discover the site on its own.

None of this can be done by anything other than the domain owner signing into their own Google
account — there's no API-token equivalent for initial ownership verification.

## Verifying the technical output

```bash
curl https://<production-origin>/robots.txt
curl https://<production-origin>/sitemap.xml
curl https://<production-origin>/manifest.webmanifest
curl -I https://<production-origin>/opengraph-image
```

Social preview rendering (Open Graph/Twitter card) can be spot-checked with any link-unfurl
debugger — paste the homepage URL and confirm the title, description, and generated image render
as expected.
