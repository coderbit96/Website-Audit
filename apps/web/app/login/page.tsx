import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthShell } from "../../components/auth/auth-shell";
import { LoginForm } from "../../components/auth/login-form";
import { getCurrentAccount } from "../../lib/auth/current-user";
import { authenticatedDestination } from "../../lib/auth/destination";
import { isSuperAdmin } from "../../lib/auth/permissions";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
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
      eyebrow="Welcome back"
      title="Sign in to SiteSignal"
      description="Continue to your audit results and account profile."
      footer={
        <p>
          New to SiteSignal?{" "}
          <Link
            href={
              returnTo === "/account"
                ? "/register"
                : `/register?audit=${encodeURIComponent(audit!)}`
            }
          >
            Create an account
          </Link>
        </p>
      }
    >
      <LoginForm returnTo={returnTo} />
    </AuthShell>
  );
}
