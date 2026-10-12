"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { loginSchema, type LoginInput } from "../../lib/auth/validation";

export function LoginForm({ returnTo = "/account" }: { returnTo?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        callbackUrl: returnTo,
        redirect: false,
      });

      if (!result || result.error) {
        setFormError("Email or password is incorrect.");
        return;
      }

      // The server passes only /account or a validated public audit path.
      router.replace(returnTo);
      router.refresh();
    } catch {
      setFormError("Sign in is temporarily unavailable. Please try again.");
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
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="field-error" id="login-email-error" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="field-group">
        <div className="field-label-row">
          <label htmlFor="password">Password</label>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
        <div className="password-input-control">
          <input
            id="password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password ? "login-password-error" : undefined
            }
            {...register("password")}
          />
          <button
            className="password-visibility-toggle"
            type="button"
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
          >
            {isPasswordVisible ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password && (
          <p className="field-error" id="login-password-error" role="alert">
            {errors.password.message}
          </p>
        )}
      </div>

      {formError && (
        <p className="form-alert" role="alert">
          {formError}
        </p>
      )}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
