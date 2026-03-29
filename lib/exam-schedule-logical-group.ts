/** حقول تحدد «جلسة» امتحانية منطقية واحدة (قد تُقسّم على عدة قاعات في الجدول). بدون اعتماد على قاعدة البيانات — آمن للاستيراد من مكوّنات العميل. */
export type ExamScheduleLogicalGroupFields = {
  college_subject_id: string;
  study_subject_id: string;
  stage_level: number;
  exam_date: string;
  start_time: string;
  end_time: string;
  schedule_type: string;
  /** يمنع دمج جلسات متطابقة زمنياً عبر أعوام أو فصول مختلفة */
  academic_year?: string | null;
  term_label?: string | null;
};

export function examScheduleLogicalGroupKeyFromRow(row: ExamScheduleLogicalGroupFields): string {
  return [
    row.college_subject_id,
    row.study_subject_id,
    String(row.stage_level),
    row.exam_date,
    row.start_time.slice(0, 5),
    row.end_time.slice(0, 5),
    row.schedule_type,
    (row.academic_year ?? "").trim(),
    (row.term_label ?? "").trim(),
  ].join("|");
}

/** صف يكفي لاستخراج مفتاح الجلسة وتجميع القاعات (لا يستورد أنواع الجداول من طبقة DB). */
export type ExamScheduleSessionRowLike = ExamScheduleLogicalGroupFields & {
  id: string;
  room_name: string;
  study_subject_name: string;
};

/**
 * تجميع صفوف الجدول الامتحاني إلى جلسات منطقية (مادة + مرحلة + تاريخ + وقت + نوع + سياق)،
 * مع ترتيب القاعات داخل كل جلسة.
 */
export function groupExamScheduleRowsIntoSessions<T extends ExamScheduleSessionRowLike>(rows: T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = examScheduleLogicalGroupKeyFromRow({
      college_subject_id: r.college_subject_id,
      study_subject_id: r.study_subject_id,
      stage_level: r.stage_level,
      exam_date: r.exam_date,
      start_time: r.start_time,
      end_time: r.end_time,
      schedule_type: r.schedule_type,
      academic_year: r.academic_year,
      term_label: r.term_label,
    });
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const groups = [...map.values()].map((g) =>
    [...g].sort((a, b) => a.room_name.localeCompare(b.room_name, "ar") || String(a.id).localeCompare(String(b.id)))
  );
  groups.sort((a, b) => {
    const ra = a[0]!;
    const rb = b[0]!;
    const c = `${ra.exam_date} ${ra.start_time}`.localeCompare(`${rb.exam_date} ${rb.start_time}`);
    if (c !== 0) return c;
    return ra.study_subject_name.localeCompare(rb.study_subject_name, "ar");
  });
  return groups;
}
