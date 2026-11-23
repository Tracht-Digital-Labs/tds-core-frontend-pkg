import { useEffect, useState } from "react";
import { Alert, Spinner, TabPanel, Tabs } from "@tracht-digital-labs/tds-shared/components";
import { Presence, TabIndicator } from "@tracht-digital-labs/tds-shared/motion/react";
import { fetchMe, type Me } from "../lib/auth";
import ProfileIdentity, { useProfileIdentity } from "./ProfileIdentity";
import { AppearancePanel, NotificationsPanel, usePreferenceSettings } from "./ProfilePreferences";
import ProfileSecurity from "./ProfileSecurity";

/**
 * The user's own account screen: profile, appearance, notifications, security.
 *
 * ### Where each setting actually lives
 *
 * - **Profile** (display name, picture) → `tds-auth-api`; see `ProfileIdentity`.
 * - **Appearance / notifications** → `tds-core-frontend-api`; see `ProfilePreferences`.
 * - **Password / passkeys** → the central login site, **sessions** → `tds-auth-api`;
 *   see `ProfileSecurity`.
 *
 * ### Feedback follows the house rule
 *
 * Transient outcome ("Gespeichert.") → toast. Persistent state (a load that
 * failed, a service that is not reachable) → an in-flow alert. Never both for
 * one event. Every message carries the HTTP status, which is what separates
 * "session expired" from "service down" in a bug report.
 */

type Tab = "profil" | "darstellung" | "benachrichtigungen" | "sicherheit";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["profil", "Profil"],
  ["darstellung", "Darstellung"],
  ["benachrichtigungen", "Benachrichtigungen"],
  ["sicherheit", "Sicherheit"],
];

export default function ProfileSettings() {
  const [tab, setTab] = useState<Tab>("profil");
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const identity = useProfileIdentity();
  const preferences = usePreferenceSettings();

  useEffect(() => {
    void fetchMe().then((principal) => {
      if (principal) {
        setMe(principal);
        identity.adopt(principal);
      }
      setLoading(false);
    });
    // `identity.adopt` only sets state; it is the same work on every render.
  }, []);

  if (loading) {
    return (
      <div className="tds-card" style={{ padding: "1.5rem" }}>
        <Spinner size="lg" tone="primary" />
      </div>
    );
  }

  // The pre-paint gate handles a dead session; this is "the service answered,
  // but not with a principal", which is persistent state, so an in-flow alert.
  if (!me) return <Alert>Ihr Profil konnte nicht geladen werden.</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Bereiche"
        idPrefix="profil"
        tabs={TABS}
        value={tab}
        onChange={setTab}
        decorate={(_id, active) => (active ? <TabIndicator group="profil" /> : null)}
      />

      {/* One area at a time, cross-faded on a tab change. */}
      <TabPanel idPrefix="profil" id={tab} active>
        <Presence view={tab}>
          {tab === "profil" && <ProfileIdentity me={me} identity={identity} />}
          {tab === "darstellung" && <AppearancePanel settings={preferences} />}
          {tab === "benachrichtigungen" && <NotificationsPanel settings={preferences} />}
          {tab === "sicherheit" && <ProfileSecurity />}
        </Presence>
      </TabPanel>
    </div>
  );
}
