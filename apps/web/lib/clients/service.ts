import "server-only";

import {
  createClientForWorkspace,
  getClientDetailForWorkspace,
  listClientsForWorkspace,
  replaceClientWebsitesForWorkspace,
  setClientActiveForWorkspace,
  updateClientForWorkspace,
  type ClientDetailRecord,
  type ClientListStatus,
  type ClientRecord,
} from "@website-audit/database";

import type { CurrentAccount } from "../auth/current-user";
import { canManageWorkspace } from "../auth/permissions";
import {
  releaseClientCapacity,
  requireClientAccess,
  requireClientCapacity,
  rollbackPlanCapacity,
} from "../entitlements/service";
import type { ClientDetailView, ClientView } from "./types";
import type { ClientFieldsInput } from "./validation";
import { webLogger } from "../logging/logger";

export class DuplicateClientError extends Error {
  constructor() {
    super("A client with this company name already exists in this workspace.");
    this.name = "DuplicateClientError";
  }
}

export class ClientWebsiteAssociationError extends Error {
  readonly reason: "archived" | "invalid_website" | "website_conflict";

  constructor(reason: ClientWebsiteAssociationError["reason"]) {
    const messages = {
      archived: "Restore this client before changing its websites.",
      invalid_website: "One or more selected websites are unavailable.",
      website_conflict:
        "One or more selected websites belong to another client. Detach them there first.",
    };
    super(messages[reason]);
    this.name = "ClientWebsiteAssociationError";
    this.reason = reason;
  }
}

export function canManageClients(account: CurrentAccount): boolean {
  return canManageWorkspace(account);
}

function serializeClient(record: ClientRecord): ClientView {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeClientDetail(record: ClientDetailRecord): ClientDetailView {
  return {
    client: serializeClient(record.client),
    websites: record.websites,
    audits: record.audits.map((audit) => ({
      ...audit,
      createdAt: audit.createdAt.toISOString(),
      completedAt: audit.completedAt?.toISOString() ?? null,
    })),
    reports: record.reports.map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString(),
      generatedAt: report.generatedAt?.toISOString() ?? null,
    })),
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

export async function listWorkspaceClients(
  account: CurrentAccount,
  status: ClientListStatus = "active",
): Promise<ClientView[]> {
  await requireClientAccess(account.workspace.id);
  const clients = await listClientsForWorkspace(account.workspace.id, status);
  return clients.map(serializeClient);
}

export async function getWorkspaceClientDetail(
  account: CurrentAccount,
  clientId: string,
): Promise<ClientDetailView | null> {
  await requireClientAccess(account.workspace.id);
  const detail = await getClientDetailForWorkspace({
    workspaceId: account.workspace.id,
    clientId,
  });
  return detail ? serializeClientDetail(detail) : null;
}

export async function createWorkspaceClient(
  account: CurrentAccount,
  fields: ClientFieldsInput,
): Promise<ClientView> {
  const capacity = await requireClientCapacity(account.workspace.id);
  try {
    const client = await createClientForWorkspace({
      workspaceId: account.workspace.id,
      createdById: account.id,
      fields,
    });
    return serializeClient(client);
  } catch (error) {
    await rollbackPlanCapacity(capacity.reservation);
    if (isDuplicateKeyError(error)) throw new DuplicateClientError();
    throw error;
  }
}

export async function updateWorkspaceClient(
  account: CurrentAccount,
  clientId: string,
  fields: ClientFieldsInput,
): Promise<ClientView | null> {
  await requireClientAccess(account.workspace.id);
  try {
    const client = await updateClientForWorkspace({
      workspaceId: account.workspace.id,
      clientId,
      fields,
    });
    return client ? serializeClient(client) : null;
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new DuplicateClientError();
    throw error;
  }
}

export async function changeWorkspaceClientArchiveState(
  account: CurrentAccount,
  clientId: string,
  isActive: boolean,
): Promise<ClientView | null> {
  await requireClientAccess(account.workspace.id);
  if (isActive) {
    const current = await getClientDetailForWorkspace({
      workspaceId: account.workspace.id,
      clientId,
    });
    if (!current) return null;
    if (current.client.isActive) return serializeClient(current.client);

    const capacity = await requireClientCapacity(account.workspace.id);
    try {
      const result = await setClientActiveForWorkspace({
        workspaceId: account.workspace.id,
        clientId,
        isActive: true,
      });
      if (!result?.changed) {
        await rollbackPlanCapacity(capacity.reservation);
      }
      return result ? serializeClient(result.client) : null;
    } catch (error) {
      await rollbackPlanCapacity(capacity.reservation);
      throw error;
    }
  }

  const result = await setClientActiveForWorkspace({
    workspaceId: account.workspace.id,
    clientId,
    isActive: false,
  });
  if (result?.changed) {
    try {
      await releaseClientCapacity(account.workspace.id);
    } catch (error) {
      webLogger("error", "usage.client_release_failed", {
        workspaceId: account.workspace.id,
        clientId,
        error,
      });
    }
  }
  return result ? serializeClient(result.client) : null;
}

export async function replaceWorkspaceClientWebsites(
  account: CurrentAccount,
  clientId: string,
  websiteIds: string[],
): Promise<ClientDetailView | null> {
  await requireClientAccess(account.workspace.id);
  const result = await replaceClientWebsitesForWorkspace({
    workspaceId: account.workspace.id,
    clientId,
    websiteIds,
  });
  if (result === "not_found") return null;
  if (result !== "updated") throw new ClientWebsiteAssociationError(result);
  return getWorkspaceClientDetail(account, clientId);
}
