import { RateLimitError } from "@website-audit/database";
import { applicationErrorResponse } from "../errors/api";

export function rateLimitResponse(error: RateLimitError) {
  return applicationErrorResponse(error, {
    headers: { "Cache-Control": "no-store" },
  });
}
