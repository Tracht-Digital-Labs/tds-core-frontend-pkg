// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_EVENT, type ToastDetail } from "@tracht-digital-labs/tds-shared/toast";
import { invalidateMe } from "../lib/auth";
import { getActiveCompany, setActiveCompany } from "../lib/activeCompany";
import CompanyUsersAdmin from "./CompanyUsersAdmin";

/**
 * A company admin managing their own company's users, against a scripted auth
 * API: which company opens, what the seat line and the table show, what each
 * write sends, and what a person reads after it.
 */

let toasts: ToastDetail[];
const collect = (e: Event) => toasts.push((e as CustomEvent<ToastDetail>).detail);
const toasted = (variant: string, message: string) =>
  toasts.some((t) => t.variant === variant && t.message === message);

const COMPANY_ADMIN = {
  userId: 1,
  email: "chefin@example.de",
  companies: [
    { companyId: 3, isCompanyAdmin: false },
    { companyId: 4, isCompanyAdmin: true },
    { companyId: 5, isCompanyAdmin: true },
  ],
};
const PLATFORM_ADMIN = { userId: 2, email: "root@example.de", isAdmin: true, companies: [] };

const GROUPS = [
  { id: 20, companyId: 4, slug: "buchhaltung", name: "Buchhaltung", description: "Rechnungen und Zahlungen", permissions: ["invoices.view", "invoices.pay"], isSystem: false, scope: "company" },
  { id: 21, companyId: 4, slug: "lesen", name: "Lesen", description: null, permissions: ["documents.view"], isSystem: true, scope: "platform" },
];
const MAX = {
  id: 7,
  email: "max@example.de",
  name: "Max Muster",
  displayName: null,
  label: "Max Muster",
  status: "active",
  permissions: ["documents.view"],
  permissionDenies: ["invoices.pay"],
  groupIds: [20],
  isCompanyAdmin: true,
};
const EVA = { ...MAX, id: 8, email: "eva@example.de", name: null, label: "eva@example.de", status: "disabled", permissions: [], permissionDenies: [], groupIds: [], isCompanyAdmin: false };

const payload = (over: Record<string, unknown> = {}) => ({
  users: [MAX, EVA],
  seats: { used: 2, max: 5, remaining: 3 },
  allowedPermissions: ["documents.view", "invoices.view", "invoices.pay", "projects.edit"],
  allowCustomGroups: true,
  allowCompanyAdmins: true,
  groups: GROUPS,
  ...over,
});

type Handler = (body: unknown) => Response;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Scripted answers by `METHOD path-suffix`; every request is recorded. */
function api(me: unknown, overrides: Record<string, Handler> = {}) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const routes: Record<string, Handler> = {
    "GET /me": () => json(me),
    "GET /admin/customers": () => json({ companies: [{ id: 4, name: "Acme" }, { id: 6, name: "Beta" }] }),
    "GET /company/4/users": () => json(payload()),
    "GET /company/5/users": () => json(payload({ users: [] })),
    "GET /company/6/users": () => json(payload({ users: [EVA] })),
    ...overrides,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, path, body });
      const key = Object.keys(routes).find((k) => {
        const [m, suffix] = k.split(" ");
        return m === method && path.endsWith(suffix);
      });
      return key ? routes[key](body) : new Response("{}", { status: 404 });
    }),
  );
  const sent = (method: string, suffix: string) =>
    requests.filter((r) => r.method === method && r.path.endsWith(suffix));
  return { requests, sent };
}

async function open(text = "max@example.de") {
  const u = userEvent.setup();
  render(<CompanyUsersAdmin />);
  await screen.findAllByText(text);
  return u;
}

const row = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;
const form = () => screen.getByRole("heading", { level: 2 }).closest("form") as HTMLElement;

beforeEach(() => {
  toasts = [];
  window.addEventListener(TOAST_EVENT, collect);
  localStorage.clear();
  invalidateMe();
});

afterEach(() => {
  window.removeEventListener(TOAST_EVENT, collect);
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompanyUsersAdmin: which company opens", () => {
  it("opens the first administered company, skipping a plain membership", async () => {
    const { sent } = api(COMPANY_ADMIN);
    await open();
    expect(sent("GET", "/company/4/users")).toHaveLength(1);
    expect(screen.queryByRole("combobox", { name: "Firma" })).toBeNull();
  });

  it("opens the stored company when this person administers it", async () => {
    setActiveCompany(5);
    const { sent } = api(COMPANY_ADMIN);
    await open("Noch keine weiteren Benutzer in dieser Firma.");
    expect(sent("GET", "/company/5/users")).toHaveLength(1);
  });

  it("falls back from a stored plain membership without clearing the panel's pick", async () => {
    setActiveCompany(3);
    const { sent } = api(COMPANY_ADMIN);
    await open();
    expect(sent("GET", "/company/4/users")).toHaveLength(1);
    expect(getActiveCompany()).toBe(3);
  });

  it("tells a person without an administered company what to ask for", async () => {
    const { sent } = api({ ...COMPANY_ADMIN, companies: [{ companyId: 3, isCompanyAdmin: false }] });
    render(<CompanyUsersAdmin />);
    expect(
      await screen.findByText("Sie verwalten derzeit keine Firma. Ein Administrator kann Ihnen diese Rolle geben."),
    ).toBeTruthy();
    expect(sent("GET", "/users")).toHaveLength(0);
  });

  it("gives a platform admin a picker over every company", async () => {
    setActiveCompany(6);
    const { sent } = api(PLATFORM_ADMIN);
    const u = await open("eva@example.de");
    const picker = screen.getByRole("combobox", { name: "Firma" }) as HTMLSelectElement;
    expect(picker.value).toBe("6");
    expect([...picker.options].map((o) => o.text)).toEqual(["Acme", "Beta"]);

    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    await u.selectOptions(picker, "4");
    await screen.findByText("max@example.de");
    expect(sent("GET", "/company/4/users")).toHaveLength(1);
    // Switching company closes an open editor; its draft belonged to the old one.
    expect(screen.queryByRole("heading", { name: "Neuer Benutzer" })).toBeNull();
  });

  it("opens the first company for a platform admin whose stored pick is unknown", async () => {
    setActiveCompany(99);
    const { sent } = api(PLATFORM_ADMIN);
    await open();
    expect(sent("GET", "/company/4/users")).toHaveLength(1);
  });

  it("says so when a platform admin has no companies at all", async () => {
    api(PLATFORM_ADMIN, { "GET /admin/customers": () => json({ companies: [] }) });
    render(<CompanyUsersAdmin />);
    expect(await screen.findByText("Es sind keine Firmen angelegt.")).toBeTruthy();
  });
});

describe("CompanyUsersAdmin: the list", () => {
  it("names a failed load with its status", async () => {
    api(COMPANY_ADMIN, { "GET /company/4/users": () => json({}, 500) });
    render(<CompanyUsersAdmin />);
    expect(await screen.findByText("Benutzer konnten nicht geladen werden (HTTP 500).")).toBeTruthy();
  });

  it("drops the load error once another company loads", async () => {
    setActiveCompany(6);
    api(PLATFORM_ADMIN, { "GET /company/6/users": () => json({}, 503) });
    const u = userEvent.setup();
    render(<CompanyUsersAdmin />);
    await screen.findByText("Benutzer konnten nicht geladen werden (HTTP 503).");
    await u.selectOptions(screen.getByRole("combobox", { name: "Firma" }), "4");
    await screen.findByText("max@example.de");
    expect(screen.queryByText(/nicht geladen werden/)).toBeNull();
  });

  it("shows each member's label, email, admin chip, groups and status", async () => {
    api(COMPANY_ADMIN);
    await open();
    const max = within(row("max@example.de"));
    expect(max.getByText("Max Muster")).toBeTruthy();
    expect(max.getByText("Firmenadmin")).toBeTruthy();
    expect(max.getByText("Buchhaltung")).toBeTruthy();
    expect(max.getByText("Aktiv")).toBeTruthy();

    const eva = within(screen.getAllByText("eva@example.de")[0]!.closest("tr") as HTMLElement);
    expect(eva.queryByText("Firmenadmin")).toBeNull();
    expect(eva.getByText("Deaktiviert").className).toContain("opacity-70");
    expect(screen.queryByText("Noch keine weiteren Benutzer in dieser Firma.")).toBeNull();
  });

  it("joins several group names and skips an unknown group id", async () => {
    api(COMPANY_ADMIN, {
      "GET /company/4/users": () => json(payload({ users: [{ ...MAX, groupIds: [20, 99, 21] }] })),
    });
    await open();
    expect(within(row("max@example.de")).getByText("Buchhaltung, Lesen")).toBeTruthy();
  });

  it("counts seats against the cap", async () => {
    api(COMPANY_ADMIN);
    await open();
    expect(screen.getByText(/von 5 Benutzerplätzen belegt/).textContent).toBe("2 von 5 Benutzerplätzen belegt");
    expect((screen.getByRole("button", { name: "Benutzer hinzufügen" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says unlimited when there is no cap", async () => {
    api(COMPANY_ADMIN, {
      "GET /company/4/users": () => json(payload({ seats: { used: 2, max: null, remaining: null } })),
    });
    await open();
    expect(screen.getByText(/Benutzerplätzen belegt/).textContent).toBe("2 Benutzerplätzen belegt (unbegrenzt)");
  });

  it("blocks adding when every seat is taken and says what to do", async () => {
    api(COMPANY_ADMIN, {
      "GET /company/4/users": () => json(payload({ seats: { used: 5, max: 5, remaining: 0 } })),
    });
    await open();
    expect((screen.getByRole("button", { name: "Benutzer hinzufügen" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Alle Plätze sind belegt. Entfernen Sie einen Benutzer oder fragen Sie nach mehr Plätzen."),
    ).toBeTruthy();
  });
});

describe("CompanyUsersAdmin: creating and editing", () => {
  it("sends a new member and shows a temporary password in the page, not in a toast", async () => {
    const { sent } = api(COMPANY_ADMIN, {
      "POST /company/4/users": () => json({ user: {}, temporaryPassword: "Xy-123" }),
    });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    expect(screen.getByText(/Existiert bereits ein Konto mit dieser Adresse/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Benutzer hinzufügen" }) as HTMLButtonElement).disabled).toBe(true);

    const f = within(form());
    await u.type(f.getByRole("textbox", { name: /^E-Mail/ }), "  neu@example.de ");
    await u.click(f.getByRole("checkbox", { name: /Lesen/ }));
    await u.click(f.getByRole("checkbox", { name: "projects.edit" }));
    await u.click(f.getByRole("checkbox", { name: /Firmenadmin/ }));
    await u.selectOptions(f.getByRole("combobox", { name: "Status" }), "disabled");
    await u.click(f.getByRole("button", { name: "Speichern" }));

    await screen.findByText("Benutzer angelegt. Temporäres Passwort: Xy-123");
    expect(sent("POST", "/company/4/users")[0]?.body).toEqual({
      email: "neu@example.de",
      name: null,
      permissions: ["projects.edit"],
      permissionDenies: [],
      groupIds: [21],
      isCompanyAdmin: true,
      status: "disabled",
    });
    expect(toasts).toEqual([]);
    expect(sent("GET", "/company/4/users")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Neuer Benutzer" })).toBeNull();
  });

  it("confirms a new member without a password in a toast", async () => {
    api(COMPANY_ADMIN, { "POST /company/4/users": () => json({ user: {}, temporaryPassword: null }) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    await u.type(within(form()).getByRole("textbox", { name: /^E-Mail/ }), "neu@example.de");
    await u.type(within(form()).getByRole("textbox", { name: "Name" }), " Neu ");
    await u.click(within(form()).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(toasted("success", "Benutzer angelegt.")).toBe(true));
  });

  it("opens a member with their stored values and saves the edit", async () => {
    const { sent } = api(COMPANY_ADMIN, { "PATCH /company/4/users/7": () => json({ user: {} }) });
    const u = await open();
    await u.click(within(row("max@example.de")).getByRole("button", { name: "Bearbeiten" }));
    const f = within(form());
    expect(f.getByRole("heading", { name: "Benutzer bearbeiten" })).toBeTruthy();
    expect(f.queryByText(/Existiert bereits ein Konto/)).toBeNull();
    expect((f.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Max Muster");
    expect((f.getByRole("checkbox", { name: /Buchhaltung/ }) as HTMLInputElement).checked).toBe(true);
    // A right the group grants shows its source; the stored deny is selected.
    expect(f.getAllByText("aus Gruppe „Buchhaltung“")).toHaveLength(2);
    const pay = f.getByRole("radiogroup", { name: "invoices.pay" });
    expect(within(pay).getByRole("radio", { name: "Entzogen" }).getAttribute("aria-checked")).toBe("true");

    await u.clear(f.getByRole("textbox", { name: "Name" }));
    await u.type(f.getByRole("textbox", { name: "Name" }), "Max M.");
    await u.click(within(pay).getByRole("radio", { name: "Aus Gruppe" }));
    await u.click(f.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(toasted("success", "Benutzer gespeichert.")).toBe(true));
    expect(sent("PATCH", "/company/4/users/7")[0]?.body).toEqual({
      email: "max@example.de",
      name: "Max M.",
      permissions: ["documents.view"],
      permissionDenies: [],
      groupIds: [20],
      isCompanyAdmin: true,
      status: "active",
    });
  });

  it("names the refusal and keeps the form open", async () => {
    api(COMPANY_ADMIN, {
      "POST /company/4/users": () => json({ code: "seat_limit", used: 5, max: 5 }, 422),
    });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    await u.type(within(form()).getByRole("textbox", { name: /^E-Mail/ }), "neu@example.de");
    await u.click(within(form()).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(toasted("danger", "Keine freien Benutzerplätze mehr (5 von 5).")).toBe(true));
    expect(screen.getByRole("heading", { name: "Neuer Benutzer" })).toBeTruthy();
    expect((within(form()).getByRole("button", { name: "Speichern" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers every right the groups mention when the company has no ceiling", async () => {
    api(COMPANY_ADMIN, { "GET /company/4/users": () => json(payload({ allowedPermissions: null })) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    const boxes = within(form())
      .getAllByRole("checkbox")
      .map((b) => b.closest("label")?.textContent);
    expect(boxes).toEqual([
      "BuchhaltungRechnungen und Zahlungen",
      "Lesen",
      "documents.view",
      "invoices.pay",
      "invoices.view",
      "FirmenadminDarf die Benutzer dieser Firma verwalten, also auch diese Seite hier.",
    ]);
  });

  it("drops a group when it is unticked", async () => {
    const { sent } = api(COMPANY_ADMIN, { "PATCH /company/4/users/7": () => json({ user: {} }) });
    const u = await open();
    await u.click(within(row("max@example.de")).getByRole("button", { name: "Bearbeiten" }));
    await u.click(within(form()).getByRole("checkbox", { name: /Buchhaltung/ }));
    expect(within(form()).queryByText("aus Gruppe „Buchhaltung“")).toBeNull();
    await u.click(within(form()).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sent("PATCH", "/company/4/users/7")).toHaveLength(1));
    expect((sent("PATCH", "/company/4/users/7")[0]?.body as { groupIds: number[] }).groupIds).toEqual([]);
  });

  it("hides the group list when the company has no groups", async () => {
    api(COMPANY_ADMIN, { "GET /company/4/users": () => json(payload({ groups: [] })) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    expect(within(form()).queryByText("Gruppen")).toBeNull();
  });

  it("closes the form on cancel and clears the password notice on the next edit", async () => {
    api(COMPANY_ADMIN, { "POST /company/4/users": () => json({ user: {}, temporaryPassword: "Xy-123" }) });
    const u = await open();
    await u.click(screen.getByRole("button", { name: "Benutzer hinzufügen" }));
    await u.type(within(form()).getByRole("textbox", { name: /^E-Mail/ }), "neu@example.de");
    await u.click(within(form()).getByRole("button", { name: "Speichern" }));
    await screen.findByText(/Temporäres Passwort/);

    await u.click(within(row("max@example.de")).getByRole("button", { name: "Bearbeiten" }));
    expect(screen.queryByText(/Temporäres Passwort/)).toBeNull();
    await u.click(within(form()).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("heading", { name: "Benutzer bearbeiten" })).toBeNull();
  });
});

describe("CompanyUsersAdmin: removing", () => {
  it("asks first, then removes the member from the company only", async () => {
    const { sent } = api(COMPANY_ADMIN, { "DELETE /company/4/users/7": () => json({ ok: true }) });
    const u = await open();
    await u.click(within(row("max@example.de")).getByRole("button", { name: "Entfernen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("„Max Muster“ entfernen?")).toBeTruthy();
    expect(sent("DELETE", "/users/7")).toHaveLength(0);

    await u.click(within(dialog).getByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(toasted("success", "Benutzer aus der Firma entfernt.")).toBe(true));
    expect(sent("DELETE", "/company/4/users/7")).toHaveLength(1);
    expect(sent("GET", "/company/4/users")).toHaveLength(2);
  });

  it("names a refused removal", async () => {
    api(COMPANY_ADMIN, { "DELETE /company/4/users/7": () => json({ code: "last_company_admin" }, 409) });
    const u = await open();
    await u.click(within(row("max@example.de")).getByRole("button", { name: "Entfernen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(toasted("danger", "Die Firma braucht mindestens einen Firmenadmin.")).toBe(true));
  });

  it("sends nothing when the question is cancelled", async () => {
    const { sent } = api(COMPANY_ADMIN);
    const u = await open();
    await u.click(within(row("max@example.de")).getByRole("button", { name: "Entfernen" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(sent("DELETE", "/users/7")).toHaveLength(0);
  });
});
