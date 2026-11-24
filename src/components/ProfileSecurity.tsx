import { useCallback, useEffect, useState } from "react";
import { describeFailure, FormAlert, toast } from "@tracht-digital-labs/tds-shared/components";
import { formatDateTime } from "@tracht-digital-labs/tds-shared/format";
import { LOGIN_URL } from "../config/target";
import { AUTH_API_URL, frontendFetch } from "../lib/auth";

interface SessionRow {
  jti: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

const formatDate = (value: string): string => formatDateTime(value, { style: "medium", fallback: value });
const hintStyle = { color: "var(--color-muted)" };

/**
 * Password and passkeys live on the central login site: the panel deliberately
 * hosts no login UI, so those are links with a `?next=` back here rather than a
 * second implementation of a security flow. Sessions are tds-auth-api's,
 * listed here because this is where a user looks for them — and read again on
 * every visit to the tab.
 */
export default function ProfileSecurity() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState("");

  const loadSessions = useCallback(async () => {
    const res = await frontendFetch(`${AUTH_API_URL}/me/sessions`).catch(() => null);
    if (!res?.ok) {
      // A list that cannot load is persistent state, so in-flow, not a toast.
      setError(describeFailure(res, "Sitzungen konnten nicht geladen werden"));
      return;
    }
    const body = (await res.json()) as { sessions?: SessionRow[] };
    setSessions(Array.isArray(body.sessions) ? body.sessions : []);
    setError("");
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revoke(session: SessionRow) {
    const res = await frontendFetch(`${AUTH_API_URL}/me/sessions/${encodeURIComponent(session.jti)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      toast.danger(describeFailure(res, "Sitzung konnte nicht beendet werden"));
      return;
    }
    if (session.current) {
      // Ending your own session from the list IS logging out; the panel's 401
      // backstop would get there eventually, but bouncing immediately is what
      // the user just asked for.
      location.replace(LOGIN_URL);
      return;
    }
    toast.success("Sitzung beendet.");
    void loadSessions();
  }

  const next = encodeURIComponent(location.href);

  return (
    <div className="flex flex-col gap-4">
      <div className="tds-card" style={{ padding: "1.25rem" }}>
        <h2 className="text-sm font-medium">Anmeldung</h2>
        <p className="text-xs" style={{ ...hintStyle, marginTop: "0.25rem" }}>
          Passwort und Passkeys werden zentral bei der Anmeldung verwaltet.
        </p>
        <div className="tds-toolbar" style={{ marginTop: "0.75rem" }}>
          <a className="btn btn-ghost" href={`${LOGIN_URL}/passwort?next=${next}`}>Passwort ändern</a>
          <a className="btn btn-ghost" href={`${LOGIN_URL}/passkeys?next=${next}`}>Passkeys verwalten</a>
        </div>
      </div>

      <div className="tds-card" style={{ padding: "1.25rem" }}>
        <h2 className="text-sm font-medium">Aktive Sitzungen</h2>
        {error && <FormAlert message={error} />}
        {!error && sessions.length === 0 && <p className="tds-empty">Keine weiteren Sitzungen.</p>}
        {sessions.length > 0 && (
          <ul className="tds-list" style={{ marginTop: "0.5rem" }}>
            {sessions.map((session) => (
              <li key={session.jti} className="tds-list__row">
                <span className="flex flex-col">
                  <span className="text-sm">
                    Angemeldet seit {formatDate(session.createdAt)}
                    {session.current && (
                      <span className="chip chip--info" style={{ marginLeft: "0.5rem" }}>Dieses Gerät</span>
                    )}
                  </span>
                  <span className="text-xs" style={hintStyle}>Gültig bis {formatDate(session.expiresAt)}</span>
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => void revoke(session)}>
                  {session.current ? "Abmelden" : "Beenden"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
