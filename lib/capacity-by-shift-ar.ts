/**
 * وصف عربي لتوزيع سعة القاعة (صباحي / مسائي) كما في «إدارة القاعات».
 * ملف منفصل بدون اعتماد على قاعدة البيانات — لاستخدامه من مكوّنات العميل.
 */
export function describeCapacityByShiftAr(
  capacityMorning: number,
  capacityEvening: number,
  capacityTotal: number
): {
  modeLabelAr: string;
  detailRows: { labelAr: string; value: number }[];
} {
  const m = Math.max(0, Math.floor(Number(capacityMorning) || 0));
  const ev = Math.max(0, Math.floor(Number(capacityEvening) || 0));
  const t = Math.max(0, Math.floor(Number(capacityTotal) || 0));

  if (m > 0 && ev > 0) {
    return {
      modeLabelAr: "صباحي ومسائي",
      detailRows: [
        { labelAr: "مقاعد الدوام الصباحي", value: m },
        { labelAr: "مقاعد الدوام المسائي", value: ev },
        { labelAr: "الإجمالي (معتمد في القاعة)", value: t },
      ],
    };
  }
  if (m > 0 && ev === 0) {
    const rows: { labelAr: string; value: number }[] = [{ labelAr: "مقاعد الدوام الصباحي", value: m }];
    if (t > 0 && t !== m) rows.push({ labelAr: "الإجمالي المعتمد للمادة", value: t });
    return { modeLabelAr: "صباحي فقط", detailRows: rows };
  }
  if (ev > 0 && m === 0) {
    const rows: { labelAr: string; value: number }[] = [{ labelAr: "مقاعد الدوام المسائي", value: ev }];
    if (t > 0 && t !== ev) rows.push({ labelAr: "الإجمالي المعتمد للمادة", value: t });
    return { modeLabelAr: "مسائي فقط", detailRows: rows };
  }
  return {
    modeLabelAr: t > 0 ? "إجمالي السعة (لم يُفصّل الدوام في السجل)" : "—",
    detailRows: t > 0 ? [{ labelAr: "عدد المقاعد الكلي", value: t }] : [],
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
