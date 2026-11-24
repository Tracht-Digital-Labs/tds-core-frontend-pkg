// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_EVENT, type ToastDetail } from "@tracht-digital-labs/tds-shared/toast";
import UsersAdmin from "./UsersAdmin";

/**
 * User management against a scripted auth API: what the list shows, what each
 * action sends, and what a person reads after it. The unreachable-API cases
 * are `UsersAdmin.test.tsx`.
 */

let toasts: ToastDetail[];
const collect = (e: Event) => toasts.push((e as CustomEvent<ToastDetail>).detail);
const toasted = (variant: string, message: string) =>
  toasts.some((t) => t.variant === variant && t.message === message);

const ERIKA = {
  id: 5,
  email: "erika@example.de",
  name: "Erika Muster",
  isBlogAuthor: true,
  status: "disabled",
  memberships: [
    { customerId: 1, permissions: [], groupIds: [] },
    { customerId: 99, permissions: [] },
  ],
};
const ADA = { id: 6, email: "ada@example.de", name: null, isAdmin: true, isSupportAgent: true, isBlogAuthor: true };

const GROUPS = [
  { id: 10, companyId: 0, slug: "lesen", name: "Lesen", description: null, permissions: ["invoices.view"], isSystem: true, scope: "platform" },
  { id: 11, companyId: 2, slug: "fremd", name: "Fremde Gruppe", description: null, permissions: [], isSystem: false, scope: "company" },
];

type Handler = (body: unknown) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Scripted answers by `METHOD path-suffix`; every request is recorded. */
function api(overrides: Record<string, Handler> = {}) {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  const routes: Record<string, Handler> = {
    "GET /admin/users": () => json({ users: [ERIKA, ADA] }),
    "GET /admin/customers": () => json({ companies: [{ id: 1, name: "Acme" }, { id: 2, name: "Beta" }] }),
    "GET /admin/groups": () => json({ groups: GROUPS }),
    "GET /admin/companies/1/policy": () => json({ policy: { companyId: 1, allowCompanyAdmins: false } }),
    "GET /admin/companies/2/policy": () => json({ policy: { companyId: 2, allowCompanyAdmins: true } }),
    ...overrides,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      const key = Object.keys(routes).find((k) => {
        const [m, path] = k.split(" ");
        return m === method && new URL(url, "http://x").pathname.endsWith(path);
      });
      return key ? routes[key](body) : new Response("{}", { status: 404 });
    }),
  );
  const sent = (method: string, suffix: string) =>
    requests.filter((r) => r.method === method && new URL(r.url, "http://x").pathname.endsWith(suffix));
  return { requests, sent };
}

async function open() {
  const u = userEvent.setup();
  render(<UsersAdmin />);
  await screen.findByText("erika@example.de");
  return u;
}

/** The card of one user in the list. */
const card = (email: string) => screen.getByText(email).closest(".tds-card") as HTMLElement;

beforeEach(() => {
  toasts = [];
  window.addEventListener(TOAST_EVENT, collect);
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, collect);
  cleanup();
  vi.unstubAllGlobals();
});

describe("UsersAdmin: the list", () => {
  it("shows each user's role chips and companies", async () => {
    api();
    await open();
    const erika = within(card("erika@example.de"));
    expect(erika.getByText("Erika Muster")).toBeTruthy();
    expect(erika.getByText("Blog-Autor")).toBeTruthy();
    expect(erika.getByText("Gesperrt")).toBeTruthy();
    expect(erika.queryByText("Admin")).toBeNull();
    // A company the list does not know is named by its id.
    expect(erika.getByText("2 Firmen: Acme, #99")).toBeTruthy();

    const ada = within(card("ada@example.de"));
    expect(ada.getByText("—")).toBeTruthy();
    expect(ada.getByText("Admin")).toBeTruthy();
    expect(ada.getByText("Support-Agent")).toBeTruthy();
    // Admins are always blog authors; the chip would say nothing.
    expect(ada.queryByText("Blog-Autor")).toBeNull();
    expect(ada.queryByText(/Firm/)).toBeNull();
  });

  it("uses the singular for one company", async () => {
    api({ "GET /admin/users": () => json({ users: [{ ...ERIKA, memberships: [ERIKA.memberships[0]] }] }) });
    await open();
    expect(within(card("erika@example.de")).getByText("1 Firma: Acme")).toBeTruthy();
  });

  it("names the status when the user list cannot be loaded", async () => {
    api({ "GET /admin/users": () => json({}, 500) });
    render(<UsersAdmin />);
    expect(await screen.findByText("Benutzer laden fehlgeschlagen (HTTP 500).")).toBeTruthy();
    expect(screen.getByText("Keine Benutzer.")).toBeTruthy();
  });

  it("still lists users when companies, catalog and groups are unavailable", async () => {
    api({
      "GET /admin/customers": () => json({}, 503),
      "GET /admin/groups": () => json({}, 503),
    });
    await open();
    expect(within(card("erika@example.de")).getByText("2 Firmen: #1, #99")).toBeTruthy();
  });
});

describe("UsersAdmin: creating", () => {
  it("sends a normalised payload and shows the temporary password in-flow", async () => {
    const { sent } = api({ "POST /admin/users": () => json({ tempPassword: "Tmp-123" }) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Neuer Benutzer" }));
    await u.type(screen.getByLabelText("E-Mail"), "neu@example.de");
    await u.type(screen.getByLabelText("Name"), "   ");
    await u.click(screen.getByLabelText("Admin-Panel-Zugang"));
    await u.click(screen.getByLabelText("Support-Agent (Tickets zuweisbar)"));
    expect(screen.getByText(/Admins haben vollen Zugriff/)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(sent("POST", "/admin/users")).toHaveLength(1));
    expect(sent("POST", "/admin/users")[0].body).toEqual({
      email: "neu@example.de",
      name: null,
      isAdmin: true,
      isSupportAgent: true,
      isBlogAuthor: false,
      status: "active",
      memberships: [],
    });
    expect(await screen.findByText("Benutzer angelegt. Temporäres Passwort: Tmp-123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Neuer Benutzer" })).toBeTruthy();
    expect(toasts).toEqual([]);
  });

  it("drops the support-agent flag of a non-admin", async () => {
    const { sent } = api({ "POST /admin/users": () => json({}) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Neuer Benutzer" }));
    await u.type(screen.getByLabelText("E-Mail"), "neu@example.de");
    await u.click(screen.getByLabelText("Admin-Panel-Zugang"));
    await u.click(screen.getByLabelText("Support-Agent (Tickets zuweisbar)"));
    await u.click(screen.getByLabelText("Admin-Panel-Zugang"));
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(toasted("success", "Benutzer angelegt.")).toBe(true));
    expect(sent("POST", "/admin/users")[0].body).toMatchObject({ isAdmin: false, isSupportAgent: false });
  });

  it.each([
    [409, "E-Mail existiert bereits."],
    [500, "Anlegen fehlgeschlagen (HTTP 500)."],
  ])("names a %i refusal", async (status, message) => {
    api({ "POST /admin/users": () => json({}, status) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Neuer Benutzer" }));
    await u.type(screen.getByLabelText("E-Mail"), "neu@example.de");
    await u.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => expect(toasted("danger", message)).toBe(true));
    expect((screen.getByLabelText("E-Mail") as HTMLInputElement).value).toBe("neu@example.de");
  });

  it("keeps the submit disabled until there is an e-mail", async () => {
    api();
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Neuer Benutzer" }));
    expect((screen.getByRole("button", { name: "Anlegen" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("UsersAdmin: editing", () => {
  it("sends the edited user and confirms the save", async () => {
    const { sent } = api({ "PATCH /admin/users/5": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await u.click(await screen.findByLabelText("Aktiv"));
    await u.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(toasted("success", "Benutzer gespeichert.")).toBe(true));
    expect(sent("PATCH", "/admin/users/5")[0].body).toMatchObject({
      email: "erika@example.de",
      name: "Erika Muster",
      isAdmin: false,
      isBlogAuthor: true,
      status: "active",
      memberships: [
        { customerId: 1, permissions: [], groupIds: [] },
        { customerId: 99, permissions: [] },
      ],
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Benutzer bearbeiten" })).toBeNull());
  });

  it.each([
    [409, "Konflikt (z. B. eigener Admin-Zugang)."],
    [500, "Speichern fehlgeschlagen (HTTP 500)."],
  ])("names a %i refusal and keeps the editor open", async (status, message) => {
    api({ "PATCH /admin/users/5": () => json({}, status) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await u.click(await screen.findByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(toasted("danger", message)).toBe(true));
    expect(screen.getByRole("heading", { name: "Benutzer bearbeiten" })).toBeTruthy();
  });
});

describe("UsersAdmin: memberships", () => {
  it("drops every membership of a user made admin", async () => {
    const { sent } = api({ "PATCH /admin/users/5": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await u.click(await screen.findByLabelText("Admin-Panel-Zugang"));
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", "/admin/users/5")).toHaveLength(1));
    expect(sent("PATCH", "/admin/users/5")[0].body).toMatchObject({ isAdmin: true, memberships: [] });
  });

  it("disables company admin where the company does not allow it, and says why", async () => {
    api();
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    const form = await screen.findByRole("heading", { name: "Benutzer bearbeiten" });
    const boxes = () => within(form.closest("form")!).getAllByLabelText(/Firmenadmin/) as HTMLInputElement[];
    await waitFor(() => expect(boxes()[0].disabled).toBe(true));
    expect(screen.getAllByText(/Für diese Firma nicht freigeschaltet/)).toHaveLength(1);
    expect(boxes()[1].disabled).toBe(false);
  });

  it("offers platform groups and the company's own, and sends the choice", async () => {
    const { sent } = api({ "PATCH /admin/users/5": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await screen.findByRole("heading", { name: "Benutzer bearbeiten" });
    expect(screen.queryByText("Fremde Gruppe")).toBeNull();
    await u.click(screen.getAllByRole("checkbox", { name: /Lesen/ })[0]);
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", "/admin/users/5")).toHaveLength(1));
    expect(sent("PATCH", "/admin/users/5")[0].body).toMatchObject({
      memberships: [{ customerId: 1, groupIds: [10] }, { customerId: 99 }],
    });
  });

  it("adds the next free company and removes one", async () => {
    const { sent } = api({ "PATCH /admin/users/5": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    const add = await screen.findByRole("button", { name: "+ Firma hinzufügen" });
    await u.click(add);
    // Acme is taken, so Beta comes next; with both used there is nothing left to add.
    expect((add as HTMLButtonElement).disabled).toBe(true);
    // Only the added company is asked about; the known answers are kept.
    await waitFor(() => expect(sent("GET", "/admin/companies/2/policy")).toHaveLength(1));
    expect(sent("GET", "/admin/companies/1/policy")).toHaveLength(1);
    await u.click(screen.getAllByRole("button", { name: "Entfernen" })[1]);
    await u.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", "/admin/users/5")).toHaveLength(1));
    const memberships = (sent("PATCH", "/admin/users/5")[0].body as { memberships: Array<{ customerId: number }> })
      .memberships;
    expect(memberships.map((m) => m.customerId)).toEqual([1, 2]);
  });

  it("asks for each membership's delegation policy once", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await screen.findByRole("heading", { name: "Benutzer bearbeiten" });
    await waitFor(() => expect(sent("GET", "/admin/companies/99/policy")).toHaveLength(1));
    expect(sent("GET", "/admin/companies/1/policy")).toHaveLength(1);
  });
});

describe("UsersAdmin: password reset", () => {
  it("shows a new temporary password in-flow", async () => {
    api({ "POST /admin/users/5/reset-password": () => json({ tempPassword: "Neu-456" }) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Passwort zurücksetzen" }));
    expect(await screen.findByText("Neues temporäres Passwort für erika@example.de: Neu-456")).toBeTruthy();
  });

  it("confirms a reset that returns no password", async () => {
    api({ "POST /admin/users/5/reset-password": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Passwort zurücksetzen" }));
    await waitFor(() => expect(toasted("success", "Passwort für erika@example.de zurückgesetzt.")).toBe(true));
  });

  it("names a refusal", async () => {
    api({ "POST /admin/users/5/reset-password": () => json({}, 403) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Passwort zurücksetzen" }));
    await waitFor(() => expect(toasted("danger", "Zurücksetzen fehlgeschlagen (HTTP 403).")).toBe(true));
  });
});

describe("UsersAdmin: deleting", () => {
  it("asks first, then deletes and reloads", async () => {
    const { sent } = api({ "DELETE /admin/users/5": () => json({}) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Löschen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Benutzer „Erika Muster“ wirklich löschen?")).toBeTruthy();
    expect(sent("DELETE", "/admin/users/5")).toHaveLength(0);
    await u.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(toasted("success", "erika@example.de gelöscht.")).toBe(true));
    expect(sent("DELETE", "/admin/users/5")).toHaveLength(1);
    expect(sent("GET", "/admin/users").length).toBeGreaterThan(1);
  });

  it("names a refused deletion", async () => {
    api({ "DELETE /admin/users/5": () => json({}, 403) });
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Löschen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(toasted("danger", "Löschen fehlgeschlagen (HTTP 403).")).toBe(true));
  });

  it("deletes nothing when cancelled", async () => {
    const { sent } = api();
    const u = await open();
    await u.click(within(card("erika@example.de")).getByRole("button", { name: "Löschen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(sent("DELETE", "/admin/users/5")).toHaveLength(0);
  });
});
