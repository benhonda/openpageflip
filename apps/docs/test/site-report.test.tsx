import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import SiteReport from "../src/examples/react/SiteReport.tsx";
import { buildReport, RANGE_KEYS } from "../src/examples/react/site-report/data.ts";

// The home page's demo. examples.test.tsx already proves it renders; these hold the parts a
// reader uses: the range switch, the contents page, the arrow keys and the page readout.

describe("site report data", () => {
  it.each(RANGE_KEYS)("%s is the same report every time, and adds up", (range) => {
    const report = buildReport(range);
    expect(buildReport(range)).toEqual(report);

    const shares = report.sources.reduce((sum, s) => sum + s.share, 0);
    expect(shares).toBeCloseTo(1);
    // The pages are written around these orders: the leader first, the most-read page first.
    expect(report.sources.map((s) => s.share)).toEqual(
      report.sources.map((s) => s.share).sort((a, b) => b - a),
    );
    expect(report.pages.map((p) => p.views.now)).toEqual(
      report.pages.map((p) => p.views.now).sort((a, b) => b - a),
    );
    expect(report.sessions.now).toBeGreaterThan(report.sessions.prev);
    expect(report.peak.sessions).toBe(Math.max(...report.series.map((p) => p.sessions)));
  });
});

describe("site report", () => {
  const mount = async () => {
    const screen = await render(<SiteReport flipDuration={50} />);
    const pages = () => [
      ...screen.container.querySelectorAll<HTMLElement>("[data-opf-page]:not([data-opf-clone])"),
    ];
    await expect.poll(() => screen.container.querySelector(".opf-book")).not.toBeNull();
    const readout = () => screen.container.querySelector("output")?.textContent;
    /** The eyebrow or headline at the top of each page now lying open. */
    const open = () =>
      pages()
        .filter((el) => el.style.display === "block")
        .map((el) => {
          const top = el.querySelector(".sr-body")?.firstElementChild;
          return (top?.firstElementChild ?? top)?.textContent;
        });
    return { screen, pages, readout, open };
  };

  it("redraws every page for a new range without rebuilding the book", async () => {
    const { screen, pages, readout } = await mount();
    await screen.getByLabelText("Next page").click();
    await screen.getByLabelText("Next page").click();
    await expect.poll(readout).toBe("3–4 / 10");
    const before = pages();
    const sessions = before[5]?.querySelector(".sr-bignum")?.textContent;

    await screen.getByRole("button", { name: "12 months" }).click();

    expect(screen.container.textContent).toContain("Last 12 months");
    expect(before[5]?.querySelector(".sr-bignum")?.textContent).not.toBe(sessions);
    // Same elements, same spread: the book was told to redraw, not made again.
    expect(pages()).toEqual(before);
    expect(pages().every((el, i) => el === before[i])).toBe(true);
    expect(readout()).toBe("3–4 / 10");
    await screen.unmount();
  });

  it.each([
    ["Highlights", "Highlights"],
    ["Traffic overview", "01 · Traffic overview"],
    ["Acquisition", "02 · Acquisition"],
    ["Top pages", "03 · Top pages"],
  ])("opens %s from the contents page, facing its story", async (row, eyebrow) => {
    const { screen, open, readout } = await mount();
    await screen.getByLabelText("Next page").click();
    await expect.poll(readout).toBe("1–2 / 10");

    await screen.getByRole("button", { name: new RegExp(`^${row}`) }).click();
    // The section opens on the left page, so its story is the page beside it.
    await expect.poll(() => open()[0]).toBe(eyebrow);
    expect(open()).toHaveLength(2);
    await screen.unmount();
  });

  it("turns on the arrow keys only while focus is in the report", async () => {
    const { screen, readout } = await mount();
    await userEvent.keyboard("{ArrowRight}");
    expect(readout()).toBe("Cover");

    screen.container.querySelector<HTMLElement>(".sr-stage")?.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(readout).toBe("1–2 / 10");
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(readout).toBe("Cover");
    await screen.unmount();
  });

  it("counts single pages when the book is showing one", async () => {
    const screen = await render(<SiteReport flipDuration={50} layout="single" />);
    await expect.poll(() => screen.container.querySelector(".opf-book")).not.toBeNull();
    await screen.getByLabelText("Next page").click();
    await expect.poll(() => screen.container.querySelector("output")?.textContent).toBe("1 / 10");
    await screen.unmount();
  });

  it("keeps the page behind the cover looking the same while the cover swings", async () => {
    // Slow enough to look at the page mid-turn, when the book swings it as a board with its cover.
    const screen = await render(<SiteReport flipDuration={600} />);
    await expect.poll(() => screen.container.querySelector(".opf-book")).not.toBeNull();
    const colophon = screen.container.querySelectorAll<HTMLElement>("[data-opf-page]")[1];
    const body = colophon?.querySelector(".sr-body");
    if (!colophon || !body) throw new Error("the colophon page is missing");
    const look = () => ({
      crease: getComputedStyle(colophon, "::after").backgroundImage,
      margins: getComputedStyle(body).padding,
    });

    await screen.getByLabelText("Next page").click();
    await expect.poll(() => screen.container.querySelector("output")?.textContent).toBe("1–2 / 10");
    const atRest = look();
    expect(atRest.crease).toContain("linear-gradient");

    await screen.getByLabelText("Previous page").click();
    // Mid-turn: the page is swinging as a board, on the back of the cover.
    await expect.poll(() => colophon.style.transform).toContain("rotateY");
    expect(look()).toEqual(atRest);
    await screen.unmount();
  });

  it("reads a point off the chart and a count off a bar", async () => {
    const { screen } = await mount();
    // React listens for pointerover and works out the enter itself.
    const over = () => new PointerEvent("pointerover", { pointerType: "mouse", bubbles: true });
    screen.container.querySelector(".sr-chart rect")?.dispatchEvent(over());
    await expect
      .poll(() => screen.container.querySelector(".sr-tip")?.textContent)
      .toMatch(/^Wk of .+ · [\d,]+$/);

    screen.container.querySelector(".sr-bar")?.dispatchEvent(over());
    await expect
      .poll(() => screen.container.querySelector(".sr-bars + p")?.textContent)
      .toMatch(/^Organic search: [\d,]+ sessions · [+−][\d.]+ pts vs prior$/);
    await screen.unmount();
  });
});
