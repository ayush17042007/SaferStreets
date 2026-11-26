import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { Gallery } from "./Gallery";

// jsdom cannot compute colours, so contrast is covered by contrast.test.ts and by the
// Playwright axe run in e2e/. This checks structure: names, roles, labels, headings, ids.
describe("gallery accessibility (axe, structure)", () => {
  it("has no axe violations", async () => {
    const { container } = render(<Gallery />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
