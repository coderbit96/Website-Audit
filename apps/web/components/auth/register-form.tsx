"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { registerSchema, type RegisterInput } from "../../lib/auth/validation";

type RegistrationResponse = {
  error?: string;
  fieldErrors?: Partial<Record<keyof RegisterInput, string[]>>;
};

export function RegisterForm({ returnTo = "/account" }: { returnTo?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [arePasswordsVisible, setArePasswordsVisible] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as RegistrationResponse;

      if (!response.ok) {
        for (const [field, messages] of Object.entries(
          result.fieldErrors ?? {},
        )) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof RegisterInput, { message });
          }
        }
        setFormError(result.error ?? "Unable to create your account.");
        return;
      }

      const loginResult = await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: returnTo,
        redirect: false,
      });

      if (!loginResult || loginResult.error) {
        router.replace("/login");
        router.refresh();
        return;
      }

      // Registration always enters the new personal workspace; never use an
      // untrusted redirect value from a client-side authentication response.
      router.replace(returnTo);
      router.refresh();
    } catch {
      setFormError(
        "Account creation is temporarily unavailable. Please try again.",
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
        <label htmlFor="name">Full name</label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Aanya Sharma"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "register-name-error" : undefined}
          {...register("name")}
        />
        {errors.name && (
          <p className="field-error" id="register-name-error" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.in"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "register-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="field-error" id="register-email-error" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="password">Password</label>
        <div className="password-input-control">
          <input
            id="password"
            type={arePasswordsVisible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 12 characters"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password
                ? "register-password-error"
                : "register-password-hint"
            }
            {...register("password")}
          />
          <button
            className="password-visibility-toggle"
            type="button"
            aria-label={
              arePasswordsVisible ? "Hide passwords" : "Show passwords"
            }
            aria-pressed={arePasswordsVisible}
            onClick={() => setArePasswordsVisible((visible) => !visible)}
          >
            {arePasswordsVisible ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password ? (
          <p className="field-error" id="register-password-error" role="alert">
            {errors.password.message}
          </p>
        ) : (
          <p className="field-hint" id="register-password-hint">
            Use 12+ characters with upper, lower, and number.
          </p>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="confirmPassword">Confirm password</label>
        <div className="password-input-control">
          <input
            id="confirmPassword"
            type={arePasswordsVisible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repeat your password"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={
              errors.confirmPassword
                ? "register-confirm-password-error"
                : undefined
            }
            {...register("confirmPassword")}
          />
          <button
            className="password-visibility-toggle"
            type="button"
            aria-label={
              arePasswordsVisible ? "Hide passwords" : "Show passwords"
            }
            aria-pressed={arePasswordsVisible}
            onClick={() => setArePasswordsVisible((visible) => !visible)}
          >
            {arePasswordsVisible ? "Hide" : "Show"}
          </button>
        </div>
        {errors.confirmPassword && (
          <p
            className="field-error"
            id="register-confirm-password-error"
            role="alert"
          >
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {formError && (
        <p className="form-alert" role="alert">
          {formError}
        </p>
      )}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
