"use server";

import { revalidatePath } from "next/cache";
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
  const v = validateSituationFormPayload(payload, { forSubmit: true });
  if (!v.ok) return { ok: false, message: v.message };

  const ins = await insertSituationFormSubmission({
    ownerUserId: session.uid,
    collegeLabelSnapshot: v.data.collegeLabel,
    payload: v.data,
  });
  if (!ins.ok) return ins;

  revalidatePath("/dashboard/college/status-followup");
  revalidatePath("/tracking");
  revalidatePath("/dashboard/college");
  revalidatePath("/dashboard/situations-followup");
  return { ok: true, id: ins.id };
}
