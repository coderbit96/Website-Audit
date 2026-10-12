import { NextResponse } from "next/server";

import { authorizeSuperAdminApi } from "../../../../lib/admin/api";
import { getSuperAdminCreditRecipients } from "../../../../lib/admin/service";
import { applicationErrorResponse } from "../../../../lib/errors/api";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeSuperAdminApi();
  if ("response" in authorization) return authorization.response;
  const search = new URL(request.url).searchParams.get("search") ?? "";
  if (search.length > 100) {
    return NextResponse.json({ error: "Search is too long." }, { status: 400 });
  }
  try {
    const recipients = await getSuperAdminCreditRecipients(
      authorization.account,
      search,
    );
    return NextResponse.json({ data: recipients });
  } catch (error) {
    return applicationErrorResponse(error, {
      operation: "Listing admin credit recipients",
    });
  }
}
