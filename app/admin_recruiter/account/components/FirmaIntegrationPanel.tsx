"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { FIELD, FieldLabel } from "./account-form-fields";
import {
  AccountErrorBanner,
  AccountLoadingSkeleton,
  AccountSaveButton,
  AccountSuccessBanner,
} from "./AccountFormStatus";
import {
  E_SIGNATURE_SETTINGS_LABEL,
  E_SIGNATURE_USER_ERRORS,
  E_SIGNATURE_WORKSPACE_LABEL,
  sanitizeESignatureUserMessage,
} from "@/lib/e-signature/user-facing";

type FirmaSettingsResponse = {
  firma_workspace_id: string | null;
  effective_workspace_id: string | null;
  env_fallback_workspace_id: string | null;
  source: "tenant" | "env" | null;
  firma_workspace_provisioning_status?: string | null;
  firma_workspace_provisioning_error?: string | null;
};

export default function FirmaIntegrationPanel() {
  const { organization, loading, error } = useAccountData();
  const [firmaWorkspaceId, setFirmaWorkspaceId] = useState("");
  const [effectiveWorkspaceId, setEffectiveWorkspaceId] = useState<string | null>(null);
  const [envFallbackId, setEnvFallbackId] = useState<string | null>(null);
  const [source, setSource] = useState<"tenant" | "env" | null>(null);
  const [provisioningStatus, setProvisioningStatus] = useState<string | null>(null);
  const [provisioningError, setProvisioningError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      if (!organization?.id) {
        setSettingsLoading(false);
        return;
      }

      setSettingsLoading(true);
      try {
        const res = await fetch("/api/admin/tenant-firma-settings", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as FirmaSettingsResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            sanitizeESignatureUserMessage(
              payload.error,
              `Failed to load ${E_SIGNATURE_SETTINGS_LABEL}`
            )
          );
        }
        if (cancelled) return;
        setFirmaWorkspaceId(payload.firma_workspace_id ?? "");
        setEffectiveWorkspaceId(payload.effective_workspace_id);
        setEnvFallbackId(payload.env_fallback_workspace_id);
        setSource(payload.source);
        setProvisioningStatus(payload.firma_workspace_provisioning_status ?? null);
        setProvisioningError(
          payload.firma_workspace_provisioning_error
            ? sanitizeESignatureUserMessage(payload.firma_workspace_provisioning_error)
            : null
        );
      } catch (err) {
        if (!cancelled) {
          setSaveError(
            sanitizeESignatureUserMessage(
              err instanceof Error ? err.message : null,
              `Failed to load ${E_SIGNATURE_SETTINGS_LABEL}`
            )
          );
        }
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  const handleProvisionWorkspace = async () => {
    if (!organization?.id) return;

    setProvisioning(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await fetch("/api/admin/tenant-firma-settings/provision-workspace", {
        method: "POST",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        firmaProvisioning?: {
          status: string;
          workspaceId?: string | null;
          message?: string | null;
        };
      };
      if (!res.ok) {
        throw new Error(
          sanitizeESignatureUserMessage(payload.error, E_SIGNATURE_USER_ERRORS.workspaceUnavailable)
        );
      }

      const result = payload.firmaProvisioning;
      if (result?.status === "created" && result.workspaceId) {
        setFirmaWorkspaceId(result.workspaceId);
        setEffectiveWorkspaceId(result.workspaceId);
        setSource("tenant");
        setProvisioningStatus("created");
        setProvisioningError(null);
        setSaveSuccess(`${E_SIGNATURE_WORKSPACE_LABEL} created successfully.`);
      } else if (result?.status === "already_configured" && result.workspaceId) {
        setFirmaWorkspaceId(result.workspaceId);
        setEffectiveWorkspaceId(result.workspaceId);
        setSource("tenant");
        setSaveSuccess(`${E_SIGNATURE_WORKSPACE_LABEL} is already configured.`);
      } else {
        const message = sanitizeESignatureUserMessage(
          result?.message,
          E_SIGNATURE_USER_ERRORS.workspaceUnavailable
        );
        setProvisioningStatus("failed");
        setProvisioningError(message);
        setSaveError(message);
      }
    } catch (err) {
      setSaveError(
        sanitizeESignatureUserMessage(
          err instanceof Error ? err.message : null,
          E_SIGNATURE_USER_ERRORS.workspaceUnavailable
        )
      );
    } finally {
      setProvisioning(false);
    }
  };

  const showProvisionButton =
    !firmaWorkspaceId.trim() &&
    (provisioningStatus === "failed" || provisioningStatus === "not_configured" || !effectiveWorkspaceId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!organization?.id) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await fetch("/api/admin/tenant-firma-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firma_workspace_id: firmaWorkspaceId.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as FirmaSettingsResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          sanitizeESignatureUserMessage(payload.error, `Failed to save ${E_SIGNATURE_SETTINGS_LABEL}`)
        );
      }

      setFirmaWorkspaceId(payload.firma_workspace_id ?? "");
      setEffectiveWorkspaceId(payload.effective_workspace_id);
      setSource(payload.source);
      setSaveSuccess(`${E_SIGNATURE_WORKSPACE_LABEL} settings saved.`);
    } catch (err) {
      setSaveError(
        sanitizeESignatureUserMessage(
          err instanceof Error ? err.message : null,
          `Failed to save ${E_SIGNATURE_SETTINGS_LABEL}`
        )
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || settingsLoading) {
    return <AccountLoadingSkeleton rows={3} />;
  }

  if (error) {
    return <AccountErrorBanner message={error} />;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{E_SIGNATURE_SETTINGS_LABEL}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Assign an e-signature workspace for this organization. Signature templates and applicant
          signing requests are created in this workspace. Leave blank to use the server&apos;s
          global workspace fallback when configured by your platform administrator.
        </p>
      </div>

      {saveError ? <AccountErrorBanner message={saveError} /> : null}
      {saveSuccess ? <AccountSuccessBanner message={saveSuccess} /> : null}

      {!effectiveWorkspaceId ? (
        <div
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          {E_SIGNATURE_USER_ERRORS.workspaceNotConfigured} Template publishing and applicant signing
          will fail until a workspace is available.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="e-signature-workspace-id">Workspace ID</FieldLabel>
          <input
            id="e-signature-workspace-id"
            className={FIELD}
            value={firmaWorkspaceId}
            onChange={(event) => setFirmaWorkspaceId(event.target.value)}
            placeholder={
              envFallbackId
                ? `Uses server fallback (${envFallbackId})`
                : "Enter workspace ID"
            }
            autoComplete="off"
          />
        </div>

        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p>
            <span className="font-medium">Effective workspace:</span>{" "}
            {effectiveWorkspaceId ?? "Not configured"}
          </p>
          <p className="mt-1">
            <span className="font-medium">Source:</span>{" "}
            {source === "tenant"
              ? "Organization setting"
              : source === "env"
                ? "Server environment fallback"
                : "None"}
          </p>
        </div>

        {provisioningError ? (
          <p className="text-sm text-amber-800">{provisioningError}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {showProvisionButton ? (
            <button
              type="button"
              onClick={() => void handleProvisionWorkspace()}
              disabled={provisioning || saving}
              className="inline-flex h-10 items-center justify-center rounded-[6px] border bg-white px-4 text-sm font-medium transition hover:bg-[color:color-mix(in_srgb,var(--brand-secondary)_8%,white)] disabled:opacity-60"
              style={{ color: "var(--brand-secondary)", borderColor: "var(--brand-secondary)" }}
            >
              {provisioning
                ? `Creating ${E_SIGNATURE_WORKSPACE_LABEL}…`
                : `Create ${E_SIGNATURE_WORKSPACE_LABEL}`}
            </button>
          ) : null}

          <AccountSaveButton saving={saving} label={`Save ${E_SIGNATURE_SETTINGS_LABEL}`} />
        </div>
      </form>
    </section>
  );
}
