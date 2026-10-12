import "server-only";

import { createHash } from "node:crypto";

import {
  completePdfReportGeneration,
  createPdfReportGeneration,
  failPdfReportGeneration,
  getPdfAuditReportForWorkspace,
  getPublicPdfReportByToken,
  type PdfAuditReportData,
} from "@website-audit/database";
import { createPriorityActionPlan } from "@website-audit/audit-core";

import type { CurrentAccount } from "../auth/current-user";
import { webLogger } from "../logging/logger";
import {
  rollbackPlanCapacity,
  requireReportCapacity,
} from "../entitlements/service";
import { generateAuditPdf } from "./pdf-document";

export type PdfReportGenerationResult =
  | {
      outcome: "completed";
      reportId: string;
      fileName: string;
      buffer: Buffer;
    }
  | { outcome: "not_found" }
  | { outcome: "not_completed" };

function fileNamePart(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return normalized || "website";
}

export async function generateWorkspaceAuditPdf(
  account: CurrentAccount,
  auditId: string,
): Promise<PdfReportGenerationResult> {
  const lookup = await getPdfAuditReportForWorkspace({
    workspaceId: account.workspace.id,
    auditId,
  });
  if (lookup.outcome !== "ready") return lookup;

  return generateAuthorizedPdf(account, lookup.data, account.workspace.id);
}

export async function generatePublicAuditPdf(
  account: CurrentAccount,
  token: string,
): Promise<PdfReportGenerationResult> {
  const lookup = await getPublicPdfReportByToken(token);
  if (lookup.outcome !== "ready") return lookup;
  return generateAuthorizedPdf(account, lookup.data, lookup.workspaceId);
}

async function generateAuthorizedPdf(
  account: CurrentAccount,
  data: PdfAuditReportData,
  reportWorkspaceId: string,
): Promise<PdfReportGenerationResult> {
  const capacity = await requireReportCapacity(account.workspace.id);

  const auditId = data.audit.id;
  const auditDate = data.audit.completedAt.toISOString().slice(0, 10);
  const fileName = `${fileNamePart(data.website.name)}-audit-${auditDate}.pdf`;
  let reportId: string | null = null;

  try {
    webLogger("info", "report.generation_started", {
      auditId,
      workspaceId: account.workspace.id,
      userId: account.id,
    });
    reportId = await createPdfReportGeneration({
      workspaceId: reportWorkspaceId,
      auditId,
      createdById: account.id,
      title: `${data.website.name} website audit report`,
    });
    const buffer = await generateAuditPdf({
      ...data,
      actionPlan: createPriorityActionPlan(data.priorityFindings),
    });
    const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
    await completePdfReportGeneration({
      workspaceId: reportWorkspaceId,
      reportId,
      fileName,
      fileSizeBytes: buffer.byteLength,
      checksumSha256,
    });
    webLogger("info", "report.generation_completed", {
      auditId,
      reportId,
      workspaceId: account.workspace.id,
      fileSizeBytes: buffer.byteLength,
    });
    return { outcome: "completed", reportId, fileName, buffer };
  } catch (error) {
    webLogger("error", "report.generation_failed", {
      auditId,
      reportId,
      workspaceId: account.workspace.id,
      error,
    });
    const cleanupResults = await Promise.allSettled([
      reportId
        ? failPdfReportGeneration({
            workspaceId: reportWorkspaceId,
            reportId,
            failureReason: "The PDF document could not be generated.",
          })
        : Promise.resolve(),
      rollbackPlanCapacity(capacity.reservation),
    ]);
    if (cleanupResults[0]?.status === "rejected") {
      webLogger("error", "report.failure_metadata_persist_failed", {
        auditId,
        reportId,
        workspaceId: account.workspace.id,
        error: cleanupResults[0].reason,
      });
    }
    throw new Error("PDF_REPORT_GENERATION_FAILED", { cause: error });
  }
}
