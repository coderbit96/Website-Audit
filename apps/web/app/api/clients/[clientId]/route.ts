import { NextResponse } from "next/server";

import {
  authorizeClientApi,
  unexpectedClientApiError,
  unsupportedClientContentTypeResponse,
} from "../../../../lib/clients/api";
import {
  changeWorkspaceClientArchiveState,
  ClientWebsiteAssociationError,
  DuplicateClientError,
  getWorkspaceClientDetail,
  replaceWorkspaceClientWebsites,
  updateWorkspaceClient,
} from "../../../../lib/clients/service";
import { updateClientSchema } from "../../../../lib/clients/validation";
import { planEntitlementResponse } from "../../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../../lib/entitlements/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";

type ClientRouteContext = { params: Promise<{ clientId: string }> };

export async function GET(
  _request: Request,
  context: ClientRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeClientApi(false);
  if ("response" in authorization) return authorization.response;
  try {
    const { clientId } = await context.params;
    const client = await getWorkspaceClientDetail(
      authorization.account,
      clientId,
    );
    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({ data: client });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    return unexpectedClientApiError("Loading a client", error);
  }
}

export async function PATCH(
  request: Request,
  context: ClientRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeClientApi(true);
  if ("response" in authorization) return authorization.response;
  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;
  const contentTypeError = unsupportedClientContentTypeResponse(request);
  if (contentTypeError) return contentTypeError;

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;
  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the request and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const { clientId } = await context.params;
    let result;
    if (parsed.data.operation === "update") {
      result = await updateWorkspaceClient(authorization.account, clientId, {
        companyName: parsed.data.companyName,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        notes: parsed.data.notes,
      });
    } else if (parsed.data.operation === "websites") {
      result = await replaceWorkspaceClientWebsites(
        authorization.account,
        clientId,
        parsed.data.websiteIds,
      );
    } else {
      result = await changeWorkspaceClientArchiveState(
        authorization.account,
        clientId,
        parsed.data.operation === "restore",
      );
    }
    if (!result) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    if (error instanceof DuplicateClientError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ClientWebsiteAssociationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return unexpectedClientApiError("Updating a client", error);
  }
}
