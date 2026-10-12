import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthShell } from "../../components/auth/auth-shell";
import { RegisterForm } from "../../components/auth/register-form";
import { getCurrentAccount } from "../../lib/auth/current-user";
import { authenticatedDestination } from "../../lib/auth/destination";
import { isSuperAdmin } from "../../lib/auth/permissions";

export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ audit?: string }>;
}) {
  const { audit } = await searchParams;
  const returnTo = authenticatedDestination(audit);
  const account = await getCurrentAccount();

  if (account) {
    redirect(
      returnTo === "/account"
        ? isSuperAdmin(account)
          ? "/admin"
          : "/profile"
        : returnTo,
    );
  }

  return (
    <AuthShell
      eyebrow="Start auditing"
      title="Create your account"
      description="Save your plan details and download reports from completed audits."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href={
              returnTo === "/account"
                ? "/login"
                : `/login?audit=${encodeURIComponent(audit!)}`
            }
          >
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm returnTo={returnTo} />
    </AuthShell>
  );
}
