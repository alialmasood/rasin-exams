import type { AdminCollegeExamScheduleRow } from "@/lib/college-exam-schedules";
import type { ExamMealSlot } from "@/lib/exam-meal-slot";
import type { StudyType } from "@/lib/college-study-subjects";

export type AggregatedTodayExamRow = {
  formation_label: string;
  college_subject_name: string;
  study_subject_name: string;
  study_type: StudyType;
  stage_level: number;
  meal_slot: ExamMealSlot;
  total_students_in_rooms: number;
  room_sessions: number;
};

export function baghdadIsoDateToday(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const iso = `${y}-${m}-${d}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function aggregateSchedulesForTodayExams(rows: AdminCollegeExamScheduleRow[]): AggregatedTodayExamRow[] {
  const map = new Map<
    string,
    {
      formation_label: string;
      college_subject_name: string;
      study_subject_name: string;
      study_type: StudyType;
      stage_level: number;
      meal_slot: ExamMealSlot;
      total_students_in_rooms: number;
      room_sessions: number;
    }
  >();
  for (const r of rows) {
    const key = `${r.owner_user_id}|${r.college_subject_id}|${r.study_subject_id}|${r.meal_slot}|${r.stage_level}`;
    const cur = map.get(key);
    if (cur) {
      cur.total_students_in_rooms += r.student_count;
      cur.room_sessions += 1;
    } else {
      map.set(key, {
        formation_label: r.formation_label,
        college_subject_name: r.college_subject_name,
        study_subject_name: r.study_subject_name,
        study_type: r.study_type,
        stage_level: r.stage_level,
        meal_slot: r.meal_slot,
        total_students_in_rooms: r.student_count,
        room_sessions: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    const f = a.formation_label.localeCompare(b.formation_label, "ar");
    if (f !== 0) return f;
    const br = a.college_subject_name.localeCompare(b.college_subject_name, "ar");
    if (br !== 0) return br;
    const su = a.study_subject_name.localeCompare(b.study_subject_name, "ar");
    if (su !== 0) return su;
    if (a.meal_slot !== b.meal_slot) return a.meal_slot - b.meal_slot;
    return a.stage_level - b.stage_level;
  });
}
