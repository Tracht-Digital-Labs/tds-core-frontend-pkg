// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_EVENT, type ToastDetail } from "@tracht-digital-labs/tds-shared/toast";

/**
 * The user's own account screen against scripted auth and preferences APIs:
 * what each tab sends, what it says afterwards, and which state survives a
 * tab change. `fetchMe` caches per module, so every case imports afresh.
 */

let toasts: ToastDetail[];
const collect = (e: Event) => toasts.push((e as CustomEvent<ToastDetail>).detail);
const toasted = (variant: string, message: string) =>
  toasts.some((t) => t.variant === variant && t.message === message);

const ME = { userId: 7, email: "erika@example.de", name: "Erika Muster", displayName: "Erika", label: "Erika", hasAvatar: false };
const SESSIONS = [
  { jti: "this/one", createdAt: "2026-11-01T08:00:00Z", expiresAt: "2026-12-01T08:00:00Z", current: true },
  { jti: "other/one", createdAt: "2026-10-01T08:00:00Z", expiresAt: "2026-11-30T08:00:00Z", current: false },
];

type Handler = () => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const offline: Handler = () => Promise.reject(new TypeError("Failed to fetch"));

function api(overrides: Record<string, Handler> = {}) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const routes: Record<string, Handler> = {
    "GET /me": () => json(ME),
    "GET /me/preferences": () => json({ preferences: { theme: "dark", locale: "de" } }),
    "PUT /me/preferences": () => json({}),
    "GET /me/sessions": () => json({ sessions: SESSIONS }),
    ...overrides,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(input), "http://x").pathname.replace(/^\/auth/, "");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      requests.push({ method, path: decodeURIComponent(path), body });
      const route = routes[`${method} ${decodeURIComponent(path)}`];
      return route ? route() : new Response("{}", { status: 404 });
    }),
  );
  const sent = (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path);
  return { sent };
}

async function open() {
  vi.resetModules();
  const { default: ProfileSettings } = await import("./ProfileSettings");
  const u = userEvent.setup();
  render(<ProfileSettings />);
  await screen.findByRole("tablist");
  return u;
}

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  toasts = [];
  window.addEventListener(TOAST_EVENT, collect);
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, collect);
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProfileSettings: loading", () => {
  it("says so in-flow when there is no principal", async () => {
    api({ "GET /me": () => json({}, 401) });
    vi.resetModules();
    const { default: ProfileSettings } = await import("./ProfileSettings");
    render(<ProfileSettings />);
    expect(await screen.findByText("Ihr Profil konnte nicht geladen werden.")).toBeTruthy();
    expect(toasts).toEqual([]);
  });
});

describe("ProfileSettings: profile", () => {
  it("shows name and e-mail read-only and saves the trimmed display name", async () => {
    const { sent } = api({ "PATCH /me": () => json({}) });
    const u = await open();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^E-Mail/) as HTMLInputElement).value).toBe("erika@example.de");
    const field = screen.getByLabelText(/^Anzeigename/) as HTMLInputElement;
    expect(field.value).toBe("Erika");
    await u.clear(field);
    await u.type(field, "  Eri ");
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(toasted("success", "Profil gespeichert.")).toBe(true));
    expect(sent("PATCH", "/me")[0].body).toEqual({ displayName: "Eri" });
  });

  it.each([
    [() => json({}, 500), "Speichern fehlgeschlagen (HTTP 500)."],
    [offline, "Speichern fehlgeschlagen, die API ist nicht erreichbar."],
  ])("names a failed save", async (handler, message) => {
    api({ "PATCH /me": handler });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(toasted("danger", message)).toBe(true));
  });

  it("keeps an unsaved display name across a tab change", async () => {
    api();
    const u = await open();
    await u.type(screen.getByLabelText(/^Anzeigename/), "x");
    await u.click(tab("Darstellung"));
    await screen.findByText("Erscheinungsbild");
    await u.click(tab("Profil"));
    expect(((await screen.findByLabelText(/^Anzeigename/)) as HTMLInputElement).value).toBe("Erikax");
  });
});

describe("ProfileSettings: avatar", () => {
  const picture = (bytes = 10) => new File([new Uint8Array(bytes)], "me.png", { type: "image/png" });
  const input = () => document.querySelector("input[type=file]") as HTMLInputElement;

  it("uploads a picture, then offers to remove it, and keeps it across a tab change", async () => {
    const { sent } = api({ "POST /me/avatar": () => json({ avatarUrl: "https://cdn.example/a.webp" }) });
    const u = await open();
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull();
    await u.upload(input(), picture());
    await waitFor(() => expect(toasted("success", "Profilbild aktualisiert.")).toBe(true));
    expect(sent("POST", "/me/avatar")[0].body).toBeInstanceOf(FormData);
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeTruthy();
    await u.click(tab("Sicherheit"));
    await u.click(tab("Profil"));
    expect(await screen.findByRole("button", { name: "Entfernen" })).toBeTruthy();
  });

  it("refuses a picture over 2 MB before sending it", async () => {
    const { sent } = api();
    const u = await open();
    await u.upload(input(), picture(2 * 1024 * 1024 + 1));
    await waitFor(() => expect(toasted("warning", "Das Bild ist zu groß (maximal 2 MB).")).toBe(true));
    expect(sent("POST", "/me/avatar")).toHaveLength(0);
  });

  it.each([
    [() => json({}, 413), "Bild konnte nicht gespeichert werden (HTTP 413)."],
    [offline, "Bild konnte nicht gespeichert werden, die API ist nicht erreichbar."],
  ])("names a failed upload", async (handler, message) => {
    api({ "POST /me/avatar": handler });
    const u = await open();
    await u.upload(input(), picture());
    await waitFor(() => expect(toasted("danger", message)).toBe(true));
  });

  it("removes a picture", async () => {
    const { sent } = api({
      "GET /me": () => json({ ...ME, hasAvatar: true, avatarUrl: "https://cdn.example/a.webp" }),
      "DELETE /me/avatar": () => json({}),
    });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(toasted("success", "Profilbild entfernt.")).toBe(true));
    expect(sent("DELETE", "/me/avatar")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull();
  });

  it("names a failed removal", async () => {
    api({ "GET /me": () => json({ ...ME, hasAvatar: true }), "DELETE /me/avatar": () => json({}, 500) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(toasted("danger", "Bild konnte nicht entfernt werden (HTTP 500).")).toBe(true));
    expect(screen.getByRole("button", { name: "Entfernen" })).toBeTruthy();
  });
});

describe("ProfileSettings: appearance and notifications", () => {
  it("checks the stored theme and changes it without a preferences request", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(tab("Darstellung"));
    await waitFor(() => expect((screen.getByRole("radio", { name: /Dunkel/ }) as HTMLInputElement).checked).toBe(true));
    await u.click(screen.getByRole("radio", { name: /Hell/ }));
    expect((screen.getByRole("radio", { name: /Hell/ }) as HTMLInputElement).checked).toBe(true);
    expect(sent("PUT", "/me/preferences")).toHaveLength(0);
    expect(screen.queryByText(/nur auf diesem Gerät/)).toBeNull();
  });

  it("says preferences stay on this device when none come back", async () => {
    api({ "GET /me/preferences": () => json({}, 503) });
    const u = await open();
    await u.click(tab("Darstellung"));
    expect(await screen.findByText("Einstellungen werden derzeit nur auf diesem Gerät gespeichert.")).toBeTruthy();
  });

  it("saves the language", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(tab("Darstellung"));
    await u.selectOptions(await screen.findByLabelText(/^Sprache/), "en");
    await waitFor(() => expect(toasted("success", "Gespeichert.")).toBe(true));
    expect(sent("PUT", "/me/preferences")[0].body).toEqual({ preferences: { locale: "en" } });
  });

  it("names a refused language save", async () => {
    api({ "PUT /me/preferences": () => json({}, 500) });
    const u = await open();
    await u.click(tab("Darstellung"));
    await u.selectOptions(await screen.findByLabelText(/^Sprache/), "en");
    await waitFor(() => expect(toasted("danger", "Sprache speichern fehlgeschlagen (HTTP 500).")).toBe(true));
  });

  it("saves each notification switch, both on by default", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(tab("Benachrichtigungen"));
    const email = await screen.findByRole("checkbox", { name: /E-Mail-Benachrichtigungen/ });
    expect((screen.getByRole("checkbox", { name: /Hinweise in der Oberfläche/ }) as HTMLInputElement).checked).toBe(true);
    await u.click(email);
    await waitFor(() => expect(toasted("success", "Gespeichert.")).toBe(true));
    expect(sent("PUT", "/me/preferences")[0].body).toEqual({ preferences: { notify_email: "0" } });
    expect((email as HTMLInputElement).checked).toBe(false);
  });

  it("names a notification save that never arrives", async () => {
    api({ "PUT /me/preferences": offline });
    const u = await open();
    await u.click(tab("Benachrichtigungen"));
    await u.click(await screen.findByRole("checkbox", { name: /Hinweise in der Oberfläche/ }));
    await waitFor(() =>
      expect(toasted("danger", "Einstellung speichern fehlgeschlagen, die API ist nicht erreichbar.")).toBe(true),
    );
  });
});

describe("ProfileSettings: security", () => {
  it("links password and passkeys to the login site with a way back", async () => {
    api();
    const u = await open();
    await u.click(tab("Sicherheit"));
    const link = await screen.findByRole("link", { name: "Passwort ändern" });
    expect(link.getAttribute("href")).toMatch(/\/passwort\?next=http%3A%2F%2F/);
    expect(screen.getByRole("link", { name: "Passkeys verwalten" }).getAttribute("href")).toMatch(/\/passkeys\?next=/);
  });

  it("lists sessions, marks this device, and ends another/one", async () => {
    const { sent } = api({ "DELETE /me/sessions/other/one": () => json({}) });
    const u = await open();
    await u.click(tab("Sicherheit"));
    const list = await screen.findByRole("list");
    expect(within(list).getByText("Dieses Gerät")).toBeTruthy();
    expect(within(list).getByRole("button", { name: "Abmelden" })).toBeTruthy();
    await u.click(within(list).getByRole("button", { name: "Beenden" }));
    await waitFor(() => expect(toasted("success", "Sitzung beendet.")).toBe(true));
    expect(sent("DELETE", "/me/sessions/other/one")).toHaveLength(1);
    // The id is one path segment, slash and all.
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/me/sessions/other%2Fone"))).toBe(true);
    await waitFor(() => expect(sent("GET", "/me/sessions")).toHaveLength(2));
  });

  it("asks for the sessions again on every visit to the tab", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(tab("Sicherheit"));
    await screen.findByRole("list");
    await u.click(tab("Profil"));
    await screen.findByLabelText(/^Anzeigename/);
    await u.click(tab("Sicherheit"));
    await waitFor(() => expect(sent("GET", "/me/sessions")).toHaveLength(2));
  });

  it("names a refused session end", async () => {
    api({ "DELETE /me/sessions/other/one": () => json({}, 403) });
    const u = await open();
    await u.click(tab("Sicherheit"));
    await u.click(await screen.findByRole("button", { name: "Beenden" }));
    await waitFor(() => expect(toasted("danger", "Sitzung konnte nicht beendet werden (HTTP 403).")).toBe(true));
  });

  it.each([
    [() => json({}, 500), "Sitzungen konnten nicht geladen werden (HTTP 500)."],
    [offline, "Sitzungen konnten nicht geladen werden, die API ist nicht erreichbar."],
  ])("says in-flow when sessions cannot be loaded", async (handler, message) => {
    api({ "GET /me/sessions": handler });
    const u = await open();
    await u.click(tab("Sicherheit"));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Keine weiteren Sitzungen.")).toBeNull();
  });

  it("says when there are no sessions to list", async () => {
    api({ "GET /me/sessions": () => json({ sessions: [] }) });
    const u = await open();
    await u.click(tab("Sicherheit"));
    expect(await screen.findByText("Keine weiteren Sitzungen.")).toBeTruthy();
  });
});
