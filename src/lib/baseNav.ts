/**
 * The base service's own nav rows, declared as data so the desktop rail and
 * the mobile drawer render from ONE source instead of two hand-kept copies.
 * The `icon` keys are resolved by components/Icon.astro; `order` keeps these
 * ahead of any extension that targets the same group. Sections and their order
 * are lib/navModel.ts's: the Dashboard stands alone at the top, configuration
 * (`group: "system"`) closes the rail.
 */
import type { FrontendTarget } from "../config/target";
import type { NavInput } from "./navModel";

export function baseNav(target: FrontendTarget): NavInput[] {
  const admin = target === "admin";
  return [
    { href: "/", label: "Dashboard", id: undefined, icon: "layout-dashboard", order: 0, group: "start" },
    // Platform-admin only, and revealed the same way `/firma` is. It used to
    // hang in the nav of BOTH products unconditionally, so every portal user
    // was invited to a screen whose very first call answers 403.
    { href: "/users", label: "Benutzer", id: "users", icon: "users", order: 1, revealFor: "platform-admin" },
    // The company admin's own user management, in BOTH products: a company
    // admin signs in to the portal, and the Firmen extension is admin-product
    // only. Rendered hidden and revealed by the shell script once /me confirms
    // the role — the nav is built at BUILD time and cannot know it. The
    // condition also requires a MEMBERSHIP (see revealNav): someone in no
    // company has no "meine Firma", platform admins included, who manage
    // companies from the Firmen directory instead.
    {
      href: "/firma",
      label: "Meine Firma",
      id: "firma",
      icon: "building",
      order: 2,
      revealFor: "company-or-platform-admin",
    },
    // One route, two wikis (see pages/wiki.astro): the admin build gets the
    // API reference, the portal gets FAQs and handbooks. The label and icon
    // follow the content, because "Wiki" told a customer nothing about what is
    // behind it. The API reference is platform documentation and closes the
    // System group; the portal's help is customer content and stays with the
    // account rows.
    {
      href: "/wiki",
      label: admin ? "API-Referenz" : "Hilfe",
      id: "wiki",
      icon: admin ? "book-open" : "life-buoy",
      order: admin ? 6 : 3,
      group: admin ? "system" : undefined,
    },
    // Platform-admin only: every section on that page configures the platform
    // (SMTP, Stripe, CORS and each extension's /admin/settings/*). In the
    // portal it used to open onto sections that all answered 403.
    {
      href: "/einstellungen",
      label: "Einstellungen",
      id: "einstellungen",
      icon: "settings",
      order: 4,
      group: "system",
      revealFor: "platform-admin",
    },
    // Copies: the caller owns what it gets back.
    ...(admin ? ADMIN_ONLY.map((row) => ({ ...row })) : []),
  ];
}

/**
 * Rows only the management product shows. The routes exist in both targets
 * (one route list); the API gates each of them on `isAdmin` regardless of who
 * finds them.
 */
const ADMIN_ONLY: NavInput[] = [
  // The setup wizard sits next to the settings it links into: every item names
  // a platform credential, and the portal has nothing to set up.
  {
    href: "/einrichtung",
    label: "Einrichtung",
    id: "einrichtung",
    icon: "list-checks",
    order: 4.5,
    group: "system",
    revealFor: "platform-admin",
  },
  // The code composed into this build and the locally installed API packages.
  // Read-only: releases and deploys stay in the repositories.
  { href: "/module", label: "Module", id: "module", icon: "package", order: 5, group: "system" },
  // The PUBLIC tools site. It joins the `tools` group so it sits beside the
  // tools extension's own "Tools" entry (`/tools-verwaltung`, the catalog
  // editor) — the label says "Website" precisely because those two are one
  // click apart and easy to confuse. Opens in a NEW TAB, unlike the same-tab
  // cross-property links on the public sites: someone in the panel is
  // mid-task, and replacing their working context with a public catalog loses
  // their place.
  {
    href: "https://tools.tracht-digital.de",
    label: "Tools-Website",
    id: "tools-site",
    icon: "external-link",
    group: "tools",
    order: 90,
    external: true,
  },
];
