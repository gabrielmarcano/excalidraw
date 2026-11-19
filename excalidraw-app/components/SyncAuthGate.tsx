import { useEffect, useState } from "react";

import {
  getSyncToken,
  isCloudSyncConfigured,
  setSyncToken,
  verifySyncToken,
} from "../data/CloudSync";

import "./SyncAuthGate.scss";

import type { FormEvent, ReactNode } from "react";

export const SyncAuthGate = ({ children }: { children: ReactNode }) => {
  const configured = isCloudSyncConfigured();
  const [unlocked, setUnlocked] = useState<boolean>(
    () => !configured || Boolean(getSyncToken()),
  );
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a stored token already exists, verify it in the background so revoking
  // SYNC_TOKEN on Cloudflare locks the device out, while keeping offline access.
  useEffect(() => {
    if (!configured || !unlocked) {
      return;
    }
    const token = getSyncToken();
    if (!token) {
      setUnlocked(false);
      return;
    }
    let cancelled = false;
    verifySyncToken(token).then((result) => {
      if (!cancelled && result === "unauthorized") {
        setSyncToken(null);
        setUnlocked(false);
        setError("La clave ya no es válida. Ingrésala de nuevo.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [configured, unlocked]);

  if (unlocked) {
    return <>{children}</>;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const trimmed = passcode.trim();
    if (!trimmed) {
      setError("Ingresa la clave.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await verifySyncToken(trimmed);
    setSubmitting(false);

    if (result === "ok") {
      setSyncToken(trimmed);
      setPasscode("");
      setUnlocked(true);
    } else if (result === "unauthorized") {
      setError("Clave incorrecta.");
    } else {
      setError("No se pudo conectar con el servidor de sincronización.");
    }
  };

  return (
    <div className="sync-auth-gate">
      <form className="sync-auth-gate__card" onSubmit={handleSubmit}>
        <h1 className="sync-auth-gate__title">Canvas</h1>
        <p className="sync-auth-gate__subtitle">
          Ingresa tu clave para acceder y sincronizar tus tableros.
        </p>
        <input
          className="sync-auth-gate__input"
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Clave de acceso"
          autoComplete="current-password"
          autoFocus
          disabled={submitting}
        />
        {error && (
          <div className="sync-auth-gate__error" role="alert">
            {error}
          </div>
        )}
        <button
          className="sync-auth-gate__button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
};
