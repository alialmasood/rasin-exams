"use client";

import { useActionState, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCollegeQuickActionsRegister, useCollegeQuickUrlTrigger } from "../college-quick-actions";
import { createPortal } from "react-dom";
import { useCollegePortalBasePath } from "@/components/dashboard/college-portal-base-path";
import type { CollegeRoomScheduleHint } from "@/lib/college-exam-schedules";
import {
  COLLEGE_BRANCH_ALL_SENTINEL,
  type CollegeRoomDefinitionRow,
} from "@/lib/college-room-definitions-shared";
import type { CollegeSubjectRow } from "@/lib/college-subjects";
import type { CollegeStudySubjectRow } from "@/lib/college-study-subjects";
import {
  formatCollegeStudyLevelTierLabel,
  formatCollegeStudyStageLabel,
  isPostgraduateStudyStageLevel,
  POSTGRAD_STUDY_STAGE_DIPLOMA,
  POSTGRAD_STUDY_STAGE_DOCTOR,
  POSTGRAD_STUDY_STAGE_MASTER,
} from "@/lib/college-study-stage-display";
import type { CollegeExamRoomRow } from "@/lib/college-rooms";
import type { StaffRegistryNamePicklist } from "@/lib/staff-registry-shared";
import { getCollegeUndergradStageLevelOptionsForScope } from "@/lib/college-stage-level";
import {
  EMPTY_EXTERNAL_ROOM_STAFF,
  MAX_EXTERNAL_INVIGILATORS,
  formatExternalStaffPlainTextForExport,
  type ExternalRoomStaffStored,
} from "@/lib/room-external-staff";
import {
  buildCollegeExamRoomsReportHtml,
  printCollegeExamRoomsReportHtml,
} from "@/lib/college-rooms-report-html";
import {
  createCollegeExamRoomAction,
  defineCollegeRoomDefinitionsAction,
  deleteCollegeExamRoomAction,
  updateCollegeExamRoomAction,
} from "./actions";
import { RoomReportModal } from "./room-report-modal";
import { StudySubjectExamSelect } from "./study-subject-exam-select";

/** نفس فواصل التخزيم في lib/college-rooms (مراقبون / أسماء غياب) */
function splitNameList(raw: string): string[] {
  return raw
    .split(/[,،;|\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseBulkCapNum(raw: string): number {
  const n = Number(
    String(raw)
      .trim()
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  );
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeBulkCapInput(raw: string): string {
  return String(raw)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function StackedNamesCell({ value }: { value: string }) {
  const items = splitNameList(value);
  if (items.length === 0) {
    return <span className="text-[11px] text-[#94A3B8]">—</span>;
  }
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 break-words">
      {items.map((name, i) => (
        <span key={`${i}-${name.slice(0, 48)}`} className="block break-words text-[11px] leading-snug text-[#334155]">
          <span className="ms-1 inline-block font-semibold tabular-nums text-[10px] text-[#64748B]">{i + 1}.</span> {name}
        </span>
      ))}
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#172554] disabled:opacity-60"
    >
      {pending ? "جاري الحفظ..." : label}
    </button>
  );
}

function shiftCapacityLabel(row: CollegeExamRoomRow, slot: 1 | 2) {
  if (slot === 1) {
    return `${row.capacity_total} (ص ${row.capacity_morning} + م ${row.capacity_evening})`;
  }
  if (!row.study_subject_id_2) return "—";
  return `${row.capacity_total_2} (ص ${row.capacity_morning_2} + م ${row.capacity_evening_2})`;
}

/** تجميع عندما تتكرر نفس المادة (الفتحة 1 أو 2) في أكثر من قاعة — لإظهار الإجمالي للمستخدم. */
type SubjectMultiRoomAggregate = {
  subjectId: string;
  subjectName: string;
  roomCount: number;
  totalCapacity: number;
  totalMorning: number;
  totalEvening: number;
  totalAttendance: number;
  totalAbsence: number;
  /** ترتيب معرفات القاعات حسب التسلسل المعروض */
  roomOrderIds: string[];
};

function buildSubjectMultiRoomAggregates(rows: CollegeExamRoomRow[], slot: 1 | 2): Map<string, SubjectMultiRoomAggregate> {
  const bySubject = new Map<string, CollegeExamRoomRow[]>();
  for (const r of rows) {
    const sid = slot === 1 ? r.study_subject_id : r.study_subject_id_2;
    if (!sid) continue;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(r);
  }
  const out = new Map<string, SubjectMultiRoomAggregate>();
  for (const [sid, list] of bySubject) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
      return String(a.id).localeCompare(String(b.id));
    });
    const name =
      slot === 1
        ? sorted[0]!.study_subject_name
        : (sorted[0]!.study_subject_name_2 ?? sorted[0]!.study_subject_name);
    let totalCapacity = 0;
    let totalMorning = 0;
    let totalEvening = 0;
    let totalAttendance = 0;
    let totalAbsence = 0;
    for (const r of sorted) {
      if (slot === 1) {
        totalCapacity += r.capacity_total;
        totalMorning += r.capacity_morning;
        totalEvening += r.capacity_evening;
        totalAttendance += r.attendance_count;
        totalAbsence += r.absence_count;
      } else {
        totalCapacity += r.capacity_total_2;
        totalMorning += r.capacity_morning_2;
        totalEvening += r.capacity_evening_2;
        totalAttendance += r.attendance_count_2;
        totalAbsence += r.absence_count_2;
      }
    }
    out.set(sid, {
      subjectId: sid,
      subjectName: name,
      roomCount: sorted.length,
      totalCapacity,
      totalMorning,
      totalEvening,
      totalAttendance,
      totalAbsence,
      roomOrderIds: sorted.map((x) => x.id),
    });
  }
  return out;
}

function roomIndexInSubjectDistribution(agg: SubjectMultiRoomAggregate, roomId: string): number {
  const i = agg.roomOrderIds.indexOf(roomId);
  return i >= 0 ? i + 1 : 1;
}

const inputNumberClass =
  "h-11 w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none [appearance:textfield] focus:border-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

type StudyTierUi = "UNDERGRAD" | "POSTGRAD";

function tierFromLevel(lv: number): StudyTierUi {
  return isPostgraduateStudyStageLevel(lv) ? "POSTGRAD" : "UNDERGRAD";
}

/** عرض المستوى والمرحلة في جدول القاعات (مثل صفحة المواد الدراسية) */
function RoomStageTableLines({ level }: { level: number }) {
  const lv = Number(level);
  return (
    <div className="space-y-0.5">
      <span
        className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-[9px] font-bold break-words ${
          isPostgraduateStudyStageLevel(lv)
            ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#A5B4FC]/50"
            : "bg-[#F0FDFA] text-[#0F766E] ring-1 ring-[#99F6E4]/70"
        }`}
      >
        {formatCollegeStudyLevelTierLabel(lv)}
      </span>
      {!isPostgraduateStudyStageLevel(lv) ? (
        <div className="text-[10px] text-[#64748B]">{formatCollegeStudyStageLabel(lv)}</div>
      ) : null}
    </div>
  );
}

/** نص موحّد لتصدير Excel / عرض نصي للمرحلة */
function roomStageExportLabel(level: number): string {
  const lv = Number(level);
  if (isPostgraduateStudyStageLevel(lv)) return formatCollegeStudyLevelTierLabel(lv);
  return `${formatCollegeStudyLevelTierLabel(lv)} — ${formatCollegeStudyStageLabel(lv)}`;
}

function roomBranchLabel(branch: CollegeSubjectRow | { branch_name: string; branch_type: "DEPARTMENT" | "BRANCH" }) {
  return `${branch.branch_name} (${branch.branch_type === "BRANCH" ? "فرع" : "قسم"})`;
}

/** نص واحد للبحث النصي في القاعة (بدون اعتماد على تطبيع أحرف عربية متقدم) */
function buildRoomRowSearchHaystack(r: CollegeExamRoomRow): string {
  const ext = r.external_room_staff;
  const extBits = [
    ext.supervisor_formation_name,
    ...ext.external_invigilators.flatMap((x) => [x.name, x.formation_name]),
  ];
  const parts = [
    r.college_subject_name,
    r.room_name,
    r.supervisor_name,
    r.supervisor_name_2 ?? "",
    r.invigilators,
    r.invigilators_2 ?? "",
    r.study_subject_name,
    r.study_subject_name_2 ?? "",
    roomStageExportLabel(r.stage_level ?? 1),
    r.study_subject_id_2 ? roomStageExportLabel(Number(r.stage_level_2 ?? 1)) : "",
    r.absence_names,
    r.absence_names_2 ?? "",
    r.study_subject_instructor_name,
    r.study_subject_instructor_name_2 ?? "",
    String(r.serial_no),
    ...extBits,
  ];
  return parts.join(" ");
}

function RoomFields({
  branches,
  subjects,
  collegeLabel,
  fixedCollegeSubjectId,
  scopedBranchName,
  defaults,
  showSerial = true,
  disableAttendanceFields = false,
  staffRegistryPicklist = null,
  roomDefinitions = [],
  /** إضافة فقط: اختيار عدة قاعات من السجل المرجعي بنفس المادة والسعة */
  multiRoomNames = false,
}: {
  branches: CollegeSubjectRow[];
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
  /** بوابة القسم: معرّف القسم الثابت لحساب مراحل هندسة العمارة (5) ضمن الهندسة */
  fixedCollegeSubjectId?: string | null;
  /** اسم القسم/الفرع المعروض (مرادف لـ college_subjects.branch_name) */
  scopedBranchName?: string | null;
  defaults?: Partial<CollegeExamRoomRow>;
  showSerial?: boolean;
  disableAttendanceFields?: boolean;
  /** من صفحة السجل المرجعي للأسماء (إدارة المشرفين والمراقبين) — اقتراحات للحقول */
  staffRegistryPicklist?: StaffRegistryNamePicklist | null;
  roomDefinitions?: CollegeRoomDefinitionRow[];
  multiRoomNames?: boolean;
}) {
  const d = defaults ?? {};
  const lockedBranchId = fixedCollegeSubjectId?.trim() || null;
  const branchLockedToDepartment = Boolean(lockedBranchId);
  const [selectedCollegeSubjectId, setSelectedCollegeSubjectId] = useState(
    () => d.college_subject_id ?? lockedBranchId ?? ""
  );
  const isAllBranchesSelected = selectedCollegeSubjectId === COLLEGE_BRANCH_ALL_SENTINEL;
  const lockedBranchMeta = useMemo(
    () => (lockedBranchId ? branches.find((b) => b.id === lockedBranchId) : undefined),
    [branches, lockedBranchId]
  );
  const undergradStageOptions = useMemo(
    () =>
      getCollegeUndergradStageLevelOptionsForScope({
        collegeLabel,
        fixedCollegeSubjectId: isAllBranchesSelected ? null : selectedCollegeSubjectId || null,
        scopedBranchName: isAllBranchesSelected
          ? null
          : branchLockedToDepartment
            ? (scopedBranchName ?? null)
            : (branches.find((b) => b.id === selectedCollegeSubjectId)?.branch_name ?? null),
      }),
    [branches, branchLockedToDepartment, collegeLabel, isAllBranchesSelected, scopedBranchName, selectedCollegeSubjectId]
  );
  const firstUndergrad = undergradStageOptions[0] ?? 1;
  const raw1 = Number(d.stage_level ?? firstUndergrad);
  const raw2Parsed = d.stage_level_2 != null ? Number(d.stage_level_2) : firstUndergrad;
  const raw2 = Number.isFinite(raw2Parsed) ? raw2Parsed : firstUndergrad;

  const [tier1, setTier1] = useState<StudyTierUi>(() => tierFromLevel(raw1));
  const [undergradStage1, setUndergradStage1] = useState(() => {
    if (tierFromLevel(raw1) === "UNDERGRAD" && undergradStageOptions.includes(raw1)) return String(raw1);
    return String(firstUndergrad);
  });
  const [postgradStage1, setPostgradStage1] = useState(() =>
    tierFromLevel(raw1) === "POSTGRAD" && isPostgraduateStudyStageLevel(raw1)
      ? String(raw1)
      : String(POSTGRAD_STUDY_STAGE_DIPLOMA)
  );

  const [tier2, setTier2] = useState<StudyTierUi>(() => tierFromLevel(raw2));
  const [undergradStage2, setUndergradStage2] = useState(() => {
    if (tierFromLevel(raw2) === "UNDERGRAD" && undergradStageOptions.includes(raw2)) return String(raw2);
    return String(firstUndergrad);
  });
  const [postgradStage2, setPostgradStage2] = useState(() =>
    tierFromLevel(raw2) === "POSTGRAD" && isPostgraduateStudyStageLevel(raw2)
      ? String(raw2)
      : String(POSTGRAD_STUDY_STAGE_DIPLOMA)
  );

  const [exam1SubjectId, setExam1SubjectId] = useState(() => d.study_subject_id ?? "");
  const [exam2SubjectId, setExam2SubjectId] = useState(() => d.study_subject_id_2 ?? "");
  const availableSubjects = useMemo(() => {
    if (!selectedCollegeSubjectId) return [];
    if (isAllBranchesSelected) return subjects;
    return subjects.filter((s) => s.college_subject_id == null || s.college_subject_id === selectedCollegeSubjectId);
  }, [isAllBranchesSelected, selectedCollegeSubjectId, subjects]);
  const availableRoomDefinitions = useMemo(() => {
    if (!selectedCollegeSubjectId) return [];
    if (isAllBranchesSelected) {
      const seen = new Set<string>();
      const dedup: CollegeRoomDefinitionRow[] = [];
      for (const room of roomDefinitions) {
        if (seen.has(room.room_name_key)) continue;
        seen.add(room.room_name_key);
        dedup.push(room);
      }
      return dedup.sort((a, b) => a.room_name.localeCompare(b.room_name, "ar"));
    }
    return roomDefinitions
      .filter((room) => room.college_subject_id === selectedCollegeSubjectId)
      .sort((a, b) => a.room_name.localeCompare(b.room_name, "ar"));
  }, [isAllBranchesSelected, roomDefinitions, selectedCollegeSubjectId]);

  useEffect(() => {
    if (!exam1SubjectId) return;
    const sub = subjects.find((s) => s.id === exam1SubjectId);
    if (!sub) return;
    const lv = Number(sub.study_stage_level);
    if (isPostgraduateStudyStageLevel(lv)) {
      setTier1("POSTGRAD");
      setPostgradStage1(String(lv));
    } else {
      setTier1("UNDERGRAD");
      setUndergradStage1(undergradStageOptions.includes(lv) ? String(lv) : String(firstUndergrad));
    }
  }, [exam1SubjectId, subjects, firstUndergrad, undergradStageOptions]);

  useEffect(() => {
    if (tier1 === "UNDERGRAD" && !undergradStageOptions.includes(Number(undergradStage1))) {
      setUndergradStage1(String(firstUndergrad));
    }
    if (tier2 === "UNDERGRAD" && !undergradStageOptions.includes(Number(undergradStage2))) {
      setUndergradStage2(String(firstUndergrad));
    }
  }, [firstUndergrad, tier1, tier2, undergradStage1, undergradStage2, undergradStageOptions]);

  const invigilatorsFieldId = useId();
  const invSlot1FieldId = `${invigilatorsFieldId}-slot1`;
  const [singleSupervisorName, setSingleSupervisorName] = useState(() => (d.supervisor_name ?? "").trim());
  const invSplitInit = splitNameList(d.invigilators ?? "");
  const [invPickSlots, setInvPickSlots] = useState<string[]>(() => [
    invSplitInit[0] ?? "",
    invSplitInit[1] ?? "",
    invSplitInit[2] ?? "",
    invSplitInit[3] ?? "",
  ]);
  useEffect(() => {
    const s = splitNameList(d.invigilators ?? "");
    setInvPickSlots([s[0] ?? "", s[1] ?? "", s[2] ?? "", s[3] ?? ""]);
  }, [d.invigilators]);

  const hasStaffSupervisorPick = Boolean(staffRegistryPicklist?.supervisors.length);
  const hasStaffInvigilatorPick = Boolean(staffRegistryPicklist?.invigilators.length);

  const supervisorSelectOptions = useMemo(() => {
    if (!staffRegistryPicklist?.supervisors.length) return [];
    const set = new Set(staffRegistryPicklist.supervisors);
    const cur = singleSupervisorName.trim();
    if (cur) set.add(cur);
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [staffRegistryPicklist?.supervisors, singleSupervisorName]);

  const invSelectOptions = useMemo(() => {
    if (!staffRegistryPicklist?.invigilators.length) return [];
    const set = new Set(staffRegistryPicklist.invigilators);
    for (const t of invPickSlots) {
      const x = t.trim();
      if (x) set.add(x);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [staffRegistryPicklist?.invigilators, invPickSlots]);

  const invigilatorsHiddenValue = useMemo(
    () =>
      invPickSlots
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join("، "),
    [invPickSlots]
  );

  const singleRoomOptions = useMemo(() => {
    const set = new Set(availableRoomDefinitions.map((room) => room.room_name));
    const cur = (d.room_name ?? "").trim();
    if (cur) set.add(cur);
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [availableRoomDefinitions, d.room_name]);

  /** إضافة جماعية: اختيار القاعات المعرّفة + مشرف ومراقبون لكل قاعة */
  const [roomDefinitionsExpanded, setRoomDefinitionsExpanded] = useState(false);
  const [roomDefinitionsQuery, setRoomDefinitionsQuery] = useState("");
  const [selectedDefinedRooms, setSelectedDefinedRooms] = useState<string[]>([]);
  const availableRoomNamesSet = useMemo(
    () => new Set(availableRoomDefinitions.map((room) => room.room_name)),
    [availableRoomDefinitions]
  );
  const filteredRoomDefinitions = useMemo(() => {
    const q = roomDefinitionsQuery.trim().toLowerCase();
    return availableRoomDefinitions.filter((room) => !q || room.room_name.toLowerCase().includes(q));
  }, [availableRoomDefinitions, roomDefinitionsQuery]);
  const bulkRoomOrder = useMemo(
    () => selectedDefinedRooms.filter((roomName) => availableRoomNamesSet.has(roomName)),
    [availableRoomNamesSet, selectedDefinedRooms]
  );
  const [perRoomSupervisor, setPerRoomSupervisor] = useState<Record<string, string>>({});
  const [perRoomInvSlots, setPerRoomInvSlots] = useState<Record<string, [string, string, string, string]>>({});
  const [perRoomInvFree, setPerRoomInvFree] = useState<Record<string, string>>({});
  const [perRoomCap1, setPerRoomCap1] = useState<Record<string, { m: string; e: string }>>({});
  const [perRoomCap2, setPerRoomCap2] = useState<Record<string, { m: string; e: string }>>({});
  const [externalSupervisorBatchName, setExternalSupervisorBatchName] = useState("");

  useEffect(() => {
    if (!multiRoomNames) return;
    setPerRoomSupervisor((prev) => {
      const next: Record<string, string> = {};
      for (const name of bulkRoomOrder) next[name] = prev[name] ?? "";
      return next;
    });
    setPerRoomInvSlots((prev) => {
      const next: Record<string, [string, string, string, string]> = {};
      const empty: [string, string, string, string] = ["", "", "", ""];
      for (const name of bulkRoomOrder) {
        next[name] = prev[name] ? ([...prev[name]!] as [string, string, string, string]) : [...empty];
      }
      return next;
    });
    setPerRoomInvFree((prev) => {
      const next: Record<string, string> = {};
      for (const name of bulkRoomOrder) next[name] = prev[name] ?? "";
      return next;
    });
    setPerRoomCap1((prev) => {
      const next: Record<string, { m: string; e: string }> = {};
      for (const name of bulkRoomOrder) {
        next[name] = prev[name] ?? { m: "0", e: "0" };
      }
      return next;
    });
    setPerRoomCap2((prev) => {
      const next: Record<string, { m: string; e: string }> = {};
      for (const name of bulkRoomOrder) {
        next[name] = prev[name] ?? { m: "0", e: "0" };
      }
      return next;
    });
  }, [multiRoomNames, bulkRoomOrder]);

  const toggleDefinedRoom = useCallback((roomName: string) => {
    setSelectedDefinedRooms((prev) =>
      prev.includes(roomName) ? prev.filter((name) => name !== roomName) : [...prev, roomName]
    );
  }, []);

  const selectAllDefinedRooms = useCallback(() => {
    setSelectedDefinedRooms(availableRoomDefinitions.map((room) => room.room_name));
  }, [availableRoomDefinitions]);

  const clearSelectedDefinedRooms = useCallback(() => {
    setSelectedDefinedRooms([]);
  }, []);

  const applyExternalSupervisorName = useCallback(
    (value: string) => {
      setExternalSupervisorBatchName(value);
      setPerRoomSupervisor((prev) => {
        if (bulkRoomOrder.length === 0) return prev;
        const next = { ...prev };
        for (const roomName of bulkRoomOrder) next[roomName] = value;
        return next;
      });
    },
    [bulkRoomOrder]
  );

  const supervisorSelectOptionsMulti = useMemo(() => {
    if (!staffRegistryPicklist?.supervisors.length) return [];
    const set = new Set(staffRegistryPicklist.supervisors);
    for (const rn of bulkRoomOrder) {
      const cur = (perRoomSupervisor[rn] ?? "").trim();
      if (cur) set.add(cur);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [staffRegistryPicklist?.supervisors, bulkRoomOrder, perRoomSupervisor]);

  const invSelectOptionsMulti = useMemo(() => {
    if (!staffRegistryPicklist?.invigilators.length) return [];
    const set = new Set(staffRegistryPicklist.invigilators);
    for (const rn of bulkRoomOrder) {
      for (const t of perRoomInvSlots[rn] ?? ["", "", "", ""]) {
        const x = t.trim();
        if (x) set.add(x);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [staffRegistryPicklist?.invigilators, bulkRoomOrder, perRoomInvSlots]);

  const [dualExam, setDualExam] = useState(() => Boolean(d.study_subject_id_2));

  const roomsWithStaffJson = useMemo(() => {
    if (!multiRoomNames) return "";
    return JSON.stringify(
      bulkRoomOrder.map((roomName) => {
        const cap1 = perRoomCap1[roomName] ?? { m: "0", e: "0" };
        const cap2 = perRoomCap2[roomName] ?? { m: "0", e: "0" };
        const base = {
          roomName,
          supervisorName: perRoomSupervisor[roomName] ?? "",
          invigilators: hasStaffInvigilatorPick
            ? (perRoomInvSlots[roomName] ?? ["", "", "", ""])
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
                .join("، ")
            : (perRoomInvFree[roomName] ?? "").trim(),
          capacityMorning: cap1.m,
          capacityEvening: cap1.e,
        };
        return dualExam
          ? {
              ...base,
              capacityMorning2: cap2.m,
              capacityEvening2: cap2.e,
            }
          : base;
      }),
    );
  }, [
    multiRoomNames,
    bulkRoomOrder,
    dualExam,
    perRoomSupervisor,
    perRoomInvSlots,
    perRoomInvFree,
    perRoomCap1,
    perRoomCap2,
    hasStaffInvigilatorPick,
  ]);

  const bulkCapacityTotals = useMemo(() => {
    if (!multiRoomNames || bulkRoomOrder.length === 0) return null;
    let sumM1 = 0;
    let sumE1 = 0;
    let sumM2 = 0;
    let sumE2 = 0;
    for (const name of bulkRoomOrder) {
      const c1 = perRoomCap1[name] ?? { m: "0", e: "0" };
      sumM1 += parseBulkCapNum(c1.m);
      sumE1 += parseBulkCapNum(c1.e);
      const c2 = perRoomCap2[name] ?? { m: "0", e: "0" };
      sumM2 += parseBulkCapNum(c2.m);
      sumE2 += parseBulkCapNum(c2.e);
    }
    return {
      slot1Morning: sumM1,
      slot1Evening: sumE1,
      slot1Total: sumM1 + sumE1,
      slot2Morning: sumM2,
      slot2Evening: sumE2,
      slot2Total: sumM2 + sumE2,
      roomCount: bulkRoomOrder.length,
    };
  }, [multiRoomNames, bulkRoomOrder, perRoomCap1, perRoomCap2]);

  useEffect(() => {
    if (!dualExam || !exam2SubjectId) return;
    const sub = subjects.find((s) => s.id === exam2SubjectId);
    if (!sub) return;
    const lv = Number(sub.study_stage_level);
    if (isPostgraduateStudyStageLevel(lv)) {
      setTier2("POSTGRAD");
      setPostgradStage2(String(lv));
    } else {
      setTier2("UNDERGRAD");
      setUndergradStage2(undergradStageOptions.includes(lv) ? String(lv) : String(firstUndergrad));
    }
  }, [dualExam, exam2SubjectId, subjects, firstUndergrad, undergradStageOptions]);

  const extStaffSyncKey = JSON.stringify(d.external_room_staff ?? null);
  const [extStaff, setExtStaff] = useState<ExternalRoomStaffStored>(
    () => d.external_room_staff ?? EMPTY_EXTERNAL_ROOM_STAFF
  );
  useEffect(() => {
    setExtStaff(d.external_room_staff ?? EMPTY_EXTERNAL_ROOM_STAFF);
  }, [extStaffSyncKey]);

  const selectedSubject1 = useMemo(
    () => (exam1SubjectId ? subjects.find((s) => s.id === exam1SubjectId) : undefined),
    [exam1SubjectId, subjects],
  );
  const selectedSubject2 = useMemo(
    () => (exam2SubjectId ? subjects.find((s) => s.id === exam2SubjectId) : undefined),
    [exam2SubjectId, subjects],
  );
  const disableUndergradTier1 = Boolean(
    selectedSubject1 && isPostgraduateStudyStageLevel(Number(selectedSubject1.study_stage_level)),
  );
  const disablePostgradTier1 = Boolean(
    selectedSubject1 && !isPostgraduateStudyStageLevel(Number(selectedSubject1.study_stage_level)),
  );
  const disableUndergradTier2 = Boolean(
    selectedSubject2 && isPostgraduateStudyStageLevel(Number(selectedSubject2.study_stage_level)),
  );
  const disablePostgradTier2 = Boolean(
    selectedSubject2 && !isPostgraduateStudyStageLevel(Number(selectedSubject2.study_stage_level)),
  );

  const hiddenStage1 = tier1 === "POSTGRAD" ? postgradStage1 : undergradStage1;
  const hiddenStage2 = tier2 === "POSTGRAD" ? postgradStage2 : undergradStage2;

  const stageSelectClass =
    "h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500";

  return (
    <>
      {showSerial ? (
        <div className="max-w-[12rem]">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">التسلسل</label>
          <input
            name="serial_no"
            type="number"
            min={0}
            required
            defaultValue={d.serial_no ?? 1}
            className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
          />
        </div>
      ) : null}

      {multiRoomNames ? (
        <>
          <div className="w-full rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]/80 px-4 py-3">
            <label className="mb-1 block text-sm font-semibold text-[#1E3A8A]">القاعات المعرّفة لهذا القسم/الفرع</label>
            {!selectedCollegeSubjectId ? (
              <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#64748B]">
                اختر القسم/الفرع أولاً لتظهر لك القاعات المعرّفة الجاهزة للاختيار.
              </p>
            ) : availableRoomDefinitions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#64748B]">
                لا توجد قاعات معرّفة لهذا القسم/الفرع بعد. استخدم زر <span className="font-bold">تعريف القاعات</span> ثم عد
                لاختيارها هنا.
              </p>
            ) : (
              <>
                <div className="rounded-xl border border-[#DBEAFE] bg-white px-3 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A]">
                        القاعات المختارة الآن: <span className="tabular-nums">{bulkRoomOrder.length}</span> من{" "}
                        <span className="tabular-nums">{availableRoomDefinitions.length}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
                        افتح القائمة عند الحاجة فقط، حتى لا تأخذ أسماء القاعات الكثيرة مساحة كبيرة داخل المودل.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRoomDefinitionsExpanded((v) => !v)}
                      className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-sm font-semibold text-[#1D4ED8]"
                    >
                      {roomDefinitionsExpanded ? "إخفاء قائمة القاعات" : "فتح قائمة القاعات"}
                    </button>
                  </div>
                  {bulkRoomOrder.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bulkRoomOrder.slice(0, 8).map((roomName) => (
                        <span
                          key={roomName}
                          className="inline-flex max-w-full rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1E3A8A]"
                        >
                          <span className="truncate">{roomName}</span>
                        </span>
                      ))}
                      {bulkRoomOrder.length > 8 ? (
                        <span className="inline-flex rounded-full bg-[#E2E8F0] px-3 py-1 text-xs font-semibold text-[#475569]">
                          +{bulkRoomOrder.length - 8} أخرى
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[#64748B]">لم يتم اختيار أي قاعة بعد.</p>
                  )}
                </div>
                <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#475569]">
                  اختر القاعات التي تريد ربطها بالمادة الامتحانية. يعتمد النظام هنا على السجل المرجعي للقاعات بدل الإدخال
                  اليدوي الحر.
                </p>
                {roomDefinitionsExpanded ? (
                  <div className="mt-3 rounded-xl border border-[#DBEAFE] bg-white p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <input
                        value={roomDefinitionsQuery}
                        onChange={(e) => setRoomDefinitionsQuery(e.target.value)}
                        placeholder="ابحث باسم القاعة"
                        className="h-11 flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-blue-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={selectAllDefinedRooms}
                          className="rounded-xl border border-[#BFDBFE] bg-white px-3 py-2 text-sm font-semibold text-[#1D4ED8]"
                        >
                          تحديد الكل
                        </button>
                        <button
                          type="button"
                          onClick={clearSelectedDefinedRooms}
                          className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-semibold text-[#475569]"
                        >
                          إلغاء التحديد
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 max-h-48 overflow-y-auto">
                      {filteredRoomDefinitions.length === 0 ? (
                        <p className="text-sm text-[#64748B]">لا توجد نتائج مطابقة لعبارة البحث.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {filteredRoomDefinitions.map((room) => {
                            const checked = selectedDefinedRooms.includes(room.room_name);
                            return (
                              <label
                                key={room.id}
                                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                  checked
                                    ? "border-[#60A5FA] bg-[#EFF6FF] text-[#1E3A8A]"
                                    : "border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:bg-white"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleDefinedRoom(room.room_name)}
                                  className="h-4 w-4"
                                />
                                <span className="min-w-0 flex-1 break-words">{room.room_name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <input type="hidden" name="capacity_morning" value="0" readOnly />
          <input type="hidden" name="capacity_evening" value="0" readOnly />
          <input type="hidden" name="capacity_morning_2" value="0" readOnly />
          <input type="hidden" name="capacity_evening_2" value="0" readOnly />
          <input type="hidden" name="room_names_bulk" value={bulkRoomOrder.join("\n")} readOnly />
          <input type="hidden" name="rooms_with_staff_json" value={roomsWithStaffJson} readOnly />
          {bulkRoomOrder.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
              بعد اختيار القاعات من القائمة أعلاه ستظهر هنا بطاقة لكل قاعة لاختيار المشرف والمراقبين والسعة.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[#0F172A]">السعة والمشرف والمراقبون لكل قاعة</p>
              {bulkRoomOrder.map((roomName, idx) => (
                <div
                  key={roomName}
                  className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 shadow-sm"
                >
                  <p className="mb-3 border-b border-[#E2E8F0] pb-2 text-sm font-extrabold text-[#0F172A]">
                    <span className="me-2 tabular-nums text-[#64748B]">{idx + 1}.</span>
                    {roomName}
                  </p>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-semibold text-[#334155]">مشرف القاعة</label>
                      {hasStaffSupervisorPick ? (
                        <>
                          <select
                            value={perRoomSupervisor[roomName] ?? ""}
                            onChange={(e) =>
                              setPerRoomSupervisor((prev) => ({ ...prev, [roomName]: e.target.value }))
                            }
                            className={stageSelectClass}
                          >
                            <option value="">— بدون / لاحقاً —</option>
                            {supervisorSelectOptionsMulti.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[10px] font-medium text-[#64748B]">من السجل المرجعي لكل قاعة على حدة.</p>
                        </>
                      ) : (
                        <input
                          value={perRoomSupervisor[roomName] ?? ""}
                          onChange={(e) =>
                            setPerRoomSupervisor((prev) => ({ ...prev, [roomName]: e.target.value }))
                          }
                          placeholder="يمكن تركه فارغًا"
                          autoComplete="off"
                          className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                    <div className="min-w-0 lg:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[#334155]">
                        المراقبون
                        <span className="ms-1 font-normal text-[#64748B]">
                          {hasStaffInvigilatorPick ? "حتى أربعة من القائمة." : "بحد أقصى 4 أسماء، افصل بفاصلة (، أو ,)."}
                        </span>
                      </label>
                      {hasStaffInvigilatorPick ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {([0, 1, 2, 3] as const).map((slotIdx) => (
                            <div key={slotIdx} className="min-w-0">
                              <label className="mb-0.5 block text-[10px] font-bold text-[#64748B]">مراقب {slotIdx + 1}</label>
                              <select
                                value={perRoomInvSlots[roomName]?.[slotIdx] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPerRoomInvSlots((prev) => {
                                    const cur = [...(prev[roomName] ?? ["", "", "", ""])] as [
                                      string,
                                      string,
                                      string,
                                      string,
                                    ];
                                    cur[slotIdx] = v;
                                    return { ...prev, [roomName]: cur };
                                  });
                                }}
                                className={stageSelectClass}
                              >
                                <option value="">— فارغ —</option>
                                {invSelectOptionsMulti.map((n) => (
                                  <option key={`${roomName}-${slotIdx}-${n}`} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <input
                          value={perRoomInvFree[roomName] ?? ""}
                          onChange={(e) =>
                            setPerRoomInvFree((prev) => ({ ...prev, [roomName]: e.target.value }))
                          }
                          placeholder="مثال: أحمد علي، محمد حسن، …"
                          autoComplete="off"
                          className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none focus:border-blue-500"
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-[#E2E8F0] pt-3">
                    <p className="mb-2 text-xs font-bold text-[#334155]">عدد الطلبة المسموح بهم — الامتحان الأول</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold leading-snug text-[#64748B]">
                          الدوام الصباحي
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={perRoomCap1[roomName]?.m ?? "0"}
                          onChange={(e) =>
                            setPerRoomCap1((prev) => ({
                              ...prev,
                              [roomName]: {
                                ...(prev[roomName] ?? { m: "0", e: "0" }),
                                m: normalizeBulkCapInput(e.target.value),
                              },
                            }))
                          }
                          className={inputNumberClass}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold leading-snug text-[#64748B]">
                          الدوام المسائي
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={perRoomCap1[roomName]?.e ?? "0"}
                          onChange={(e) =>
                            setPerRoomCap1((prev) => ({
                              ...prev,
                              [roomName]: {
                                ...(prev[roomName] ?? { m: "0", e: "0" }),
                                e: normalizeBulkCapInput(e.target.value),
                              },
                            }))
                          }
                          className={inputNumberClass}
                        />
                      </div>
                    </div>
                    {dualExam ? (
                      <>
                        <p className="mb-2 mt-3 text-xs font-bold text-[#1E3A8A]">عدد الطلبة المسموح بهم — الامتحان الثاني</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold leading-snug text-[#64748B]">
                              الدوام الصباحي (المادة الثانية)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={perRoomCap2[roomName]?.m ?? "0"}
                              onChange={(e) =>
                                setPerRoomCap2((prev) => ({
                                  ...prev,
                                  [roomName]: {
                                    ...(prev[roomName] ?? { m: "0", e: "0" }),
                                    m: normalizeBulkCapInput(e.target.value),
                                  },
                                }))
                              }
                              className={inputNumberClass}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold leading-snug text-[#64748B]">
                              الدوام المسائي (المادة الثانية)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={perRoomCap2[roomName]?.e ?? "0"}
                              onChange={(e) =>
                                setPerRoomCap2((prev) => ({
                                  ...prev,
                                  [roomName]: {
                                    ...(prev[roomName] ?? { m: "0", e: "0" }),
                                    e: normalizeBulkCapInput(e.target.value),
                                  },
                                }))
                              }
                              className={inputNumberClass}
                            />
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {bulkCapacityTotals ? (
                <div
                  className="rounded-xl border border-emerald-300/60 bg-[#ECFDF5] px-4 py-3 shadow-sm"
                  role="region"
                  aria-label="ملخص السعة على جميع القاعات"
                >
                  <p className="mb-3 text-sm font-extrabold text-[#065F46]">ملخص السعة — مجموع المقاعد على كل القاعات</p>
                  <p className="mb-2 text-[11px] font-medium text-emerald-900/85">
                    يعرض النظام مجموع ما أدخلته في بطاقات القاعات أعلاه ({bulkCapacityTotals.roomCount}{" "}
                    {bulkCapacityTotals.roomCount === 1 ? "قاعة" : "قاعات"}) للتحقق السريع قبل الحفظ.
                  </p>
                  <div className="space-y-2 rounded-lg border border-emerald-200/80 bg-white/90 px-3 py-2.5 text-sm text-[#047857]">
                    <p className="font-bold text-[#0F172A]">الامتحان الأول</p>
                    <ul className="space-y-1.5 text-[13px]">
                      <li className="flex justify-between gap-2 tabular-nums">
                        <span className="text-[#64748B]">مجموع الصباحي</span>
                        <span className="font-bold">{bulkCapacityTotals.slot1Morning}</span>
                      </li>
                      <li className="flex justify-between gap-2 tabular-nums">
                        <span className="text-[#64748B]">مجموع المسائي</span>
                        <span className="font-bold">{bulkCapacityTotals.slot1Evening}</span>
                      </li>
                      <li className="flex justify-between gap-2 border-t border-emerald-100 pt-1.5 tabular-nums">
                        <span className="font-extrabold text-[#065F46]">الإجمالي</span>
                        <span className="text-base font-extrabold text-[#047857]">{bulkCapacityTotals.slot1Total}</span>
                      </li>
                    </ul>
                  </div>
                  {dualExam ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-[#93C5FD]/80 bg-[#EFF6FF]/90 px-3 py-2.5 text-sm text-[#1E40AF]">
                      <p className="font-bold text-[#1E3A8A]">الامتحان الثاني</p>
                      <ul className="space-y-1.5 text-[13px]">
                        <li className="flex justify-between gap-2 tabular-nums">
                          <span className="text-[#64748B]">مجموع الصباحي</span>
                          <span className="font-bold">{bulkCapacityTotals.slot2Morning}</span>
                        </li>
                        <li className="flex justify-between gap-2 tabular-nums">
                          <span className="text-[#64748B]">مجموع المسائي</span>
                          <span className="font-bold">{bulkCapacityTotals.slot2Evening}</span>
                        </li>
                        <li className="flex justify-between gap-2 border-t border-blue-100 pt-1.5 tabular-nums">
                          <span className="font-extrabold text-[#1E3A8A]">الإجمالي</span>
                          <span className="text-base font-extrabold tabular-nums">{bulkCapacityTotals.slot2Total}</span>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_minmax(0,1.45fr)]">
          <input type="hidden" name="supervisor_name" value={singleSupervisorName} readOnly />
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">اسم القاعة</label>
            <select
              name="room_name"
              required
              defaultValue={(d.room_name ?? "").trim()}
              className={stageSelectClass}
            >
              <option value="">اختر القاعة المعرّفة</option>
              {singleRoomOptions.map((roomName) => (
                <option key={roomName} value={roomName}>
                  {roomName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-[#64748B]">
              تُعرض هنا القاعات المعرّفة لهذا القسم/الفرع فقط لمنع اختلاف التسمية.
            </p>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">مشرف القاعة</label>
            {hasStaffSupervisorPick ? (
              <>
                <select
                  key={`sup-${(d as Partial<CollegeExamRoomRow>).id ?? "new"}-${(d.supervisor_name ?? "").slice(0, 48)}`}
                  value={singleSupervisorName}
                  onChange={(e) => setSingleSupervisorName(e.target.value)}
                  className={stageSelectClass}
                >
                  <option value="">— بدون / لاحقاً —</option>
                  {supervisorSelectOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] font-medium leading-relaxed text-[#64748B]">
                  قائمة منسدلة من السجل المرجعي. لإظهار اسم جديد هنا أضفه من «إدارة المشرفين والمراقبين».
                </p>
              </>
            ) : (
              <input
                placeholder="يمكن تركه فارغًا وإكماله لاحقًا"
                value={singleSupervisorName}
                onChange={(e) => setSingleSupervisorName(e.target.value)}
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
              />
            )}
          </div>
          <div className="min-w-0">
            <label
              htmlFor={hasStaffInvigilatorPick ? invSlot1FieldId : invigilatorsFieldId}
              className="mb-1 block text-sm text-[#334155]"
            >
              <span className="font-semibold">المراقبون</span>
              <span className="ms-2 text-xs font-normal text-[#64748B]">
                {hasStaffInvigilatorPick ? "حتى أربعة مراقبين من القائمة." : "بحد أقصى 4 أسماء، افصل بينها بفاصلة (، أو ,)."}
              </span>
            </label>
            {hasStaffInvigilatorPick ? (
              <>
                <input type="hidden" name="invigilators" value={invigilatorsHiddenValue} readOnly />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([0, 1, 2, 3] as const).map((idx) => (
                    <div key={idx} className="min-w-0">
                      <label
                        htmlFor={idx === 0 ? invSlot1FieldId : `${invigilatorsFieldId}-slot${idx + 1}`}
                        className="mb-0.5 block text-[10px] font-bold text-[#64748B]"
                      >
                        مراقب {idx + 1}
                      </label>
                      <select
                        id={idx === 0 ? invSlot1FieldId : `${invigilatorsFieldId}-slot${idx + 1}`}
                        value={invPickSlots[idx] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInvPickSlots((prev) => {
                            const next = [...prev];
                            next[idx] = v;
                            return next;
                          });
                        }}
                        className={stageSelectClass}
                      >
                        <option value="">— فارغ —</option>
                        {invSelectOptions.map((n) => (
                          <option key={`${idx}-${n}`} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] font-medium leading-relaxed text-[#64748B]">
                  قوائم من السجل المرجعي. لإضافة أسماء جديدة استخدم نفس الصفحة المرجعية ثم أعد فتح المودال إن لزم.
                </p>
              </>
            ) : (
              <input
                id={invigilatorsFieldId}
                name="invigilators"
                placeholder="مثال: أحمد علي، محمد حسن، …"
                defaultValue={d.invigilators ?? ""}
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 outline-none focus:border-blue-500"
              />
            )}
          </div>
        </div>
      )}

      <input type="hidden" name="external_room_staff_json" value={JSON.stringify(extStaff)} readOnly />

      <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/40 px-4 py-3">
        <p className="text-sm font-bold text-amber-950">مشرف أو مراقبون من خارج تشكيل الكلية</p>
        <p className="text-xs leading-relaxed text-amber-900/85">
          إن وُجد مشرف أو مراقب من تشكيل آخر، حدّد ذلك هنا مع اسم التشكيل التابع له. أسماء المشرف والمراقبين الداخليين تُعرَف في{" "}
          {multiRoomNames ? "بطاقة كل قاعة أعلاه." : "الحقول أعلاه."}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#334155]">
          <input
            type="checkbox"
            checked={extStaff.supervisor_is_external}
            onChange={(ev) =>
              setExtStaff((prev) => ({ ...prev, supervisor_is_external: ev.target.checked }))
            }
            className="h-4 w-4 rounded border-amber-300 text-[#B45309] focus:ring-amber-400"
          />
          مشرف القاعة من خارج التشكيل
        </label>
        {extStaff.supervisor_is_external ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-[#334155]">اسم المشرف الخارجي</label>
              <input
                type="text"
                value={multiRoomNames ? externalSupervisorBatchName : singleSupervisorName}
                onChange={(ev) =>
                  multiRoomNames ? applyExternalSupervisorName(ev.target.value) : setSingleSupervisorName(ev.target.value)
                }
                placeholder={multiRoomNames ? "يُطبَّق على القاعات المختارة ويمكن تعديله لكل قاعة" : "أدخل اسم المشرف الخارجي"}
                className="h-11 w-full rounded-xl border border-amber-200/90 bg-white px-3 text-sm outline-none focus:border-amber-500"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-[#334155]">التشكيل / الكلية التابع لها المشرف</label>
              <input
                type="text"
                value={extStaff.supervisor_formation_name}
                onChange={(ev) =>
                  setExtStaff((prev) => ({ ...prev, supervisor_formation_name: ev.target.value }))
                }
                placeholder="مثال: كلية الهندسة — قسم المدني"
                className="h-11 w-full rounded-xl border border-amber-200/90 bg-white px-3 text-sm outline-none focus:border-amber-500"
              />
            </div>
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#334155]">مراقبون من خارج التشكيل</span>
            <button
              type="button"
              onClick={() =>
                setExtStaff((prev) =>
                  prev.external_invigilators.length >= MAX_EXTERNAL_INVIGILATORS
                    ? prev
                    : {
                        ...prev,
                        external_invigilators: [
                          ...prev.external_invigilators,
                          { name: "", formation_name: "" },
                        ],
                      }
                )
              }
              className="rounded-lg text-xs font-bold text-[#B45309] underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
            >
              إضافة مراقب خارجي
            </button>
          </div>
          {extStaff.external_invigilators.length === 0 ? (
            <p className="text-[11px] text-[#64748B]">لا يوجد — استخدم «إضافة» عند وجود مراقب من تشكيل آخر.</p>
          ) : (
            <ul className="space-y-2">
              {extStaff.external_invigilators.map((inv, idx) => (
                <li
                  key={idx}
                  className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white/90 p-3 sm:flex-row sm:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <label className="mb-0.5 block text-[10px] font-bold text-[#64748B]">اسم المراقب</label>
                    <input
                      type="text"
                      value={inv.name}
                      onChange={(ev) =>
                        setExtStaff((prev) => {
                          const next = [...prev.external_invigilators];
                          next[idx] = { ...next[idx]!, name: ev.target.value };
                          return { ...prev, external_invigilators: next };
                        })
                      }
                      className="h-10 w-full rounded-lg border border-[#E2E8F0] px-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-0.5 block text-[10px] font-bold text-[#64748B]">التشكيل التابع له</label>
                    <input
                      type="text"
                      value={inv.formation_name}
                      onChange={(ev) =>
                        setExtStaff((prev) => {
                          const next = [...prev.external_invigilators];
                          next[idx] = { ...next[idx]!, formation_name: ev.target.value };
                          return { ...prev, external_invigilators: next };
                        })
                      }
                      className="h-10 w-full rounded-lg border border-[#E2E8F0] px-2.5 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExtStaff((prev) => ({
                        ...prev,
                        external_invigilators: prev.external_invigilators.filter((_, i) => i !== idx),
                      }))
                    }
                    className="h-10 shrink-0 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <label className="mb-1 block text-sm font-semibold text-[#334155]">القسم / الفرع</label>
        {branchLockedToDepartment ? (
          <>
            <input type="hidden" name="college_subject_id" value={lockedBranchId ?? ""} />
            <div
              className="flex min-h-11 w-full items-center rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#334155]"
              aria-readonly
            >
              {lockedBranchMeta ? roomBranchLabel(lockedBranchMeta) : "قسم حسابك الحالي"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
              مرتبط بحساب القسم/الفرع الحالي؛ لا يُغيَّر من هذه الصفحة.
            </p>
          </>
        ) : (
          <>
            <select
              name="college_subject_id"
              value={selectedCollegeSubjectId}
              onChange={(e) => {
                setSelectedCollegeSubjectId(e.target.value);
                setExam1SubjectId("");
                setExam2SubjectId("");
              }}
              required
              className={stageSelectClass}
            >
              <option value="">اختر القسم/الفرع</option>
              <option value={COLLEGE_BRANCH_ALL_SENTINEL}>كل الكلية (اختيار من كل المواد والقاعات)</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {roomBranchLabel(branch)}
                </option>
              ))}
            </select>
            {isAllBranchesSelected ? (
              <p className="mt-1 text-[11px] leading-relaxed text-[#1E3A8A]">
                تعمل بنطاق كل الكلية: ستظهر مواد كل الفروع وكل القاعات المعرّفة، وسيتحدد الفرع تلقائيًا من المادة الدراسية المختارة عند الحفظ.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
                عند اختيار مادة مشتركة، يحدد هذا الحقل الفرع الذي تتبعه القاعة داخل الجداول والتقارير.
              </p>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <p className="text-sm font-bold text-[#0F172A]">نوع استخدام القاعة</p>
        <p className="mt-1 text-xs leading-5 text-[#64748B]">حدّد إن كانت القاعة لامتحان واحد أو لمادتين امتحانيتين في الوقت نفسه.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDualExam(false)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              !dualExam
                ? "border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            امتحان واحد
          </button>
          <button
            type="button"
            onClick={() => setDualExam(true)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              dualExam
                ? "border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A]"
                : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
            }`}
          >
            امتحانان (مادتان)
          </button>
        </div>
      </div>

      {!dualExam ? (
        <>
          <input type="hidden" name="study_subject_id_2" value="" />
          <input type="hidden" name="stage_level_2" value="" />
          <input type="hidden" name="capacity_morning_2" value="0" />
          <input type="hidden" name="capacity_evening_2" value="0" />
        </>
      ) : null}

      <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-white px-4 py-4 shadow-sm">
        <p className="text-base font-extrabold text-[#0F172A]">الامتحان الأول</p>

        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">المادة الامتحانية</label>
          <StudySubjectExamSelect
            name="study_subject_id"
            subjects={availableSubjects}
            value={exam1SubjectId}
            defaultValue={d.study_subject_id ?? ""}
            onValueChange={setExam1SubjectId}
            required
            triggerClassName="bg-[#F8FAFC]"
            placeholder={selectedCollegeSubjectId ? "اختر المادة الدراسية" : "اختر القسم/الفرع أولاً"}
          />
        </div>

        <fieldset className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/80 px-3 py-3 sm:px-4">
          <legend className="px-1 text-sm font-semibold text-[#334155]">مستوى الدراسة (الامتحان الأول)</legend>
          <div className="mt-1 flex flex-wrap gap-4 sm:gap-6">
            <label
              className={`flex items-center gap-2 text-sm text-[#0F172A] ${disableUndergradTier1 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                className="size-4 accent-[#1E3A8A] disabled:opacity-50"
                checked={tier1 === "UNDERGRAD"}
                disabled={disableUndergradTier1}
                onChange={() => {
                  setTier1("UNDERGRAD");
                  setUndergradStage1((prev) =>
                    undergradStageOptions.includes(Number(prev)) ? prev : String(firstUndergrad),
                  );
                }}
              />
              الدراسة الأولية
            </label>
            <label
              className={`flex items-center gap-2 text-sm text-[#0F172A] ${disablePostgradTier1 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                className="size-4 accent-[#1E3A8A] disabled:opacity-50"
                checked={tier1 === "POSTGRAD"}
                disabled={disablePostgradTier1}
                onChange={() => setTier1("POSTGRAD")}
              />
              الدراسات العليا
            </label>
          </div>
        </fieldset>

        <input type="hidden" name="stage_level" value={hiddenStage1} />

        <div className="min-w-0">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
          {tier1 === "UNDERGRAD" ? (
            <select required value={undergradStage1} onChange={(e) => setUndergradStage1(e.target.value)} className={stageSelectClass}>
              {undergradStageOptions.map((s) => (
                <option key={s} value={String(s)}>
                  المرحلة {s}
                </option>
              ))}
            </select>
          ) : (
            <select required value={postgradStage1} onChange={(e) => setPostgradStage1(e.target.value)} className={stageSelectClass}>
              <option value={String(POSTGRAD_STUDY_STAGE_DIPLOMA)}>دبلوم</option>
              <option value={String(POSTGRAD_STUDY_STAGE_MASTER)}>ماجستير</option>
              <option value={String(POSTGRAD_STUDY_STAGE_DOCTOR)}>دكتوراه</option>
            </select>
          )}
        </div>

        {!multiRoomNames ? (
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]/90 px-3 py-3">
            <p className="mb-2 text-sm font-bold text-[#334155]">عدد الطلبة المسموح بهم</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                  <span className="block text-sm text-[#334155]">الدوام الصباحي</span>
                  عدد الطلبة المسموح بهم (صباحي)
                </label>
                <input
                  name="capacity_morning"
                  type="number"
                  min={0}
                  required
                  defaultValue={d.capacity_morning ?? d.capacity_total ?? 0}
                  className={inputNumberClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                  <span className="block text-sm text-[#334155]">الدوام المسائي</span>
                  عدد الطلبة المسموح بهم (مسائي)
                </label>
                <input
                  name="capacity_evening"
                  type="number"
                  min={0}
                  required
                  defaultValue={d.capacity_evening ?? 0}
                  className={inputNumberClass}
                />
              </div>
            </div>

            {!disableAttendanceFields ? (
            <>
              <p className="mb-2 mt-4 text-sm font-bold text-[#334155]">الدوام الصباحي — الحضور والغياب</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">الحضور</label>
                  <input
                    name="s1_att_m"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.attendance_count ?? 0}
                    className={inputNumberClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">الغياب</label>
                  <input
                    name="s1_abs_m"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.absence_count ?? 0}
                    className={inputNumberClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#64748B]">أسماء الغياب</label>
                  <textarea
                    name="s1_names_m"
                    rows={2}
                    defaultValue={d.absence_names ?? ""}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <p className="mb-2 mt-4 text-sm font-bold text-[#92400E]">الدوام المسائي — الحضور والغياب</p>
              <div className="rounded-lg border border-[#FDE68A]/90 bg-[#FFFBEB]/80 px-2 py-2 sm:px-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">الحضور</label>
                    <input
                      name="s1_att_e"
                      type="number"
                      min={0}
                      required
                      defaultValue={0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">الغياب</label>
                    <input
                      name="s1_abs_e"
                      type="number"
                      min={0}
                      required
                      defaultValue={0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#92400E]">أسماء الغياب</label>
                    <textarea
                      name="s1_names_e"
                      rows={2}
                      defaultValue=""
                      className="w-full rounded-xl border border-[#FDE68A] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#93C5FD] bg-[#EFF6FF]/50 px-3 py-2 text-xs leading-relaxed text-[#475569]">
            عند إضافة أكثر من قاعة دفعة واحدة، يُحدَّد عدد الطلبة المسموح بهم (صباحي/مسائي) داخل{" "}
            <strong>بطاقة كل قاعة</strong> أعلاه لكل امتحان.
          </p>
        )}
      </div>

      {dualExam ? (
        <div className="space-y-4 rounded-xl border border-dashed border-[#93C5FD] bg-[#EFF6FF]/40 px-4 py-4">
          <p className="text-base font-extrabold text-[#1E3A8A]">الامتحان الثاني</p>
          <p className="text-xs leading-5 text-[#475569]">
            {multiRoomNames ? (
              <>
                نفس <strong>مشرف القاعة</strong> و<strong>المراقبون</strong> لكل قاعة؛ أدخل المادة الثانية والمرحلة أدناه، وأعداد
                الطلبة لكل قاعة في بطاقتها (قسم «الامتحان الثاني»).
              </>
            ) : (
              <>
                نفس <strong>مشرف القاعة</strong> و<strong>المراقبون</strong>؛ أدخل المادة الثانية والسعات وحضور كل دوام كما في الامتحان
                الأول.
              </>
            )}
          </p>

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المادة الامتحانية الثانية</label>
            <StudySubjectExamSelect
              name="study_subject_id_2"
              subjects={availableSubjects}
              value={exam2SubjectId}
              defaultValue={d.study_subject_id_2 ?? ""}
              onValueChange={setExam2SubjectId}
              required
              triggerClassName="bg-white"
              placeholder={selectedCollegeSubjectId ? "اختر المادة الثانية" : "اختر القسم/الفرع أولاً"}
            />
          </div>

          <fieldset className="rounded-lg border border-[#BFDBFE] bg-white/90 px-3 py-3 sm:px-4">
            <legend className="px-1 text-sm font-semibold text-[#334155]">مستوى الدراسة (الامتحان الثاني)</legend>
            <div className="mt-1 flex flex-wrap gap-4 sm:gap-6">
              <label
                className={`flex items-center gap-2 text-sm text-[#0F172A] ${disableUndergradTier2 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  className="size-4 accent-[#1E3A8A] disabled:opacity-50"
                  checked={tier2 === "UNDERGRAD"}
                  disabled={disableUndergradTier2}
                  onChange={() => {
                    setTier2("UNDERGRAD");
                    setUndergradStage2((prev) =>
                      undergradStageOptions.includes(Number(prev)) ? prev : String(firstUndergrad),
                    );
                  }}
                />
                الدراسة الأولية
              </label>
              <label
                className={`flex items-center gap-2 text-sm text-[#0F172A] ${disablePostgradTier2 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  className="size-4 accent-[#1E3A8A] disabled:opacity-50"
                  checked={tier2 === "POSTGRAD"}
                  disabled={disablePostgradTier2}
                  onChange={() => setTier2("POSTGRAD")}
                />
                الدراسات العليا
              </label>
            </div>
          </fieldset>

          <input type="hidden" name="stage_level_2" value={hiddenStage2} />

          <div className="min-w-0">
            <label className="mb-1 block text-sm font-semibold text-[#334155]">المرحلة الدراسية</label>
            {tier2 === "UNDERGRAD" ? (
              <select required value={undergradStage2} onChange={(e) => setUndergradStage2(e.target.value)} className={stageSelectClass}>
                {undergradStageOptions.map((s) => (
                  <option key={s} value={String(s)}>
                    المرحلة {s}
                  </option>
                ))}
              </select>
            ) : (
              <select required value={postgradStage2} onChange={(e) => setPostgradStage2(e.target.value)} className={stageSelectClass}>
                <option value={String(POSTGRAD_STUDY_STAGE_DIPLOMA)}>دبلوم</option>
                <option value={String(POSTGRAD_STUDY_STAGE_MASTER)}>ماجستير</option>
                <option value={String(POSTGRAD_STUDY_STAGE_DOCTOR)}>دكتوراه</option>
              </select>
            )}
          </div>

          {!multiRoomNames ? (
            <div className="rounded-lg border border-[#BFDBFE] bg-white px-3 py-3">
              <p className="mb-2 text-sm font-bold text-[#334155]">عدد الطلبة المسموح بهم</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                    <span className="block text-sm text-[#334155]">الدوام الصباحي</span>
                    عدد الطلبة المسموح بهم (صباحي)
                  </label>
                  <input
                    name="capacity_morning_2"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.capacity_morning_2 ?? 0}
                    className={inputNumberClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold leading-snug text-[#64748B]">
                    <span className="block text-sm text-[#334155]">الدوام المسائي</span>
                    عدد الطلبة المسموح بهم (مسائي)
                  </label>
                  <input
                    name="capacity_evening_2"
                    type="number"
                    min={0}
                    required
                    defaultValue={d.capacity_evening_2 ?? 0}
                    className={inputNumberClass}
                  />
                </div>
              </div>

              {!disableAttendanceFields ? (
              <>
                <p className="mb-2 mt-4 text-sm font-bold text-[#334155]">الدوام الصباحي — الحضور والغياب</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">الحضور</label>
                    <input
                      name="s2_att_m"
                      type="number"
                      min={0}
                      required
                      defaultValue={d.attendance_count_2 ?? 0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">الغياب</label>
                    <input
                      name="s2_abs_m"
                      type="number"
                      min={0}
                      required
                      defaultValue={d.absence_count_2 ?? 0}
                      className={inputNumberClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#64748B]">أسماء الغياب</label>
                    <textarea
                      name="s2_names_m"
                      rows={2}
                      defaultValue={d.absence_names_2 ?? ""}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <p className="mb-2 mt-4 text-sm font-bold text-[#92400E]">الدوام المسائي — الحضور والغياب</p>
                <div className="rounded-lg border border-[#FDE68A]/90 bg-[#FFFBEB]/80 px-2 py-2 sm:px-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">الحضور</label>
                      <input
                        name="s2_att_e"
                        type="number"
                        min={0}
                        required
                        defaultValue={0}
                        className={inputNumberClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">الغياب</label>
                      <input
                        name="s2_abs_e"
                        type="number"
                        min={0}
                        required
                        defaultValue={0}
                        className={inputNumberClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#92400E]">أسماء الغياب</label>
                      <textarea
                        name="s2_names_e"
                        rows={2}
                        defaultValue=""
                        className="w-full rounded-xl border border-[#FDE68A] bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {disableAttendanceFields ? (
        <>
          <input type="hidden" name="attendance_count" value={String(d.attendance_count ?? 0)} />
          <input type="hidden" name="absence_count" value={String(d.absence_count ?? 0)} />
          <input type="hidden" name="absence_names" value={d.absence_names ?? ""} />
          <input type="hidden" name="attendance_count_2" value={String(d.attendance_count_2 ?? 0)} />
          <input type="hidden" name="absence_count_2" value={String(d.absence_count_2 ?? 0)} />
          <input type="hidden" name="absence_names_2" value={d.absence_names_2 ?? ""} />
        </>
      ) : null}
    </>
  );
}

function RoomDefinitionsDialog({
  open,
  onClose,
  branches,
  roomDefinitions,
  fixedCollegeSubjectId,
  scopedBranchName,
}: {
  open: boolean;
  onClose: () => void;
  branches: CollegeSubjectRow[];
  roomDefinitions: CollegeRoomDefinitionRow[];
  fixedCollegeSubjectId?: string | null;
  scopedBranchName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(defineCollegeRoomDefinitionsAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lockedBranchId = fixedCollegeSubjectId?.trim() || null;
  const branchLockedToDepartment = Boolean(lockedBranchId);
  const lockedBranchMeta = useMemo(
    () => (lockedBranchId ? branches.find((b) => b.id === lockedBranchId) : undefined),
    [branches, lockedBranchId]
  );
  const [selectedCollegeSubjectId, setSelectedCollegeSubjectId] = useState(() => lockedBranchId ?? "");
  const isAllBranches = selectedCollegeSubjectId === COLLEGE_BRANCH_ALL_SENTINEL;
  const visibleDefinitions = useMemo(() => {
    if (!selectedCollegeSubjectId) return [];
    if (isAllBranches) return roomDefinitions;
    return roomDefinitions.filter((room) => room.college_subject_id === selectedCollegeSubjectId);
  }, [isAllBranches, roomDefinitions, selectedCollegeSubjectId]);
  /** في وضع «كل الكلية» نعرض ملخصًا لكل فرع لتوضيح أين سيُنسخ التعريف. */
  const definitionsPerBranchSummary = useMemo(() => {
    if (!isAllBranches) return null;
    const byBranch = new Map<string, { branchName: string; count: number }>();
    for (const room of roomDefinitions) {
      const key = room.college_subject_id;
      const cur = byBranch.get(key);
      if (cur) cur.count += 1;
      else byBranch.set(key, { branchName: room.college_subject_name, count: 1 });
    }
    return [...byBranch.values()].sort((a, b) => a.branchName.localeCompare(b.branchName, "ar"));
  }, [isAllBranches, roomDefinitions]);
  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(92vw,880px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      dir="rtl"
    >
      <form action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">تعريف القاعات</h2>
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
          <label className="mb-1 block text-sm font-semibold text-[#334155]">القسم / الفرع</label>
          {branchLockedToDepartment ? (
            <>
              <input type="hidden" name="college_subject_id" value={lockedBranchId ?? ""} />
              <div className="flex min-h-11 w-full items-center rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#334155]">
                {lockedBranchMeta ? roomBranchLabel(lockedBranchMeta) : (scopedBranchName ?? "قسم حسابك الحالي")}
              </div>
            </>
          ) : (
            <>
              <select
                name="college_subject_id"
                value={selectedCollegeSubjectId}
                onChange={(e) => setSelectedCollegeSubjectId(e.target.value)}
                required
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 outline-none focus:border-blue-500"
              >
                <option value="">اختر القسم/الفرع</option>
                <option value={COLLEGE_BRANCH_ALL_SENTINEL}>كل الكلية (تعميم على جميع الأقسام/الفروع)</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {roomBranchLabel(branch)}
                  </option>
                ))}
              </select>
              {isAllBranches ? (
                <p className="mt-1 text-[11px] leading-relaxed text-[#1E3A8A]">
                  سيُنسخ كل اسم قاعة تكتبه هنا تلقائيًا إلى كل قسم/فرع من أقسام الكلية ({branches.length} قسم/فرع).
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]/80 px-4 py-3">
          <label className="mb-1 block text-sm font-semibold text-[#1E3A8A]">أسماء القاعات (سطر لكل قاعة)</label>
          <textarea
            name="room_names_bulk"
            rows={10}
            placeholder={"قاعة 1\nقاعة 2\nقاعة 3\nمختبر الحاسوب"}
            className="min-h-[12rem] w-full resize-y rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#475569]">
            عرّف جميع قاعات هذا القسم/الفرع مرة واحدة هنا. سيُوحِّد النظام الصيغ المتقاربة مثل{" "}
            <span className="font-bold">قاعة 1</span> و<span className="font-bold">قاعة رقم 1</span> و
            <span className="font-bold"> ق 1</span> ويمنع تكرارها في السجل المرجعي.
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-bold text-[#0F172A]">القاعات المعرّفة حاليًا</p>
          {!selectedCollegeSubjectId ? (
            <p className="mt-2 text-sm text-[#64748B]">اختر القسم/الفرع لعرض القاعات المعرّفة الحالية.</p>
          ) : isAllBranches ? (
            <>
              <p className="mt-1 text-xs text-[#64748B]">
                إجمالي السجلات في كل الكلية:{" "}
                <span className="font-bold tabular-nums text-[#0F172A]">{visibleDefinitions.length}</span>
              </p>
              {definitionsPerBranchSummary && definitionsPerBranchSummary.length > 0 ? (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {definitionsPerBranchSummary.map((b) => (
                      <div
                        key={b.branchName}
                        className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#334155]"
                      >
                        <span className="truncate">{b.branchName}</span>
                        <span className="ms-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-bold text-[#1E3A8A]">
                          {b.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#64748B]">لا توجد قاعات معرّفة بعد في أيٍّ من الفروع.</p>
              )}
            </>
          ) : visibleDefinitions.length === 0 ? (
            <p className="mt-2 text-sm text-[#64748B]">لا توجد قاعات معرّفة بعد لهذا القسم/الفرع.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#64748B]">
                العدد الحالي: <span className="font-bold tabular-nums text-[#0F172A]">{visibleDefinitions.length}</span>
              </p>
              <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleDefinitions.map((room) => (
                    <div key={room.id} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#334155]">
                      {room.room_name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {state ? (
          <p className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ تعريف القاعات" />
        </div>
      </form>
    </dialog>
  );
}

function AddRoomDialog({
  open,
  onClose,
  branches,
  subjects,
  collegeLabel,
  roomDefinitions,
  fixedCollegeSubjectId,
  scopedBranchName,
  staffRegistryPicklist,
}: {
  open: boolean;
  onClose: () => void;
  branches: CollegeSubjectRow[];
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
  roomDefinitions: CollegeRoomDefinitionRow[];
  fixedCollegeSubjectId?: string | null;
  scopedBranchName?: string | null;
  staffRegistryPicklist?: StaffRegistryNamePicklist | null;
}) {
  const [state, formAction, pending] = useActionState(createCollegeExamRoomAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(96vw,1180px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      dir="rtl"
    >
      <form action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">إضافة قاعة جديدة</h2>
        <RoomFields
          branches={branches}
          subjects={subjects}
          collegeLabel={collegeLabel}
          roomDefinitions={roomDefinitions}
          fixedCollegeSubjectId={fixedCollegeSubjectId}
          scopedBranchName={scopedBranchName}
          showSerial={false}
          disableAttendanceFields
          staffRegistryPicklist={staffRegistryPicklist ?? null}
          multiRoomNames
        />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ القاعة أو القاعات" />
        </div>
      </form>
    </dialog>
  );
}

function EditRoomDialog({
  open,
  onClose,
  branches,
  subjects,
  collegeLabel,
  roomDefinitions,
  fixedCollegeSubjectId,
  scopedBranchName,
  staffRegistryPicklist,
  row,
}: {
  open: boolean;
  onClose: () => void;
  branches: CollegeSubjectRow[];
  subjects: CollegeStudySubjectRow[];
  collegeLabel: string;
  roomDefinitions: CollegeRoomDefinitionRow[];
  fixedCollegeSubjectId?: string | null;
  scopedBranchName?: string | null;
  staffRegistryPicklist?: StaffRegistryNamePicklist | null;
  row: CollegeExamRoomRow | null;
}) {
  const [state, formAction, pending] = useActionState(updateCollegeExamRoomAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const key = useMemo(() => `${row?.id ?? "none"}-${open ? "open" : "closed"}`, [row?.id, open]);
  useEffect(() => {
    if (!dialogRef.current) return;
    if (open && !dialogRef.current.open) dialogRef.current.showModal();
    if (!open && dialogRef.current.open) dialogRef.current.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto box-border h-fit max-h-[min(90vh,100dvh)] w-[min(96vw,1180px)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-0 shadow-xl"
      dir="rtl"
    >
      <form key={key} action={formAction} className="w-full space-y-4 p-6">
        <h2 className="text-xl font-bold text-[#0F172A]">تعديل القاعة</h2>
        <input type="hidden" name="id" value={row?.id ?? ""} />
        <input type="hidden" name="serial_no" value={row?.serial_no ?? ""} />
        <RoomFields
          branches={branches}
          subjects={subjects}
          collegeLabel={collegeLabel}
          roomDefinitions={roomDefinitions}
          fixedCollegeSubjectId={fixedCollegeSubjectId}
          scopedBranchName={scopedBranchName}
          defaults={row ?? undefined}
          showSerial={false}
          disableAttendanceFields
          staffRegistryPicklist={staffRegistryPicklist ?? null}
        />
        {state && !state.ok ? <p className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="rounded-xl border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B]" onClick={onClose}>
            إلغاء
          </button>
          <SubmitButton pending={pending} label="حفظ التعديلات" />
        </div>
      </form>
    </dialog>
  );
}

function DeleteRoomForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteCollegeExamRoomAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="block w-full rounded-lg px-3 py-2 text-right text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        حذف
      </button>
      {state && !state.ok ? <p className="mt-1 px-3 text-xs text-red-600">{state.message}</p> : null}
    </form>
  );
}

function MultiRoomSubjectHint({
  slotLabel,
  agg,
  roomIndex,
}: {
  slotLabel: "الامتحان الأول" | "الامتحان الثاني";
  agg: SubjectMultiRoomAggregate;
  roomIndex: number;
}) {
  return (
    <div className="mt-1.5 rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] px-2 py-1.5 text-[10px] leading-relaxed text-[#312E81]">
      <p className="font-bold text-[#1E1B4B]">
        توزيع {slotLabel} على عدة قاعات — القاعة {roomIndex} من {agg.roomCount}
      </p>
      <p className="mt-1 text-[#4338CA]">
        جميع هذه القاعات لمادة واحدة؛ الأعداد أدناه هي <span className="font-semibold">حصة هذه القاعة فقط</span>، أما{" "}
        <span className="font-semibold">المجموع الكلي للمادة</span> عند جمع القاعات: سعة إجمالية{" "}
        <strong className="tabular-nums">{agg.totalCapacity}</strong> (صباحي {agg.totalMorning} + مسائي {agg.totalEvening})،
        حضور <strong className="tabular-nums">{agg.totalAttendance}</strong>، غياب{" "}
        <strong className="tabular-nums">{agg.totalAbsence}</strong>.
      </p>
    </div>
  );
}

function SubjectsCell({
  row,
  aggregateSlot1,
  aggregateSlot2,
}: {
  row: CollegeExamRoomRow;
  aggregateSlot1?: SubjectMultiRoomAggregate;
  aggregateSlot2?: SubjectMultiRoomAggregate;
}) {
  const dual = Boolean(row.study_subject_id_2);
  const idx1 = aggregateSlot1 ? roomIndexInSubjectDistribution(aggregateSlot1, row.id) : 0;
  const idx2 = aggregateSlot2 ? roomIndexInSubjectDistribution(aggregateSlot2, row.id) : 0;
  return (
    <div className="min-w-0 space-y-0.5 break-words text-[11px] leading-snug text-[#334155]">
      <div className="flex flex-wrap items-center gap-1">
        <div className="font-semibold text-[#0F172A]">{row.study_subject_name}</div>
        {aggregateSlot1 ? (
          <span className="inline-flex shrink-0 rounded-full bg-[#4F46E5] px-1.5 py-0.5 text-[9px] font-bold text-white">
            جزء من توزيع ({idx1}/{aggregateSlot1.roomCount})
          </span>
        ) : null}
      </div>
      <RoomStageTableLines level={row.stage_level ?? 1} />
      {aggregateSlot1 ? <MultiRoomSubjectHint slotLabel="الامتحان الأول" agg={aggregateSlot1} roomIndex={idx1} /> : null}
      {dual && row.study_subject_name_2 ? (
        <div className="border-t border-[#E2E8F0] pt-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <div className="font-semibold text-[#0F172A]">{row.study_subject_name_2}</div>
            {aggregateSlot2 ? (
              <span className="inline-flex shrink-0 rounded-full bg-[#4F46E5] px-1.5 py-0.5 text-[9px] font-bold text-white">
                جزء من توزيع ({idx2}/{aggregateSlot2.roomCount})
              </span>
            ) : null}
          </div>
          <RoomStageTableLines level={row.stage_level_2 ?? 1} />
          {aggregateSlot2 ? <MultiRoomSubjectHint slotLabel="الامتحان الثاني" agg={aggregateSlot2} roomIndex={idx2} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function RowDetailHint({
  row,
  hints,
  aggregateSlot1,
  aggregateSlot2,
}: {
  row: CollegeExamRoomRow;
  hints: CollegeRoomScheduleHint[];
  aggregateSlot1?: SubjectMultiRoomAggregate;
  aggregateSlot2?: SubjectMultiRoomAggregate;
}) {
  const dual = Boolean(row.study_subject_id_2);
  const idx1 = aggregateSlot1 ? roomIndexInSubjectDistribution(aggregateSlot1, row.id) : 0;
  const idx2 = aggregateSlot2 ? roomIndexInSubjectDistribution(aggregateSlot2, row.id) : 0;
  const invigilatorsRaw = String(row.invigilators ?? "").trim()
    ? row.invigilators
    : String(row.invigilators_2 ?? "").trim()
      ? (row.invigilators_2 ?? "")
      : "";
  const invigilatorsNames = splitNameList(invigilatorsRaw);

  return (
    <div className="space-y-3 text-sm leading-6 text-[#334155]">
      <p>
        <span className="font-bold text-[#0F172A]">{row.room_name}</span>
        {dual ? (
          <span className="ms-2 rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1D4ED8]">قاعة بامتحانين</span>
        ) : null}
      </p>
      {aggregateSlot1 ? (
        <p className="rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] px-3 py-2 text-xs leading-relaxed text-[#312E81]">
          <strong>توزيع المادة على عدة قاعات:</strong> هذه القاعة {idx1} من {aggregateSlot1.roomCount} لمادة «
          {aggregateSlot1.subjectName}». المجموع الكلي للمادة على كل القاعات: سعة {aggregateSlot1.totalCapacity} (ص{" "}
          {aggregateSlot1.totalMorning} + م {aggregateSlot1.totalEvening})، حضور {aggregateSlot1.totalAttendance}، غياب{" "}
          {aggregateSlot1.totalAbsence}.
        </p>
      ) : null}
      <ul className="list-disc space-y-1 pe-4">
        <li>
          الامتحان 1: <strong>{row.study_subject_name}</strong> —{" "}
          {isPostgraduateStudyStageLevel(row.stage_level ?? 1)
            ? formatCollegeStudyLevelTierLabel(row.stage_level ?? 1)
            : `${formatCollegeStudyLevelTierLabel(row.stage_level ?? 1)}، ${formatCollegeStudyStageLabel(row.stage_level ?? 1)}`}{" "}
          — سعة {shiftCapacityLabel(row, 1)}
          {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
          <span className="ms-1 text-[11px] text-[#475569]">
            — التدريسي:{" "}
            <span className="font-semibold text-[#334155]">
              {row.study_subject_instructor_name.trim() ? row.study_subject_instructor_name.trim() : "—"}
            </span>
          </span>
        </li>
        {dual && row.study_subject_name_2 ? (
          <li>
            الامتحان 2: <strong>{row.study_subject_name_2}</strong>
            {" — "}
            {isPostgraduateStudyStageLevel(row.stage_level_2 ?? 1)
              ? formatCollegeStudyLevelTierLabel(row.stage_level_2 ?? 1)
              : `${formatCollegeStudyLevelTierLabel(row.stage_level_2 ?? 1)}، ${formatCollegeStudyStageLabel(row.stage_level_2 ?? 1)}`}{" "}
            — سعة {shiftCapacityLabel(row, 2)}
            {row.supervisor_name ? ` — مشرف: ${row.supervisor_name}` : null}
            <span className="ms-1 text-[11px] text-[#475569]">
              — التدريسي:{" "}
              <span className="font-semibold text-[#334155]">
                {row.study_subject_instructor_name_2?.trim() ? row.study_subject_instructor_name_2.trim() : "—"}
              </span>
            </span>
          </li>
        ) : null}
        <li>
          المراقبون:{" "}
          {invigilatorsNames.length > 0 ? (
            <span className="font-semibold text-[#334155]">{invigilatorsNames.join("، ")}</span>
          ) : (
            <span className="text-[#94A3B8]">—</span>
          )}
          {row.external_room_staff.external_invigilators.length > 0 ? (
            <span className="mt-1 block text-xs text-amber-900">
              مراقبون خارج التشكيل:{" "}
              {row.external_room_staff.external_invigilators
                .map((x) => `${x.name}${x.formation_name.trim() ? ` (${x.formation_name.trim()})` : ""}`)
                .join("؛ ")}
            </span>
          ) : null}
        </li>
        {row.external_room_staff.supervisor_is_external && row.external_room_staff.supervisor_formation_name.trim() ? (
          <li className="text-xs text-amber-900">
            مشرف القاعة خارج التشكيل — التشكيل: {row.external_room_staff.supervisor_formation_name.trim()}
          </li>
        ) : null}
      </ul>
      {aggregateSlot2 ? (
        <p className="rounded-lg border border-[#C4B5FD] bg-[#F5F3FF] px-3 py-2 text-xs leading-relaxed text-[#4C1D95]">
          <strong>توزيع الامتحان الثاني على عدة قاعات:</strong> هذه القاعة {idx2} من {aggregateSlot2.roomCount}. المجموع الكلي
          على كل القاعات: سعة {aggregateSlot2.totalCapacity} (ص {aggregateSlot2.totalMorning} + م{" "}
          {aggregateSlot2.totalEvening})، حضور {aggregateSlot2.totalAttendance}، غياب {aggregateSlot2.totalAbsence}.
        </p>
      ) : null}
      {hints.length > 0 ? (
        <div>
          <p className="mb-1 font-semibold text-[#0F172A]">مواعيد مرتبطة بالجدول (حسب ما أُدخل في «الجداول الامتحانية»):</p>
          <ul className="space-y-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
            {hints.map((h, i) => (
              <li key={`${h.exam_date}-${h.start_time}-${i}`} className="text-xs sm:text-sm">
                {h.exam_date} — {h.meal_slot_label} — {h.start_time}–{h.end_time} — <strong>{h.study_subject_name}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-[#64748B]">لا توجد جداول امتحانية مربوطة بهذه القاعة بعد. بعد تعريف المواد، أنشئ الجدولين بنفس القاعة والتاريخ والوقت ليظهران هنا.</p>
      )}
    </div>
  );
}

export function RoomsManagementPanel({
  branches,
  rows,
  studySubjects,
  scheduleHintsByRoom,
  roomDefinitions,
  collegeLabel,
  fixedCollegeSubjectId = null,
  scopedBranchName = null,
  staffRegistryPicklist = null,
}: {
  branches: CollegeSubjectRow[];
  rows: CollegeExamRoomRow[];
  studySubjects: CollegeStudySubjectRow[];
  scheduleHintsByRoom: Record<string, CollegeRoomScheduleHint[]>;
  roomDefinitions: CollegeRoomDefinitionRow[];
  collegeLabel: string;
  fixedCollegeSubjectId?: string | null;
  scopedBranchName?: string | null;
  /** يُمرَّر من بوابة القسم فقط — أسماء من سجل المشرفين والمراقبين */
  staffRegistryPicklist?: StaffRegistryNamePicklist | null;
}) {
  const portalBase = useCollegePortalBasePath();
  const hideAddRoomButton = portalBase === "/dashboard/college";
  const hideEditDeleteRoomActions = portalBase === "/dashboard/college";
  const [addOpen, setAddOpen] = useState(false);
  const [definitionsOpen, setDefinitionsOpen] = useState(false);
  /** إعادة تركيب مودال الإضافة عند كل فتح حتى تُصفَّر حالة useActionState ولا يبقى ok: true من الجلسة السابقة */
  const [addDialogKey, setAddDialogKey] = useState(0);
  const [definitionsDialogKey, setDefinitionsDialogKey] = useState(0);
  const [editDialogKey, setEditDialogKey] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [editingRow, setEditingRow] = useState<CollegeExamRoomRow | null>(null);
  const closeAddDialog = useCallback(() => setAddOpen(false), []);
  const closeDefinitionsDialog = useCallback(() => setDefinitionsOpen(false), []);
  const closeEditDialog = useCallback(() => setEditingRow(null), []);
  const openDefinitionsDialog = useCallback(() => {
    setDefinitionsDialogKey((k) => k + 1);
    setDefinitionsOpen(true);
  }, []);
  const openAddDialog = useCallback(() => {
    setAddDialogKey((k) => k + 1);
    setAddOpen(true);
  }, []);
  useCollegeQuickActionsRegister({ openAddRoom: openAddDialog }, [openAddDialog]);
  useCollegeQuickUrlTrigger("room", openAddDialog);
  /** تفاصيل القاعة مثبتة أسفل الشاشة حتى يغلقها المستخدم */
  const [pinnedDetailRowId, setPinnedDetailRowId] = useState<string | null>(null);
  const [reportRow, setReportRow] = useState<CollegeExamRoomRow | null>(null);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  /** فلترة: فارغ = كل القاعات */
  const [filterRoomId, setFilterRoomId] = useState("");
  /** فلترة: فارغ = كل المواد */
  const [filterSubjectId, setFilterSubjectId] = useState("");
  /** فلترة: فارغ = كل المراحل (قيمة نصية لرقم المرحلة كما في قاعدة البيانات) */
  const [filterStageLevel, setFilterStageLevel] = useState("");
  const roomSearchFieldId = useId();

  const roomFilterOptions = useMemo(
    () =>
      [...rows]
        .sort((a, b) =>
          a.serial_no !== b.serial_no ? a.serial_no - b.serial_no : String(a.id).localeCompare(String(b.id), "ar"),
        )
        .map((r) => ({ id: r.id, label: `${r.serial_no}. ${r.room_name}` })),
    [rows],
  );

  const subjectFilterOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (!m.has(r.study_subject_id)) m.set(r.study_subject_id, r.study_subject_name);
      if (r.study_subject_id_2 && !m.has(r.study_subject_id_2)) {
        m.set(r.study_subject_id_2, r.study_subject_name_2 ?? "");
      }
    }
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows]);

  const stageFilterOptions = useMemo(() => {
    const levels = new Set<number>();
    for (const r of rows) {
      levels.add(Number(r.stage_level));
      if (r.stage_level_2 != null) levels.add(Number(r.stage_level_2));
    }
    return [...levels]
      .sort((a, b) => a - b)
      .map((lv) => ({ value: String(lv), label: roomStageExportLabel(lv) }));
  }, [rows]);

  const displayRows = useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();
    const stageN = filterStageLevel === "" ? null : Number(filterStageLevel);
    return rows.filter((r) => {
      if (filterRoomId && r.id !== filterRoomId) return false;
      if (filterSubjectId && r.study_subject_id !== filterSubjectId && r.study_subject_id_2 !== filterSubjectId) {
        return false;
      }
      if (stageN != null && Number.isFinite(stageN)) {
        const m1 = Number(r.stage_level);
        const m2 = r.stage_level_2 != null ? Number(r.stage_level_2) : NaN;
        if (m1 !== stageN && m2 !== stageN) return false;
      }
      if (q && !buildRoomRowSearchHaystack(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, roomSearchQuery, filterRoomId, filterSubjectId, filterStageLevel]);

  const clearRoomTableFilters = useCallback(() => {
    setRoomSearchQuery("");
    setFilterRoomId("");
    setFilterSubjectId("");
    setFilterStageLevel("");
  }, []);

  useEffect(() => {
    if (filterRoomId && !rows.some((r) => r.id === filterRoomId)) setFilterRoomId("");
  }, [rows, filterRoomId]);

  useEffect(() => {
    if (!filterSubjectId) return;
    const ok = rows.some(
      (r) => r.study_subject_id === filterSubjectId || r.study_subject_id_2 === filterSubjectId,
    );
    if (!ok) setFilterSubjectId("");
  }, [rows, filterSubjectId]);

  useEffect(() => {
    if (filterStageLevel === "") return;
    const n = Number(filterStageLevel);
    if (!Number.isFinite(n)) {
      setFilterStageLevel("");
      return;
    }
    const ok = rows.some((r) => r.stage_level === n || r.stage_level_2 === n);
    if (!ok) setFilterStageLevel("");
  }, [rows, filterStageLevel]);

  useEffect(() => {
    if (!pinnedDetailRowId) return;
    if (!displayRows.some((r) => r.id === pinnedDetailRowId)) {
      setPinnedDetailRowId(null);
    }
  }, [pinnedDetailRowId, displayRows]);

  const stats = useMemo(() => {
    const totalRooms = rows.length;
    /** مواد امتحانية فعلية: معرفات فريدة مستخدمة في قاعات (الأولى أو الثانية)، لا إجمالي قائمة المواد في النظام. */
    const linkedSubjectIds = new Set<string>();
    for (const r of rows) {
      linkedSubjectIds.add(r.study_subject_id);
      if (r.study_subject_id_2) linkedSubjectIds.add(r.study_subject_id_2);
    }
    const distinctExamSubjectsInRooms = linkedSubjectIds.size;
    const totalAttendanceSeats = rows.reduce((a, r) => a + r.attendance_count + r.attendance_count_2, 0);
    const totalAbsenceSeats = rows.reduce((a, r) => a + r.absence_count + r.absence_count_2, 0);
    const singleExamRooms = rows.filter((r) => !r.study_subject_id_2).length;
    const doubleExamRooms = rows.filter((r) => Boolean(r.study_subject_id_2)).length;
    const totalCapacityFromShifts = rows.reduce((a, r) => {
      const slot1 = r.capacity_morning + r.capacity_evening;
      const slot2 = r.study_subject_id_2 ? r.capacity_morning_2 + r.capacity_evening_2 : 0;
      return a + slot1 + slot2;
    }, 0);
    const subjectIdRoomSlots = new Map<string, number>();
    for (const r of rows) {
      const bump = (sid: string) => subjectIdRoomSlots.set(sid, (subjectIdRoomSlots.get(sid) ?? 0) + 1);
      bump(r.study_subject_id);
      if (r.study_subject_id_2) bump(r.study_subject_id_2);
    }
    const subjectsSpreadAcrossMultipleRooms = [...subjectIdRoomSlots.values()].filter((c) => c > 1).length;
    return {
      totalRooms,
      distinctExamSubjectsInRooms,
      totalAttendanceSeats,
      totalAbsenceSeats,
      singleExamRooms,
      doubleExamRooms,
      totalCapacityFromShifts,
      subjectsSpreadAcrossMultipleRooms,
    };
  }, [rows]);

  const multiRoomAggSlot1 = useMemo(() => buildSubjectMultiRoomAggregates(rows, 1), [rows]);
  const multiRoomAggSlot2 = useMemo(() => buildSubjectMultiRoomAggregates(rows, 2), [rows]);

  const pinnedDetailRow = pinnedDetailRowId ? rows.find((r) => r.id === pinnedDetailRowId) : null;
  const menuRow = menuId ? rows.find((r) => r.id === menuId) : undefined;

  const closeActionsMenu = useCallback(() => {
    setMenuId(null);
    setMenuCoords(null);
  }, []);

  const refreshMenuPosition = useCallback(() => {
    const btn = menuButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuMinW = 192;
    const pad = 8;
    let left = rect.left;
    if (left + menuMinW > window.innerWidth - pad) left = window.innerWidth - menuMinW - pad;
    if (left < pad) left = pad;
    setMenuCoords({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuId) {
      setMenuCoords(null);
      return;
    }
    refreshMenuPosition();
    window.addEventListener("resize", refreshMenuPosition);
    window.addEventListener("scroll", refreshMenuPosition, true);
    return () => {
      window.removeEventListener("resize", refreshMenuPosition);
      window.removeEventListener("scroll", refreshMenuPosition, true);
    };
  }, [menuId, refreshMenuPosition]);

  useEffect(() => {
    if (!menuId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuPanelRef.current?.contains(t)) return;
      if (menuButtonRef.current?.contains(t)) return;
      closeActionsMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuId, closeActionsMenu]);

  const exportPdfReport = useCallback(() => {
    let generatedLabel: string;
    try {
      generatedLabel = new Date().toLocaleString("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "full",
        timeStyle: "short",
      });
    } catch {
      generatedLabel = new Date().toISOString();
    }
    const html = buildCollegeExamRoomsReportHtml({
      rows,
      stats,
      scheduleHintsByRoom,
      collegeLabel,
      generatedLabel,
    });
    if (!printCollegeExamRoomsReportHtml(html)) {
      window.alert(
        "تعذر فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع، ثم اختر «حفظ كـ PDF» من نافذة الطباعة."
      );
    }
  }, [rows, stats, scheduleHintsByRoom, collegeLabel]);

  const exportExcel = useCallback(async () => {
    try {
      const xlsx = await import("xlsx");
      const sorted = [...rows].sort((a, b) => {
        if (a.serial_no !== b.serial_no) return a.serial_no - b.serial_no;
        return String(a.id).localeCompare(String(b.id));
      });
      const df = new Intl.DateTimeFormat("ar-IQ", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
        timeStyle: "short",
      });
      const data = sorted.map((r) => {
        const dual = Boolean(r.study_subject_id_2);
        const hints = scheduleHintsByRoom[r.id] ?? [];
        const hintsText =
          hints.length === 0
            ? ""
            : hints
                .map((h) => `${h.exam_date} ${h.meal_slot_label} ${h.start_time}-${h.end_time} (${h.study_subject_name})`)
                .join("؛ ");
        const { supervisorLine, invigilatorsLine } = formatExternalStaffPlainTextForExport(
          r.supervisor_name,
          r.invigilators,
          r.external_room_staff
        );
        return {
          الكلية: collegeLabel,
          التسلسل: r.serial_no,
          "اسم القاعة": r.room_name,
          "مشرف القاعة": supervisorLine,
          المراقبون: invigilatorsLine,
          "المادة الامتحانية الأولى": r.study_subject_name,
          "المرحلة (الامتحان الأول)": roomStageExportLabel(r.stage_level ?? 1),
          "المادة الامتحانية الثانية": r.study_subject_name_2 || "",
          "المرحلة (الامتحان الثاني)": dual ? roomStageExportLabel(Number(r.stage_level_2 ?? 1)) : "",
          "نوع القاعة": dual ? "مزدوجة" : "منفردة",
          "سعة الامتحان الأول (ملخص)": shiftCapacityLabel(r, 1),
          "صباحي 1": r.capacity_morning,
          "مسائي 1": r.capacity_evening,
          "إجمالي سعة 1": r.capacity_total,
          "صباحي 2": dual ? r.capacity_morning_2 : "",
          "مسائي 2": dual ? r.capacity_evening_2 : "",
          "إجمالي سعة 2": dual ? r.capacity_total_2 : "",
          "حضور (امتحان 1)": r.attendance_count,
          "حضور (امتحان 2)": r.attendance_count_2,
          "غياب (امتحان 1)": r.absence_count,
          "غياب (امتحان 2)": r.absence_count_2,
          "أسماء الغياب 1": r.absence_names,
          "أسماء الغياب 2": r.absence_names_2,
          "مواعيد الجداول المرتبطة": hintsText,
          "تاريخ الإضافة": df.format(new Date(r.created_at)),
          "آخر تحديث": df.format(new Date(r.updated_at)),
        };
      });
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "القاعات");
      xlsx.writeFile(wb, "college-exam-rooms.xlsx");
    } catch {
      window.alert("تعذر تصدير ملف Excel. أعد المحاولة.");
    }
  }, [rows, collegeLabel, scheduleHintsByRoom]);

  return (
    <section className={`relative space-y-6 ${pinnedDetailRowId ? "pb-[min(13.5rem,24vh)]" : ""}`} dir="rtl">
      <header className="relative overflow-hidden rounded-[22px] border border-[#E8EEF7] bg-white px-6 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg, #1E3A8A 0%, #2563EB 55%, #38BDF8 100%)" }}
          aria-hidden
        />
        <h1 className="text-3xl font-extrabold text-[#0F172A]">إدارة القاعات</h1>
        <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
          تعريف القاعات وربطها بمادة أو مادتين امتحانيتين في النافذة الزمنية نفسها، مع توزيع الطلبة صباحي/مسائي لكل امتحان. يمكنك
          إضافة أكثر من قاعة لنفس المادة الدراسية لتوزيع الطلبة بينها؛ يُحسب الحضور والغياب لكل قاعة ثم يُجمَع في التقارير.
        </p>
      </header>

      <div className="min-w-0 overflow-x-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f3578] bg-[#274092] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {!hideAddRoomButton ? (
              <>
                <button
                  type="button"
                  onClick={openDefinitionsDialog}
                  className="rounded-xl bg-[#DBEAFE] px-4 py-2 text-sm font-bold text-[#1D4ED8] shadow-sm ring-1 ring-white/40 transition hover:bg-[#BFDBFE]"
                >
                  تعريف القاعات
                </button>
                <button
                  type="button"
                  onClick={openAddDialog}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#274092] shadow-sm ring-1 ring-white/60 transition hover:bg-white/95"
                >
                  إضافة قاعة
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void exportExcel()}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تصدير Excel
            </button>
            <button
              type="button"
              onClick={exportPdfReport}
              className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-[2px] transition hover:border-white/60 hover:bg-white/20"
            >
              تقرير PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[#E2E8F0] bg-white px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد القاعات الكلية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalRooms}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs font-semibold text-[#64748B]">عدد المواد الامتحانية</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.distinctExamSubjectsInRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">معرّفات مواد فريدة ظاهرة في القاعات (قد تتكرر المادة على عدة قاعات)</p>
          </div>
          <div className="rounded-2xl border border-[#DCFCE7] bg-[#F0FDF4] px-4 py-3">
            <p className="text-xs font-semibold text-[#166534]">عدد الامتحانات المنفردة</p>
            <p className="mt-1 text-2xl font-extrabold text-[#15803D]">{stats.singleExamRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#15803D]/85">قاعات بمادة امتحانية واحدة</p>
          </div>
          <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
            <p className="text-xs font-semibold text-[#92400E]">عدد الامتحانات المزدوجة</p>
            <p className="mt-1 text-2xl font-extrabold text-[#B45309]">{stats.doubleExamRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#B45309]/85">قاعات بمادتين في الوقت نفسه</p>
          </div>
          <div className="rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-3">
            <p className="text-xs font-semibold text-[#3730A3]">مواد موزّعة على عدة قاعات</p>
            <p className="mt-1 text-2xl font-extrabold text-[#4338CA]">{stats.subjectsSpreadAcrossMultipleRooms}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#3730A3]/85">عدد المواد التي لها أكثر من قاعة بنفس التعريف</p>
          </div>
          <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 sm:col-span-2 lg:col-span-2">
            <p className="text-xs font-semibold text-[#1E40AF]">عدد المقاعد الامتحانية الكلي</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1D4ED8]">{stats.totalCapacityFromShifts}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#1E40AF]/85">مجموع أعمدة السعة الصباحي والمسائي لجميع القاعات والامتحانين إن وُجدا</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد المقاعد الامتحانية (حضور)</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalAttendanceSeats}</p>
          </div>
          <div className="rounded-2xl border border-[#E5ECF6] bg-[#F8FAFC] px-4 py-3">
            <p className="text-xs text-[#64748B]">عدد المقاعد الغياب</p>
            <p className="mt-1 text-2xl font-extrabold text-[#1E3A8A]">{stats.totalAbsenceSeats}</p>
          </div>
        </div>

        <p className="border-b border-[#E2E8F0] bg-[#FFFBEB] px-5 py-2 text-sm text-[#92400E]">
          <strong>تلميح:</strong> اضغط على صف في الجدول لعرض التفاصيل في الشريط السفلي الثابت؛ يمكن إغلاقها بالزر «إغلاق التفاصيل». عندما تُعرَّف{" "}
          <strong>أكثر من قاعة لنفس المادة الامتحانية</strong>، يظهر في عمود «المادة والمرحلة» إجمالي السعة والحضور والغياب لجميع القاعات
          المرتبطة بتلك المادة، مع توضيح أن أعمدة السعة والحضور في الصف تمثّل <strong>هذه القاعة فقط</strong>.
        </p>

        <div className="space-y-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
          <p className="text-xs font-bold text-[#334155]">تصفية القاعات والبحث</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="min-w-0 flex-1 lg:min-w-[14rem]">
              <label htmlFor={roomSearchFieldId} className="mb-1 block text-xs font-bold text-[#334155]">
                بحث نصي
              </label>
              <input
                id={roomSearchFieldId}
                type="search"
                value={roomSearchQuery}
                onChange={(e) => setRoomSearchQuery(e.target.value)}
                placeholder="قاعة، مادة، مشرف، مراقب، تدريسي…"
                className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#274092] focus:ring-2 focus:ring-[#274092]/20"
                autoComplete="off"
              />
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-4xl">
              <div className="min-w-0">
                <label htmlFor={`${roomSearchFieldId}-room`} className="mb-1 block text-xs font-bold text-[#334155]">
                  القاعة
                </label>
                <select
                  id={`${roomSearchFieldId}-room`}
                  value={filterRoomId}
                  onChange={(e) => setFilterRoomId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#274092]"
                >
                  <option value="">كل القاعات</option>
                  {roomFilterOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${roomSearchFieldId}-subject`} className="mb-1 block text-xs font-bold text-[#334155]">
                  المادة الامتحانية
                </label>
                <select
                  id={`${roomSearchFieldId}-subject`}
                  value={filterSubjectId}
                  onChange={(e) => setFilterSubjectId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#274092]"
                >
                  <option value="">كل المواد</option>
                  {subjectFilterOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${roomSearchFieldId}-stage`} className="mb-1 block text-xs font-bold text-[#334155]">
                  المرحلة الدراسية
                </label>
                <select
                  id={`${roomSearchFieldId}-stage`}
                  value={filterStageLevel}
                  onChange={(e) => setFilterStageLevel(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#274092]"
                >
                  <option value="">كل المراحل</option>
                  {stageFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex shrink-0 items-end">
              <button
                type="button"
                onClick={clearRoomTableFilters}
                disabled={
                  !roomSearchQuery.trim() &&
                  !filterRoomId &&
                  !filterSubjectId &&
                  !filterStageLevel
                }
                className="h-11 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#475569] transition hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                مسح التصفية
              </button>
            </div>
          </div>
        </div>
        {rows.length > 0 ? (
          <p className="border-b border-[#E2E8F0] bg-white px-5 py-2 text-xs text-[#64748B]">
            {displayRows.length === rows.length
              ? `عرض جميع القاعات (${rows.length}).`
              : `عرض ${displayRows.length} من أصل ${rows.length} قاعة بعد التصفية.`}
          </p>
        ) : null}

        <div className="w-full min-w-0 overflow-x-hidden">
          <table className="w-full table-fixed border-collapse text-right">
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead className="bg-[#F1F5F9]">
              <tr className="border-b border-[#E2E8F0]">
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="رقم التسلسل"
                >
                  تسلسل
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  اسم القاعة
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  مشرف القاعة
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-top text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  المراقبون
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  المادة والمرحلة
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold text-[#334155] sm:text-sm"
                >
                  الوضع
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-right text-xs font-bold leading-tight break-words text-[#334155] sm:text-sm"
                  title="إجمالي السعة مع تفصيل صباحي + مسائي لكل امتحان"
                >
                  السعة
                  <span className="mt-0.5 block text-[9px] font-semibold leading-tight text-[#64748B] sm:text-[10px]">صباحي / مسائي</span>
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="حضور الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الحضور
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-2 py-2.5 align-middle text-center text-xs font-bold tabular-nums text-[#334155] sm:text-sm"
                  title="غياب الامتحان الأول / الثاني في القاعة المزدوجة"
                >
                  الغياب
                </th>
                <th
                  scope="col"
                  className="max-w-0 border-b border-[#E2E8F0] px-2 py-2.5 align-top text-right text-xs font-bold break-words text-[#334155] sm:text-sm"
                >
                  أسماء الغياب
                </th>
                <th
                  scope="col"
                  className="border-b border-[#E2E8F0] px-1 py-2.5 align-middle text-center text-xs font-bold text-[#334155] sm:text-sm"
                >
                  <span className="sr-only">إجراءات</span>
                  <span aria-hidden className="block text-center">
                    ⋮
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[11px] text-[#64748B]" colSpan={11}>
                    لا توجد قاعات امتحانية بعد.
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-[11px] text-[#64748B]" colSpan={11}>
                    لا توجد نتائج تطابق البحث. جرّب كلمات أخرى أو امسح حقل البحث.
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                  const isMultiDistributed =
                    multiRoomAggSlot1.has(row.study_subject_id) ||
                    (Boolean(row.study_subject_id_2) && multiRoomAggSlot2.has(row.study_subject_id_2!));
                  return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className={`cursor-pointer border-s-[3px] border-transparent transition-colors hover:bg-[#F8FAFC] ${
                      isMultiDistributed ? "border-s-indigo-400 bg-indigo-50/25" : ""
                    } ${pinnedDetailRowId === row.id ? "bg-[#EFF6FF]" : ""}`}
                    onClick={() => {
                      closeActionsMenu();
                      setPinnedDetailRowId(row.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        closeActionsMenu();
                        setPinnedDetailRowId(row.id);
                      }
                    }}
                  >
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-none tabular-nums text-[#334155]">
                      {row.serial_no}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug font-semibold text-[#0F172A]">
                      {row.room_name}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug text-[#334155]">
                      <span className="block">{row.supervisor_name}</span>
                      {row.external_room_staff.supervisor_is_external &&
                      row.external_room_staff.supervisor_formation_name.trim() ? (
                        <span className="mt-1 block text-[9px] font-semibold text-amber-900">
                          خارج التشكيل — {row.external_room_staff.supervisor_formation_name.trim()}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-top break-words text-right text-[#334155]">
                      <StackedNamesCell value={row.invigilators} />
                      {row.external_room_staff.external_invigilators.length > 0 ? (
                        <div className="mt-1.5 space-y-0.5 border-t border-amber-100 pt-1.5 text-[9px] leading-snug text-amber-900">
                          {row.external_room_staff.external_invigilators.map((x, i) => (
                            <div key={`${i}-${x.name.slice(0, 40)}`}>
                              <span className="font-bold">خارجي:</span> {x.name}
                              {x.formation_name.trim() ? ` — ${x.formation_name.trim()}` : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle text-right">
                      <SubjectsCell
                        row={row}
                        aggregateSlot1={multiRoomAggSlot1.get(row.study_subject_id)}
                        aggregateSlot2={
                          row.study_subject_id_2 ? multiRoomAggSlot2.get(row.study_subject_id_2) : undefined
                        }
                      />
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center">
                      <div className="flex min-h-[1.75rem] items-center justify-center">
                        {row.study_subject_id_2 ? (
                          <span className="inline-flex max-w-full rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold break-words text-[#B45309]">
                            امتحانان
                          </span>
                        ) : (
                          <span className="text-[10px] leading-none text-[#64748B]">واحد</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-middle break-words text-right text-[11px] leading-snug tabular-nums text-[#334155]">
                      <div className="leading-snug">
                        <span className="font-semibold text-[#64748B]">١:</span> {shiftCapacityLabel(row, 1)}
                      </div>
                      {row.study_subject_id_2 ? (
                        <div className="mt-0.5 leading-snug break-words text-[#475569]">
                          <span className="font-semibold text-[#64748B]">٢:</span> {shiftCapacityLabel(row, 2)}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-snug tabular-nums text-emerald-800">
                      {row.attendance_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.attendance_count_2}
                        </>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-2 py-2 align-middle text-center text-[11px] leading-snug tabular-nums text-red-800">
                      {row.absence_count}
                      {row.study_subject_id_2 ? (
                        <>
                          <span className="text-[#94A3B8]"> / </span>
                          {row.absence_count_2}
                        </>
                      ) : null}
                    </td>
                    <td
                      className="max-w-0 border-b border-[#E2E8F0] px-2 py-2 align-top break-words text-right text-[11px] leading-snug text-[#334155]"
                      title={row.absence_names || undefined}
                    >
                      <StackedNamesCell value={row.absence_names} />
                      {row.study_subject_id_2 && row.absence_names_2 ? (
                        <div className="mt-1.5 border-t border-[#E2E8F0] pt-1.5">
                          <span className="mb-0.5 block text-[10px] font-semibold text-[#64748B]">امتحان ثانٍ:</span>
                          <StackedNamesCell value={row.absence_names_2} />
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-[#E2E8F0] px-1 py-2 text-center align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="إجراءات"
                        aria-expanded={menuId === row.id}
                        className="rounded-lg p-1.5 text-[#64748B] transition hover:bg-[#F1F5F9]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuId === row.id) {
                            closeActionsMenu();
                            return;
                          }
                          menuButtonRef.current = e.currentTarget;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const menuMinW = 192;
                          const pad = 8;
                          let left = rect.left;
                          if (left + menuMinW > window.innerWidth - pad) left = window.innerWidth - menuMinW - pad;
                          if (left < pad) left = pad;
                          setMenuCoords({ top: rect.bottom + 6, left });
                          setMenuId(row.id);
                        }}
                      >
                        <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {pinnedDetailRow ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[90] max-h-[min(22vh,13rem)] overflow-x-visible overflow-y-hidden border-t border-[#CBD5E1] bg-[#F8FAFC] shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
          dir="rtl"
        >
          <div className="flex max-h-[min(22vh,13rem)] w-full flex-row items-stretch overflow-x-visible overflow-y-hidden">
            {/* في rtl أولاً = اليمين؛ الصورة بارتفاع الشريط فقط وعرض طبيعي دون صندوق عرض ثابت */}
            <div className="flex shrink-0 items-stretch bg-[#F8FAFC]">
              {/* eslint-disable-next-line @next/next/no-img-element -- عرض تلقائي h-full/w-auto لا يناسب fill من next/image */}
              <img
                src="/examphoto.jpeg"
                alt="قاعة امتحانية"
                decoding="async"
                className="h-full max-h-[min(22vh,13rem)] w-auto max-w-none object-contain object-[58%_center] -translate-x-2 select-none sm:-translate-x-3"
              />
            </div>
            <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-s border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-xs font-bold text-[#64748B]">تفاصيل القاعة المختارة</p>
                    <RowDetailHint
                      row={pinnedDetailRow}
                      hints={scheduleHintsByRoom[pinnedDetailRow.id] ?? []}
                      aggregateSlot1={multiRoomAggSlot1.get(pinnedDetailRow.study_subject_id)}
                      aggregateSlot2={
                        pinnedDetailRow.study_subject_id_2
                          ? multiRoomAggSlot2.get(pinnedDetailRow.study_subject_id_2)
                          : undefined
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPinnedDetailRowId(null)}
                    className="shrink-0 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#F1F5F9]"
                  >
                    إغلاق التفاصيل
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {menuRow && menuCoords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              className="fixed z-[110] min-w-[12rem] rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg"
              style={{ top: menuCoords.top, left: menuCoords.left }}
              dir="rtl"
              role="menu"
            >
              {!hideEditDeleteRoomActions ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-lg px-3 py-2 text-right text-sm text-[#0F172A] transition hover:bg-[#F8FAFC]"
                  onClick={() => {
                    setEditDialogKey((k) => k + 1);
                    setEditingRow(menuRow);
                    closeActionsMenu();
                  }}
                >
                  تعديل
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="block w-full rounded-lg px-3 py-2 text-right text-sm text-[#1E3A8A] transition hover:bg-[#EFF6FF]"
                onClick={() => {
                  setReportRow(menuRow);
                  closeActionsMenu();
                }}
              >
                تقرير قاعة
              </button>
              {!hideEditDeleteRoomActions ? <DeleteRoomForm id={menuRow.id} /> : null}
            </div>,
            document.body,
          )
        : null}

      <RoomDefinitionsDialog
        key={`room-definitions-${definitionsDialogKey}`}
        open={definitionsOpen}
        onClose={closeDefinitionsDialog}
        branches={branches}
        roomDefinitions={roomDefinitions}
        fixedCollegeSubjectId={fixedCollegeSubjectId}
        scopedBranchName={scopedBranchName}
      />
      <AddRoomDialog
        key={`add-room-${addDialogKey}`}
        open={addOpen}
        onClose={closeAddDialog}
        branches={branches}
        subjects={studySubjects}
        collegeLabel={collegeLabel}
        roomDefinitions={roomDefinitions}
        fixedCollegeSubjectId={fixedCollegeSubjectId}
        scopedBranchName={scopedBranchName}
        staffRegistryPicklist={staffRegistryPicklist}
      />
      <EditRoomDialog
        key={`edit-room-${editDialogKey}`}
        open={Boolean(editingRow)}
        onClose={closeEditDialog}
        branches={branches}
        subjects={studySubjects}
        collegeLabel={collegeLabel}
        roomDefinitions={roomDefinitions}
        fixedCollegeSubjectId={fixedCollegeSubjectId}
        scopedBranchName={scopedBranchName}
        staffRegistryPicklist={staffRegistryPicklist}
        row={editingRow}
      />
      <RoomReportModal
        row={reportRow}
        hints={reportRow ? (scheduleHintsByRoom[reportRow.id] ?? []) : []}
        open={Boolean(reportRow)}
        onClose={() => setReportRow(null)}
      />
    </section>
  );
}
