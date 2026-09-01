import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { FlipBook, Page } from "../src/index.ts";

// Next.js and friends import and render this on the server, where there is no window.
test("renders on the server without touching the DOM", () => {
  expect(typeof window).toBe("undefined");
  const html = renderToString(
    <FlipBook width={250} height={350} className="book">
      <Page density="hard">Cover</Page>
      <Page>One</Page>
    </FlipBook>,
  );
  expect(html).toContain('class="book"');
  expect(html).toContain('data-density="hard"');
  expect(html.match(/data-opf-page/g)).toHaveLength(2);
});
