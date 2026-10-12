import Link from "next/link";
import type { Metadata } from "next";

import { AuthShell } from "../../components/auth/auth-shell";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your account email to check password-reset availability."
      footer={
        <p>
          Remembered your password? <Link href="/login">Return to sign in</Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
