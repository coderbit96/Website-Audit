import { NextResponse } from "next/server";

import {
  authorizeWebsiteApi,
  unexpectedWebsiteApiError,
  unsupportedContentTypeResponse,
} from "../../../lib/websites/api";
import {
  createWorkspaceWebsite,
  DuplicateWebsiteError,
  listWorkspaceWebsites,
} from "../../../lib/websites/service";
import {
  createWebsiteSchema,
  websiteListStatusSchema,
} from "../../../lib/websites/validation";
import { planEntitlementResponse } from "../../../lib/entitlements/api";
import { PlanEntitlementError } from "../../../lib/entitlements/service";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../lib/security/request";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await authorizeWebsiteApi(false);
  if ("response" in authorization) {
    return authorization.response;
  }

  const rawStatus = new URL(request.url).searchParams.get("status") ?? "active";
  const status = websiteListStatusSchema.safeParse(rawStatus);
  if (!status.success) {
    return NextResponse.json(
      { error: "Status must be active, archived, or all." },
      { status: 400 },
    );
  }

  try {
    const websites = await listWorkspaceWebsites(
      authorization.account,
      status.data,
    );
    return NextResponse.json({ data: websites });
  } catch (error) {
    return unexpectedWebsiteApiError("Listing websites", error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = createWebsiteSchema.safeParse(body);
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
    const website = await createWorkspaceWebsite(
      authorization.account,
      parsed.data,
    );
    return NextResponse.json({ data: website }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanEntitlementError) {
      return await planEntitlementResponse(error, authorization.account);
    }
    if (error instanceof DuplicateWebsiteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return unexpectedWebsiteApiError("Creating a website", error);
  }
}
