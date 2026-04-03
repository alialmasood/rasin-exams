export type CapacityShiftDetailRow = {
  labelAr: string;
  value: number;
  /** حضور الطلبة المرتبط بهذا السطر (عند تمرير shiftAttendance) */
  attendance?: number;
};

export type ShiftAttendanceBreakdown = {
  morning: number;
  evening: number;
  total: number;
};

function attachAttendance(
  row: { labelAr: string; value: number },
  attendance: number | undefined
): CapacityShiftDetailRow {
  if (attendance === undefined) return row;
  return { ...row, attendance: Math.max(0, Math.floor(Number(attendance) || 0)) };
}

/**
 * وصف عربي لتوزيع سعة القاعة (صباحي / مسائي) كما في «إدارة القاعات».
 * ملف منفصل بدون اعتماد على قاعدة البيانات — لاستخدامه من مكوّنات العميل.
 *
 * عند تمرير `shiftAttendance` يُضاف رقم الحضور بجانب سطر المقاعد المناظر (للمتابعة المركزية وغيرها).
 */
export function describeCapacityByShiftAr(
  capacityMorning: number,
  capacityEvening: number,
  capacityTotal: number,
  shiftAttendance?: ShiftAttendanceBreakdown
): {
  modeLabelAr: string;
  detailRows: CapacityShiftDetailRow[];
} {
  const m = Math.max(0, Math.floor(Number(capacityMorning) || 0));
  const ev = Math.max(0, Math.floor(Number(capacityEvening) || 0));
  const t = Math.max(0, Math.floor(Number(capacityTotal) || 0));
  const a = shiftAttendance;

  if (m > 0 && ev > 0) {
    return {
      modeLabelAr: "صباحي ومسائي",
      detailRows: [
        attachAttendance({ labelAr: "مقاعد الدوام الصباحي", value: m }, a?.morning),
        attachAttendance({ labelAr: "مقاعد الدوام المسائي", value: ev }, a?.evening),
        attachAttendance({ labelAr: "الإجمالي (معتمد في القاعة)", value: t }, a?.total),
      ],
    };
  }
  if (m > 0 && ev === 0) {
    const rows: CapacityShiftDetailRow[] = [
      attachAttendance({ labelAr: "مقاعد الدوام الصباحي", value: m }, a?.morning),
    ];
    if (t > 0 && t !== m) {
      rows.push(attachAttendance({ labelAr: "الإجمالي المعتمد للمادة", value: t }, a?.total));
    }
    return { modeLabelAr: "صباحي فقط", detailRows: rows };
  }
  if (ev > 0 && m === 0) {
    const rows: CapacityShiftDetailRow[] = [
      attachAttendance({ labelAr: "مقاعد الدوام المسائي", value: ev }, a?.evening),
    ];
    if (t > 0 && t !== ev) {
      rows.push(attachAttendance({ labelAr: "الإجمالي المعتمد للمادة", value: t }, a?.total));
    }
    return { modeLabelAr: "مسائي فقط", detailRows: rows };
  }
  return {
    modeLabelAr: t > 0 ? "إجمالي السعة (لم يُفصّل الدوام في السجل)" : "—",
    detailRows:
      t > 0 ? [attachAttendance({ labelAr: "عدد المقاعد الكلي", value: t }, a?.total)] : [],
  };
}

/** دمج أسماء غياب الصباحي والمسائي لعرض موحّد (نفس فاصل إدارة القاعات). */
export function mergeAbsenceNamesByShift(morning: string, evening: string): string {
  const m = morning.trim();
  const e = evening.trim();
  if (!e) return m;
  if (!m) return e;
  return `${m}\n--- دوام مسائي ---\n${e}`;
}
