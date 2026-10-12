"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  publicAuditRequestSchema,
  type PublicAuditRequestInput,
} from "../../lib/public-audits/validation";

type CreationResponse = {
  data?: { token: string; resultUrl: string; expiresAt: string };
  error?: string;
  fieldErrors?: { url?: string[] };
};

export function PublicAuditForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PublicAuditRequestInput>({
    resolver: zodResolver(publicAuditRequestSchema),
    defaultValues: { url: "", company: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const response = await fetch("/api/public-audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as CreationResponse | null;
      if (!response.ok || !payload?.data) {
        const urlMessage = payload?.fieldErrors?.url?.[0];
        if (urlMessage) setError("url", { message: urlMessage });
        setFormError(
          urlMessage
            ? undefined
            : (payload?.error ?? "The free audit could not be started."),
        );
        return;
      }
      router.push(payload.data.resultUrl);
    } catch {
      setFormError(
        "The audit service is temporarily unavailable. Please try again.",
      );
    }
  });

  return (
    <form
      className="mt-8 rounded-2xl border border-white/10 bg-slate-900/75 p-2 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
      onSubmit={onSubmit}
      noValidate
      aria-busy={isSubmitting}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="public-audit-url">
            Website URL
          </label>
          <input
            id="public-audit-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://yourbusiness.in"
            aria-invalid={Boolean(errors.url)}
            aria-describedby={
              errors.url
                ? "public-audit-url-error"
                : formError
                  ? "public-audit-form-error"
                  : undefined
            }
            className="h-13 w-full rounded-xl border border-transparent bg-slate-950/80 px-4 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/40 focus:ring-4 focus:ring-cyan-400/8"
            {...register("url")}
          />
          <input
            aria-hidden="true"
            className="absolute -left-[10000px] size-px opacity-0"
            tabIndex={-1}
            autoComplete="off"
            {...register("company")}
          />
        </div>
        <button
          className="h-13 rounded-xl bg-cyan-300 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-65"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Securing your audit…" : "Run free audit"}
        </button>
      </div>
      {errors.url?.message ? (
        <p
          className="px-2 pt-2 text-xs text-rose-300"
          id="public-audit-url-error"
          role="alert"
        >
          {errors.url.message}
        </p>
      ) : null}
      {formError ? (
        <p
          className="px-2 pt-2 text-xs text-rose-300"
          id="public-audit-form-error"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
    </form>
  );
}
