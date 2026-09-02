import { expect, it } from "vitest";
import { render } from "vitest-browser-react";
import Playground, { EASINGS } from "../src/components/Playground.tsx";

// The code panel prints each easing's source string; this is what keeps it honest.
it.each(Object.entries(EASINGS))("easing %s prints the function it runs", (_, { source, fn }) => {
  const printed: unknown = new Function(`return ${source}`)();
  if (typeof printed !== "function") throw new Error("source is not a function");
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) expect(printed(t)).toBeCloseTo(fn(t), 12);
});

// The playground is a site component, not an example, so it gets its own test: each control
// must reach the book, and the readouts must follow what the book reports.
it("rebuilds the book from its controls and reports what the book does", async () => {
  const screen = await render(<Playground />);
  const pages = () => screen.container.querySelectorAll<HTMLElement>("[data-opf-page]");
  await expect.poll(() => pages().length).toBe(10);

  // Cover on: the first page is hard. Off: it is soft.
  await expect.poll(() => pages()[0]?.classList.contains("opf-page--hard")).toBe(true);
  await screen.getByLabelText("Cover").click();
  await expect.poll(() => pages()[0]?.classList.contains("opf-page--soft")).toBe(true);

  // A single-page layout in a wide container is portrait, and the readout says so.
  await screen.getByLabelText("Layout").selectOptions("single");
  await expect.element(screen.getByText("orientation: portrait")).toBeVisible();

  // The generated code carries the change.
  await expect.element(screen.getByText('layout: "single",')).toBeInTheDocument();

  // The API bar drives the book, and the flip shows up in the readout and the log.
  await screen.getByRole("button", { name: "turnTo last (no animation)" }).click();
  await expect.element(screen.getByText("Page 10 of 10")).toBeVisible();
  await expect.element(screen.getByText("flip: page 9")).toBeVisible();

  await screen.unmount();
});
