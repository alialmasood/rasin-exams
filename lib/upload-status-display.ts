import { examScheduleLogicalGroupKeyFromRow } from "@/lib/exam-schedule-logical-group";

export type DeanSituationStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export type UploadStatusWorkflow = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type UploadStatusTableRow = {
  schedule_id: string;
  college_subject_id: string;
  study_subject_id: string;
  exam_date: string;
  /** 1 = الوجبة الأولى، 2 = الوجبة الثانية */
  meal_slot: 1 | 2;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  schedule_type: "FINAL" | "SEMESTER";
  workflow_status: UploadStatusWorkflow;
  room_id: string;
  room_name: string;
  capacity_total: number;
  attendance_count: number;
  absence_count: number;
  subject_name: string;
  study_type: "ANNUAL" | "SEMESTER" | "COURSES" | "BOLOGNA";
  branch_name: string;
  academic_year: string | null;
  stage_level: number;
  head_submitted_at: Date | null;
  dean_status: DeanSituationStatus;
  dean_reviewed_at: Date | null;
  is_uploaded: boolean;
  is_complete: boolean;
};

export type UploadStatusListItem =
  | { kind: "single"; row: UploadStatusTableRow }
  | {
      kind: "group";
      primary_schedule_id: string;
      schedule_ids: string[];
      exam_date: string;
      start_time: string;
      end_time: string;
      duration_minutes: number;
      schedule_type: "FINAL" | "SEMESTER";
      meal_slot: 1 | 2;
      room_names_label: string;
      capacity_total_sum: number;
      attendance_sum: number;
      absence_sum: number;
      subject_name: string;
      stage_level: number;
      branch_name: string;
      academic_year: string | null;
      workflow_status: UploadStatusWorkflow;
      uploaded_count: number;
      complete_count: number;
      room_count: number;
      dean_status: DeanSituationStatus;
    };

export function buildUploadStatusListItems(rows: UploadStatusTableRow[]): UploadStatusListItem[] {
  const groups = new Map<string, UploadStatusTableRow[]>();
  for (const r of rows) {
    const k = examScheduleLogicalGroupKeyFromRow({
      college_subject_id: r.college_subject_id,
      study_subject_id: r.study_subject_id,
      stage_level: r.stage_level,
      exam_date: r.exam_date,
      start_time: r.start_time,
      end_time: r.end_time,
      schedule_type: r.schedule_type,
      meal_slot: r.meal_slot,
      academic_year: r.academic_year,
      term_label: null,
    });
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: UploadStatusListItem[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.room_name.localeCompare(b.room_name, "ar"));
    if (g.length === 1) {
      out.push({ kind: "single", row: g[0]! });
      continue;
    }
    const head = g[0]!;
    const wfPriority: Record<UploadStatusWorkflow, number> = {
      REJECTED: 0,
      DRAFT: 1,
      SUBMITTED: 2,
      APPROVED: 3,
    };
    const workflow_status = g.reduce(
      (worst, x) => (wfPriority[x.workflow_status] < wfPriority[worst.workflow_status] ? x : worst),
      head
    ).workflow_status;
    const deanPriority: Record<DeanSituationStatus, number> = { REJECTED: 0, NONE: 1, PENDING: 2, APPROVED: 3 };
    const dean_status = g.reduce(
      (worst, x) => (deanPriority[x.dean_status] < deanPriority[worst.dean_status] ? x : worst),
      head
    ).dean_status;
    const ids = [...g].sort((a, b) => Number(a.schedule_id) - Number(b.schedule_id)).map((x) => x.schedule_id);
    out.push({
      kind: "group",
      primary_schedule_id: ids[0]!,
      schedule_ids: ids,
      exam_date: head.exam_date,
      start_time: head.start_time,
      end_time: head.end_time,
      duration_minutes: head.duration_minutes,
      schedule_type: head.schedule_type,
      meal_slot: head.meal_slot,
      room_names_label: g.map((x) => x.room_name.trim()).filter(Boolean).join("، "),
      capacity_total_sum: g.reduce((a, x) => a + x.capacity_total, 0),
      attendance_sum: g.reduce((a, x) => a + x.attendance_count, 0),
      absence_sum: g.reduce((a, x) => a + x.absence_count, 0),
      subject_name: head.subject_name,
      stage_level: head.stage_level,
      branch_name: head.branch_name,
      academic_year: head.academic_year,
      workflow_status,
      uploaded_count: g.filter((x) => x.is_uploaded).length,
      complete_count: g.filter((x) => x.is_complete).length,
      room_count: g.length,
      dean_status,
    });
  }
  out.sort((a, b) => {
    const da = a.kind === "single" ? a.row.exam_date : a.exam_date;
    const db = b.kind === "single" ? b.row.exam_date : b.exam_date;
    const ta = a.kind === "single" ? a.row.start_time : a.start_time;
    const tb = b.kind === "single" ? b.row.start_time : b.start_time;
    const ma = a.kind === "single" ? a.row.meal_slot : a.meal_slot;
    const mb = b.kind === "single" ? b.row.meal_slot : b.meal_slot;
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    const cm = ma - mb;
    if (cm !== 0) return cm;
    return ta.localeCompare(tb);
  });
  return out;
}
