import { useEffect, useState } from "react";
import { PORTAL_PERMISSIONS, PORTAL_PERMISSION_LABELS } from "@tracht-digital-labs/tds-shared/permissions";
import type { Membership } from "../lib/adminUsers";
import type { Company } from "../lib/companies";
import { fetchCompanyPolicy, type Group, type PermissionDef } from "../lib/companyAdmin";
import PermissionMatrix from "./PermissionMatrix";

/**
 * `companyId -> may it have company admins`, for the companies in `ids`.
 * Asked per company as the form reaches it rather than up front: the list
 * screen shows every user and would otherwise fetch a policy for every company
 * on a page where nobody is editing anything. Best-effort like every other
 * call here: an unreachable auth-api leaves the answer unknown, and the
 * backend does the refusing.
 */
export function useCompanyAdminDelegation(ids: number[]): Map<number, boolean> {
  const [delegation, setDelegation] = useState<Map<number, boolean>>(new Map());
  const unknown = ids.filter((id) => !delegation.has(id));
  const unknownKey = unknown.join(",");

  useEffect(() => {
    if (unknown.length === 0) return;
    let cancelled = false;
    void (async () => {
      const answers = await Promise.all(
        unknown.map(async (id) => [id, (await fetchCompanyPolicy(id)).data?.policy] as const),
      );
      if (cancelled) return;
      setDelegation((current) => {
        const next = new Map(current);
        for (const [id, policy] of answers) {
          if (policy !== undefined) next.set(id, policy.allowCompanyAdmins);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // `unknownKey` stands for `unknown`, which is a new array every render.
  }, [unknownKey]);

  return delegation;
}

interface MembershipEditorProps {
  membership: Membership;
  /** Companies this membership may switch to: its own plus every unused one. */
  companies: Company[];
  /** The composed permission catalog; empty falls back to the seed set. */
  catalog: PermissionDef[];
  groups: Group[];
  /** Whether the company may have company admins; undefined while unknown. */
  allowsCompanyAdmins: boolean | undefined;
  onChange: (patch: Partial<Membership>) => void;
  onRemove: () => void;
}

/** One company membership: the company, the company-admin flag, groups and direct rights. */
export default function MembershipEditor({
  membership: m,
  companies,
  catalog,
  groups,
  allowsCompanyAdmins,
  onChange,
  onRemove,
}: MembershipEditorProps) {
  const groupIds = m.groupIds ?? [];
  const companyGroups = groups.filter((g) => g.scope === "platform" || g.companyId === m.customerId);

  return (
    <div className="tds-card p-3 space-y-3">
      {/* Wraps: a dropdown's min width is set by its widest option —
          company names here — so it cannot shrink to share a row with
          the button on a phone. (Don't write the tag name in this
          comment: lint-primitives is a regex scan and reads it as an
          unclassed control.) */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="field-boxed"
          value={String(m.customerId)}
          onChange={(e) => onChange({ customerId: Number(e.target.value) })}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          {/* Fallback when the company list is unavailable but a membership exists. */}
          {companies.every((c) => c.id !== m.customerId) ? (
            <option value={m.customerId}>Firma #{m.customerId}</option>
          ) : null}
        </select>
        <button type="button" className="btn btn-danger text-xs ml-auto" onClick={onRemove}>Entfernen</button>
      </div>

      <label className="tds-list__row" style={{ gap: "0.625rem" }}>
        <input
          type="checkbox"
          checked={m.isCompanyAdmin ?? false}
          // Unknown (policy still loading) counts as allowed: the backend
          // refuses with a named 422 either way, and disabling a control on a
          // pending fetch reads as "not permitted".
          disabled={allowsCompanyAdmins === false}
          onChange={(e) => onChange({ isCompanyAdmin: e.target.checked })}
        />
        <span className="flex flex-col">
          <span className="text-sm">Firmenadmin</span>
          <span className="text-xs opacity-70">
            {allowsCompanyAdmins === false
              ? "Für diese Firma nicht freigeschaltet: Firmen-Kontingente → „Firmenadmins zulassen“."
              : "Darf die Benutzer DIESER Firma selbst verwalten (Seite „Meine Firma“), begrenzt durch die Rechte, die der Firma freigegeben sind."}
          </span>
        </span>
      </label>

      {groups.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm">Gruppen</legend>
          <p className="text-xs opacity-70">
            Gruppenrechte gelten zusätzlich zu den einzeln vergebenen. Ändert jemand
            die Gruppe, ändert sich damit auch, was ihre Mitglieder dürfen.
          </p>
          {companyGroups.map((g) => (
            <label key={g.id} className="tds-list__row" style={{ gap: "0.625rem" }}>
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={(e) =>
                  onChange({
                    groupIds: e.target.checked ? [...groupIds, g.id] : groupIds.filter((id) => id !== g.id),
                  })
                }
              />
              <span className="flex flex-col">
                <span className="text-sm">{g.name}</span>
                <span className="text-xs opacity-70">{g.permissions.join(", ") || "keine Rechte"}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <PermissionMatrix
        catalog={
          catalog.length > 0 ? catalog : PORTAL_PERMISSIONS.map((id) => ({ id, label: PORTAL_PERMISSION_LABELS[id] }))
        }
        assignedGroups={groups.filter((g) => groupIds.includes(g.id))}
        value={m.permissions}
        denies={m.permissionDenies ?? []}
        ceiling={m.permissionCeiling ?? null}
        onChange={(next) => onChange({ permissions: next.permissions, permissionDenies: next.denies })}
      />
    </div>
  );
}
