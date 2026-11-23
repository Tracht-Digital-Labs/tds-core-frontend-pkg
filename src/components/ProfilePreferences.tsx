import { useEffect, useState } from "react";
import { describeFailure, toast } from "@tracht-digital-labs/tds-shared/components";
import type { ThemePreference } from "@tracht-digital-labs/tds-shared/design";
import { applyThemePreference, readThemePreference } from "@tracht-digital-labs/tds-shared/theme";
import { loadPreferences, savePreferences, type Preferences } from "../lib/preferences";

/**
 * Appearance and notifications: interface state, not identity, so it lives in
 * tds-core-frontend-api (`/me/preferences`). Held by the screen like the
 * identity state, so both tabs read the one copy.
 */
export function usePreferenceSettings() {
  const [prefs, setPrefs] = useState<Preferences>({});
  // "system" until mounted: the screen is server-rendered (`client:load`), and
  // the stored choice is only readable in the browser.
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setTheme(readThemePreference());
    void loadPreferences().then((stored) => {
      setPrefs(stored);
      if (stored.theme) setTheme(stored.theme);
      // An empty result is indistinguishable from "nothing saved yet", so this
      // is not treated as an error — the panel keeps working off localStorage.
      setUnavailable(Object.keys(stored).length === 0);
    });
  }, []);

  function pickTheme(next: ThemePreference) {
    setTheme(next);
    // The single write path: this stores it, paints it and raises
    // `tds:theme-change`, which the shell's preferences sync turns into a save.
    // Doing the PUT here as well would double every write.
    applyThemePreference(next);
  }

  async function persist(patch: Preferences, action: string) {
    setPrefs((current) => ({ ...current, ...patch }));
    const res = await savePreferences(patch);
    if (res?.ok) toast.success("Gespeichert.");
    else toast.danger(describeFailure(res, `${action} fehlgeschlagen`));
  }

  return { prefs, theme, unavailable, pickTheme, persist };
}

export type PreferenceSettings = ReturnType<typeof usePreferenceSettings>;

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "light", label: "Hell", hint: "Immer die helle Oberfläche." },
  { value: "dark", label: "Dunkel", hint: "Immer die dunkle Oberfläche." },
  { value: "system", label: "Auto", hint: "Folgt der Einstellung Ihres Geräts." },
];

const hintStyle = { color: "var(--color-muted)" };

export function AppearancePanel({ settings }: { settings: PreferenceSettings }) {
  const { prefs, theme, unavailable, pickTheme, persist } = settings;
  return (
    <div className="tds-card" style={{ padding: "1.25rem" }}>
      {unavailable && (
        <p className="tds-alert" role="status">
          Einstellungen werden derzeit nur auf diesem Gerät gespeichert.
        </p>
      )}

      <fieldset className="flex flex-col gap-2" style={{ marginTop: "0.75rem" }}>
        <legend className="text-sm font-medium">Erscheinungsbild</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value} className="tds-list__row" style={{ gap: "0.625rem" }}>
            <input
              type="radio"
              name="theme"
              checked={theme === option.value}
              onChange={() => pickTheme(option.value)}
            />
            <span className="flex flex-col">
              <span className="text-sm">{option.label}</span>
              <span className="text-xs" style={hintStyle}>{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <hr className="tds-dropdown__sep" style={{ margin: "1.25rem 0" }} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Sprache</span>
        <select
          className="field-boxed"
          value={prefs.locale ?? "de"}
          onChange={(e) => void persist({ locale: e.target.value as "de" | "en" }, "Sprache speichern")}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
        <span className="text-xs" style={hintStyle}>
          Gilt für Hinweise und den Support-Chat. Die Menüs und Seiten der
          Verwaltung sind derzeit ausschließlich auf Deutsch.
        </span>
      </label>
    </div>
  );
}

const NOTIFICATIONS: ReadonlyArray<{ key: "notify_toast" | "notify_email"; label: string; hint: string }> = [
  { key: "notify_toast", label: "Hinweise in der Oberfläche", hint: "Kurze Einblendungen, wenn etwas Neues eintrifft." },
  { key: "notify_email", label: "E-Mail-Benachrichtigungen", hint: "Nachrichten zu Vorgängen, die Sie betreffen." },
];

export function NotificationsPanel({ settings }: { settings: PreferenceSettings }) {
  const { prefs, persist } = settings;
  return (
    <div className="tds-card" style={{ padding: "1.25rem" }}>
      <div className="flex flex-col gap-3">
        {NOTIFICATIONS.map(({ key, label, hint }) => (
          <label key={key} className="tds-list__row" style={{ gap: "0.625rem" }}>
            <input
              type="checkbox"
              // Both are on until somebody turns them off.
              checked={(prefs[key] ?? "1") === "1"}
              onChange={(e) => void persist({ [key]: e.target.checked ? "1" : "0" }, "Einstellung speichern")}
            />
            <span className="flex flex-col">
              <span className="text-sm">{label}</span>
              <span className="text-xs" style={hintStyle}>{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
