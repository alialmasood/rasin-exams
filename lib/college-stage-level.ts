import {
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_DOCTOR,
  POSTGRAD_STUDY_STAGE_MASTER,
} from "@/lib/college-study-stage-display";

/** أرقام المراحل الدراسية المعروضة عند الجدولة وتعريف القاعات — حسب تسمية الكلية */
export function getCollegeStageLevelOptions(collegeLabel: string): number[] {
  const name = collegeLabel.trim();
  if (name.includes("كلية الطب") || name.includes("كلية طب الزهراء")) return [1, 2, 3, 4, 5, 6];
  if (name.includes("كلية الصيدلة") || name.includes("كلية طب الاسنان")) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4];
}

/**
 * مراحل الدراسة الأولية مع استثناء قسم هندسة العمارة في كلية الهندسة (5 مراحل) عند العمل ضمن بوابة قسم ثابتة.
 * يُمرَّر اسم القسم من `college_subjects.branch_name` (أو ما يعادله في الواجهة).
 */
export function getCollegeUndergradStageLevelOptionsForScope(input: {
  collegeLabel: string;
  fixedCollegeSubjectId?: string | null;
  scopedBranchName?: string | null;
}): number[] {
  const base = getCollegeStageLevelOptions(input.collegeLabel);
  const label = input.collegeLabel.trim();
  if (!label.includes("كلية الهندسة")) return base;
  if (!input.fixedCollegeSubjectId?.trim()) return base;
  const branch = (input.scopedBranchName ?? "").trim();
  if (!branch.includes("هندسة العمارة")) return base;
  return [1, 2, 3, 4, 5];
}

const POSTGRAD_STAGE_LEVELS = [
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_MASTER,
  POSTGRAD_STUDY_STAGE_DOCTOR,
] as const;

/** مراحل الجدولة الامتحانية: الأولية للكلية + دبلوم/ماجستير/دكتوراه (11–13) */
export function getExamScheduleStageLevelOptions(collegeLabel: string): number[] {
  const base = getCollegeStageLevelOptions(collegeLabel);
  const out = [...base];
  for (const p of POSTGRAD_STAGE_LEVELS) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
}
