import { NextResponse } from "next/server";

import {
  authorizeWebsiteApi,
  unexpectedWebsiteApiError,
  unsupportedContentTypeResponse,
} from "../../../../lib/websites/api";
import {
  changeWorkspaceWebsiteArchiveState,
  deleteWorkspaceWebsite,
  getWorkspaceWebsite,
  renameWorkspaceWebsite,
} from "../../../../lib/websites/service";
import { updateWebsiteSchema } from "../../../../lib/websites/validation";
import { planEntitlementResponse } from "../../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../../lib/entitlements/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";

type WebsiteRouteContext = {
  params: Promise<{ websiteId: string }>;
};

export async function GET(
  _request: Request,
  context: WebsiteRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeWebsiteApi(false);
  if ("response" in authorization) {
    return authorization.response;
  }

  try {
    const { websiteId } = await context.params;
    const website = await getWorkspaceWebsite(authorization.account, websiteId);

    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: website });
  } catch (error) {
    return unexpectedWebsiteApiError("Loading a website", error);
  }
}

export async function PATCH(
  request: Request,
  context: WebsiteRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeWebsiteApi(true);
  if ("response" in authorization) {
    return authorization.response;
  }

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  const contentTypeError = unsupportedContentTypeResponse(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;

  const parsed = updateWebsiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please provide a valid name or archive action.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const { websiteId } = await context.params;
    const website =
      "name" in parsed.data
        ? await renameWorkspaceWebsite(
            authorization.account,
            websiteId,
            parsed.data.name,
          )
        : await changeWorkspaceWebsiteArchiveState(
            authorization.account,
            websiteId,
            parsed.data.action === "restore",
          );

    if (!website) {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: website });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    return unexpectedWebsiteApiError("Updating a website", error);
  }
}

export async function DELETE(
  request: Request,
  context: WebsiteRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeWebsiteApi(true);
  if ("response" in authorization) {
    return authorization.response;
  }

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  try {
    const { websiteId } = await context.params;
    const result = await deleteWorkspaceWebsite(
      authorization.account,
      websiteId,
    );

    if (result === "not_found") {
      return NextResponse.json(
        { error: "Website not found." },
        { status: 404 },
      );
    }

    if (result === "has_dependencies") {
      return NextResponse.json(
        {
          error:
            "This website has audit history or schedules and cannot be permanently deleted. Archive it instead.",
        },
        { status: 409 },
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return unexpectedWebsiteApiError("Deleting a website", error);
  }
}
