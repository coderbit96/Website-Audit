import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import { AuditModel, ScheduledAuditModel, WebsiteModel } from "../models.js";

export type WebsiteRecord = {
  id: string;
  name: string;
  url: string;
  normalizedUrl: string;
  isActive: boolean;
  lastAuditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WebsiteListStatus = "active" | "archived" | "all";

function toWebsiteRecord(website: {
  _id: Types.ObjectId;
  name?: string | null;
  url: string;
  normalizedUrl: string;
  isActive: boolean;
  lastAuditedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): WebsiteRecord {
  return {
    id: website._id.toString(),
    name: website.name?.trim() || website.url,
    url: website.url,
    normalizedUrl: website.normalizedUrl,
    isActive: website.isActive,
    lastAuditedAt: website.lastAuditedAt ?? null,
    createdAt: website.createdAt,
    updatedAt: website.updatedAt,
  };
}

export function isValidDatabaseId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

export async function listWebsitesForWorkspace(
  workspaceId: string,
  status: WebsiteListStatus = "active",
): Promise<WebsiteRecord[]> {
  await connectToDatabase();

  const statusFilter =
    status === "all" ? {} : { isActive: status === "active" };
  const websites = await WebsiteModel.find({ workspaceId, ...statusFilter })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return websites.map(toWebsiteRecord);
}

export async function getWebsiteForWorkspace(
  workspaceId: string,
  websiteId: string,
): Promise<WebsiteRecord | null> {
  if (!isValidDatabaseId(websiteId)) {
    return null;
  }

  await connectToDatabase();
  const website = await WebsiteModel.findOne({
    _id: websiteId,
    workspaceId,
  })
    .lean()
    .exec();

  return website ? toWebsiteRecord(website) : null;
}

export async function createWebsiteForWorkspace(input: {
  workspaceId: string;
  createdById: string;
  name: string;
  url: string;
  normalizedUrl: string;
}): Promise<WebsiteRecord> {
  await connectToDatabase();
  const website = await WebsiteModel.create({
    workspaceId: input.workspaceId,
    createdById: input.createdById,
    name: input.name,
    url: input.url,
    normalizedUrl: input.normalizedUrl,
  });

  return toWebsiteRecord(website.toObject());
}

export async function updateWebsiteNameForWorkspace(
  workspaceId: string,
  websiteId: string,
  name: string,
): Promise<WebsiteRecord | null> {
  if (!isValidDatabaseId(websiteId)) {
    return null;
  }

  await connectToDatabase();
  const website = await WebsiteModel.findOneAndUpdate(
    { _id: websiteId, workspaceId },
    { $set: { name } },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();

  return website ? toWebsiteRecord(website) : null;
}

export async function setWebsiteActiveForWorkspace(
  workspaceId: string,
  websiteId: string,
  isActive: boolean,
): Promise<{ record: WebsiteRecord; changed: boolean } | null> {
  if (!isValidDatabaseId(websiteId)) {
    return null;
  }

  await connectToDatabase();
  const website = await WebsiteModel.findOneAndUpdate(
    { _id: websiteId, workspaceId, isActive: { $ne: isActive } },
    { $set: { isActive } },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();

  if (website) return { record: toWebsiteRecord(website), changed: true };

  const existing = await WebsiteModel.findOne({
    _id: websiteId,
    workspaceId,
  })
    .lean()
    .exec();
  return existing
    ? { record: toWebsiteRecord(existing), changed: false }
    : null;
}

export type DeleteWebsiteResult =
  "deleted_active" | "deleted_archived" | "not_found" | "has_dependencies";

export async function deleteWebsiteForWorkspace(
  workspaceId: string,
  websiteId: string,
): Promise<DeleteWebsiteResult> {
  if (!isValidDatabaseId(websiteId)) {
    return "not_found";
  }

  await connectToDatabase();
  const website = await WebsiteModel.findOne({
    _id: websiteId,
    workspaceId,
  })
    .select({ _id: 1 })
    .lean()
    .exec();

  if (!website) {
    return "not_found";
  }

  const [hasAudits, hasSchedules] = await Promise.all([
    AuditModel.exists({ workspaceId, websiteId: website._id }),
    ScheduledAuditModel.exists({ workspaceId, websiteId: website._id }),
  ]);

  if (hasAudits || hasSchedules) {
    return "has_dependencies";
  }

  const deleted = await WebsiteModel.findOneAndDelete({
    _id: website._id,
    workspaceId,
  })
    .select({ isActive: 1 })
    .lean()
    .exec();

  if (!deleted) return "not_found";
  return deleted.isActive ? "deleted_active" : "deleted_archived";
}
