import { NextResponse } from "next/server";

import { authorizeIssueApi, issueApiFailure } from "../../../../lib/issues/api";
import { changeWorkspaceIssueStatus } from "../../../../lib/issues/service";
import { issueWorkflowActionSchema } from "../../../../lib/issues/validation";
import {
  mutationOriginResponse,
  readBoundedJsonBody,
} from "../../../../lib/security/request";

type IssueRouteContext = { params: Promise<{ findingId: string }> };

export async function PATCH(
  request: Request,
  context: IssueRouteContext,
): Promise<NextResponse> {
  const authorization = await authorizeIssueApi();
  if ("response" in authorization) return authorization.response;

  const originResponse = mutationOriginResponse(request);
  if (originResponse) return originResponse;

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const json = await readBoundedJsonBody(request);
  if ("response" in json) return json.response;
  const body = json.body;

  const parsed = issueWorkflowActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a supported issue workflow action." },
      { status: 400 },
    );
  }

  try {
    const { findingId } = await context.params;
    const result = await changeWorkspaceIssueStatus(
      authorization.account,
      findingId,
      parsed.data.action,
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        ...result.issue,
        resolvedAt: result.issue.resolvedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return issueApiFailure(error);
  }
}
