import { useState, type SubmitEvent } from "react";
import type { AdminUser, Membership, UserPayload } from "../lib/adminUsers";
import type { Company } from "../lib/companies";
import type { Group, PermissionDef } from "../lib/companyAdmin";
import MembershipEditor, { useCompanyAdminDelegation } from "./MembershipEditor";

interface UserFormProps {
  companies: Company[];
  /** The composed permission catalog; empty falls back to the seed set. */
  catalog: PermissionDef[];
  /** Groups assignable in the companies this form can reach. */
  groups: Group[];
  /** The user being edited; absent for a new one. */
  initial?: AdminUser;
  onSubmit: (payload: UserPayload) => void;
  onCancel?: () => void;
}

/** A record from before memberships carries one company on the user itself. */
function initialMemberships(user: AdminUser | undefined): Membership[] {
  if (user?.memberships) return user.memberships;
  if (user?.customerId != null) return [{ customerId: user.customerId, permissions: user.permissions ?? [] }];
  return [];
}

/** Create or edit one user: identity, roles, status and, for non-admins, company memberships. */
export default function UserForm({ companies, catalog, groups, initial, onSubmit, onCancel }: UserFormProps) {
  const editing = initial !== undefined;
  const [email, setEmail] = useState(initial?.email ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [isSupportAgent, setIsSupportAgent] = useState(initial?.isSupportAgent ?? false);
  const [isBlogAuthor, setIsBlogAuthor] = useState(initial?.isBlogAuthor ?? false);
  const [status, setStatus] = useState<"active" | "disabled">(initial?.status ?? "active");
  const [memberships, setMemberships] = useState<Membership[]>(() => initialMemberships(initial));

  const usedCompanyIds = new Set(memberships.map((m) => m.customerId));
  const availableCompanies = companies.filter((c) => !usedCompanyIds.has(c.id));
  const delegation = useCompanyAdminDelegation([...usedCompanyIds]);

  const addMembership = () => {
    const next = availableCompanies[0];
    if (next) setMemberships([...memberships, { customerId: next.id, permissions: [] }]);
  };
  const updateMembership = (index: number, patch: Partial<Membership>) =>
    setMemberships(memberships.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  const removeMembership = (index: number) => setMemberships(memberships.filter((_, i) => i !== index));

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    onSubmit({
      email: email.trim(),
      name: name.trim() === "" ? null : name.trim(),
      isAdmin,
      isSupportAgent: isAdmin && isSupportAgent,
      isBlogAuthor,
      status,
      // Admins bypass portal permissions — no company memberships.
      memberships: isAdmin ? [] : memberships.filter((m) => m.customerId > 0),
    });
  };

  return (
    <form className="user-form space-y-4" onSubmit={submit}>
      <h3 className="font-medium">{editing ? "Benutzer bearbeiten" : "Neuer Benutzer"}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm mb-1 block">E-Mail</span>
          <input
            type="email"
            className="field-boxed w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm mb-1 block">Name</span>
          <input className="field-boxed w-full" value={name ?? ""} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>Admin-Panel-Zugang</span>
        </label>
        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isSupportAgent} onChange={(e) => setIsSupportAgent(e.target.checked)} />
            <span>Support-Agent (Tickets zuweisbar)</span>
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAdmin || isBlogAuthor}
            disabled={isAdmin}
            onChange={(e) => setIsBlogAuthor(e.target.checked)}
          />
          <span>Blog-Autor{isAdmin ? " (Admins immer)" : ""}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={status === "active"}
            onChange={(e) => setStatus(e.target.checked ? "active" : "disabled")}
          />
          <span>Aktiv</span>
        </label>
      </div>

      {isAdmin ? (
        <p className="text-xs opacity-60">
          Admins haben vollen Zugriff: Firmen-Zuordnungen &amp; Portal-Berechtigungen entfallen.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Firmen &amp; Berechtigungen</span>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={addMembership}
              disabled={availableCompanies.length === 0}
            >
              + Firma hinzufügen
            </button>
          </div>
          {memberships.length === 0 ? (
            <p className="text-xs opacity-60">Keine Firma zugeordnet, dieses Konto kann sich anmelden, sieht aber kein Portal.</p>
          ) : null}
          {memberships.map((m, i) => (
            <MembershipEditor
              key={m.customerId}
              membership={m}
              companies={companies.filter((c) => c.id === m.customerId || !usedCompanyIds.has(c.id))}
              catalog={catalog}
              groups={groups}
              allowsCompanyAdmins={delegation.get(m.customerId)}
              onChange={(patch) => updateMembership(i, patch)}
              onRemove={() => removeMembership(i)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={email.trim() === ""}>
          {editing ? "Speichern" : "Anlegen"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
        ) : null}
      </div>
    </form>
  );
}
