import "server-only";

import { NextResponse } from "next/server";

import { getCurrentAccount } from "../auth/current-user";
import { isSuperAdmin } from "../auth/permissions";

export async function authorizeSuperAdminApi(): Promise<
  | { account: NonNullable<Awaited<ReturnType<typeof getCurrentAccount>>> }
  | { response: NextResponse }
> {
  const account = await getCurrentAccount();
  if (!account) {
    return {
      response: NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      ),
    };
  }
  if (!isSuperAdmin(account)) {
    return {
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  return { account };
}
