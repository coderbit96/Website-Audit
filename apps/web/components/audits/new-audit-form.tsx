"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AUDIT_PRESET_DEFINITIONS,
  AuditPreset,
  type AuditPreset as AuditPresetValue,
} from "@website-audit/audit-core/audit-queue";
import type { PlanTier } from "@website-audit/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";

import type { AuditApiError, AuditApiSuccess } from "../../lib/audits/types";
import {
  createAuditSchema,
  type CreateAuditInput,
} from "../../lib/audits/validation";
import type { WebsiteView } from "../../lib/websites/types";

const presetOrder = [
  AuditPreset.QUICK,
  AuditPreset.STANDARD,
  AuditPreset.FULL,
] as const;

const analysisOptions = [
  {
    name: "performanceAnalysis",
    label: "Performance analysis",
    description: "Prepare performance diagnostics for supported pages.",
  },
  {
    name: "accessibilityAnalysis",
    label: "Accessibility analysis",
    description: "Prepare automated accessibility checks.",
  },
  {
    name: "securityAnalysis",
    label: "Security analysis",
    description: "Prepare public-facing security checks.",
  },
  {
    name: "mobileAnalysis",
    label: "Mobile analysis",
    description: "Prepare mobile usability checks.",
  },
] as const;

export function NewAuditForm({
  websites,
  initialWebsiteId,
  canManage,
  plan,
  maximumPages,
  canRunAudit,
  monthlyAuditsUsed,
  monthlyAuditLimit,
}: {
  websites: WebsiteView[];
  initialWebsiteId: string;
  canManage: boolean;
  plan: PlanTier;
  maximumPages: number;
  canRunAudit: boolean;
  monthlyAuditsUsed: number;
  monthlyAuditLimit: number;
}) {
  const router = useRouter();
  const standardDefaults = AUDIT_PRESET_DEFINITIONS.STANDARD.defaults;
  const form = useForm<CreateAuditInput>({
    resolver: zodResolver(createAuditSchema),
    defaultValues: {
      websiteId: initialWebsiteId,
      preset: AuditPreset.STANDARD,
      settings: {
        ...standardDefaults,
        maximumPages: Math.min(standardDefaults.maximumPages, maximumPages),
      },
    },
  });
  const selectedPreset = useWatch({
    control: form.control,
    name: "preset",
  });
  const definition = AUDIT_PRESET_DEFINITIONS[selectedPreset];
  const effectiveMaximumPages = Math.min(
    definition.maximumPagesLimit,
    maximumPages,
  );

  function applyPreset(preset: AuditPresetValue) {
    form.setValue("preset", preset, { shouldValidate: true });
    form.setValue(
      "settings",
      {
        ...AUDIT_PRESET_DEFINITIONS[preset].defaults,
        maximumPages: Math.min(
          AUDIT_PRESET_DEFINITIONS[preset].defaults.maximumPages,
          maximumPages,
        ),
      },
      { shouldValidate: true },
    );
  }

  async function submitAudit(input: CreateAuditInput) {
    form.clearErrors("root");

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = (await response.json().catch(() => null)) as
        AuditApiSuccess<{ auditId: string }> | AuditApiError | null;

      if (!response.ok || !payload || !("data" in payload)) {
        throw new Error(
          payload && "error" in payload
            ? payload.error
            : "The audit could not be created.",
        );
      }

      router.push(`/dashboard/audits/${payload.data.auditId}`);
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "The audit could not be created.",
      });
    }
  }

  if (!canManage) {
    return (
      <section className="audit-form-empty">
        <h2>Read-only workspace access</h2>
        <p>Ask a workspace owner or admin to create an audit.</p>
        <Link href="/dashboard/audits">Back to audits</Link>
      </section>
    );
  }

  if (websites.length === 0) {
    return (
      <section className="audit-form-empty">
        <h2>Add an active website first</h2>
        <p>An audit must belong to an active website in this workspace.</p>
        <Link href="/dashboard/websites">Manage websites</Link>
      </section>
    );
  }

  if (!canRunAudit) {
    return (
      <section className="audit-form-empty">
        <h2>Monthly audit limit reached</h2>
        <p>
          {plan} includes {monthlyAuditLimit} audit
          {monthlyAuditLimit === 1 ? "" : "s"} per month. This workspace has
          used {monthlyAuditsUsed}.
        </p>
        <Link href="/dashboard/billing">Review plans</Link>
      </section>
    );
  }

  return (
    <form
      className="new-audit-form"
      onSubmit={form.handleSubmit(submitAudit)}
      noValidate
      aria-busy={form.formState.isSubmitting}
    >
      {form.formState.errors.root?.message ? (
        <p className="form-alert" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <section className="audit-form-section">
        <div className="audit-form-section-heading">
          <span>01</span>
          <div>
            <h2>Choose a website</h2>
            <p>
              Only active websites from the current workspace are available.
            </p>
          </div>
        </div>
        <div className="audit-select-field">
          <label htmlFor="audit-website">Website</label>
          <select
            id="audit-website"
            aria-invalid={Boolean(form.formState.errors.websiteId)}
            aria-describedby={
              form.formState.errors.websiteId
                ? "audit-website-error"
                : undefined
            }
            {...form.register("websiteId")}
          >
            {websites.map((website) => (
              <option key={website.id} value={website.id}>
                {website.name} — {website.url}
              </option>
            ))}
          </select>
          {form.formState.errors.websiteId?.message ? (
            <p className="field-error" id="audit-website-error" role="alert">
              {form.formState.errors.websiteId.message}
            </p>
          ) : null}
        </div>
      </section>

      <section className="audit-form-section">
        <div className="audit-form-section-heading">
          <span>02</span>
          <div>
            <h2>Select audit coverage</h2>
            <p>Each preset has a server-enforced page and depth ceiling.</p>
          </div>
        </div>
        <div className="audit-preset-grid">
          {presetOrder.map((preset) => {
            const presetDefinition = AUDIT_PRESET_DEFINITIONS[preset];
            return (
              <label
                className="audit-preset-card"
                data-selected={selectedPreset === preset}
                key={preset}
              >
                <input
                  type="radio"
                  value={preset}
                  checked={selectedPreset === preset}
                  onChange={() => applyPreset(preset)}
                />
                <span className="audit-preset-check" aria-hidden="true" />
                <strong>{presetDefinition.label}</strong>
                <small>{presetDefinition.description}</small>
                <span>
                  Up to{" "}
                  {Math.min(presetDefinition.maximumPagesLimit, maximumPages)}{" "}
                  pages · Depth {presetDefinition.maximumDepthLimit}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="audit-form-section">
        <details className="audit-advanced-settings">
          <summary>
            <span>
              <strong>Advanced settings</strong>
              <small>Fine-tune scope and analysis modules</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="audit-advanced-content">
            <div className="audit-number-grid">
              <div className="field-group">
                <label htmlFor="maximum-pages">Maximum pages</label>
                <input
                  id="maximum-pages"
                  type="number"
                  min={1}
                  max={effectiveMaximumPages}
                  aria-invalid={Boolean(
                    form.formState.errors.settings?.maximumPages,
                  )}
                  aria-describedby={
                    form.formState.errors.settings?.maximumPages
                      ? "maximum-pages-error"
                      : "maximum-pages-hint"
                  }
                  {...form.register("settings.maximumPages", {
                    valueAsNumber: true,
                  })}
                />
                <p className="field-hint" id="maximum-pages-hint">
                  {plan} limit: {effectiveMaximumPages}
                </p>
                {form.formState.errors.settings?.maximumPages?.message ? (
                  <p
                    className="field-error"
                    id="maximum-pages-error"
                    role="alert"
                  >
                    {form.formState.errors.settings.maximumPages.message}
                  </p>
                ) : null}
              </div>
              <div className="field-group">
                <label htmlFor="maximum-depth">Maximum depth</label>
                <input
                  id="maximum-depth"
                  type="number"
                  min={0}
                  max={definition.maximumDepthLimit}
                  aria-invalid={Boolean(
                    form.formState.errors.settings?.maximumDepth,
                  )}
                  aria-describedby={
                    form.formState.errors.settings?.maximumDepth
                      ? "maximum-depth-error"
                      : "maximum-depth-hint"
                  }
                  {...form.register("settings.maximumDepth", {
                    valueAsNumber: true,
                  })}
                />
                <p className="field-hint" id="maximum-depth-hint">
                  Server limit: {definition.maximumDepthLimit}
                </p>
                {form.formState.errors.settings?.maximumDepth?.message ? (
                  <p
                    className="field-error"
                    id="maximum-depth-error"
                    role="alert"
                  >
                    {form.formState.errors.settings.maximumDepth.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="audit-toggle-list">
              <label>
                <span>
                  <strong>Respect robots.txt</strong>
                  <small>Honor website crawling directives.</small>
                </span>
                <input
                  type="checkbox"
                  {...form.register("settings.respectRobotsTxt")}
                />
              </label>
              <label>
                <span>
                  <strong>Check external links</strong>
                  <small>
                    Prepare validation for linked external resources.
                  </small>
                </span>
                <input
                  type="checkbox"
                  {...form.register("settings.checkExternalLinks")}
                />
              </label>
              <label>
                <span>
                  <strong>JavaScript rendering</strong>
                  <small>Not available yet. Pages are fetched as HTML.</small>
                </span>
                <input
                  type="checkbox"
                  disabled
                  aria-label="JavaScript rendering unavailable"
                />
              </label>
            </div>

            <div className="audit-analysis-grid">
              {analysisOptions.map((option) => (
                <label key={option.name}>
                  <input
                    type="checkbox"
                    {...form.register(`settings.${option.name}`)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </details>
      </section>

      <div className="audit-form-actions">
        <Link href="/dashboard/audits">Cancel</Link>
        <button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating audit…" : "Create audit"}
        </button>
      </div>
    </form>
  );
}
