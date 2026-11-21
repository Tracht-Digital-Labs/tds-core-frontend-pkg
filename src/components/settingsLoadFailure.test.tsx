// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CorsSettings from "./CorsSettings";
import MailSettings from "./MailSettings";
import SitemapSettings from "./SitemapSettings";
import StripeSettings from "./StripeSettings";

/**
 * A settings section that cannot load says why, in flow: a non-admin is told
 * so instead of seeing an HTTP code, any other status is named, and an API
 * that never answers is called unreachable. The wording comes from
 * tds-shared's `describeFailure`, so all four sections speak alike.
 */

const SECTIONS: Array<[string, ComponentType, string]> = [
  ["CORS", CorsSettings, "Origins konnten nicht geladen werden"],
  ["Mail", MailSettings, "Einstellungen konnten nicht geladen werden"],
  ["Sitemap", SitemapSettings, "Sites konnten nicht geladen werden"],
  ["Stripe", StripeSettings, "Stripe-Status konnte nicht geladen werden"],
];

afterEach(() => {
  cleanup();
});

const answer = (status: number) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));

describe.each(SECTIONS)("%s settings that cannot load", (_name, Section, what) => {
  it("tell a non-admin that the section is for administrators", async () => {
    answer(403);
    render(<Section />);
    expect(await screen.findByText("Nur für Administratoren.")).toBeTruthy();
  });

  it("name any other HTTP status", async () => {
    answer(500);
    render(<Section />);
    expect(await screen.findByText(`${what} (HTTP 500).`)).toBeTruthy();
  });

  it("call an API that never answers unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(<Section />);
    expect(await screen.findByText(`${what}, die API ist nicht erreichbar.`)).toBeTruthy();
  });
});
