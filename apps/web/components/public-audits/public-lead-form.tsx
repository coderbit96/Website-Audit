"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";

import {
  publicLeadRequestSchema,
  publicLeadServiceLabels,
  publicLeadServices,
  type PublicLeadRequestInput,
  type PublicLeadService,
} from "../../lib/leads/validation";

type LeadApiResponse = {
  data?: { received: boolean };
  error?: string;
  fieldErrors?: Partial<Record<keyof PublicLeadRequestInput, string[]>>;
};

export function PublicLeadForm({
  auditToken,
  requestedService,
}: {
  auditToken: string;
  requestedService: PublicLeadService;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PublicLeadRequestInput>({
    resolver: zodResolver(publicLeadRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      auditToken,
      requestedService,
      source: "public-audit",
      company: "",
    },
  });
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  }>();

  const submit = handleSubmit(async (values) => {
    setNotice(undefined);
    try {
      const response = await fetch("/api/public-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as LeadApiResponse | null;
      if (!response.ok || !payload?.data?.received) {
        throw new Error(payload?.error ?? "Your request could not be sent.");
      }
      setNotice({
        type: "success",
        message:
          "Request received. Our team can now review your audit and contact you.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Your request could not be sent.",
      });
    }
  });

  if (notice?.type === "success") {
    return (
      <div
        className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/8 p-5"
        role="status"
      >
        <strong className="text-sm text-emerald-200">Request received</strong>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {notice.message}
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-slate-950/35 p-5 sm:grid-cols-2"
      onSubmit={submit}
      noValidate
      aria-busy={isSubmitting}
    >
      <input type="hidden" {...register("auditToken")} />
      <input type="hidden" {...register("source")} />
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label htmlFor="lead-company">Company</label>
        <input
          id="lead-company"
          tabIndex={-1}
          autoComplete="off"
          {...register("company")}
        />
      </div>

      <LeadField label="Name" error={errors.name?.message}>
        <input
          autoComplete="name"
          placeholder="Your name"
          {...register("name")}
        />
      </LeadField>
      <LeadField label="Email" error={errors.email?.message}>
        <input
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.in"
          {...register("email")}
        />
      </LeadField>
      <LeadField label="Phone (optional)" error={errors.phone?.message}>
        <input
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          {...register("phone")}
        />
      </LeadField>
      <LeadField
        label="Requested service"
        error={errors.requestedService?.message}
      >
        <select {...register("requestedService")}>
          {publicLeadServices.map((service) => (
            <option key={service} value={service}>
              {publicLeadServiceLabels[service]}
            </option>
          ))}
        </select>
      </LeadField>

      {notice?.type === "error" ? (
        <p
          className="rounded-xl border border-rose-300/20 bg-rose-300/8 p-3 text-sm text-rose-200 sm:col-span-2"
          role="alert"
        >
          {notice.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-5 text-slate-400">
          Your audit score and highest-priority detected problems are attached
          securely. We do not publish your contact details.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}

function LeadField({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-200">
      <span>{label}</span>
      <span className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-white/5 [&_input]:px-3.5 [&_input]:py-3 [&_input]:font-normal [&_input]:text-white [&_input]:outline-none [&_input]:transition [&_input]:placeholder:text-slate-400 [&_input]:focus:border-cyan-300/40 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-white/10 [&_select]:bg-slate-900 [&_select]:px-3.5 [&_select]:py-3 [&_select]:font-normal [&_select]:text-white [&_select]:outline-none [&_select]:focus:border-cyan-300/40">
        {children}
      </span>
      {error ? (
        <small className="font-normal text-rose-300" role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}
