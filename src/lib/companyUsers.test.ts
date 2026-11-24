import { describe, expect, it } from "vitest";
import { bodyOf, emptyDraft, pickCompany } from "./companyUsers";

describe("bodyOf", () => {
  // Through the form this is unobservable: jsdom strips the spaces from an
  // email input itself. A real browser does too, but the body must not
  // depend on that.
  it("trims the email and the name, and sends a blank name as null", () => {
    expect(bodyOf({ ...emptyDraft(), email: "  neu@example.de ", name: "   " })).toMatchObject({
      email: "neu@example.de",
      name: null,
    });
    expect(bodyOf({ ...emptyDraft(), name: " Neu " }).name).toBe("Neu");
  });
});

describe("pickCompany", () => {
  it("keeps a stored pick that is in the list, else takes the first", () => {
    expect(pickCompany(5, [4, 5])).toBe(5);
    expect(pickCompany(3, [4, 5])).toBe(4);
    expect(pickCompany(null, [4, 5])).toBe(4);
    expect(pickCompany(4, [])).toBeNull();
  });
});
