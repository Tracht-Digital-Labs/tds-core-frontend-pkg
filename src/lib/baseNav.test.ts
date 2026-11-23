import { describe, expect, it } from "vitest";
import { baseNav } from "./baseNav";

const ids = (target: "admin" | "customer") => baseNav(target).map((row) => row.id ?? row.href);

describe("baseNav", () => {
  it("gives the management product every row", () => {
    expect(ids("admin")).toEqual(["/", "users", "firma", "wiki", "einstellungen", "einrichtung", "module", "tools-site"]);
  });

  it("leaves the platform tools out of the portal", () => {
    expect(ids("customer")).toEqual(["/", "users", "firma", "wiki", "einstellungen"]);
  });

  it("names the wiki after what is behind it", () => {
    const wiki = (target: "admin" | "customer") => baseNav(target).find((row) => row.id === "wiki");
    expect(wiki("admin")).toMatchObject({ label: "API-Referenz", icon: "book-open", order: 6, group: "system" });
    expect(wiki("customer")).toMatchObject({ label: "Hilfe", icon: "life-buoy", order: 3, group: undefined });
  });

  it("hides the admin screens until /me confirms the role", () => {
    const reveal = Object.fromEntries(baseNav("admin").map((row) => [row.id, row.revealFor]));
    expect(reveal).toMatchObject({
      users: "platform-admin",
      firma: "company-or-platform-admin",
      einstellungen: "platform-admin",
      einrichtung: "platform-admin",
    });
  });

  it("opens only the public tools site in a new tab", () => {
    expect(baseNav("admin").filter((row) => row.external).map((row) => row.id)).toEqual(["tools-site"]);
  });

  it("returns a fresh list per call", () => {
    expect(baseNav("admin")).not.toBe(baseNav("admin"));
  });
});
