import "server-only";

import {
  createWebsiteForWorkspace,
  deleteWebsiteForWorkspace,
  getWebsiteForWorkspace,
  listWebsitesForWorkspace,
  setWebsiteActiveForWorkspace,
  updateWebsiteNameForWorkspace,
  type DeleteWebsiteResult as DatabaseDeleteWebsiteResult,
  type WebsiteListStatus,
  type WebsiteRecord,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import { canManageWorkspace } from "../auth/permissions";
import {
  releaseWebsiteCapacity,
  rollbackPlanCapacity,
  requireWebsiteCapacity,
} from "../entitlements/service";
import type { WebsiteView } from "./types";
import { normalizeWebsiteUrl } from "./validation";
import { webLogger } from "../logging/logger";

export class DuplicateWebsiteError extends Error {
  constructor() {
    super("This website already exists in the current workspace.");
    this.name = "DuplicateWebsiteError";
  }
}

export function canManageWebsites(account: CurrentAccount): boolean {
  return canManageWorkspace(account);
}

function serializeWebsite(record: WebsiteRecord): WebsiteView {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    isActive: record.isActive,
    lastAuditedAt: record.lastAuditedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function listWorkspaceWebsites(
  account: CurrentAccount,
  status: WebsiteListStatus = "active",
): Promise<WebsiteView[]> {
  const records = await listWebsitesForWorkspace(account.workspace.id, status);
  return records.map(serializeWebsite);
}

export async function getWorkspaceWebsite(
  account: CurrentAccount,
  websiteId: string,
): Promise<WebsiteView | null> {
  const record = await getWebsiteForWorkspace(account.workspace.id, websiteId);
  return record ? serializeWebsite(record) : null;
}

export async function createWorkspaceWebsite(
  account: CurrentAccount,
  input: { name: string; url: string },
): Promise<WebsiteView> {
  const normalized = normalizeWebsiteUrl(input.url);
  const capacity = await requireWebsiteCapacity(account.workspace.id);

  try {
    const record = await createWebsiteForWorkspace({
      workspaceId: account.workspace.id,
      createdById: account.id,
      name: input.name.trim(),
      ...normalized,
    });
    return serializeWebsite(record);
  } catch (error) {
    await rollbackPlanCapacity(capacity.reservation);
    if (isDuplicateKeyError(error)) {
      throw new DuplicateWebsiteError();
    }
    throw error;
  }
}

export async function renameWorkspaceWebsite(
  account: CurrentAccount,
  websiteId: string,
  name: string,
): Promise<WebsiteView | null> {
  const record = await updateWebsiteNameForWorkspace(
    account.workspace.id,
    websiteId,
    name.trim(),
  );
  return record ? serializeWebsite(record) : null;
}

export async function changeWorkspaceWebsiteArchiveState(
  account: CurrentAccount,
  websiteId: string,
  isActive: boolean,
): Promise<WebsiteView | null> {
  if (isActive) {
    const current = await getWebsiteForWorkspace(
      account.workspace.id,
      websiteId,
    );
    if (!current) return null;
    if (current.isActive) return serializeWebsite(current);

    const capacity = await requireWebsiteCapacity(account.workspace.id);
    try {
      const result = await setWebsiteActiveForWorkspace(
        account.workspace.id,
        websiteId,
        true,
      );
      if (!result || !result.changed) {
        await rollbackPlanCapacity(capacity.reservation);
      }
      return result ? serializeWebsite(result.record) : null;
    } catch (error) {
      await rollbackPlanCapacity(capacity.reservation);
      throw error;
    }
  }

  const result = await setWebsiteActiveForWorkspace(
    account.workspace.id,
    websiteId,
    false,
  );
  if (result?.changed) {
    try {
      await releaseWebsiteCapacity(account.workspace.id);
    } catch (error) {
      webLogger("error", "usage.website_release_failed", {
        workspaceId: account.workspace.id,
        websiteId,
        operation: "archive",
        error,
      });
    }
  }
  return result ? serializeWebsite(result.record) : null;
}

export async function deleteWorkspaceWebsite(
  account: CurrentAccount,
  websiteId: string,
): Promise<"deleted" | "not_found" | "has_dependencies"> {
  const result = await deleteWebsiteForWorkspace(
    account.workspace.id,
    websiteId,
  );
  if (result === "deleted_active") {
    try {
      await releaseWebsiteCapacity(account.workspace.id);
    } catch (error) {
      webLogger("error", "usage.website_release_failed", {
        workspaceId: account.workspace.id,
        websiteId,
        operation: "delete",
        error,
      });
    }
  }
  return normalizeDeleteWebsiteResult(result);
}

function normalizeDeleteWebsiteResult(
  result: DatabaseDeleteWebsiteResult,
): "deleted" | "not_found" | "has_dependencies" {
  return result === "deleted_active" || result === "deleted_archived"
    ? "deleted"
    : result;
}
