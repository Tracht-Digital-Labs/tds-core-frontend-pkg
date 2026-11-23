import { useState, type FormEvent } from "react";
import { Avatar, describeFailure, Spinner, toast } from "@tracht-digital-labs/tds-shared/components";
import { FileDropZone } from "@tracht-digital-labs/tds-shared/dropzone";
import { AUTH_API_URL, frontendFetch, invalidateMe, type Me } from "../lib/auth";
import { AVATAR_PX, downscaleAvatar, MAX_AVATAR_BYTES } from "../lib/avatar";

/**
 * Display name and picture, both in tds-auth-api: identity, and auth-api owns
 * the `app_user` row. Only these two are editable here: `name` drives the admin
 * user list and the public blog byline, and `email` is the login identity.
 *
 * The state lives in a hook the screen holds, not in the panel, so an unsaved
 * name or a fresh picture survives switching tabs.
 */
export function useProfileIdentity() {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  /** Take the loaded principal's values as the starting point. */
  function adopt(me: Me) {
    setDisplayName(me.displayName ?? "");
    setAvatarUrl(me.avatarUrl ?? null);
    setHasAvatar(Boolean(me.hasAvatar));
  }

  async function save() {
    setSaving(true);
    const res = await frontendFetch(`${AUTH_API_URL}/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim() }),
    }).catch(() => null);
    setSaving(false);
    // Never await a mutation and drop the response.
    if (!res?.ok) {
      toast.danger(describeFailure(res, "Speichern fehlgeschlagen"));
      return;
    }
    invalidateMe();
    toast.success("Profil gespeichert.");
  }

  async function upload(file: File) {
    setAvatarBusy(true);
    try {
      const blob = await downscaleAvatar(file);
      if (blob.size > MAX_AVATAR_BYTES) {
        toast.warning("Das Bild ist zu groß (maximal 2 MB).");
        return;
      }
      const form = new FormData();
      form.append("file", blob, "avatar.webp");
      const res = await frontendFetch(`${AUTH_API_URL}/me/avatar`, { method: "POST", body: form }).catch(() => null);
      if (!res?.ok) {
        toast.danger(describeFailure(res, "Bild konnte nicht gespeichert werden"));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { avatarUrl?: string };
      setAvatarUrl(body.avatarUrl ?? null);
      setHasAvatar(true);
      invalidateMe();
      toast.success("Profilbild aktualisiert.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    const res = await frontendFetch(`${AUTH_API_URL}/me/avatar`, { method: "DELETE" }).catch(() => null);
    setAvatarBusy(false);
    if (!res?.ok) {
      toast.danger(describeFailure(res, "Bild konnte nicht entfernt werden"));
      return;
    }
    setAvatarUrl(null);
    setHasAvatar(false);
    invalidateMe();
    toast.success("Profilbild entfernt.");
  }

  return { displayName, setDisplayName, avatarUrl, hasAvatar, saving, avatarBusy, adopt, save, upload, removeAvatar };
}

export type ProfileIdentityState = ReturnType<typeof useProfileIdentity>;

const hintStyle = { color: "var(--color-muted)" };

export default function ProfileIdentity({ me, identity }: { me: Me; identity: ProfileIdentityState }) {
  const { displayName, setDisplayName, avatarUrl, hasAvatar, saving, avatarBusy } = identity;
  const fallbackName = me.name ?? me.email;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void identity.save();
  };

  return (
    <div className="tds-card" style={{ padding: "1.25rem" }}>
      <div className="tds-row" style={{ alignItems: "center", gap: "1rem" }}>
        <Avatar
          name={me.label ?? fallbackName}
          src={hasAvatar ? avatarUrl : null}
          seed={me.userId}
          size="lg"
          decorative
        />
        <div className="flex flex-col gap-2" style={{ flex: "1 1 16rem", minWidth: 0 }}>
          <FileDropZone
            label={avatarBusy ? "Wird hochgeladen …" : "Bild auswählen"}
            hint="oder hierher ziehen"
            activeLabel="Loslassen zum Hochladen"
            accept="image/png,image/jpeg,image/webp"
            disabled={avatarBusy}
            onFiles={([file]) => void identity.upload(file)}
            onReject={() => toast.warning("Bitte ein PNG-, JPEG- oder WebP-Bild wählen.")}
          />
          {hasAvatar && (
            <button
              type="button"
              className="btn btn-ghost self-start"
              disabled={avatarBusy}
              onClick={() => void identity.removeAvatar()}
            >
              Entfernen
            </button>
          )}
          <p className="text-xs" style={hintStyle}>
            PNG, JPEG oder WebP, maximal 2 MB. Das Bild wird vor dem Hochladen
            automatisch auf {AVATAR_PX}×{AVATAR_PX} Pixel verkleinert.
          </p>
        </div>
      </div>

      <hr className="tds-dropdown__sep" style={{ margin: "1.25rem 0" }} />

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Anzeigename</span>
          <input
            className="field-boxed"
            value={displayName}
            maxLength={100}
            placeholder={fallbackName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="text-xs" style={hintStyle}>
            So werden Sie in der Oberfläche angesprochen. Leer lassen, um
            „{fallbackName}" zu verwenden.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input className="field-boxed" value={me.name ?? ""} readOnly disabled />
          <span className="text-xs" style={hintStyle}>
            Der Name Ihres Kontos. Änderungen nimmt die Benutzerverwaltung vor.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">E-Mail</span>
          <input className="field-boxed" value={me.email} readOnly disabled />
          <span className="text-xs" style={hintStyle}>
            Ihre Anmeldeadresse. Änderungen nimmt die Benutzerverwaltung vor.
          </span>
        </label>

        <div className="tds-toolbar">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size="sm" /> : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
