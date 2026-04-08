/**
 * مشرف/مراقبون من خارج تشكيل الكلية — يُخزَّن في `college_exam_rooms.external_room_staff` (JSONB).
 */

export const MAX_EXTERNAL_INVIGILATORS = 10;

export type ExternalInvigilatorEntry = {
  name: string;
  formation_name: string;
};

export type ExternalRoomStaffStored = {
  supervisor_is_external: boolean;
  /** اسم التشكيل/الكلية التي ينتمي إليها المشرف عند كونه خارجياً */
  supervisor_formation_name: string;
  external_invigilators: ExternalInvigilatorEntry[];
};

export const EMPTY_EXTERNAL_ROOM_STAFF: ExternalRoomStaffStored = {
  supervisor_is_external: false,
  supervisor_formation_name: "",
  external_invigilators: [],
};

type JsonStored = {
  supervisor_is_external?: boolean;
  supervisor_formation_name?: string;
  external_invigilators?: Array<{ name?: string; formation_name?: string }>;
};

export function parseExternalRoomStaffFromDb(value: unknown): ExternalRoomStaffStored {
  if (value == null || typeof value !== "object") {
    return { ...EMPTY_EXTERNAL_ROOM_STAFF, external_invigilators: [] };
  }
  const j = value as JsonStored;
  const raw = Array.isArray(j.external_invigilators) ? j.external_invigilators : [];
  const external_invigilators = raw.map((x) => ({
    name: String(x?.name ?? "").trim(),
    formation_name: String(x?.formation_name ?? "").trim(),
  }));
  return {
    supervisor_is_external: Boolean(j.supervisor_is_external),
    supervisor_formation_name: String(j.supervisor_formation_name ?? "").trim(),
    external_invigilators,
  };
}

export function parseExternalRoomStaffFromFormJson(jsonStr: string): ExternalRoomStaffStored {
  const s = String(jsonStr ?? "").trim();
  if (!s) return { ...EMPTY_EXTERNAL_ROOM_STAFF, external_invigilators: [] };
  try {
    const parsed = JSON.parse(s) as unknown;
    return parseExternalRoomStaffFromDb(parsed);
  } catch {
    return { ...EMPTY_EXTERNAL_ROOM_STAFF, external_invigilators: [] };
  }
}

export function validateExternalRoomStaffForSave(
  s: ExternalRoomStaffStored
): { ok: true; normalized: ExternalRoomStaffStored } | { ok: false; message: string } {
  const supervisor_is_external = Boolean(s.supervisor_is_external);
  const supervisor_formation_name = String(s.supervisor_formation_name ?? "").trim();
  if (supervisor_is_external && supervisor_formation_name.length < 2) {
    return {
      ok: false,
      message: "عند اختيار «مشرف خارج التشكيل» يجب إدخال اسم التشكيل/الكلية التابع لها المشرف (حرفان على الأقل).",
    };
  }
  const rows = (s.external_invigilators ?? []).map((x) => ({
    name: String(x?.name ?? "").trim(),
    formation_name: String(x?.formation_name ?? "").trim(),
  }));
  const nonEmpty = rows.filter((r) => r.name.length > 0 || r.formation_name.length > 0);
  for (const r of nonEmpty) {
    if (r.name.length < 2 || r.formation_name.length < 2) {
      return {
        ok: false,
        message:
          "مراقب خارج التشكيل: أكمل اسم المراقب واسم التشكيل التابع له (حرفان لكل منهما على الأقل)، أو أزل الصف الفارغ.",
      };
    }
  }
  const external_invigilators = rows.filter((r) => r.name.length >= 2 && r.formation_name.length >= 2);
  if (external_invigilators.length > MAX_EXTERNAL_INVIGILATORS) {
    return {
      ok: false,
      message: `لا يمكن إضافة أكثر من ${MAX_EXTERNAL_INVIGILATORS} مراقبين من خارج التشكيل.`,
    };
  }
  return {
    ok: true,
    normalized: {
      supervisor_is_external,
      supervisor_formation_name: supervisor_is_external ? supervisor_formation_name : "",
      external_invigilators,
    },
  };
}

/** يُعاد `null` لمسح العمود عند عدم وجود مشرف خارجي ولا مراقبين خارجيين. */
export function serializeExternalRoomStaffForDb(
  s: ExternalRoomStaffStored
): Record<string, unknown> | null {
  if (!s.supervisor_is_external && s.external_invigilators.length === 0) return null;
  return {
    supervisor_is_external: Boolean(s.supervisor_is_external),
    supervisor_formation_name: s.supervisor_is_external ? s.supervisor_formation_name.trim() : "",
    external_invigilators: s.external_invigilators.map((x) => ({
      name: x.name.trim(),
      formation_name: x.formation_name.trim(),
    })),
  };
}

/** أسماء المراقبين المسموح تسجيل غيابهم (داخل التشكيل + خارجيين). */
export function allInvigilatorNamesForAbsenceCheck(
  internalInvigilatorsRaw: string,
  ext: ExternalRoomStaffStored
): string[] {
  const base = internalInvigilatorsRaw
    .split(/[,،;|\n\r]+/u)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  const extra = ext.external_invigilators.map((x) => x.name.trim()).filter((n) => n.length >= 2);
  return [...base, ...extra];
}

export function formatSupervisorForSituationReport(
  supervisorName: string,
  ext: ExternalRoomStaffStored,
  e: (s: string) => string
): string {
  const name = (supervisorName ?? "").trim() || "—";
  if (!ext.supervisor_is_external || !ext.supervisor_formation_name.trim()) {
    return e(name);
  }
  return `${e(name)}<div class="muted" style="font-size:11px;margin-top:4px;line-height:1.4"><strong>مشرف خارج التشكيل</strong> — التشكيل: ${e(
    ext.supervisor_formation_name.trim()
  )}</div>`;
}

export function formatInvigilatorsForSituationReport(
  internalInvigilatorsText: string,
  ext: ExternalRoomStaffStored,
  e: (s: string) => string,
  splitLines: (s: string) => string[]
): string {
  const internalItems = splitLines(internalInvigilatorsText ?? "")
    .map((n) => `<li>${e(n)}</li>`)
    .join("");
  const internalBlock = internalItems ? `<ul class="list-dot">${internalItems}</ul>` : "";
  const extList = ext.external_invigilators
    .filter((x) => x.name.trim().length >= 2)
    .map(
      (x) =>
        `<li>${e(x.name.trim())}<span class="muted" style="font-size:11px"> — التشكيل: ${e(
          x.formation_name.trim() || "—"
        )}</span></li>`
    )
    .join("");
  const extBlock = extList
    ? `<div style="margin-top:6px;font-size:12px;line-height:1.45"><strong>مراقبون من خارج التشكيل</strong><ul class="list-dot" style="margin-top:4px">${extList}</ul></div>`
    : "";
  if (!internalBlock && !extBlock) return "—";
  return `${internalBlock || ""}${extBlock}`;
}

export function formatExternalStaffPlainTextForExport(
  supervisorName: string,
  internalInvigilators: string,
  ext: ExternalRoomStaffStored
): { supervisorLine: string; invigilatorsLine: string } {
  let supervisorLine = (supervisorName ?? "").trim() || "—";
  if (ext.supervisor_is_external && ext.supervisor_formation_name.trim()) {
    supervisorLine += ` (خارج التشكيل — التشكيل: ${ext.supervisor_formation_name.trim()})`;
  }
  const internal = (internalInvigilators ?? "").trim();
  const extParts = ext.external_invigilators
    .filter((x) => x.name.trim())
    .map((x) => `${x.name.trim()} (تشكيل: ${x.formation_name.trim() || "—"})`);
  let invigilatorsLine = internal || "—";
  if (extParts.length > 0) {
    invigilatorsLine =
      (internal ? `${internal}؛ ` : "") + `خارج التشكيل: ${extParts.join("؛ ")}`;
  }
  return { supervisorLine, invigilatorsLine };
}
