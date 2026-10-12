import { createHash } from "node:crypto";

import { Types } from "mongoose";

import { connectToDatabase } from "../connection.js";
import {
  LeadRequestedService,
  LeadSource,
  type LeadRequestedService as LeadRequestedServiceValue,
  type LeadSource as LeadSourceValue,
} from "../enums.js";
import { LeadModel } from "../models.js";
import {
  consumePublicLeadRateLimits,
  getPublicAuditLeadContext,
} from "./public-audits.js";

export class PublicLeadAuditUnavailableError extends Error {
  constructor() {
    super("This completed public audit is unavailable or has expired.");
    this.name = "PublicLeadAuditUnavailableError";
  }
}

export type CreatePublicLeadInput = {
  name: string;
  email: string;
  phone?: string;
  publicAuditToken: string;
  requestedService: LeadRequestedServiceValue;
  source: LeadSourceValue;
  clientKeyHash: string;
  emailKeyHash: string;
  auditKeyHash: string;
};

export async function createPublicLead(
  input: CreatePublicLeadInput,
): Promise<{ created: boolean }> {
  await consumePublicLeadRateLimits({
    clientKeyHash: input.clientKeyHash,
    emailKeyHash: input.emailKeyHash,
    auditKeyHash: input.auditKeyHash,
  });

  const context = await getPublicAuditLeadContext(input.publicAuditToken);
  if (!context) throw new PublicLeadAuditUnavailableError();

  const normalizedEmail = input.email.trim().toLowerCase();
  const dedupeKey = createHash("sha256")
    .update(
      `${context.auditId}\u0000${normalizedEmail}\u0000${input.requestedService}`,
    )
    .digest("hex");
  try {
    await LeadModel.create({
      name: input.name,
      email: normalizedEmail,
      ...(input.phone ? { phone: input.phone } : {}),
      websiteUrl: context.websiteUrl,
      auditId: new Types.ObjectId(context.auditId),
      ...(context.auditScore === null
        ? {}
        : { auditScore: context.auditScore }),
      topDetectedProblems: context.topDetectedProblems.map((problem) => ({
        title: problem.title,
        category: problem.category,
        severity: problem.severity,
      })),
      requestedService: input.requestedService,
      source: input.source,
      dedupeKey,
    });
    return { created: true };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return { created: false };
    }
    throw error;
  }
}

export type LeadListFilters = {
  search?: string;
  requestedService?: LeadRequestedServiceValue;
  source?: LeadSourceValue;
  page: number;
  pageSize: number;
};

export type LeadListItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  websiteUrl: string;
  auditId: string;
  auditScore: number | null;
  topDetectedProblems: Array<{
    title: string;
    category: string;
    severity: string;
  }>;
  requestedService: LeadRequestedServiceValue;
  source: LeadSourceValue;
  createdAt: Date;
};

export type LeadListResult = {
  items: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

/** Global lead access. Call only after the web layer verifies Super Admin. */
export async function listLeadsForSuperAdmin(
  filters: LeadListFilters,
): Promise<LeadListResult> {
  await connectToDatabase();
  const pageSize = clampInteger(filters.pageSize, 10, 100);
  const requestedPage = clampInteger(filters.page, 1, 10_000);
  const search = filters.search?.trim();
  const expression = search
    ? new RegExp(escapeRegularExpression(search.slice(0, 100)), "i")
    : undefined;
  const query = {
    ...(expression
      ? {
          $or: [
            { name: expression },
            { email: expression },
            { websiteUrl: expression },
          ],
        }
      : {}),
    ...(filters.requestedService
      ? { requestedService: filters.requestedService }
      : {}),
    ...(filters.source ? { source: filters.source } : {}),
  };
  const total = await LeadModel.countDocuments(query).exec();
  const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, Math.max(1, pageCount));
  const leads = await LeadModel.find(query)
    .select({
      name: 1,
      email: 1,
      phone: 1,
      websiteUrl: 1,
      auditId: 1,
      auditScore: 1,
      topDetectedProblems: 1,
      requestedService: 1,
      source: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()
    .exec();

  return {
    items: leads.map((lead) => ({
      id: lead._id.toString(),
      name: lead.name,
      email: lead.email,
      phone: lead.phone ?? null,
      websiteUrl: lead.websiteUrl,
      auditId: lead.auditId.toString(),
      auditScore: lead.auditScore ?? null,
      topDetectedProblems: lead.topDetectedProblems.map(
        (problem: { title: string; category: string; severity: string }) => ({
          title: problem.title,
          category: problem.category,
          severity: problem.severity,
        }),
      ),
      requestedService: lead.requestedService,
      source: lead.source,
      createdAt: lead.createdAt,
    })),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export const leadRequestedServices = Object.values(LeadRequestedService);
export const leadSources = Object.values(LeadSource);
