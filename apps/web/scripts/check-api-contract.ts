import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Fails CI when apps/web calls an API path/method that apps/api's OpenAPI spec doesn't define —
 * catching drift between the hand-maintained @novadrive/types SDK-equivalent (apiFetch/
 * authedFetch call sites) and the real API surface (see docs/testing-strategy.md). There is no
 * generated SDK here to diff against, so this walks the actual call sites in source instead.
 *
 * Not a full static analyzer: it looks for `apiFetch(...)` / `authedFetch(...)` calls (any
 * generic, any argument order — apps/web has two call conventions, a hook-based one and
 * upload-manager.ts's own `authedFetch(path, token, init?)`), takes the first string/template
 * literal argument as the path and an optional `method: "..."` as the HTTP method, and checks
 * that path+method exists in the dumped OpenAPI spec. Query strings and `${...}` interpolations
 * are normalized away before comparing, since neither survives in an OpenAPI path template.
 */

interface OpenApiDocument {
  paths: Record<string, Partial<Record<string, unknown>>>;
}

interface CallSite {
  file: string;
  line: number;
  /** null means the method is computed (e.g. a ternary) and couldn't be resolved statically. */
  method: string | null;
  rawPath: string;
  normalizedSegments: string[];
}

const SCAN_ROOT = join(import.meta.dirname, "..", "src");
const OPENAPI_PATH = join(import.meta.dirname, "..", "..", "api", "openapi.json");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (extname(full) === ".ts" || extname(full) === ".tsx") {
      out.push(full);
    }
  }
  return out;
}

/** Given the source starting at an opening `(`, returns the matching close-paren index,
 * respecting nested (), {}, [] and skipping over string/template literals so a `)` inside a
 * body payload doesn't end the scan early. */
function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0 && ch === ")") return i;
    } else if (ch === "`" || ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
    }
    i++;
  }
  return -1;
}

/** A segment that starts with a `${...}` interpolation stands in for a path param — unless the
 * interpolation is a ternary/expression whose branches are all string literals (e.g.
 * `${type === "file" ? "files" : "folders"}`, picking between two literal route prefixes, not
 * substituting an id) — in which case it's encoded as an alternatives list so it can only match
 * one of those literal spec segments, not a param. Only the *first* interpolation's own matching
 * `}` is inspected (found via brace-depth counting, not just the segment's last character) —
 * anything after it, including further interpolations or a nested template literal (e.g.
 * `${token}${withPassword ? `?password=${...}` : ""}`), doesn't change that the segment as a
 * whole is dynamic. A segment with a literal prefix before its first interpolation (e.g.
 * `children${query}`, building "children" + an appended "?..." query string) keeps only that
 * literal prefix — the interpolation there isn't a path segment at all. */
function normalizeSegment(segment: string): string {
  const interpIndex = segment.indexOf("${");
  if (interpIndex === -1) return segment;
  if (interpIndex > 0) return segment.slice(0, interpIndex);

  let depth = 1;
  let i = 2;
  while (i < segment.length && depth > 0) {
    if (segment[i] === "{") depth++;
    else if (segment[i] === "}") depth--;
    i++;
  }
  const inner = segment.slice(2, i - 1);
  const literalAlternatives = [...inner.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  return literalAlternatives.length > 0 ? `{alt:${literalAlternatives.join("|")}}` : "{param}";
}

/** Strips a real query string (a literal `?` outside any `${...}` interpolation) — a naive
 * `rawPath.split("?")` would also cut at the `?` inside a ternary like
 * `${type === "file" ? "files" : "folders"}`, truncating the path mid-interpolation. */
function stripQueryString(rawPath: string): string {
  let depth = 0;
  for (let i = 0; i < rawPath.length; i++) {
    if (rawPath[i] === "$" && rawPath[i + 1] === "{") {
      depth++;
      i++;
    } else if (depth > 0 && rawPath[i] === "}") {
      depth--;
    } else if (depth === 0 && rawPath[i] === "?") {
      return rawPath.slice(0, i);
    }
  }
  return rawPath;
}

function normalizePath(rawPath: string): string[] {
  return stripQueryString(rawPath).split("/").map(normalizeSegment).filter(Boolean);
}

/** Extracts a leading template literal starting at `s[0] === "`"`, returning its inner text
 * (backticks stripped). Template literals can nest arbitrarily — e.g.
 * `` `/shared-links/${token}${withPassword ? `?password=${encodeURIComponent(withPassword)}` : ""}` ``
 * has a whole second template literal inside a ternary inside an interpolation — so a naive
 * `` `([^`]*)` `` regex stops at the first inner backtick, truncating the path mid-string. This
 * walks the literal properly, recursing into `${...}` to skip any nested template literal (or
 * quoted string) in full before looking for this literal's own closing backtick. */
function extractLeadingTemplateLiteral(s: string): string | null {
  if (s[0] !== "`") return null;
  let i = 1;
  while (i < s.length) {
    if (s[i] === "\\") {
      i += 2;
      continue;
    }
    if (s[i] === "`") return s.slice(1, i);
    if (s[i] === "$" && s[i + 1] === "{") {
      i += 2;
      let depth = 1;
      while (i < s.length && depth > 0) {
        if (s[i] === "{") {
          depth++;
          i++;
        } else if (s[i] === "}") {
          depth--;
          i++;
        } else if (s[i] === "`") {
          const nested = extractLeadingTemplateLiteral(s.slice(i));
          i += (nested?.length ?? 0) + 2; // +2 for the nested literal's own backticks
        } else if (s[i] === '"' || s[i] === "'") {
          const quote = s[i];
          i++;
          while (i < s.length && s[i] !== quote) {
            if (s[i] === "\\") i++;
            i++;
          }
          i++;
        } else {
          i++;
        }
      }
      continue;
    }
    i++;
  }
  return null; // unterminated — shouldn't happen in valid source
}

function extractLeadingPathString(args: string): string | null {
  const trimmed = args.replace(/^\s*/, "");
  if (trimmed[0] === "`") return extractLeadingTemplateLiteral(trimmed);
  const quoteMatch = /^("([^"]*)"|'([^']*)')/.exec(trimmed);
  if (quoteMatch) return quoteMatch[2] ?? quoteMatch[3] ?? "";
  return null;
}

function extractCallSites(file: string, source: string): CallSite[] {
  const sites: CallSite[] = [];
  const callRegex = /\b(?:authedFetch|apiFetch)\s*(?:<[^>(]*>)?\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callRegex.exec(source))) {
    const openParenIndex = match.index + match[0].length - 1;
    const closeParenIndex = findMatchingParen(source, openParenIndex);
    if (closeParenIndex === -1) continue;
    const args = source.slice(openParenIndex + 1, closeParenIndex);

    const rawPath = extractLeadingPathString(args);
    if (rawPath === null || !rawPath.startsWith("/")) continue;

    // A literal method string ("PUT", "DELETE", ...) is checked exactly; a computed method (e.g.
    // `favorited ? "PUT" : "DELETE"`) can't be resolved statically, so the check falls back to
    // "does this path exist under any method" rather than guessing GET and reporting a false
    // mismatch against a PUT/DELETE-only endpoint.
    const literalMethodMatch = /method:\s*["'](\w+)["']/.exec(args);
    const hasComputedMethod = /method:\s*[^"'\s]/.test(args) && !literalMethodMatch;
    const method = literalMethodMatch
      ? literalMethodMatch[1].toLowerCase()
      : hasComputedMethod
        ? null
        : "get";

    const line = source.slice(0, match.index).split("\n").length;
    sites.push({
      file,
      line,
      method,
      rawPath,
      normalizedSegments: normalizePath(rawPath),
    });
  }

  return sites;
}

function pathExistsInSpec(
  segments: string[],
  method: string | null,
  doc: OpenApiDocument,
): boolean {
  for (const [specPath, methods] of Object.entries(doc.paths)) {
    if (method !== null && !(method in methods)) continue;
    const specSegments = specPath.split("/").filter(Boolean);
    if (specSegments.length !== segments.length) continue;
    const isMatch = specSegments.every((specSegment, i) => {
      const callSegment = segments[i];
      const specIsParam = specSegment.startsWith("{") && specSegment.endsWith("}");

      if (callSegment.startsWith("{alt:")) {
        // A ternary-of-literals picks between fixed route prefixes, not an id — only a literal
        // spec segment matching one of the alternatives counts, not a param slot.
        const alternatives = callSegment.slice("{alt:".length, -1).split("|");
        return !specIsParam && alternatives.includes(specSegment);
      }

      const callIsParam = callSegment === "{param}";
      // A `${...}` interpolation in the call site may stand in for any spec param segment, and
      // vice versa — but a literal call segment (e.g. "root") must match a literal spec segment
      // exactly. Otherwise a literal sibling route like `/folders/root` would spuriously "match"
      // a same-shaped parameterized route like `/folders/{id}` and drift would go undetected.
      if (specIsParam && callIsParam) return true;
      if (specIsParam !== callIsParam) return false;
      return specSegment === callSegment;
    });
    if (isMatch) return true;
  }
  return false;
}

function main() {
  let doc: OpenApiDocument;
  try {
    doc = JSON.parse(readFileSync(OPENAPI_PATH, "utf-8")) as OpenApiDocument;
  } catch {
    console.error(
      `Could not read ${OPENAPI_PATH} — run "pnpm --filter api openapi:dump" first.`,
    );
    process.exit(1);
    return;
  }

  const files = listSourceFiles(SCAN_ROOT);
  const allSites = files.flatMap((file) =>
    extractCallSites(file, readFileSync(file, "utf-8")),
  );

  const mismatches = allSites.filter(
    (site) => !pathExistsInSpec(site.normalizedSegments, site.method, doc),
  );

  console.log(`Checked ${allSites.length} API call site(s) across ${files.length} file(s).`);

  if (mismatches.length > 0) {
    console.error(`\n${mismatches.length} call site(s) don't match any documented API endpoint:\n`);
    for (const m of mismatches) {
      console.error(
        `  ${m.file.replace(SCAN_ROOT, "src")}:${m.line}  ${(m.method ?? "ANY").toUpperCase()} ${m.rawPath}`,
      );
    }
    console.error(
      "\nEither the API removed/renamed this endpoint (fix apps/web), or apps/web is calling a" +
        " path the API never documented (check the controller's route + @Api* decorators).",
    );
    process.exit(1);
  }

  console.log("No drift between apps/web's API calls and apps/api's OpenAPI spec.");
}

main();
