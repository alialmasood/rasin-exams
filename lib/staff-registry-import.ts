import * as XLSX from "xlsx";

export type StaffRegistryImportItem = {
  fullName: string;
  collegeSubjectId: string | null;
  sheetRow: number;
};

const BRANCH_ALIASES = [
  "القسم أو الفرع",
  "القسم/الفرع",
  "القسم \\ الفرع",
  "قسم او فرع",
  "الفرع",
  "القسم",
  "التشكيل",
  "branch",
  "department",
  "college_subject",
  "معرف القسم",
];

const NAME_ALIASES = ["الاسم الكامل", "الاسم", "full name", "fullname", "name", "الاسم الرباعي"];

function normalizeHeaderKey(s: string): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findColumnKey(headers: string[], aliases: string[]): string | null {
  const normalizedAliases = new Set(aliases.map((a) => normalizeHeaderKey(a)));
  for (const h of headers) {
    const n = normalizeHeaderKey(h);
    if (normalizedAliases.has(n)) return h;
  }
  for (const h of headers) {
    const n = normalizeHeaderKey(h);
    for (const a of aliases) {
      const na = normalizeHeaderKey(a);
      if (n.includes(na) || na.includes(n)) return h;
    }
  }
  return null;
}

function collapseSpaces(s: string): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isAllBranchesCell(raw: string): boolean {
  const t = collapseSpaces(raw).toLowerCase();
  if (!t) return true;
  if (t === "*" || t === "all" || t === "any") return true;
  if (t.includes("كل") && (t.includes("قسم") || t.includes("فرع"))) return true;
  return false;
}

function matchBranchId(
  cell: string,
  branches: ReadonlyArray<{ id: string; branch_name: string }>
): string | null {
  const t = collapseSpaces(cell);
  if (!t) return null;
  const tLower = t.toLowerCase();
  for (const b of branches) {
    const bn = collapseSpaces(b.branch_name);
    if (bn === t) return b.id;
    if (bn.toLowerCase() === tLower) return b.id;
  }
  return null;
}

export type ParsedStaffRegistryImport = {
  items: StaffRegistryImportItem[];
  rowErrors: string[];
  sheetRowCount: number;
};

/**
 * يقرأ أول ورقة في ملف Excel (.xlsx / .xls): عمود الاسم + عمود القسم/الفرع (للحساب المركزي).
 * أعمدة إضافية (مثل صنف قديم) تُترك دون قراءة.
 */
export function parseStaffRegistryExcelBuffer(
  buffer: ArrayBuffer,
  opts: {
    branches: ReadonlyArray<{ id: string; branch_name: string }>;
    isCentralAccount: boolean;
    fixedCollegeSubjectId: string | null;
  }
): { ok: true; data: ParsedStaffRegistryImport } | { ok: false; message: string } {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { ok: false, message: "الملف تالف أو ليس ملف Excel صالحاً أو تعذّر قراءته." };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, message: "الملف لا يحتوي على أي ورقة عمل." };
  const ws = wb.Sheets[sheetName];
  if (!ws) return { ok: false, message: "تعذّر قراءة الورقة الأولى." };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  }) as Record<string, unknown>[];
  if (rows.length === 0) return { ok: false, message: "الملف فارغ أو لا يحتوي على بيانات بعد رأس الأعمدة." };

  const headers = Object.keys(rows[0] ?? {});
  const nameKey = findColumnKey(headers, NAME_ALIASES);
  if (!nameKey) {
    return {
      ok: false,
      message: "لم يُعثر على عمود الاسم. استخدم عنواناً مثل «الاسم الكامل» أو Name.",
    };
  }

  const branchKey =
    opts.isCentralAccount && opts.fixedCollegeSubjectId == null
      ? findColumnKey(headers, BRANCH_ALIASES)
      : null;

  if (opts.isCentralAccount && opts.fixedCollegeSubjectId == null && !branchKey) {
    return {
      ok: false,
      message:
        "لم يُعثر على عمود القسم/الفرع. للحساب المركزي أضف عموداً بعنوان «القسم أو الفرع» (اسم الفرع كما في النظام، أو «كل الأقسام والفروع»).",
    };
  }

  const items: StaffRegistryImportItem[] = [];
  const rowErrors: string[] = [];
  let sheetRowCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 2;
    const fullName = collapseSpaces(String(row[nameKey] ?? ""));
    const branchRaw = branchKey ? String(row[branchKey] ?? "") : "";

    const allEmpty = !fullName && (!branchKey || !collapseSpaces(branchRaw));
    if (allEmpty) continue;

    sheetRowCount++;

    if (fullName.length < 2) {
      rowErrors.push(`السطر ${sheetRow}: الاسم الكامل ناقص أو فارغ.`);
      continue;
    }
    if (fullName.length > 200) {
      rowErrors.push(`السطر ${sheetRow}: الاسم طويل جداً (أكثر من 200 حرف).`);
      continue;
    }

    let collegeSubjectId: string | null;

    if (opts.fixedCollegeSubjectId) {
      collegeSubjectId = opts.fixedCollegeSubjectId;
      const cell = collapseSpaces(branchRaw);
      if (cell && opts.branches.length > 0) {
        const matched = matchBranchId(cell, opts.branches);
        if (matched && matched !== opts.fixedCollegeSubjectId) {
          rowErrors.push(`السطر ${sheetRow}: القسم/الفرع في الملف لا يطابق قسم حسابك.`);
          continue;
        }
        if (cell && !matched) {
          rowErrors.push(`السطر ${sheetRow}: قيمة القسم/الفرع في الملف لا تطابق اسم فرعك المعرّف.`);
          continue;
        }
      }
    } else if (opts.isCentralAccount) {
      if (isAllBranchesCell(branchRaw)) {
        collegeSubjectId = null;
      } else {
        const id = matchBranchId(branchRaw, opts.branches);
        if (!id) {
          rowErrors.push(
            `السطر ${sheetRow}: لم يُعثر على قسم/فرع مطابق لـ «${collapseSpaces(branchRaw).slice(0, 80)}».`
          );
          continue;
        }
        collegeSubjectId = id;
      }
    } else {
      collegeSubjectId = opts.fixedCollegeSubjectId;
      if (!collegeSubjectId) {
        rowErrors.push(`السطر ${sheetRow}: لم يُحدَّد قسم للحساب.`);
        continue;
      }
    }

    items.push({
      fullName,
      collegeSubjectId,
      sheetRow,
    });
  }

  if (sheetRowCount === 0) {
    return { ok: false, message: "لا توجد صفوف بيانات غير فارغة في الملف." };
  }

  return { ok: true, data: { items, rowErrors, sheetRowCount } };
}
