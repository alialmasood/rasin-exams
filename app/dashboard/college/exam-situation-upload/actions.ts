"use server";

import { revalidatePath } from "next/cache";
import { recordCollegeActivityEvent } from "@/lib/college-activity-log";
import { getCollegePortalDataOwnerUserId } from "@/lib/college-portal-scope";
import { revalidateCollegePortalSegment } from "@/lib/revalidate-college-portal";
import { getSession } from "@/lib/session";
import { insertSituationFormSubmission } from "@/lib/college-situation-form-submissions";
import { type SituationFormPayloadV1, validateSituationFormPayload } from "@/lib/situation-form-payload";

export async function submitSituationFormAction(
  payload: unknown
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session || session.role !== "COLLEGE") {
    return { ok: false, message: "غير مصرح." };
  }
  const ownerUserId = await getCollegePortalDataOwnerUserId(session);
  if (!ownerUserId) return { ok: false, message: "غير مصرح." };
  const v = validateSituationFormPayload(payload, { forSubmit: true });
  if (!v.ok) return { ok: false, message: v.message };

  const ins = await insertSituationFormSubmission({
    ownerUserId,
    collegeLabelSnapshot: v.data.collegeLabel,
    payload: v.data,
  });
  if (!ins.ok) return ins;

  void recordCollegeActivityEvent({
    ownerUserId,
    action: "submit",
    resource: "situation_form",
    summary: `إرسال نموذج موقف امتحاني (المعرّف ${ins.id}).`,
    details: { submissionId: ins.id },
  });
  revalidateCollegePortalSegment("status-followup");
  revalidatePath("/tracking");
  revalidateCollegePortalSegment("");
  revalidatePath("/dashboard/situations-followup");
  return { ok: true, id: ins.id };
}
