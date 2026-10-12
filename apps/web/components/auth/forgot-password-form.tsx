"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "../../lib/auth/validation";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(undefined);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      setMessage(
        result.message ??
          result.error ??
          "Password reset is temporarily unavailable. Please try again later.",
      );
    } catch {
      setMessage(
        "Password reset is temporarily unavailable. Please try again later.",
      );
    }
  });

  return (
    <form
      className="auth-form"
      onSubmit={onSubmit}
      noValidate
      aria-busy={isSubmitting}
    >
      <div className="field-group">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.in"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email ? "forgot-password-email-error" : undefined
          }
          {...register("email")}
        />
        {errors.email && (
          <p
            className="field-error"
            id="forgot-password-email-error"
            role="alert"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Checking…" : "Check reset availability"}
      </button>
    </form>
  );
}
