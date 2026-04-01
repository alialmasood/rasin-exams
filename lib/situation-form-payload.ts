export const SITUATION_FORM_PAYLOAD_VERSION = 1 as const;

export type SituationFormPayloadV1 = {
  version: typeof SITUATION_FORM_PAYLOAD_VERSION;
  collegeLabel: string;
  department: string;
  weekday: string;
  examDate: string;
  term: string;
  examType: string;
  studyCategory: "UNDERGRAD" | "POSTGRAD";
  stage: string;
  subject: string;
  teacherName: string;
  studySystem: string;
  studyShift: string;
  roomCount: string;
  studentCount: string;
  absentCount: string;
  absents: { name: string; reason: string }[];
  invigilatorCount: string;
  invigilators: string[];
  invigilatorNote: string;
};

function todayIsoBaghdad(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

function isNonEmpty(s: string): boolean {
  return s.trim().length > 0;
}

export function validateSituationFormPayload(
  input: unknown,
  options?: { forSubmit?: boolean }
): { ok: true; data: SituationFormPayloadV1 } | { ok: false; message: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "بيانات النموذج غير صالحة." };
  }
  const o = input as Record<string, unknown>;
  if (o.version !== SITUATION_FORM_PAYLOAD_VERSION) {
    return { ok: false, message: "إصدار النموذج غير مدعوم." };
  }
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  const examDate = str("examDate").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return { ok: false, message: "صيغة التاريخ غير صالحة." };
  }
  if (options?.forSubmit && examDate < todayIsoBaghdad()) {
    return { ok: false, message: "التاريخ لا يقبل يومًا قبل اليوم الحالي (بتوقيت بغداد)." };
  }
  const required: [string, string][] = [
    ["department", "القسم"],
    ["subject", "المادة الدراسية"],
    ["stage", "المرحلة الدراسية"],
    ["term", "الفصل أو الدور"],
    ["examType", "نوع الامتحان"],
    ["studySystem", "نظام الدراسة"],
    ["studyShift", "نوع الدراسة"],
  ];
  for (const [key, label] of required) {
    if (!isNonEmpty(str(key))) {
      return { ok: false, message: `يرجى تعبئة حقل: ${label}.` };
    }
  }
  if (options?.forSubmit && !isNonEmpty(str("teacherName"))) {
    return { ok: false, message: "يرجى تعبئة حقل: اسم التدريسي." };
  }
  if (options?.forSubmit) {
    const numericLabels: [string, string][] = [
      ["roomCount", "عدد القاعات الامتحانية"],
      ["studentCount", "عدد الطلبة"],
      ["absentCount", "عدد الغياب"],
      ["invigilatorCount", "عدد المراقبين"],
    ];
    for (const [key, label] of numericLabels) {
      const v = str(key).trim();
      if (!/^\d+$/.test(v)) {
        return { ok: false, message: `يرجى إدخال رقم صحيح (٠ أو أكثر) لحقل: ${label}.` };
      }
    }
  }
  const sc = str("studyCategory").trim().toUpperCase();
  if (sc !== "UNDERGRAD" && sc !== "POSTGRAD") {
    return { ok: false, message: "يرجى اختيار الدراسة (أولية / عليا)." };
  }
  let absents: { name: string; reason: string }[] = [];
  if (Array.isArray(o.absents)) {
    absents = o.absents
      .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
      .map((x) => ({
        name: typeof x.name === "string" ? x.name : "",
        reason: typeof x.reason === "string" ? x.reason : "",
      }))
      .filter((x) => x.name.trim().length > 0);
  }
  if (options?.forSubmit) {
    for (const a of absents) {
      if (!isNonEmpty(a.reason)) {
        return { ok: false, message: "أدخل سبب الغياب لكل طالب غائب." };
      }
    }
  }
  let invigilators: string[] = [];
  if (Array.isArray(o.invigilators)) {
    invigilators = o.invigilators
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const data: SituationFormPayloadV1 = {
    version: SITUATION_FORM_PAYLOAD_VERSION,
    collegeLabel: str("collegeLabel").trim() || "—",
    department: str("department").trim(),
    weekday: str("weekday").trim(),
    examDate,
    term: str("term").trim(),
    examType: str("examType").trim(),
    studyCategory: sc === "POSTGRAD" ? "POSTGRAD" : "UNDERGRAD",
    stage: str("stage").trim(),
    subject: str("subject").trim(),
    teacherName: str("teacherName").trim(),
    studySystem: str("studySystem").trim(),
    studyShift: str("studyShift").trim(),
    roomCount: str("roomCount").trim(),
    studentCount: str("studentCount").trim(),
    absentCount: str("absentCount").trim(),
    absents,
    invigilatorCount: str("invigilatorCount").trim(),
    invigilators,
    invigilatorNote: str("invigilatorNote").trim(),
  };

  return { ok: true, data };
}
