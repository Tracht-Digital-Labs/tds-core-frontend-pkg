/**
 * The platform admin's user records in tds-auth-api (`/admin/users`), as the
 * user management screen reads and writes them.
 */
import type { PortalPermission } from "@tracht-digital-labs/tds-shared/permissions";
import { AUTH_API_URL } from "./auth";

export interface Membership {
  /** The company. Named `customerId` on the wire for one more release. */
  customerId: number;
  /** Direct grants. NOT the effective set — groups add to this server-side. */
  permissions: string[];
  /** May this membership manage the company's own users? */
  isCompanyAdmin?: boolean;
  /** Groups assigned to this user IN this company. */
  groupIds?: number[];
  /** The most this ONE person may hold; null = inherit the company policy. */
  permissionCeiling?: string[] | null;
  /** Withheld from this person even where an assigned group grants it. */
  permissionDenies?: string[];
}

export interface AdminUser {
  id: number;
  email: string;
  name?: string | null;
  isAdmin?: boolean;
  isSupportAgent?: boolean;
  isBlogAuthor?: boolean;
  memberships?: Membership[];
  /** Single-company records from before memberships; read, never written. */
  customerId?: number | null;
  permissions?: PortalPermission[];
  status?: "active" | "disabled";
}

/** What the user form submits, for a new user and for an edit alike. */
export interface UserPayload {
  email: string;
  name: string | null;
  isAdmin: boolean;
  isSupportAgent: boolean;
  isBlogAuthor: boolean;
  status: "active" | "disabled";
  memberships: Membership[];
}

export const USERS_URL = `${AUTH_API_URL}/admin/users`;
