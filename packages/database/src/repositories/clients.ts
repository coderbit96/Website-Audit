import { type ClientSession, Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  type AuditStatus,
  type AuditType,
  type ReportGenerationStatus,
} from "../enums.js";
import {
  AuditModel,
  ClientModel,
  ReportModel,
  WebsiteModel,
} from "../models.js";

export type ClientListStatus = "active" | "archived" | "all";

export type ClientRecord = {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  websiteCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientWebsiteRecord = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  selected: boolean;
};

export type ClientAuditRecord = {
  id: string;
  website: { id: string; name: string };
  status: AuditStatus;
  type: AuditType;
  overallScore: number | null;
  pagesCrawled: number;
  createdAt: Date;
  completedAt: Date | null;
};

export type ClientReportRecord = {
  id: string;
  auditId: string;
  title: string;
  format: string;
  status: ReportGenerationStatus;
  websiteName: string;
  createdAt: Date;
  generatedAt: Date | null;
};

export type ClientDetailRecord = {
  client: ClientRecord;
  websites: ClientWebsiteRecord[];
  audits: ClientAuditRecord[];
  reports: ClientReportRecord[];
};

export type ClientMutationFields = {
  companyName: string;
  contactName?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  notes?: string | undefined;
};

function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function clientDisplayFields(client: {
  companyName?: string | null;
  contactName?: string | null;
  name: string;
  company?: string | null;
}): { companyName: string; contactName: string | null } {
  const companyName =
    client.companyName?.trim() || client.company?.trim() || client.name.trim();
  const contactName = client.contactName?.trim() || client.name.trim();
  return {
    companyName,
    contactName: contactName === companyName ? null : contactName,
  };
}

function serializeClient(
  client: {
    _id: Types.ObjectId;
    companyName?: string | null;
    contactName?: string | null;
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean | null;
    createdAt: Date;
    updatedAt: Date;
  },
  websiteCount = 0,
): ClientRecord {
  const names = clientDisplayFields(client);
  return {
    id: client._id.toString(),
    ...names,
    email: client.email?.trim() || null,
    phone: client.phone?.trim() || null,
    notes: client.notes?.trim() || null,
    isActive: client.isActive !== false,
    websiteCount,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

function transactionIsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Transaction numbers are only allowed") ||
      error.message.includes("does not support retryable writes"))
  );
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function listClientsForWorkspace(
  workspaceId: string,
  status: ClientListStatus = "active",
): Promise<ClientRecord[]> {
  if (!Types.ObjectId.isValid(workspaceId)) return [];
  await connectToDatabase();
  const workspaceObjectId = new Types.ObjectId(workspaceId);
  const statusFilter =
    status === "all"
      ? {}
      : status === "active"
        ? { isActive: { $ne: false } }
        : { isActive: false };
  const clients = await ClientModel.find({
    workspaceId: workspaceObjectId,
    ...statusFilter,
  })
    .sort({ companyName: 1, company: 1, name: 1, _id: 1 })
    .lean()
    .exec();
  const clientIds = clients.map((client) => client._id);
  const websiteCounts =
    clientIds.length === 0
      ? []
      : await WebsiteModel.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              workspaceId: workspaceObjectId,
              clientId: { $in: clientIds },
            },
          },
          { $group: { _id: "$clientId", count: { $sum: 1 } } },
        ]).exec();
  const countByClient = new Map(
    websiteCounts.map((entry) => [entry._id.toString(), entry.count]),
  );
  return clients.map((client) =>
    serializeClient(client, countByClient.get(client._id.toString()) ?? 0),
  );
}

export async function createClientForWorkspace(input: {
  workspaceId: string;
  createdById: string;
  fields: ClientMutationFields;
}): Promise<ClientRecord> {
  await connectToDatabase();
  const companyName = input.fields.companyName.trim().replace(/\s+/g, " ");
  const contactName = optionalValue(input.fields.contactName);
  const client = await ClientModel.create({
    workspaceId: input.workspaceId,
    createdById: input.createdById,
    companyName,
    normalizedCompanyName: normalizeCompanyName(companyName),
    contactName,
    email: optionalValue(input.fields.email)?.toLocaleLowerCase("en-US"),
    phone: optionalValue(input.fields.phone),
    notes: optionalValue(input.fields.notes),
    isActive: true,
    name: contactName ?? companyName,
    company: companyName,
  });
  return serializeClient(client.toObject());
}

export async function updateClientForWorkspace(input: {
  workspaceId: string;
  clientId: string;
  fields: ClientMutationFields;
}): Promise<ClientRecord | null> {
  if (!Types.ObjectId.isValid(input.clientId)) return null;
  await connectToDatabase();
  const companyName = input.fields.companyName.trim().replace(/\s+/g, " ");
  const contactName = optionalValue(input.fields.contactName);
  const client = await ClientModel.findOneAndUpdate(
    { _id: input.clientId, workspaceId: input.workspaceId },
    {
      $set: {
        companyName,
        normalizedCompanyName: normalizeCompanyName(companyName),
        contactName,
        email: optionalValue(input.fields.email)?.toLocaleLowerCase("en-US"),
        phone: optionalValue(input.fields.phone),
        notes: optionalValue(input.fields.notes),
        name: contactName ?? companyName,
        company: companyName,
      },
    },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();
  if (!client) return null;
  const websiteCount = await WebsiteModel.countDocuments({
    workspaceId: input.workspaceId,
    clientId: client._id,
  });
  return serializeClient(client, websiteCount);
}

export async function setClientActiveForWorkspace(input: {
  workspaceId: string;
  clientId: string;
  isActive: boolean;
}): Promise<{ client: ClientRecord; changed: boolean } | null> {
  if (!Types.ObjectId.isValid(input.clientId)) return null;
  await connectToDatabase();
  const changed = await ClientModel.findOneAndUpdate(
    {
      _id: input.clientId,
      workspaceId: input.workspaceId,
      isActive: { $ne: input.isActive },
    },
    { $set: { isActive: input.isActive } },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec();
  const client =
    changed ??
    (await ClientModel.findOne({
      _id: input.clientId,
      workspaceId: input.workspaceId,
    })
      .lean()
      .exec());
  if (!client) return null;
  const websiteCount = await WebsiteModel.countDocuments({
    workspaceId: input.workspaceId,
    clientId: client._id,
  });
  return {
    client: serializeClient(client, websiteCount),
    changed: Boolean(changed),
  };
}

export type ReplaceClientWebsitesResult =
  "updated" | "not_found" | "archived" | "invalid_website" | "website_conflict";

async function replaceClientWebsites(
  input: { workspaceId: string; clientId: string; websiteIds: string[] },
  session?: ClientSession,
): Promise<ReplaceClientWebsitesResult> {
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const clientId = new Types.ObjectId(input.clientId);
  let clientQuery = ClientModel.findOne({ _id: clientId, workspaceId }).select({
    isActive: 1,
  });
  if (session) clientQuery = clientQuery.session(session);
  const client = await clientQuery.lean().exec();
  if (!client) return "not_found";
  if (client.isActive === false) return "archived";

  const websiteIds = input.websiteIds.map((id) => new Types.ObjectId(id));
  let websitesQuery = WebsiteModel.find({
    _id: { $in: websiteIds },
    workspaceId,
  }).select({ clientId: 1 });
  if (session) websitesQuery = websitesQuery.session(session);
  const websites = await websitesQuery.lean().exec();
  if (websites.length !== websiteIds.length) return "invalid_website";
  if (
    websites.some(
      (website) => website.clientId && !website.clientId.equals(clientId),
    )
  ) {
    return "website_conflict";
  }

  let detachedQuery = WebsiteModel.find({
    workspaceId,
    clientId,
    ...(websiteIds.length > 0 ? { _id: { $nin: websiteIds } } : {}),
  }).select({ _id: 1 });
  if (session) detachedQuery = detachedQuery.session(session);
  const detachedWebsiteIds = (await detachedQuery.lean().exec()).map(
    (website) => website._id,
  );

  if (websiteIds.length > 0) {
    await WebsiteModel.updateMany(
      { _id: { $in: websiteIds }, workspaceId },
      { $set: { clientId } },
      session ? { session } : {},
    ).exec();
    let auditsQuery = AuditModel.find({
      workspaceId,
      websiteId: { $in: websiteIds },
    }).select({ _id: 1 });
    if (session) auditsQuery = auditsQuery.session(session);
    const auditIds = (await auditsQuery.lean().exec()).map(
      (audit) => audit._id,
    );
    if (auditIds.length > 0) {
      await ReportModel.updateMany(
        { workspaceId, auditId: { $in: auditIds } },
        { $set: { clientId } },
        session ? { session } : {},
      ).exec();
    }
  }
  await WebsiteModel.updateMany(
    {
      workspaceId,
      clientId,
      ...(websiteIds.length > 0 ? { _id: { $nin: websiteIds } } : {}),
    },
    { $unset: { clientId: 1 } },
    session ? { session } : {},
  ).exec();
  if (detachedWebsiteIds.length > 0) {
    let detachedAuditsQuery = AuditModel.find({
      workspaceId,
      websiteId: { $in: detachedWebsiteIds },
    }).select({ _id: 1 });
    if (session) detachedAuditsQuery = detachedAuditsQuery.session(session);
    const detachedAuditIds = (await detachedAuditsQuery.lean().exec()).map(
      (audit) => audit._id,
    );
    if (detachedAuditIds.length > 0) {
      await ReportModel.updateMany(
        {
          workspaceId,
          clientId,
          auditId: { $in: detachedAuditIds },
        },
        { $unset: { clientId: 1 } },
        session ? { session } : {},
      ).exec();
    }
  }
  return "updated";
}

export async function replaceClientWebsitesForWorkspace(input: {
  workspaceId: string;
  clientId: string;
  websiteIds: string[];
}): Promise<ReplaceClientWebsitesResult> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.clientId) ||
    input.websiteIds.some((id) => !Types.ObjectId.isValid(id))
  ) {
    return "invalid_website";
  }
  const mongo = await connectToDatabase();
  const session = await mongo.connection.startSession();
  let outcome: ReplaceClientWebsitesResult = "not_found";
  try {
    try {
      await session.withTransaction(async () => {
        outcome = await replaceClientWebsites(input, session);
      });
    } catch (error) {
      if (!transactionIsUnavailable(error)) throw error;
      outcome = await replaceClientWebsites(input);
    }
    return outcome;
  } finally {
    await session.endSession();
  }
}

export async function getClientDetailForWorkspace(input: {
  workspaceId: string;
  clientId: string;
}): Promise<ClientDetailRecord | null> {
  if (
    !Types.ObjectId.isValid(input.workspaceId) ||
    !Types.ObjectId.isValid(input.clientId)
  ) {
    return null;
  }
  await connectToDatabase();
  const workspaceId = new Types.ObjectId(input.workspaceId);
  const clientId = new Types.ObjectId(input.clientId);
  const client = await ClientModel.findOne({ _id: clientId, workspaceId })
    .lean()
    .exec();
  if (!client) return null;

  const websites = await WebsiteModel.find({
    workspaceId,
    $or: [{ clientId }, { clientId: { $exists: false } }, { clientId: null }],
  })
    .select({ name: 1, url: 1, isActive: 1, clientId: 1 })
    .sort({ isActive: -1, name: 1, url: 1 })
    .lean()
    .exec();
  const selectedWebsites = websites.filter((website) =>
    website.clientId?.equals(clientId),
  );
  const selectedWebsiteIds = selectedWebsites.map((website) => website._id);
  const audits =
    selectedWebsiteIds.length === 0
      ? []
      : await AuditModel.find({
          workspaceId,
          websiteId: { $in: selectedWebsiteIds },
        })
          .select({
            websiteId: 1,
            status: 1,
            type: 1,
            overallScore: 1,
            pagesCrawled: 1,
            createdAt: 1,
            completedAt: 1,
          })
          .sort({ createdAt: -1, _id: -1 })
          .limit(25)
          .lean()
          .exec();
  const reports = await ReportModel.find({ workspaceId, clientId })
    .select({
      auditId: 1,
      title: 1,
      format: 1,
      status: 1,
      createdAt: 1,
      generatedAt: 1,
    })
    .sort({ createdAt: -1, _id: -1 })
    .limit(25)
    .lean()
    .exec();
  const reportAuditIds = reports.map((report) => report.auditId);
  const reportAudits =
    reportAuditIds.length === 0
      ? []
      : await AuditModel.find({
          _id: { $in: reportAuditIds },
          workspaceId,
        })
          .select({ websiteId: 1 })
          .lean()
          .exec();
  const websiteNameById = new Map(
    selectedWebsites.map((website) => [
      website._id.toString(),
      website.name?.trim() || website.url,
    ]),
  );
  const auditWebsiteById = new Map(
    reportAudits.map((audit) => [
      audit._id.toString(),
      audit.websiteId.toString(),
    ]),
  );

  return {
    client: serializeClient(client, selectedWebsites.length),
    websites: websites.map((website) => ({
      id: website._id.toString(),
      name: website.name?.trim() || website.url,
      url: website.url,
      isActive: website.isActive,
      selected: website.clientId?.equals(clientId) ?? false,
    })),
    audits: audits.map((audit) => ({
      id: audit._id.toString(),
      website: {
        id: audit.websiteId.toString(),
        name:
          websiteNameById.get(audit.websiteId.toString()) ??
          "Unavailable website",
      },
      status: audit.status,
      type: audit.type,
      overallScore:
        typeof audit.overallScore === "number" ? audit.overallScore : null,
      pagesCrawled: audit.pagesCrawled ?? 0,
      createdAt: audit.createdAt,
      completedAt: audit.completedAt ?? null,
    })),
    reports: reports.map((report) => {
      const websiteId = auditWebsiteById.get(report.auditId.toString());
      return {
        id: report._id.toString(),
        auditId: report.auditId.toString(),
        title: report.title,
        format: report.format,
        status: report.status,
        websiteName: websiteId
          ? (websiteNameById.get(websiteId) ?? "Previously associated website")
          : "Unavailable website",
        createdAt: report.createdAt,
        generatedAt: report.generatedAt ?? null,
      };
    }),
  };
}
