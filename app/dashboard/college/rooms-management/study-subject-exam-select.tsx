"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CollegeStudySubjectRow } from "@/lib/college-study-subjects";
import { formatCollegeStudyStageLabel, isPostgraduateStudyStageLevel } from "@/lib/college-study-stage-display";

function stageDetailsText(s: CollegeStudySubjectRow): string {
  const lv = Number(s.study_stage_level);
  const stage = formatCollegeStudyStageLabel(lv);
  if (isPostgraduateStudyStageLevel(lv)) return `دراسات عليا — ${stage}`;
  return `الدراسة الأولية — ${stage}`;
}

function stageDetailsClassName(s: CollegeStudySubjectRow): string {
  return isPostgraduateStudyStageLevel(Number(s.study_stage_level)) ? "text-[#4338CA]" : "text-[#0F766E]";
}

type StudySubjectExamSelectProps = {
  name: string;
  subjects: CollegeStudySubjectRow[];
  defaultValue?: string;
  required?: boolean;
  /** يُستدعى عند اختيار مادة من القائمة (للمزامنة مع «مستوى الدراسة» في النموذج) */
  onValueChange?: (subjectId: string) => void;
  /** أصناف زر الفتح (مطابقة حقل select السابق) */
  triggerClassName?: string;
  placeholder?: string;
};

export function StudySubjectExamSelect({
  name,
  subjects,
  defaultValue = "",
  required,
  onValueChange,
  triggerClassName,
  placeholder = "اختر المادة الدراسية",
}: StudySubjectExamSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useLayoutEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = useMemo(() => subjects.find((s) => s.id === value), [subjects, value]);

  const baseTrigger =
    "flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] px-3 text-right outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15";

  return (
    <div ref={rootRef} className="relative min-w-0">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`${baseTrigger} ${triggerClassName ?? "bg-[#F8FAFC]"}`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-sm font-semibold leading-tight text-[#0F172A]">{selected.subject_name}</span>
            <span
              className={`mt-0.5 block truncate text-[9px] font-medium leading-tight ${stageDetailsClassName(selected)}`}
            >
              {stageDetailsText(selected)}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-start text-sm text-[#94A3B8]">{placeholder}</span>
        )}
        <svg
          className={`size-4 shrink-0 text-[#64748B] transition ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute end-0 start-0 top-[calc(100%+4px)] z-[140] max-h-[min(280px,45vh)] overflow-auto rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg"
        >
          {subjects.map((s) => {
            const active = s.id === value;
            return (
              <li key={s.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-stretch gap-0.5 px-3 py-2 text-start transition hover:bg-[#F1F5F9] ${
                    active ? "bg-[#EFF6FF]" : ""
                  }`}
                  onClick={() => {
                    setValue(s.id);
                    onValueChange?.(s.id);
                    setOpen(false);
                  }}
                >
                  <span className="truncate text-sm font-semibold leading-tight text-[#0F172A]">{s.subject_name}</span>
                  <span className={`truncate text-[9px] font-medium leading-snug ${stageDetailsClassName(s)}`}>
                    {stageDetailsText(s)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
