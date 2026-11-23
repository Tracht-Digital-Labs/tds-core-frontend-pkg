import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ConfirmDialog, describeFailure, FormAlert, Spinner, toast } from "@tracht-digital-labs/tds-shared/components";
import { AnimatedItem, AnimatedList, Collapse, Presence } from "@tracht-digital-labs/tds-shared/motion/react";
import { USERS_URL, type AdminUser, type UserPayload } from "../lib/adminUsers";
import { frontendFetch } from "../lib/auth";
import { fetchCompanies, type Company } from "../lib/companies";
import { fetchGroups, fetchPermissionCatalog, type Group, type PermissionDef } from "../lib/companyAdmin";
import UserForm from "./UserForm";

/**
 * One write to the user API. `frontendFetch` rejects like fetch when the
 * request never reaches the auth API; uncaught, a submit ended without a word
 * and the form stayed open as if nothing had been sent. That case is toasted
 * here as `failure`, so a caller only ever handles an answer.
 */
async function sendWrite(path: string, init: RequestInit, failure: string): Promise<Response | null> {
  const res = await frontendFetch(`${USERS_URL}${path}`, init).catch(() => null);
  if (res === null) toast.danger(describeFailure(null, failure));
  return res;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * Core user management (Benutzerverwaltung) — the base service's own screen. Users
 * live in tds-auth-api (`/admin/users`); the company list comes from
 * `lib/companies.ts`, which prefers the composed `tds-ext-customers` extension
 * and falls back to the legacy customer-api (see that file for why the fallback
 * exists). Beyond list/create/reset/delete it offers the full per-user editor
 * (`UserForm`): admin/support-agent/blog-author flags, account status, and
 * **company memberships with per-company portal permissions** (the fine-grained
 * RBAC). Admins bypass portal permissions, so their memberships are cleared.
 */
export default function UsersAdmin() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    try {
      // Only the user list is required. Companies, the permission catalog and
      // the groups are best-effort and never throw: membership editing works
      // without names (it shows ids), and the permission picker falls back to
      // the shared seed labels, so an outage of the composed API or the legacy
      // customer-api must not take user management down with it.
      const [uRes, companyResult, permissionDefs, groupList] = await Promise.all([
        frontendFetch(USERS_URL),
        fetchCompanies(),
        fetchPermissionCatalog(),
        fetchGroups(),
      ]);
      if (!uRes.ok) throw new Error(`Benutzer laden fehlgeschlagen (HTTP ${uRes.status}).`);
      const uData = await uRes.json();
      setUsers(uData.users ?? []);
      setCompanies(companyResult.companies);
      setCatalog(permissionDefs);
      setGroups(groupList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUsers([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  // A temporary password must be READ and copied, so it stays an in-flow
  // notice — a toast that blends itself away after four seconds would take the
  // credential with it. Every other outcome here is transient and toasted.

  const createUser = async (payload: UserPayload) => {
    setError(null);
    setNotice(null);
    const res = await sendWrite("", json(payload), "Anlegen fehlgeschlagen");
    if (!res) return;
    if (!res.ok) {
      toast.danger(res.status === 409 ? "E-Mail existiert bereits." : `Anlegen fehlgeschlagen (HTTP ${res.status}).`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.tempPassword) setNotice(`Benutzer angelegt. Temporäres Passwort: ${data.tempPassword}`);
    else toast.success("Benutzer angelegt.");
    setShowCreate(false);
    void load();
  };

  const updateUser = async (id: number, payload: UserPayload) => {
    setError(null);
    const res = await sendWrite(`/${id}`, { ...json(payload), method: "PATCH" }, "Speichern fehlgeschlagen");
    if (!res) return;
    if (!res.ok) {
      toast.danger(
        res.status === 409 ? "Konflikt (z. B. eigener Admin-Zugang)." : `Speichern fehlgeschlagen (HTTP ${res.status}).`,
      );
      return;
    }
    setEditingId(null);
    void load();
    // Said out loud: a form that just closes looks identical to Abbrechen.
    toast.success("Benutzer gespeichert.");
  };

  const resetPassword = async (u: AdminUser) => {
    const res = await sendWrite(`/${u.id}/reset-password`, { method: "POST" }, "Zurücksetzen fehlgeschlagen");
    if (!res) return;
    // Without this branch a rejected reset looked exactly like a successful
    // one that happened to return no password.
    if (!res.ok) {
      toast.danger(`Zurücksetzen fehlgeschlagen (HTTP ${res.status}).`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.tempPassword) setNotice(`Neues temporäres Passwort für ${u.email}: ${data.tempPassword}`);
    else toast.success(`Passwort für ${u.email} zurückgesetzt.`);
  };

  // Deletion is two-step: the row button parks the user in `pendingDelete`, the
  // <ConfirmDialog> performs it. `deleting` keeps both dialog buttons disabled
  // while the request is in flight, so the confirm cannot be double-submitted —
  // something `window.confirm()` gave for free by blocking the thread, and
  // which a non-blocking dialog must do explicitly.
  const confirmRemove = async () => {
    const u = pendingDelete;
    if (!u) return;
    setDeleting(true);
    const res = await sendWrite(`/${u.id}`, { method: "DELETE" }, "Löschen fehlgeschlagen");
    setDeleting(false);
    setPendingDelete(null);
    if (!res) return;
    // Reload either way: a refused delete names its status instead of the row
    // silently reappearing.
    void load();
    if (res.ok) toast.success(`${u.email} gelöscht.`);
    else toast.danger(`Löschen fehlgeschlagen (HTTP ${res.status}).`);
  };

  const form = { companies, catalog, groups };

  return (
    <div className="users-admin space-y-6">
      {/* `.status-pill` is an inline LABEL, not a banner. <FormAlert> (danger)
          and `.tds-alert` (any hue) are the block-message primitives. */}
      <FormAlert message={error} />
      {notice ? (
        <p className="tds-alert" style={{ "--tds-alert-hue": "var(--color-info)" } as CSSProperties} role="status">
          {notice}
        </p>
      ) : null}

      <div className="tds-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Abbrechen" : "Neuer Benutzer"}
        </button>
      </div>

      <Collapse open={showCreate}>
        <UserForm {...form} onSubmit={createUser} onCancel={() => setShowCreate(false)} />
      </Collapse>

      {users === null ? (
        <p role="status"><Spinner /></p>
      ) : users.length === 0 ? (
        <p className="tds-empty">Keine Benutzer.</p>
      ) : (
        // Rows arrive, leave (delete) and reflow animated; each card swaps
        // between its summary and its edit form in place.
        <AnimatedList className="tds-stack">
          {users.map((u) => (
            <AnimatedItem key={u.id} className="tds-card p-4">
              <Presence view={editingId === u.id ? "edit" : "view"}>
                {editingId === u.id ? (
                  <UserForm
                    {...form}
                    initial={u}
                    onSubmit={(payload) => void updateUser(u.id, payload)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <UserSummary
                    user={u}
                    companyName={companyName}
                    onEdit={() => setEditingId(u.id)}
                    onResetPassword={() => void resetPassword(u)}
                    onDelete={() => setPendingDelete(u)}
                  />
                )}
              </Presence>
            </AnimatedItem>
          ))}
        </AnimatedList>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Benutzer „${pendingDelete?.name ?? pendingDelete?.email ?? ""}“ wirklich löschen?`}
        message="Der Zugang und alle Firmen-Mitgliedschaften werden entfernt. Das lässt sich nicht rückgängig machen."
        busy={deleting}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/** `2 Firmen: Acme, #99`, naming a company the list does not know by its id. */
function companiesLabel(user: AdminUser, companyName: Map<number, string>): string {
  const memberships = user.memberships ?? [];
  const count = `${memberships.length} ${memberships.length === 1 ? "Firma" : "Firmen"}`;
  if (memberships.length === 0) return count;
  return `${count}: ${memberships.map((m) => companyName.get(m.customerId) ?? `#${m.customerId}`).join(", ")}`;
}

function UserSummary({
  user: u,
  companyName,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  user: AdminUser;
  companyName: Map<number, string>;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium">{u.name ?? "—"}</p>
        <p className="text-sm opacity-70 break-all">{u.email}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {u.isAdmin ? <span className="chip chip--cat-violet">Admin</span> : null}
          {u.isAdmin && u.isSupportAgent ? <span className="chip chip--cat-teal">Support-Agent</span> : null}
          {/* Admins are always blog authors; the chip would say nothing. */}
          {u.isBlogAuthor && !u.isAdmin ? <span className="chip chip--cat-amber">Blog-Autor</span> : null}
          {u.status === "disabled" ? <span className="chip chip--cat-rose">Gesperrt</span> : null}
          {!u.isAdmin ? <span className="text-xs opacity-60">{companiesLabel(u, companyName)}</span> : null}
        </div>
      </div>
      {/* `.tds-toolbar`, not a hand-rolled flex row: this used to carry
          `shrink-0`, which pinned three buttons at their full width and pushed
          the card 52px past a 375px viewport — invisible, because
          body{overflow-x:hidden} CLIPS it. */}
      <div className="tds-toolbar">
        <button type="button" className="btn btn-ghost" onClick={onEdit}>Bearbeiten</button>
        <button type="button" className="btn btn-ghost" onClick={onResetPassword}>Passwort zurücksetzen</button>
        <button type="button" className="btn btn-danger" onClick={onDelete}>Löschen</button>
      </div>
    </div>
  );
}
