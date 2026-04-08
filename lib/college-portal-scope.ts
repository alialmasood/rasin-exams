import { getCollegeProfileByUserId } from "@/lib/college-accounts";
import type { CollegeProfileRow } from "@/lib/college-accounts";
import type { SessionPayload } from "@/lib/session";

export type CollegePortalScope =
  | {
      accountKind: "FORMATION";
      sessionUserId: string;
      dataOwnerUserId: string;
      collegeSubjectId: null;
      formationName: string | null;
      branchName: null;
    }
  | {
      accountKind: "DEPARTMENT";
      sessionUserId: string;
      /** مالك بيانات التشكيل (حساب التشكيل) */
      dataOwnerUserId: string;
      collegeSubjectId: string;
      formationName: string | null;
      branchName: string | null;
    }
  | {
      accountKind: "FOLLOWUP";
      sessionUserId: string;
    };

/** يحدد نطاق البيانات لصفحات بوابة الكلية/القسم (ليس للمتابعة المركزية). */
export async function resolveCollegePortalScope(sessionUserId: string): Promise<CollegePortalScope | null> {
  const profile = await getCollegeProfileByUserId(sessionUserId);
  if (!profile) return null;
  const kind = profile.account_kind;
  if (kind === "FOLLOWUP") {
    return { accountKind: "FOLLOWUP", sessionUserId };
  }
  if (kind === "DEPARTMENT") {
    const sid = profile.college_subject_id?.trim();
    const tenant = profile.tenant_owner_user_id?.trim();
    if (!sid || !tenant) return null;
    return {
      accountKind: "DEPARTMENT",
      sessionUserId,
      dataOwnerUserId: tenant,
      collegeSubjectId: sid,
      formationName: profile.formation_name,
      branchName: profile.scoped_branch_name,
    };
  }
  return {
    accountKind: "FORMATION",
    sessionUserId,
    dataOwnerUserId: sessionUserId,
    collegeSubjectId: null,
    formationName: profile.formation_name,
    branchName: null,
  };
}

export function collegePortalDisplayLabel(profile: CollegeProfileRow): string {
  if (profile.account_kind === "FOLLOWUP") {
    return profile.holder_name?.trim() || "متابعة مركزية";
  }
  if (profile.account_kind === "DEPARTMENT") {
    const f = profile.formation_name?.trim() || "التشكيل";
    const b = profile.scoped_branch_name?.trim() || "القسم";
    return `${f} — ${b}`;
  }
  return profile.formation_name?.trim() || "حساب كلية";
}

/** لتحميل صفحات التشكيل أو القسم: مالك البيانات + فلتر القسم + مسار الواجهة. */
export type CollegeWorkspaceForPages = {
  sessionUserId: string;
  dataOwnerUserId: string;
  collegeSubjectId: string | null;
  collegeLabel: string;
  basePath: "/dashboard/college" | "/department";
  canManageBranches: boolean;
};

export async function loadCollegeWorkspaceForPages(session: {
  role: string;
  uid: string;
}): Promise<CollegeWorkspaceForPages | null> {
  if (session.role !== "COLLEGE") return null;
  const profile = await getCollegeProfileByUserId(session.uid);
  if (!profile || profile.account_kind === "FOLLOWUP") return null;
  if (profile.account_kind === "DEPARTMENT") {
    const tenant = profile.tenant_owner_user_id?.trim();
    const sid = profile.college_subject_id?.trim();
    if (!tenant || !sid) return null;
    return {
      sessionUserId: session.uid,
      dataOwnerUserId: tenant,
      collegeSubjectId: sid,
      collegeLabel: collegePortalDisplayLabel(profile),
      basePath: "/department",
      canManageBranches: false,
    };
  }
  return {
    sessionUserId: session.uid,
    dataOwnerUserId: session.uid,
    collegeSubjectId: null,
    collegeLabel: collegePortalDisplayLabel(profile),
    basePath: "/dashboard/college",
    canManageBranches: true,
  };
}

/** مالك الصفوف في قاعدة البيانات (حساب التشكيل) لاستدعاءات الإجراءات والاستعلامات */
export async function getCollegePortalDataOwnerUserId(session: SessionPayload): Promise<string | null> {
  if (session.role !== "COLLEGE") return null;
  if (session.college_account_kind === "FOLLOWUP") return null;
  if (session.college_account_kind === "DEPARTMENT") {
    const profile = await getCollegeProfileByUserId(session.uid);
    return profile?.tenant_owner_user_id?.trim() ?? null;
  }
  return session.uid;
}

/** يفرض معرّف القسم من الجلسة عند حساب القسم */
export function effectiveCollegeSubjectIdForMutation(session: SessionPayload, fromForm: string): string {
  if (session.college_account_kind === "DEPARTMENT" && session.college_subject_id?.trim()) {
    return session.college_subject_id.trim();
  }
  return fromForm.trim();
}

/** يمنع حساب القسم من الوصول لجداول أقسام أخرى */
export function departmentCanAccessCollegeSubjectRow(
  session: SessionPayload,
  rowCollegeSubjectId: string
): boolean {
  if (session.college_account_kind !== "DEPARTMENT") return true;
  const a = session.college_subject_id?.trim();
  const b = rowCollegeSubjectId.trim();
  return Boolean(a && a === b);
}
