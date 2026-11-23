# Testing

`npm run test:run` runs vitest 4. DOM suites opt into jsdom via a `@vitest-environment` docblock; the rest run in
node. The `.astro` shell relies on the product build and `astro check`. CI (`_build.yml`) runs the tests along with
type-check and `lint:primitives`; the products' release workflows don't, so this repo's CI is the gate.

## Setup

- **`vitest.config.ts` sets `unstubGlobals: true`.** `restoreMocks` doesn't undo `vi.stubGlobal`, and a leaked stub
  makes later `vi.spyOn` return the same mock, sharing call history across tests.
- `redirectToLogin` latches on a module-level `redirecting` flag; re-import via `vi.resetModules()` per test.
- jsdom's `window` is shared within a file; unregister listeners per case (e.g. preferences).

## Key suites

| Suite | Covers |
|---|---|
| `auth.test.ts` | The 401 backstop: a scoped 401 with a live `/me` returns to the caller and keeps the hint |
| `target.test.ts` | Different `HINT_PREFIX` per product |
| `astro.test.ts` | Every injected entrypoint exists on disk; the prerendered set is exactly `/404` and `/500` |
| `Layout.test.ts` | Gate hex fallbacks (in `AuthGate.astro`) against the installed tds-shared canvas (its `base.css` partials inlined, as the build does); router, persisted chrome and script placement |
| `astroCompile.test.ts` | Every `.astro` file compiles with Astro's own compiler, so a template error fails here rather than in a product build |
| `baseNav.test.ts` | The base nav rows per product: admin-only rows, the wiki per target, reveal conditions |
| `notificationFeed.test.ts` | Restraint: hidden tabs don't poll, 401/403 stops, transport failures aren't toasted, the cursor advances |
| `dashboardLayout.test.ts` | Progressive enhancement (no layout / API error / unreachable → authored order); all four save branches via `tds:toast` |
| `CompanyUsersAdmin.test.tsx` | `/firma` against a scripted auth API: which company opens (stored pick, plain membership, platform-admin picker), seat line, table, create/edit bodies, the in-flow temporary password, refusals, removal. With `lib/companyUsers.test.ts`, mutation check: 24 breakages, 24 caught |
| `UsersAdmin.flows.test.tsx` | Every user-management action against a scripted auth API: payload, refusal messages per status, in-flow temporary passwords, membership/group/company-admin rules, one policy request per company. Mutation check: 23 breakages, 22 caught (jsdom trims e-mail inputs itself) |
| `ProfileSettings.test.tsx` | Every account-screen action against scripted auth and preferences APIs; unsaved name and fresh picture survive a tab change; the theme writes no preferences request; sessions reload per visit. Mutation check: 16 breakages, 16 caught |
| `ModulesAdmin.test.tsx` | One read-only request; no update or deploy control |
| `panelHues.test.ts` | One distinct hue per group; the mapping |
| `moduleInventory`, `activeCompany` / `actAsHeaders` tests | Inventory degradation; auth prefix excluded first |

## Type-checking extension islands: `npm run type-check:extensions`

Nothing in the normal pipeline type-checks an extension's `.tsx`:

- product repos have no `src/`, so their `astro check` checks 0 files;
- `astro build` strips types with esbuild (type errors build green; syntax errors fail);
- extension repos don't install tds-shared (a peer), so `tsc` there can't resolve imports.

`tsconfig.extcheck.json` checks every sibling `tds-ext-*-pkg/islands/**/*.tsx` against this repo's installed
dependencies (with a `paths` block). Run it after touching any island. It needs the full workspace, so it's a local
tool, not CI, and is excluded from the published package.
