"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function LogoutButton({
  className = "secondary-button",
}: {
  className?: string;
}) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className={className}
      type="button"
      disabled={isPending}
      onClick={() => {
        setIsPending(true);
        void signOut({ callbackUrl: "/login" }).catch(() => {
          setIsPending(false);
        });
      }}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
