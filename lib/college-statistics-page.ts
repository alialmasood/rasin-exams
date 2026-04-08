import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import { listCollegeExamRoomsByOwner } from "@/lib/college-rooms";
import type { CollegeDashboardSnapshot } from "@/lib/college-dashboard-stats";
import { getCollegeDashboardSnapshot, STUDY_TYPE_LABEL_AR } from "@/lib/college-dashboard-stats";
import {
  listExamDayUploadSummariesForOwner,
  type ExamDayUploadSummary,
} from "@/lib/college-exam-situations";
import { listCollegeSubjectUsageByOwner, listCollegeSubjectsByOwner } from "@/lib/college-subjects";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";
import { normalizeStudyType, type StudyType } from "@/lib/college-study-subjects";

export type DeanReviewBreakdown = {
  totalReports: number;
  approved: number;
  rejected: number;
  pending: number;
  none: number;
};

export type ScheduleCountByStudyType = {
  studyType: StudyType;
  label: string;
  count: number;
};

export type RoomCapacitySummary = {
  totalRooms: number;
  sumCapacityTotal: number;
  roomsWithDualExam: number;
};

export type BranchStatisticsRow = {
  branchName: string;
  branchTypeLabel: string;
  branchHeadName: string;
  studySubjectsCount: number;
  examSchedulesCount: number;
};

export type CollegeExamRoomSerialized = Omit<CollegeExamRoomRow, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
};

export type CollegeStatisticsPageData = {
  snapshot: CollegeDashboardSnapshot;
  dayUploads: ExamDayUploadSummary[];
  branchRows: BranchStatisticsRow[];
  rooms: CollegeExamRoomSerialized[];
  deanBreakdown: DeanReviewBreakdown;
  schedulesByStudyType: ScheduleCountByStudyType[];
  roomCapacitySummary: RoomCapacitySummary;
  generatedAtIso: string;
};

function normalizeStudyTypeDb(v: string): StudyType {
  return normalizeStudyType(v ?? "");
}

function serializeRoom(row: CollegeExamRoomRow): CollegeExamRoomSerialized {
  const { created_at, updated_at, ...rest } = row;
  return {
    ...rest,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  };
}

function emptyDeanBreakdown(): DeanReviewBreakdown {
  return { totalReports: 0, approved: 0, rejected: 0, pending: 0, none: 0 };
}

function emptyRoomCapacity(): RoomCapacitySummary {
  return { totalRooms: 0, sumCapacityTotal: 0, roomsWithDualExam: 0 };
}

function roomCapacitySummaryFromRooms(rooms: CollegeExamRoomRow[]): RoomCapacitySummary {
  return {
    totalRooms: rooms.length,
    sumCapacityTotal: rooms.reduce((s, r) => s + (Number(r.capacity_total) || 0), 0),
    roomsWithDualExam: rooms.filter((r) => r.study_subject_id_2 && String(r.study_subject_id_2).trim()).length,
  };
}

export async function getCollegeStatisticsPageData(
  ownerUserId: string,
  restrictCollegeSubjectId?: string | null
): Promise<CollegeStatisticsPageData> {
  const rid = restrictCollegeSubjectId?.trim() ?? null;
  const generatedAtIso = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    const snapshot = await getCollegeDashboardSnapshot(ownerUserId, rid);
    return {
      snapshot,
      dayUploads: [],
      branchRows: [],
      rooms: [],
      deanBreakdown: emptyDeanBreakdown(),
      schedulesByStudyType: [],
      roomCapacitySummary: emptyRoomCapacity(),
      generatedAtIso,
    };
  }

  await ensureCoreSchema();

  const [snapshot, dayUploads, subjects, usageRows, rooms, deanRow, schedByTypeRows] = await Promise.all([
    getCollegeDashboardSnapshot(ownerUserId, rid),
    listExamDayUploadSummariesForOwner(ownerUserId, rid),
    listCollegeSubjectsByOwner(ownerUserId, rid),
    listCollegeSubjectUsageByOwner(ownerUserId, rid),
    listCollegeExamRoomsByOwner(ownerUserId, rid),
    (async () => {
      const pool = getDbPool();
      const r = rid
        ? await pool.query<{
            total: number;
            approved: number;
            rejected: number;
            pending: number;
            none: number;
          }>(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(rep.dean_status::text, ''))) = 'APPROVED')::int AS approved,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(rep.dean_status::text, ''))) = 'REJECTED')::int AS rejected,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(rep.dean_status::text, ''))) = 'PENDING')::int AS pending,
                    COUNT(*) FILTER (WHERE rep.dean_status IS NULL OR UPPER(TRIM(COALESCE(rep.dean_status::text, ''))) IN ('', 'NONE'))::int AS none
             FROM college_exam_situation_reports rep
             INNER JOIN college_exam_schedules e ON e.id = rep.exam_schedule_id AND e.owner_user_id = rep.owner_user_id
             WHERE rep.owner_user_id = $1 AND e.college_subject_id = $2::bigint`,
            [ownerUserId, rid]
          )
        : await pool.query<{
            total: number;
            approved: number;
            rejected: number;
            pending: number;
            none: number;
          }>(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(dean_status::text, ''))) = 'APPROVED')::int AS approved,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(dean_status::text, ''))) = 'REJECTED')::int AS rejected,
                    COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(dean_status::text, ''))) = 'PENDING')::int AS pending,
                    COUNT(*) FILTER (WHERE dean_status IS NULL OR UPPER(TRIM(COALESCE(dean_status::text, ''))) IN ('', 'NONE'))::int AS none
             FROM college_exam_situation_reports
             WHERE owner_user_id = $1`,
            [ownerUserId]
          );
      return r.rows[0];
    })(),
    (async () => {
      const pool = getDbPool();
      const r = rid
        ? await pool.query<{ study_type: string; c: number }>(
            `SELECT COALESCE(s.study_type, 'ANNUAL') AS study_type, COUNT(e.id)::int AS c
             FROM college_exam_schedules e
             INNER JOIN college_study_subjects s ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
             WHERE e.owner_user_id = $1 AND e.college_subject_id = $2::bigint
             GROUP BY COALESCE(s.study_type, 'ANNUAL')`,
            [ownerUserId, rid]
          )
        : await pool.query<{ study_type: string; c: number }>(
            `SELECT COALESCE(s.study_type, 'ANNUAL') AS study_type, COUNT(e.id)::int AS c
             FROM college_exam_schedules e
             INNER JOIN college_study_subjects s ON s.id = e.study_subject_id AND s.owner_user_id = e.owner_user_id
             WHERE e.owner_user_id = $1
             GROUP BY COALESCE(s.study_type, 'ANNUAL')`,
            [ownerUserId]
          );
      return r.rows;
    })(),
  ]);

  const usageMap = new Map(usageRows.map((u) => [u.college_subject_id, u]));
  const branchRows: BranchStatisticsRow[] = subjects.map((s) => {
    const u = usageMap.get(s.id);
    return {
      branchName: s.branch_name,
      branchTypeLabel: s.branch_type === "BRANCH" ? "فرع" : "قسم",
      branchHeadName: s.branch_head_name,
      studySubjectsCount: u?.study_subjects_count ?? 0,
      examSchedulesCount: u?.exam_schedules_count ?? 0,
    };
  });

  const countMap = new Map<StudyType, number>();
  for (const row of schedByTypeRows) {
    const t = normalizeStudyTypeDb(row.study_type);
    countMap.set(t, (countMap.get(t) ?? 0) + Number(row.c ?? 0));
  }
  const allTypes: StudyType[] = ["ANNUAL", "SEMESTER", "COURSES", "BOLOGNA", "INTEGRATIVE"];
  const schedulesByStudyType: ScheduleCountByStudyType[] = allTypes.map((studyType) => ({
    studyType,
    label: STUDY_TYPE_LABEL_AR[studyType],
    count: countMap.get(studyType) ?? 0,
  }));

  const d0 = deanRow;
  const deanBreakdown: DeanReviewBreakdown = {
    totalReports: Number(d0?.total ?? 0),
    approved: Number(d0?.approved ?? 0),
    rejected: Number(d0?.rejected ?? 0),
    pending: Number(d0?.pending ?? 0),
    none: Number(d0?.none ?? 0),
  };

  const roomCapacitySummary = roomCapacitySummaryFromRooms(rooms);

  return {
    snapshot,
    dayUploads,
    branchRows,
    rooms: rooms.map(serializeRoom),
    deanBreakdown,
    schedulesByStudyType,
    roomCapacitySummary,
    generatedAtIso,
  };
}
