import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, FormAlert, Spinner, toast } from "@tracht-digital-labs/tds-shared/components";
import { Collapse } from "@tracht-digital-labs/tds-shared/motion/react";

import { fetchMe, membershipIds, type Me } from "../lib/auth";
import { fetchCompanies, type Company } from "../lib/companies";
import { getActiveCompany } from "../lib/activeCompany";
import {
  createCompanyUser,
  describeFailure,
  fetchCompanyUsers,
  removeCompanyUser,
  updateCompanyUser,
  type CompanyMember,
  type CompanyUsersPayload,
} from "../lib/companyAdmin";
import { bodyOf, draftOf, emptyDraft, grantableRights, pickCompany, seatsFull, type Draft } from "../lib/companyUsers";
import CompanyMemberForm from "./CompanyMemberForm";
import CompanyMembersTable from "./CompanyMembersTable";

/**
 * A company admin managing their OWN company's users.
 *
 * ### Why this lives in the host and not in the Firmen extension
 *
 * `tds-customer-frontend` composes only support-tickets, billing, messages,
 * projects and documents — the Firmen extension is admin-product only. A
 * company admin signs in to the PORTAL, so the screen has to come from the
 * shell, which both products build.
 *
 * ### What the server decides, and what this screen only renders
 *
 * The seat cap, the permission ceiling and the assignable groups all arrive in
 * the list payload. This screen never computes them: it shows what the backend
 * says is allowed and lets the backend refuse anything else. Filtering the
 * checkboxes here is a courtesy — `CompanyUserGuard` is the boundary, and it
 * names its refusals (`seat_limit`, `permission_not_allowed`, …) so a rejection
 * says which right was the problem instead of "Forbidden".
 */
export default function CompanyUsersAdmin() {
  const { me, companyId, directory, payload, error, loading, select, reload } = useCompanyUsers();
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<CompanyMember | null>(null);

  function startEditing(id: number | "new", next: Draft) {
    setDraft(next);
    setEditingId(id);
    setNotice("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (companyId === null || editingId === null) return;
    setSaving(true);
    try {
      const { res, data } =
        editingId === "new"
          ? await createCompanyUser(companyId, bodyOf(draft))
          : await updateCompanyUser(companyId, editingId, bodyOf(draft));

      // Never await a mutation and drop the response.
      if (!data) {
        toast.danger(await describeFailure(res, "Speichern fehlgeschlagen"));
        return;
      }

      const temporary = "temporaryPassword" in data ? data.temporaryPassword : null;
      if (temporary) {
        // A credential has to be READ and copied, so it stays in the flow — a
        // toast would fade it away with the password still uncopied.
        setNotice(`Benutzer angelegt. Temporäres Passwort: ${temporary}`);
      } else {
        toast.success(editingId === "new" ? "Benutzer angelegt." : "Benutzer gespeichert.");
      }

      setEditingId(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function remove(member: CompanyMember) {
    if (companyId === null) return;
    const { res, data } = await removeCompanyUser(companyId, member.id);
    setPendingRemove(null);
    if (!data) {
      toast.danger(await describeFailure(res, "Entfernen fehlgeschlagen"));
      return;
    }
    // "Entfernt", not "gelöscht": the account survives, it just no longer
    // belongs to this company.
    toast.success("Benutzer aus der Firma entfernt.");
    await reload();
  }

  if (loading) {
    return (
      <div className="tds-card" style={{ padding: "1.5rem" }}>
        <Spinner size="lg" tone="primary" />
      </div>
    );
  }

  if (companyId === null) {
    return (
      <p className="tds-alert" role="status">
        {me?.isAdmin
          ? "Es sind keine Firmen angelegt."
          : "Sie verwalten derzeit keine Firma. Ein Administrator kann Ihnen diese Rolle geben."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <FormAlert message={error} />}

      {/* Platform admins only: they belong to no company, so without a picker
          this page would have nothing to show — while the API happily lets
          them manage any of them. Requirement: "als Universaladmin alle Rechte
          auch intern dieser Firma bearbeiten". */}
      {directory.length > 0 && (
        <label className="block">
          <span className="text-sm">Firma</span>
          <select
            className="field-boxed"
            value={companyId}
            onChange={(e) => {
              setEditingId(null);
              void select(Number(e.target.value));
            }}
          >
            {directory.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {notice && (
        <p className="tds-alert tds-alert--success" role="status">
          {notice}
        </p>
      )}

      {payload && (
        <SeatSummary
          payload={payload}
          canAdd={!seatsFull(payload) && editingId === null}
          onAdd={() => startEditing("new", emptyDraft())}
        />
      )}

      {/* Opens in place; the table below slides down instead of jumping. */}
      <Collapse open={editingId !== null}>
        {editingId !== null && (
          <CompanyMemberForm
            draft={draft}
            onDraft={setDraft}
            isNew={editingId === "new"}
            groups={payload?.groups ?? []}
            grantable={grantableRights(payload)}
            ceiling={payload?.allowedPermissions ?? null}
            saving={saving}
            onSubmit={save}
            onCancel={() => setEditingId(null)}
          />
        )}
      </Collapse>

      <CompanyMembersTable
        users={payload?.users ?? []}
        groups={payload?.groups ?? []}
        onEdit={(member) => startEditing(member.id, draftOf(member))}
        onRemove={setPendingRemove}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`„${pendingRemove?.label ?? ""}“ entfernen?`}
        message="Das Konto bleibt bestehen und verliert nur den Zugang zu dieser Firma. Wenn die Person noch zu anderen Firmen gehört, bleibt der Zugang dorthin unberührt."
        confirmLabel="Entfernen"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove && void remove(pendingRemove)}
      />
    </div>
  );
}

/** Seats in use against the cap, and the add button. */
function SeatSummary({ payload, canAdd, onAdd }: { payload: CompanyUsersPayload; canAdd: boolean; onAdd: () => void }) {
  const { used, max } = payload.seats;
  return (
    <div className="tds-card" style={{ padding: "1rem" }}>
      <div className="tds-row" style={{ justifyContent: "space-between", gap: "1rem" }}>
        <span className="text-sm">
          <strong>{used}</strong>
          {max !== null ? ` von ${max}` : ""} Benutzerplätzen belegt
          {max === null && " (unbegrenzt)"}
        </span>
        <button type="button" className="btn btn-primary" disabled={!canAdd} onClick={onAdd}>
          Benutzer hinzufügen
        </button>
      </div>
      {seatsFull(payload) && (
        <p className="text-xs" style={{ color: "var(--color-muted)", marginTop: "0.5rem" }}>
          Alle Plätze sind belegt. Entfernen Sie einen Benutzer oder fragen Sie nach mehr Plätzen.
        </p>
      )}
    </div>
  );
}

/**
 * Who is asking, which companies they may manage here, and the open
 * company's users.
 *
 * A platform admin administers every company — CompanyAdminMiddleware lets
 * them through this surface regardless of memberships (they have none) and
 * regardless of whether the company's delegation is switched on, because that
 * grant limits what a COMPANY may do on its own. So they get the directory and
 * a picker. Everyone else gets only the companies they ADMINISTER: a plain
 * membership would render a screen where every write 403s.
 */
function useCompanyUsers() {
  const [me, setMe] = useState<Me | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  /** Non-empty only for a platform admin: every company, for the picker. */
  const [directory, setDirectory] = useState<Company[]>([]);
  const [payload, setPayload] = useState<CompanyUsersPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: number) => {
    const { res, data } = await fetchCompanyUsers(id);
    if (!data) {
      setError(await describeFailure(res, "Benutzer konnten nicht geladen werden"));
      setPayload(null);
      return;
    }
    setPayload(data);
    setError("");
  }, []);

  useEffect(() => {
    void (async () => {
      const principal = await fetchMe();
      setMe(principal);

      let ids: number[];
      if (principal?.isAdmin) {
        const { companies } = await fetchCompanies();
        setDirectory(companies);
        ids = companies.map((c) => c.id);
      } else {
        ids = membershipIds(principal, (c) => c.isCompanyAdmin === true);
      }

      const active = pickCompany(getActiveCompany(), ids);
      setCompanyId(active);
      if (active !== null) await load(active);
      setLoading(false);
    })();
  }, [load]);

  const select = useCallback(
    (id: number) => {
      setCompanyId(id);
      return load(id);
    },
    [load],
  );

  const reload = useCallback(async () => {
    if (companyId !== null) await load(companyId);
  }, [companyId, load]);

  return { me, companyId, directory, payload, error, loading, select, reload };
}
