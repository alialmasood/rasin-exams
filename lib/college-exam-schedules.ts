import { assertExamDateNotInPast } from "@/lib/exam-schedule-date";
import { getDbPool, isDatabaseConfigured } from "@/lib/db";
import { ensureCoreSchema } from "@/lib/schema";

export type ScheduleType = "FINAL" | "SEMESTER";

export type CollegeExamScheduleRow = {
  id: string;
  owner_user_id: string;
  college_subject_id: string;
  college_subject_name: string;
  study_subject_id: string;
  study_subject_name: string;
  room_id: string;
  room_name: string;
  stage_level: number;
  schedule_type: ScheduleType;
  workflow_status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  term_label: string | null;
  academic_year: string | null;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  notes: string | null;
  created_at: Date;
};

function toMinutes(time: string) {
  const [h, m] = time.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function asNumericUserId(value: string) {
  const v = value.trim();
  return /^[0-9]+$/.test(v) ? v : null;
}

/** التحقق من وجود القاعة وملكيتها للمستخدم. أي مادة امتحانية مسموح اختيارها مع أي قاعة مملوكة. */
export async function assertExamRoomAllowsStudySubject(
  pool: ReturnType<typeof getDbPool>,
  ownerUserId: string,
  roomId: string,
  _studySubjectId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await pool.query(
    `SELECT 1 FROM college_exam_rooms WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [roomId.trim(), ownerUserId]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "القاعة المختارة غير موجودة." };
  return { ok: true };
}

export type CollegeRoomScheduleHint = {
  exam_date: string;
  start_time: string;
  end_time: string;
  study_subject_name: string;
};

/** تلميحات جداول لكل قاعة (للعرض في إدارة القاعات). */
export async function listCollegeExamScheduleHintsByRoom(
  ownerUserId: string
): Promise<Record<string, CollegeRoomScheduleHint[]>> {
  if (!isDatabaseConfigured()) return {};
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    room_id: string | number;
    exam_date: string;
    start_time: string;
    end_time: string;
    study_subject_name: string;
  }>(
    `SELECT e.room_id, e.exam_date::text, e.start_time::text, e.end_time::text, s.subject_name AS study_subject_name
     FROM college_exam_schedules e
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     WHERE e.owner_user_id = $1
     ORDER BY e.exam_date ASC, e.start_time ASC, e.id ASC`,
    [ownerUserId]
  );
  const out: Record<string, CollegeRoomScheduleHint[]> = {};
  for (const row of r.rows) {
    const id = String(row.room_id);
    if (!out[id]) out[id] = [];
    out[id].push({
      exam_date: row.exam_date,
      start_time: String(row.start_time).slice(0, 5),
      end_time: String(row.end_time).slice(0, 5),
      study_subject_name: row.study_subject_name,
    });
  }
  return out;
}

async function writeScheduleAudit(
  ownerUserId: string,
  action: string,
  targetScheduleId: string | null,
  metadata: Record<string, unknown>
) {
  const pool = getDbPool();
  const actor = asNumericUserId(ownerUserId);
  const target = targetScheduleId && /^[0-9]+$/.test(targetScheduleId) ? targetScheduleId : null;
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_user_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [actor, action, target, JSON.stringify(metadata)]
    );
  } catch {
    // لا نكسر العملية الأساسية إذا فشل سجل التدقيق.
  }
}

export async function listCollegeExamSchedulesByOwner(ownerUserId: string): Promise<CollegeExamScheduleRow[]> {
  if (!isDatabaseConfigured()) return [];
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query<{
    id: string | number;
    owner_user_id: string | number;
    college_subject_id: string | number;
    college_subject_name: string;
    study_subject_id: string | number;
    study_subject_name: string;
    room_id: string | number;
    room_name: string;
    stage_level: number;
    schedule_type: string;
    workflow_status: string;
    term_label: string | null;
    academic_year: string | null;
    exam_date: string;
    start_time: string;
    end_time: string;
    duration_minutes: number;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT e.id, e.owner_user_id, e.college_subject_id, c.branch_name AS college_subject_name,
            e.study_subject_id, s.subject_name AS study_subject_name,
            e.room_id, r.room_name, e.stage_level,
            e.schedule_type, COALESCE(e.workflow_status, 'DRAFT') AS workflow_status,
            e.term_label, e.academic_year, e.exam_date::text, e.start_time::text, e.end_time::text,
            e.duration_minutes, e.notes, e.created_at
     FROM college_exam_schedules e
     INNER JOIN college_subjects c ON c.id = e.college_subject_id
     INNER JOIN college_study_subjects s ON s.id = e.study_subject_id
     INNER JOIN college_exam_rooms r ON r.id = e.room_id
     WHERE e.owner_user_id = $1
     ORDER BY e.exam_date ASC, e.start_time ASC, e.created_at ASC`,
    [ownerUserId]
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    owner_user_id: String(x.owner_user_id),
    college_subject_id: String(x.college_subject_id),
    college_subject_name: x.college_subject_name,
    study_subject_id: String(x.study_subject_id),
    study_subject_name: x.study_subject_name,
    room_id: String(x.room_id),
    room_name: x.room_name,
    stage_level: Number(x.stage_level ?? 1),
    schedule_type: x.schedule_type === "SEMESTER" ? "SEMESTER" : "FINAL",
    workflow_status:
      x.workflow_status === "APPROVED"
        ? "APPROVED"
        : x.workflow_status === "REJECTED"
          ? "REJECTED"
          : x.workflow_status === "SUBMITTED"
            ? "SUBMITTED"
            : "DRAFT",
    term_label: x.term_label,
    academic_year: x.academic_year,
    exam_date: x.exam_date,
    start_time: x.start_time.slice(0, 5),
    end_time: x.end_time.slice(0, 5),
    duration_minutes: x.duration_minutes,
    notes: x.notes,
    created_at: x.created_at,
  }));
}

export async function createCollegeExamSchedule(input: {
  ownerUserId: string;
  collegeSubjectId: string;
  studySubjectId: string;
  roomId: string;
  stageLevel: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  examDate: string;
  startTime: string;
  endTime: string;
  notes: string;
}): Promise<{ ok: true; row: CollegeExamScheduleRow } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "يرجى اختيار القسم أو الفرع." };
  if (!/^\d+$/.test(input.studySubjectId.trim())) return { ok: false, message: "يرجى اختيار المادة الدراسية." };
  if (!/^\d+$/.test(input.roomId.trim())) return { ok: false, message: "يرجى اختيار القاعة الامتحانية." };
  if (!/^\d+$/.test(input.stageLevel.trim())) return { ok: false, message: "يرجى اختيار المرحلة." };
  if (!input.termLabel.trim()) return { ok: false, message: "يرجى اختيار الفصل الدراسي." };
  if (!input.academicYear.trim()) return { ok: false, message: "يرجى تحديد العام الدراسي." };
  const pastCheck = assertExamDateNotInPast(input.examDate);
  if (!pastCheck.ok) return pastCheck;
  if (!input.startTime.trim()) return { ok: false, message: "يرجى تحديد وقت بداية الامتحان." };
  if (!input.endTime.trim()) return { ok: false, message: "يرجى تحديد وقت نهاية الامتحان." };
  const startMin = toMinutes(input.startTime.trim());
  const endMin = toMinutes(input.endTime.trim());
  if (startMin < 0 || endMin < 0) return { ok: false, message: "تنسيق الوقت غير صالح." };
  if (endMin <= startMin) return { ok: false, message: "وقت نهاية الامتحان يجب أن يكون بعد وقت البداية." };
  const pool = getDbPool();

  const subjectScope = await pool.query(
    `SELECT 1
     FROM college_study_subjects
     WHERE id = $1 AND owner_user_id = $2 AND college_subject_id = $3
     LIMIT 1`,
    [input.studySubjectId.trim(), input.ownerUserId, input.collegeSubjectId.trim()]
  );
  if ((subjectScope.rowCount ?? 0) === 0) {
    return { ok: false, message: "المادة المختارة لا تتبع القسم/الفرع المحدد." };
  }
  const roomScope = await pool.query(
    `SELECT 1 FROM college_exam_rooms WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [input.roomId.trim(), input.ownerUserId]
  );
  if ((roomScope.rowCount ?? 0) === 0) return { ok: false, message: "القاعة المختارة غير موجودة." };
  const roomSubjectOk = await assertExamRoomAllowsStudySubject(
    pool,
    input.ownerUserId,
    input.roomId.trim(),
    input.studySubjectId.trim()
  );
  if (!roomSubjectOk.ok) return roomSubjectOk;
  const holiday = await pool.query(
    `SELECT holiday_name
     FROM college_holidays
     WHERE owner_user_id = $1 AND holiday_date = $2
     LIMIT 1`,
    [input.ownerUserId, input.examDate.trim()]
  );
  if ((holiday.rowCount ?? 0) > 0) {
    const holidayName = String((holiday.rows[0] as { holiday_name?: string })?.holiday_name ?? "عطلة");
    return { ok: false, message: `لا يمكن الجدولة في هذا اليوم (${holidayName}).` };
  }

  const contextLocked = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND college_subject_id = $2
       AND schedule_type = $3
       AND COALESCE(term_label, '') = COALESCE($4, '')
       AND COALESCE(academic_year, '') = COALESCE($5, '')
       AND workflow_status IN ('SUBMITTED','APPROVED')
     LIMIT 1`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
    ]
  );
  if ((contextLocked.rowCount ?? 0) > 0) {
    return { ok: false, message: "هذا الجدول مرفوع للمتابعة ولا يمكن تعديل إدخالاته." };
  }

  const stageNum = Number(input.stageLevel.trim());
  const dup = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND college_subject_id = $2
       AND study_subject_id = $3
       AND stage_level = $4
       AND exam_date = $5
       AND start_time = $6::time
       AND end_time = $7::time
     LIMIT 1`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      stageNum,
      input.examDate.trim(),
      input.startTime.trim(),
      input.endTime.trim(),
    ]
  );
  if ((dup.rowCount ?? 0) > 0) {
    return { ok: false, message: "هذه المادة مضافة مسبقًا لنفس المرحلة وبنفس التوقيت." };
  }
  const cohortConflict = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND college_subject_id = $2
       AND study_subject_id = $3
       AND stage_level = $4
       AND exam_date = $5
       AND (start_time < $6::time AND end_time > $7::time)
     LIMIT 1`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      stageNum,
      input.examDate.trim(),
      input.endTime.trim(),
      input.startTime.trim(),
    ]
  );
  if ((cohortConflict.rowCount ?? 0) > 0) {
    return { ok: false, message: "تعارض: نفس المادة والمرحلة مسجّلة في وقت متداخل." };
  }

  const ins = await pool.query<{ id: string | number }>(
    `INSERT INTO college_exam_schedules
      (owner_user_id, college_subject_id, study_subject_id, room_id, schedule_type, workflow_status, term_label,
       academic_year, stage_level, exam_date, start_time, end_time, duration_minutes, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10::time,$11::time,$12,$13,NOW(),NOW())
     RETURNING id`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      input.roomId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
      stageNum,
      input.examDate.trim(),
      input.startTime.trim(),
      input.endTime.trim(),
      endMin - startMin,
      input.notes.trim() || null,
    ]
  );
  const id = String(ins.rows[0]?.id ?? "");
  const rows = await listCollegeExamSchedulesByOwner(input.ownerUserId);
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, message: "تمت الإضافة لكن تعذر تحميل السجل الجديد." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_CREATED", id, {
    collegeSubjectId: input.collegeSubjectId.trim(),
    studySubjectId: input.studySubjectId.trim(),
    examDate: input.examDate.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    roomId: input.roomId.trim(),
  });
  return { ok: true, row };
}

export async function updateCollegeExamSchedule(input: {
  id: string;
  ownerUserId: string;
  collegeSubjectId: string;
  studySubjectId: string;
  roomId: string;
  stageLevel: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  examDate: string;
  startTime: string;
  endTime: string;
  notes: string;
}): Promise<{ ok: true; row: CollegeExamScheduleRow } | { ok: false; message: string }> {
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف الإدخال غير صالح." };
  const createLike = await createCollegeExamSchedule({
    ownerUserId: input.ownerUserId,
    collegeSubjectId: input.collegeSubjectId,
    studySubjectId: input.studySubjectId,
    roomId: input.roomId,
    stageLevel: input.stageLevel,
    scheduleType: input.scheduleType,
    termLabel: input.termLabel,
    academicYear: input.academicYear,
    examDate: input.examDate,
    startTime: input.startTime,
    endTime: input.endTime,
    notes: input.notes,
  });
  const skipCreateLikeMessages = new Set([
    "هذه المادة مضافة مسبقًا بنفس التوقيت.",
    "هذه المادة مضافة مسبقًا لنفس المرحلة وبنفس التوقيت.",
  ]);
  if (!createLike.ok && !skipCreateLikeMessages.has(createLike.message)) return createLike;

  const startMin = toMinutes(input.startTime.trim());
  const endMin = toMinutes(input.endTime.trim());
  const pool = getDbPool();
  const holiday = await pool.query(
    `SELECT holiday_name
     FROM college_holidays
     WHERE owner_user_id = $1 AND holiday_date = $2
     LIMIT 1`,
    [input.ownerUserId, input.examDate.trim()]
  );
  if ((holiday.rowCount ?? 0) > 0) {
    const holidayName = String((holiday.rows[0] as { holiday_name?: string })?.holiday_name ?? "عطلة");
    return { ok: false, message: `لا يمكن الجدولة في هذا اليوم (${holidayName}).` };
  }
  const updStage = Number(input.stageLevel.trim());
  const dup = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND id <> $2
       AND college_subject_id = $3
       AND study_subject_id = $4
       AND stage_level = $5
       AND exam_date = $6
       AND start_time = $7::time
       AND end_time = $8::time
     LIMIT 1`,
    [
      input.ownerUserId,
      input.id.trim(),
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      updStage,
      input.examDate.trim(),
      input.startTime.trim(),
      input.endTime.trim(),
    ]
  );
  if ((dup.rowCount ?? 0) > 0) return { ok: false, message: "هذه المادة مضافة مسبقًا لنفس المرحلة وبنفس التوقيت." };
  const cohortConflict = await pool.query(
    `SELECT 1
     FROM college_exam_schedules
     WHERE owner_user_id = $1
       AND id <> $2
       AND college_subject_id = $3
       AND study_subject_id = $4
       AND stage_level = $5
       AND exam_date = $6
       AND (start_time < $7::time AND end_time > $8::time)
     LIMIT 1`,
    [
      input.ownerUserId,
      input.id.trim(),
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      updStage,
      input.examDate.trim(),
      input.endTime.trim(),
      input.startTime.trim(),
    ]
  );
  if ((cohortConflict.rowCount ?? 0) > 0) {
    return { ok: false, message: "تعارض: نفس المادة والمرحلة مسجّلة في وقت متداخل." };
  }

  const roomSubjectOkUpd = await assertExamRoomAllowsStudySubject(
    pool,
    input.ownerUserId,
    input.roomId.trim(),
    input.studySubjectId.trim()
  );
  if (!roomSubjectOkUpd.ok) return roomSubjectOkUpd;

  const upd = await pool.query(
    `UPDATE college_exam_schedules
     SET college_subject_id = $1, study_subject_id = $2, room_id = $3,
         schedule_type = $4, term_label = $5, academic_year = $6, stage_level = $7, exam_date = $8,
         start_time = $9::time, end_time = $10::time, duration_minutes = $11, notes = $12, updated_at = NOW()
     WHERE id = $13 AND owner_user_id = $14 AND workflow_status IN ('DRAFT','REJECTED')`,
    [
      input.collegeSubjectId.trim(),
      input.studySubjectId.trim(),
      input.roomId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
      updStage,
      input.examDate.trim(),
      input.startTime.trim(),
      input.endTime.trim(),
      endMin - startMin,
      input.notes.trim() || null,
      input.id.trim(),
      input.ownerUserId,
    ]
  );
  if ((upd.rowCount ?? 0) === 0) return { ok: false, message: "الإدخال غير موجود أو مرفوع/معتمد ولا يمكن تعديله." };
  const rows = await listCollegeExamSchedulesByOwner(input.ownerUserId);
  const row = rows.find((r) => r.id === input.id.trim());
  if (!row) return { ok: false, message: "تم التحديث لكن تعذر تحميل السجل." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_UPDATED", input.id.trim(), {
    collegeSubjectId: input.collegeSubjectId.trim(),
    studySubjectId: input.studySubjectId.trim(),
    examDate: input.examDate.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    roomId: input.roomId.trim(),
  });
  return { ok: true, row };
}

export async function deleteCollegeExamSchedule(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  if (!/^\d+$/.test(input.id.trim())) return { ok: false, message: "معرّف الإدخال غير صالح." };
  await ensureCoreSchema();
  const pool = getDbPool();
  const r = await pool.query(`DELETE FROM college_exam_schedules WHERE id = $1 AND owner_user_id = $2 AND workflow_status IN ('DRAFT','REJECTED')`, [
    input.id.trim(),
    input.ownerUserId,
  ]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "الإدخال غير موجود أو مرفوع/معتمد ولا يمكن حذفه." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_DELETED", input.id.trim(), {});
  return { ok: true, id: input.id.trim() };
}

export async function submitCollegeExamScheduleContext(input: {
  ownerUserId: string;
  collegeSubjectId: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "يرجى اختيار القسم أو الفرع." };
  if (!input.termLabel.trim()) return { ok: false, message: "يرجى اختيار الفصل الدراسي." };
  if (!input.academicYear.trim()) return { ok: false, message: "يرجى تحديد العام الدراسي." };
  const pool = getDbPool();
  const r = await pool.query(
    `UPDATE college_exam_schedules
     SET workflow_status = 'SUBMITTED', updated_at = NOW()
     WHERE owner_user_id = $1
       AND college_subject_id = $2
       AND schedule_type = $3
       AND COALESCE(term_label, '') = COALESCE($4, '')
       AND COALESCE(academic_year, '') = COALESCE($5, '')
       AND workflow_status = 'DRAFT'`,
    [
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "لا توجد مسودات ضمن هذا الجدول لرفعها." };
  await writeScheduleAudit(input.ownerUserId, "EXAM_SCHEDULE_SUBMITTED", null, {
    collegeSubjectId: input.collegeSubjectId.trim(),
    scheduleType: input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
    termLabel: input.termLabel.trim() || null,
    academicYear: input.academicYear.trim() || null,
  });
  return { ok: true };
}

export async function reviewCollegeExamScheduleContext(input: {
  reviewerUserId: string;
  ownerUserId: string;
  collegeSubjectId: string;
  scheduleType: string;
  termLabel: string;
  academicYear: string;
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isDatabaseConfigured()) return { ok: false, message: "قاعدة البيانات غير مهيأة." };
  await ensureCoreSchema();
  if (!/^\d+$/.test(input.collegeSubjectId.trim())) return { ok: false, message: "القسم/الفرع غير صالح." };
  const pool = getDbPool();
  const status = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
  const r = await pool.query(
    `UPDATE college_exam_schedules
     SET workflow_status = $1, updated_at = NOW()
     WHERE owner_user_id = $2
       AND college_subject_id = $3
       AND schedule_type = $4
       AND COALESCE(term_label, '') = COALESCE($5, '')
       AND COALESCE(academic_year, '') = COALESCE($6, '')
       AND workflow_status = 'SUBMITTED'`,
    [
      status,
      input.ownerUserId,
      input.collegeSubjectId.trim(),
      input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
      input.termLabel.trim() || null,
      input.academicYear.trim() || null,
    ]
  );
  if ((r.rowCount ?? 0) === 0) return { ok: false, message: "لا توجد إدخالات مرفوعة ضمن هذا السياق." };
  await writeScheduleAudit(input.reviewerUserId, `EXAM_SCHEDULE_${status}`, null, {
    ownerUserId: input.ownerUserId,
    collegeSubjectId: input.collegeSubjectId.trim(),
    scheduleType: input.scheduleType === "SEMESTER" ? "SEMESTER" : "FINAL",
    termLabel: input.termLabel.trim() || null,
    academicYear: input.academicYear.trim() || null,
    reviewNote: input.reviewNote?.trim() || null,
  });
  return { ok: true };
}
