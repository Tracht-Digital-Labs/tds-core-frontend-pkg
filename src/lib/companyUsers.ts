/**
 * The pure half of the company-admin user screen (`CompanyUsersAdmin`): the
 * editor's draft, the body it sends, which rights it offers and which company
 * opens. The server decides all limits; these only shape what it sent.
 */
import type { CompanyMember, CompanyUsersPayload } from "./companyAdmin";

export interface Draft {
  email: string;
  name: string;
  permissions: string[];
  /** Withheld from this person even where an assigned group grants it. */
  permissionDenies: string[];
  groupIds: number[];
  isCompanyAdmin: boolean;
  status: "active" | "disabled";
}

export const emptyDraft = (): Draft => ({
  email: "",
  name: "",
  permissions: [],
  permissionDenies: [],
  groupIds: [],
  isCompanyAdmin: false,
  status: "active",
});

export const draftOf = (member: CompanyMember): Draft => ({
  email: member.email,
  name: member.name ?? "",
  permissions: [...member.permissions],
  permissionDenies: [...(member.permissionDenies ?? [])],
  groupIds: [...member.groupIds],
  isCompanyAdmin: member.isCompanyAdmin,
  status: member.status,
});

/** The create/update body: trimmed, and a blank name sent as null. */
export const bodyOf = (draft: Draft) => ({
  email: draft.email.trim(),
  name: draft.name.trim() || null,
  permissions: draft.permissions,
  permissionDenies: draft.permissionDenies,
  groupIds: draft.groupIds,
  isCompanyAdmin: draft.isCompanyAdmin,
  status: draft.status,
});

/**
 * The rights this admin may hand out. `null` from the server means "no
 * ceiling"; then everything the assignable groups mention is offered, since
 * there is no catalog call on this surface.
 */
export function grantableRights(payload: CompanyUsersPayload | null): string[] {
  if (payload?.allowedPermissions) return payload.allowedPermissions;
  const fromGroups = new Set<string>();
  for (const group of payload?.groups ?? []) {
    for (const key of group.permissions) fromGroups.add(key);
  }
  return [...fromGroups].sort();
}

/** No seat left. An unlimited company (`remaining: null`) is never full. */
export const seatsFull = (payload: CompanyUsersPayload | null): boolean =>
  payload?.seats.remaining != null && payload.seats.remaining <= 0;

/**
 * The company to open: the stored panel-wide pick when it is one of `ids`,
 * else the first. Deliberately NOT `resolveActiveCompany`, which clears a
 * stored pick that is not in the list: `ids` here can be a SUBSET of the
 * memberships, and someone who is a plain member of A and an admin of B would
 * lose their selection just by opening this page.
 */
export const pickCompany = (stored: number | null, ids: number[]): number | null =>
  stored !== null && ids.includes(stored) ? stored : (ids[0] ?? null);
