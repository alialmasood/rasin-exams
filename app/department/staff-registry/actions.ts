"use server";

import {
  deleteCollegeStaffRegistryRow,
  insertCollegeStaffRegistryRow,
  STAFF_REGISTRY_ALL_BRANCHES_VALUE,
  updateCollegeStaffRegistryRow,
} from "@/lib/college-staff-registry";
import { listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import { parseStaffRegistryExcelBuffer } from "@/lib/staff-registry-import";
import {
  departmentCanAccessCollegeSubjectRow,
  effectiveCollegeSubjectIdForMutation,
  getCollegePortalDataOwnerUserId,
  isDepartmentPortalSession,
} from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
import { getSession } from "@/lib/session";

export type StaffRegistryActionState = { ok: true; message: string } | { ok: false; message: string } | null;

export type StaffRegistryImportActionState =
  | null
  | {
      ok: true;
      message: string;
      inserted: number;
      rowIssueCount: number;
    }
  | { ok: false; message: string };

const STAFF_IMPORT_MAX_BYTES = 8 * 1024 * 1024;

export async function addCollegeStaffRegistryAction(
  _prev: StaffRegistryActionState,
  formData: FormData
): Promise<StaffRegistryActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  if (!isDepartmentPortalSession(session)) {
    return { ok: false, message: "هذه الصفحة متاحة فقط من بوابة القسم/الفرع." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const fullName = String(formData.get("full_name") ?? "");
  const rawSubject = String(formData.get("college_subject_id") ?? "").trim();
  let collegeSubjectId: string | null;
  if (session.college_account_kind === "CENTRAL") {
    if (rawSubject === STAFF_REGISTRY_ALL_BRANCHES_VALUE) {
      collegeSubjectId = null;
    } else if (!/^\d+$/.test(rawSubject)) {
      return { ok: false, message: "اختر القسم/الفرع أو «كل الأقسام والفروع»." };
    } else {
      collegeSubjectId = rawSubject;
    }
  } else {
    collegeSubjectId = effectiveCollegeSubjectIdForMutation(session, rawSubject);
    if (!collegeSubjectId) {
      return { ok: false, message: "معرّف القسم غير صالح." };
    }
  }
  if (
    collegeSubjectId !== null &&
    !departmentCanAccessCollegeSubjectRow(session, collegeSubjectId)
  ) {
    return { ok: false, message: "لا يمكن الإضافة لهذا القسم." };
  }
  if (collegeSubjectId === null && session.college_account_kind !== "CENTRAL") {
    return { ok: false, message: "خيار «كل الأقسام والفروع» متاح للحساب المركزي فقط." };
  }
  const res = await insertCollegeStaffRegistryRow({
    ownerUserId,
    collegeSubjectId,
    fullName,
    roleKind: null,
  });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "create",
    resource: "staff_registry",
    summary: `إضافة اسم إلى السجل المرجعي: ${fullName.trim().slice(0, 80)}.`,
    details: { id: res.id, collegeSubjectId: collegeSubjectId ?? "ALL_BRANCHES" },
  });
  revalidateCollegePortalSegment("staff-registry");
  return { ok: true, message: "تم حفظ الاسم في السجل." };
}

export async function updateCollegeStaffRegistryAction(
  _prev: StaffRegistryActionState,
  formData: FormData
): Promise<StaffRegistryActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  if (!isDepartmentPortalSession(session)) {
    return { ok: false, message: "هذه الصفحة متاحة فقط من بوابة القسم/الفرع." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const rowId = String(formData.get("id") ?? "").trim();
  if (!/^\d+$/.test(rowId)) return { ok: false, message: "معرّف السجل غير صالح." };
  const fullName = String(formData.get("full_name") ?? "");
  const rawSubject = String(formData.get("college_subject_id") ?? "").trim();
  let collegeSubjectId: string | null;
  if (session.college_account_kind === "CENTRAL") {
    if (rawSubject === STAFF_REGISTRY_ALL_BRANCHES_VALUE) {
      collegeSubjectId = null;
    } else if (!/^\d+$/.test(rawSubject)) {
      return { ok: false, message: "اختر القسم/الفرع أو «كل الأقسام والفروع»." };
    } else {
      collegeSubjectId = rawSubject;
    }
  } else {
    collegeSubjectId = effectiveCollegeSubjectIdForMutation(session, rawSubject);
    if (!collegeSubjectId) {
      return { ok: false, message: "معرّف القسم غير صالح." };
    }
  }
  if (
    collegeSubjectId !== null &&
    !departmentCanAccessCollegeSubjectRow(session, collegeSubjectId)
  ) {
    return { ok: false, message: "لا يمكن التعديل لهذا القسم." };
  }
  if (collegeSubjectId === null && session.college_account_kind !== "CENTRAL") {
    return { ok: false, message: "خيار «كل الأقسام والفروع» متاح للحساب المركزي فقط." };
  }
  const restrictSub =
    session.college_account_kind === "DEPARTMENT" ? session.college_subject_id?.trim() ?? null : null;
  const res = await updateCollegeStaffRegistryRow({
    ownerUserId,
    id: rowId,
    collegeSubjectId,
    fullName,
    roleKind: null,
    restrictCollegeSubjectId: restrictSub,
  });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "patch",
    resource: "staff_registry",
    summary: `تحديث سجل مرجعي (${rowId}): ${fullName.trim().slice(0, 80)}.`,
    details: { id: rowId, collegeSubjectId: collegeSubjectId ?? "ALL_BRANCHES" },
  });
  revalidateCollegePortalSegment("staff-registry");
  return { ok: true, message: "تم حفظ التعديلات." };
}

export async function deleteCollegeStaffRegistryAction(
  _prev: StaffRegistryActionState,
  formData: FormData
): Promise<StaffRegistryActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  if (!isDepartmentPortalSession(session)) {
    return { ok: false, message: "هذه الصفحة متاحة فقط من بوابة القسم/الفرع." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const id = String(formData.get("id") ?? "").trim();
  const restrictSub =
    session.college_account_kind === "DEPARTMENT" ? session.college_subject_id?.trim() ?? null : null;
  const res = await deleteCollegeStaffRegistryRow({ ownerUserId, id, restrictCollegeSubjectId: restrictSub });
  if (!res.ok) return res;
  void recordCollegeActivityEvent({
    ownerUserId,
    action: "delete",
    resource: "staff_registry",
    summary: `حذف سجل من سجل المشرفين والمراقبين (${id}).`,
    details: { id },
  });
  revalidateCollegePortalSegment("staff-registry");
  return { ok: true, message: "تم حذف السجل." };
}

export async function importCollegeStaffRegistryExcelAction(
  _prev: StaffRegistryImportActionState,
  formData: FormData
): Promise<StaffRegistryImportActionState> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") return { ok: false, message: "غير مصرح." };
  if (!isDepartmentPortalSession(session)) {
    return { ok: false, message: "هذه الصفحة متاحة فقط من بوابة القسم/الفرع." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "لم يُرفع ملف." };
  if (file.size === 0) return { ok: false, message: "الملف فارغ." };
  if (file.size > STAFF_IMPORT_MAX_BYTES) {
    return { ok: false, message: "حجم الملف كبير جداً (الحد 8 ميجابايت)." };
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    return { ok: false, message: "يُقبل ملف Excel فقط (.xlsx أو .xls)." };
  }

  const isCentral = session.college_account_kind === "CENTRAL";
  const fixedSub =
    session.college_account_kind === "DEPARTMENT" ? session.college_subject_id?.trim() ?? null : null;

  const branches = await listCollegeSubjectsByOwner(ownerUserId, isCentral ? null : fixedSub);
  const branchRefs = branches.map((b) => ({ id: b.id, branch_name: b.branch_name }));

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, message: "تعذّر قراءة الملف." };
  }

  const parsed = parseStaffRegistryExcelBuffer(buffer, {
    branches: branchRefs,
    isCentralAccount: isCentral,
    fixedCollegeSubjectId: fixedSub,
  });
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const { items, rowErrors } = parsed.data;
  if (items.length === 0) {
    const hint = rowErrors.length ? ` ${rowErrors.slice(0, 5).join(" ")}` : "";
    return { ok: false, message: `لم يُستورد أي صف صالح.${hint}` };
  }

  let inserted = 0;
  const saveErrors: string[] = [];

  for (const item of items) {
    if (item.collegeSubjectId !== null && !departmentCanAccessCollegeSubjectRow(session, item.collegeSubjectId)) {
      saveErrors.push(`السطر ${item.sheetRow}: لا صلاحية لهذا القسم/الفرع.`);
      continue;
    }
    if (item.collegeSubjectId === null && session.college_account_kind !== "CENTRAL") {
      saveErrors.push(`السطر ${item.sheetRow}: خيار «كل الأقسام والفروع» متاح للحساب المركزي فقط.`);
      continue;
    }
    const res = await insertCollegeStaffRegistryRow({
      ownerUserId,
      collegeSubjectId: item.collegeSubjectId,
      fullName: item.fullName,
      roleKind: null,
    });
    if (!res.ok) saveErrors.push(`السطر ${item.sheetRow}: ${res.message}`);
    else inserted++;
  }

  const rowIssueCount = rowErrors.length + saveErrors.length;
  if (inserted > 0) {
    void recordCollegeActivityEvent({
      ownerUserId,
      action: "create",
      resource: "staff_registry",
      summary: `استيراد Excel: ${inserted} اسمًا في السجل المرجعي.`,
      details: {
        inserted,
        file: file.name.slice(0, 120),
        rowErrors: rowErrors.slice(0, 20),
        saveErrors: saveErrors.slice(0, 20),
      },
    });
    revalidateCollegePortalSegment("staff-registry");
  }

  let message = inserted > 0 ? `تم حفظ ${inserted} سجلًا من الملف.` : "لم يُحفظ أي سجل.";
  if (rowErrors.length) {
    message += ` تخطّي أو خطأ في ${rowErrors.length} سطر (مراجعة الشكل).`;
    if (rowErrors.length <= 3) message += ` ${rowErrors.join(" ")}`;
  }
  if (saveErrors.length) {
    message += ` فشل حفظ ${saveErrors.length} سطر.`;
    if (saveErrors.length <= 3) message += ` ${saveErrors.join(" ")}`;
  }

  if (inserted === 0) {
    return { ok: false, message };
  }
  return { ok: true, message, inserted, rowIssueCount };
}
