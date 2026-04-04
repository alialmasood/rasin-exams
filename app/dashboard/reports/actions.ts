"use server";

import type { UserRole } from "@/lib/authz";
import { isAdminRole } from "@/lib/authz";
import {
  buildAdminAccountsUsersReportHtml,
  listUsersForAdminAccountsReport,
} from "@/lib/admin-accounts-users-report";
import {
  buildAdminCollegeBranchesReportHtml,
  buildAdminExamRoomsReportHtml,
  buildAdminFormationsReportHtml,
  buildAdminStudySubjectsReportHtml,
  listCollegeBranchesForAdminReport,
  listExamRoomsForAdminReport,
  listFormationsForAdminReport,
  listStudySubjectsForAdminReport,
} from "@/lib/admin-master-data-reports";
import {
  buildAdminExamSystemAggregatesReportHtml,
  listExamScheduleAggregateRowsForAdminReport,
} from "@/lib/admin-exam-system-aggregates-report";
import {
  buildComprehensivePrintHtml,
  buildComprehensiveXlsxBase64,
  loadComprehensiveReportBundle,
  validateComprehensiveSectionIds,
} from "@/lib/admin-comprehensive-report";
import { getSession } from "@/lib/session";

function generatedAtLabelAr(): string {
  try {
    return new Date().toLocaleString("ar-IQ", {
      timeZone: "Asia/Baghdad",
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return new Date().toISOString();
  }
}

export async function getAccountsUsersReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listUsersForAdminAccountsReport();
  const html = buildAdminAccountsUsersReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export async function getFormationsReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listFormationsForAdminReport();
  const html = buildAdminFormationsReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export async function getCollegeBranchesReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listCollegeBranchesForAdminReport();
  const html = buildAdminCollegeBranchesReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export async function getStudySubjectsReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listStudySubjectsForAdminReport();
  const html = buildAdminStudySubjectsReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export async function getExamRoomsReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listExamRoomsForAdminReport();
  const html = buildAdminExamRoomsReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export async function getExamSystemAggregatesReportHtmlAction(): Promise<
  { ok: true; html: string } | { ok: false; message: string }
> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بإصدار هذا التقرير." };
  }
  const rows = await listExamScheduleAggregateRowsForAdminReport();
  const html = buildAdminExamSystemAggregatesReportHtml(rows, generatedAtLabelAr());
  return { ok: true, html };
}

export type ExportComprehensiveReportResult =
  | { ok: true; kind: "xlsx"; base64: string; filename: string }
  | { ok: true; kind: "html"; html: string }
  | { ok: false; message: string };

export async function exportComprehensiveReportAction(
  sectionIds: unknown[],
  format: "xlsx" | "print"
): Promise<ExportComprehensiveReportResult> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role as UserRole)) {
    return { ok: false, message: "غير مصرح لك بتصدير التقرير الشامل." };
  }
  const raw = Array.isArray(sectionIds) ? sectionIds.map((x) => String(x)) : [];
  const ids = validateComprehensiveSectionIds(raw);
  if (ids.length === 0) {
    return { ok: false, message: "اختر وسماً واحداً على الأقل من أقسام التقرير." };
  }
  const bundle = await loadComprehensiveReportBundle();
  const dateStr = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const base64 = buildComprehensiveXlsxBase64(ids, bundle);
    return {
      ok: true,
      kind: "xlsx",
      base64,
      filename: `rashin-comprehensive-report-${dateStr}.xlsx`,
    };
  }
  const html = buildComprehensivePrintHtml(ids, bundle, generatedAtLabelAr());
  return { ok: true, kind: "html", html };
}
