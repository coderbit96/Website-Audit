import { NextResponse } from "next/server";

import {
  authorizeClientApi,
  unexpectedClientApiError,
  unsupportedClientContentTypeResponse,
} from "../../../lib/clients/api";
import {
  createWorkspaceClient,
  DuplicateClientError,
  listWorkspaceClients,
} from "../../../lib/clients/service";
import {
  clientListStatusSchema,
  createClientSchema,
} from "../../../lib/clients/validation";
import { planEntitlementResponse } from "../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../lib/entitlements/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../lib/security/request";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeClientApi(false);
  if ("response" in authorization) return authorization.response;
  const rawStatus = new URL(request.url).searchParams.get("status") ?? "active";
  const status = clientListStatusSchema.safeParse(rawStatus);
  if (!status.success) {
    return NextResponse.json(
      { error: "Status must be active, archived, or all." },
      { status: 400 },
    );
  }
  try {
    const clients = await listWorkspaceClients(
      authorization.account,
      status.data,
    );
    return NextResponse.json({ data: clients });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    return unexpectedClientApiError("Listing clients", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await authorizeClientApi(true);
  if ("response" in authorization) return authorization.response;
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;
  const contentTypeError = unsupportedClientContentTypeResponse(request);
  if (contentTypeError) return contentTypeError;

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  try {
    const client = await createWorkspaceClient(
      authorization.account,
      parsed.data,
    );
    return NextResponse.json({ data: client }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    if (error instanceof DuplicateClientError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return unexpectedClientApiError("Creating a client", error);
  }
}
