/** لمسة يوم الامتحان لمشرف القاعة والمراقبين — يُخزَّن في `college_exam_schedules.situation_room_staff_override` (JSONB). */

import { splitInvigilatorNamesList } from "@/lib/situation-staff-absences";
import type { ExternalRoomStaffStored } from "@/lib/room-external-staff";

export const SITUATION_ROOM_SUPERVISOR_MAX = 200;
export const SITUATION_ROOM_INVIGILATORS_MAX = 8000;

export type SituationRoomStaffOverrideStored = {
  supervisor_name?: string;
  invigilators?: string;
};

export function parseSituationRoomStaffOverrideFromDb(raw: unknown): SituationRoomStaffOverrideStored {
  if (!raw || typeof raw !== "object") return {};
  const j = raw as Record<string, unknown>;
  return {
    supervisor_name: typeof j.supervisor_name === "string" ? j.supervisor_name : undefined,
    invigilators: typeof j.invigilators === "string" ? j.invigilators : undefined,
  };
}

/** إن كان الحقل فارغاً والقاعة لها قيمة — نعتبره إرجاعاً لما في «إدارة القاعات». */
export function normalizeSituationSupervisorForSave(input: string, roomDefault: string): string {
  const t = String(input ?? "").trim();
  const r = String(roomDefault ?? "").trim();
  if (t === "" && r !== "") return r;
  return t;
}

export function normalizeSituationInvigilatorsForSave(input: string, roomDefault: string): string {
  const t = String(input ?? "").trim();
  const r = String(roomDefault ?? "").trim();
  if (t === "" && r !== "") return r;
  return t;
}

/** يُخزَّن فقط ما يختلف عن القاعة؛ `null` يمسح العمود. */
export function computeSituationRoomStaffOverridePayload(
  roomSupervisor: string,
  roomInvigilators: string,
  normalizedSupervisor: string,
  normalizedInvigilators: string
): SituationRoomStaffOverrideStored | null {
  const rs = String(roomSupervisor ?? "").trim();
  const ri = String(roomInvigilators ?? "").trim();
  const ns = String(normalizedSupervisor ?? "").trim().slice(0, SITUATION_ROOM_SUPERVISOR_MAX);
  const ni = String(normalizedInvigilators ?? "").trim().slice(0, SITUATION_ROOM_INVIGILATORS_MAX);
  const out: SituationRoomStaffOverrideStored = {};
  if (ns !== rs) out.supervisor_name = ns;
  if (ni !== ri) out.invigilators = ni;
  return Object.keys(out).length ? out : null;
}

export function resolveSituationRoomStaffDisplay(
  roomSupervisor: string,
  roomInvigilators: string,
  ov: SituationRoomStaffOverrideStored
): { supervisor_name: string; invigilators: string } {
  const rs = String(roomSupervisor ?? "").trim();
  const ri = String(roomInvigilators ?? "").trim();
  const os =
    ov.supervisor_name !== undefined ? String(ov.supervisor_name).trim().slice(0, SITUATION_ROOM_SUPERVISOR_MAX) : "";
  const oi =
    ov.invigilators !== undefined ? String(ov.invigilators).trim().slice(0, SITUATION_ROOM_INVIGILATORS_MAX) : "";
  return {
    supervisor_name: os || rs,
    invigilators: oi || ri,
  };
}

/** مشرف مسجّل (حرفان على الأقل) ومراقب واحد على الأقل (داخل التشكيل أو خارجي من إدارة القاعات). */
export function isSituationRoomStaffDatasetComplete(
  supervisorName: string,
  invigilatorsRaw: string,
  externalStaff?: Pick<ExternalRoomStaffStored, "external_invigilators">
): boolean {
  if (String(supervisorName ?? "").trim().length < 2) return false;
  if (splitInvigilatorNamesList(invigilatorsRaw).length > 0) return true;
  const ext = externalStaff?.external_invigilators ?? [];
  return ext.some((x) => x.name.trim().length >= 2);
}

export function validateSituationRoomStaffOverrideInput(
  normalizedSupervisor: string,
  normalizedInvigilators: string
): { ok: true } | { ok: false; message: string } {
  if (normalizedSupervisor.length > SITUATION_ROOM_SUPERVISOR_MAX) {
    return { ok: false, message: `اسم مشرف القاعة طويل جداً (الحد ${SITUATION_ROOM_SUPERVISOR_MAX} حرفاً).` };
  }
  if (normalizedInvigilators.length > SITUATION_ROOM_INVIGILATORS_MAX) {
    return { ok: false, message: `نص المراقبين طويل جداً (الحد ${SITUATION_ROOM_INVIGILATORS_MAX} حرفاً).` };
  }
  return { ok: true };
}
