import { Spinner } from "@tracht-digital-labs/tds-shared/components";

import type { Group } from "../lib/companyAdmin";
import type { Draft } from "../lib/companyUsers";
import PermissionMatrix from "./PermissionMatrix";

interface Props {
  draft: Draft;
  onDraft: (next: Draft) => void;
  isNew: boolean;
  /** The groups this company may assign. */
  groups: Group[];
  /** The rights offered as checkboxes. */
  grantable: string[];
  /** The company's permission ceiling; `null` = none. */
  ceiling: string[] | null;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}

const hint = { color: "var(--color-muted)" };

/** Create or edit one member of the company. */
export default function CompanyMemberForm({
  draft,
  onDraft,
  isNew,
  groups,
  grantable,
  ceiling,
  saving,
  onSubmit,
  onCancel,
}: Props) {
  const toggleGroup = (id: number, on: boolean) =>
    onDraft({ ...draft, groupIds: on ? [...draft.groupIds, id] : draft.groupIds.filter((g) => g !== id) });

  return (
    <form className="tds-card flex flex-col gap-4" style={{ padding: "1.25rem" }} onSubmit={onSubmit}>
      <h2 className="text-sm font-medium">{isNew ? "Neuer Benutzer" : "Benutzer bearbeiten"}</h2>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">E-Mail</span>
        <input
          className="field-boxed"
          type="email"
          required
          value={draft.email}
          onChange={(e) => onDraft({ ...draft, email: e.target.value })}
        />
        {isNew && (
          <span className="text-xs" style={hint}>
            Existiert bereits ein Konto mit dieser Adresse, wird es Ihrer Firma hinzugefügt;
            eine Person braucht keine zweite Anmeldung.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input
          className="field-boxed"
          value={draft.name}
          onChange={(e) => onDraft({ ...draft, name: e.target.value })}
        />
      </label>

      {groups.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Gruppen</legend>
          <span className="text-xs" style={hint}>
            Rechte aus einer Gruppe gelten zusätzlich zu den einzeln vergebenen.
          </span>
          {groups.map((group) => (
            <label key={group.id} className="tds-list__row" style={{ gap: "0.625rem" }}>
              <input
                type="checkbox"
                checked={draft.groupIds.includes(group.id)}
                onChange={(e) => toggleGroup(group.id, e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="text-sm">{group.name}</span>
                {group.description && (
                  <span className="text-xs" style={hint}>
                    {group.description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Rechte</legend>
        {/* The same control the platform editor uses. A right a group
            already grants shows where it comes from and can be withheld
            from this one person; anything else is a plain checkbox. */}
        <PermissionMatrix
          catalog={grantable.map((id) => ({ id, label: id }))}
          assignedGroups={groups.filter((g) => draft.groupIds.includes(g.id))}
          value={draft.permissions}
          denies={draft.permissionDenies}
          ceiling={ceiling}
          onChange={(next) => onDraft({ ...draft, permissions: next.permissions, permissionDenies: next.denies })}
        />
      </fieldset>

      <label className="tds-list__row" style={{ gap: "0.625rem" }}>
        <input
          type="checkbox"
          checked={draft.isCompanyAdmin}
          onChange={(e) => onDraft({ ...draft, isCompanyAdmin: e.target.checked })}
        />
        <span className="flex flex-col">
          <span className="text-sm">Firmenadmin</span>
          <span className="text-xs" style={hint}>
            Darf die Benutzer dieser Firma verwalten, also auch diese Seite hier.
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Status</span>
        <select
          className="field-boxed"
          value={draft.status}
          onChange={(e) => onDraft({ ...draft, status: e.target.value as Draft["status"] })}
        >
          <option value="active">Aktiv</option>
          <option value="disabled">Deaktiviert</option>
        </select>
      </label>

      <div className="tds-toolbar">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Speichern"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
