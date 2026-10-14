import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { getAuthOptions } from "../../../../lib/auth/auth-options";

type AuthRouteContext = { params: Promise<{ nextauth: string[] }> };

function handler(request: NextRequest, context: AuthRouteContext) {
  return NextAuth(request, context, getAuthOptions());
}

export { handler as GET, handler as POST };
