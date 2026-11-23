import { useMemo } from "react";

import type { CompanyMember, Group } from "../lib/companyAdmin";

interface Props {
  users: CompanyMember[];
  groups: Group[];
  onEdit: (member: CompanyMember) => void;
  onRemove: (member: CompanyMember) => void;
}

/** The company's members with their groups, status and actions. */
export default function CompanyMembersTable({ users, groups, onEdit, onRemove }: Props) {
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  return (
    <div className="tds-card" style={{ padding: "1.25rem" }}>
      <table className="tds-table">
        <caption className="sr-only">Benutzer dieser Firma</caption>
        <thead>
          <tr>
            <th>Benutzer</th>
            <th>Gruppen</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {users.map((member) => (
            <tr key={member.id}>
              <td>
                <span className="block text-sm">{member.label}</span>
                <span className="block text-xs" style={{ color: "var(--color-muted)" }}>
                  {member.email}
                </span>
              </td>
              <td>
                {member.isCompanyAdmin && <span className="chip chip--info">Firmenadmin</span>}{" "}
                {member.groupIds
                  .map((id) => groupName.get(id))
                  .filter(Boolean)
                  .join(", ")}
              </td>
              <td>
                <span className={`status-pill ${member.status === "active" ? "" : "opacity-70"}`}>
                  {member.status === "active" ? "Aktiv" : "Deaktiviert"}
                </span>
              </td>
              <td>
                <div className="tds-row" style={{ gap: "0.375rem" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => onEdit(member)}>
                    Bearbeiten
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onRemove(member)}>
                    Entfernen
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="tds-empty">Noch keine weiteren Benutzer in dieser Firma.</p>}
    </div>
  );
}
