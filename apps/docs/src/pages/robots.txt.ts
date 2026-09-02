import type { APIRoute } from "astro";

/** Everything is crawlable; the sitemap only exists (and is only advertised) when `site` is set. */
export const GET: APIRoute = ({ site }) => {
  const lines = ["User-agent: *", "Allow: /"];
  if (site !== undefined) lines.push(`Sitemap: ${new URL("/sitemap-index.xml", site).href}`);
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain" } });
};
