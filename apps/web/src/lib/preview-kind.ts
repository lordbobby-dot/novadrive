export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "csv"
  | "json"
  | "code"
  | "unsupported";

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "rb", "go", "rs", "java",
  "c", "h", "cpp", "hpp", "cs", "php", "swift", "kt", "sql", "sh", "bash",
  "zsh", "yaml", "yml", "toml", "ini", "xml", "html", "htm", "css", "scss",
  "less", "graphql", "dockerfile", "makefile", "txt", "log", "env",
]);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Dispatches a file to a preview renderer by contentType first, falling back to the file
 * extension for the text-based formats where servers/OSes often report a generic
 * text/plain or application/octet-stream contentType. */
export function detectPreviewKind(contentType: string, fileName: string): PreviewKind {
  const ext = extensionOf(fileName);

  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";

  if (contentType === "text/markdown" || ext === "md" || ext === "markdown") return "markdown";
  if (contentType === "text/csv" || ext === "csv") return "csv";
  if (contentType === "application/json" || ext === "json") return "json";

  if (contentType.startsWith("text/") || CODE_EXTENSIONS.has(ext)) return "code";

  return "unsupported";
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "tsx", py: "python", rb: "ruby", go: "go",
  rs: "rust", java: "java", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", swift: "swift", kt: "kotlin", sql: "sql",
  sh: "bash", bash: "bash", zsh: "bash", yaml: "yaml", yml: "yaml",
  toml: "toml", ini: "ini", xml: "xml", html: "markup", htm: "markup",
  css: "css", scss: "scss", less: "less", graphql: "graphql",
};

export function detectCodeLanguage(fileName: string): string {
  return LANGUAGE_BY_EXTENSION[extensionOf(fileName)] ?? "text";
}
