import type { CSSProperties } from "react";
import { APP_FONT_FAMILY } from "@/lib/app-font-family";

/** عناوين رئيسية بوابة القسم — Bold */
export const DEPARTMENT_PAGE_TITLE_FONT: CSSProperties = {
  fontFamily: APP_FONT_FAMILY,
  fontWeight: 700,
};

/** صنف العناوين الرئيسية (h1) في بوابة القسم */
export const DEPARTMENT_PAGE_TITLE_CLASS = "department-page-title";

/** صنف العناوين الفرعية (h2/h3) في بوابة القسم */
export const DEPARTMENT_SECTION_TITLE_CLASS = "department-section-title";

function normalizeDepartmentTitleClass(className: string): string {
  return className
    .replace(/\bfont-(extrabold|black)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** خصائص h1 للعناوين الرئيسية في /department — خط + Bold مضمونان */
export function getDepartmentPageTitleAttrs(
  portalBase: string,
  className: string
): { className: string; style?: CSSProperties } {
  if (portalBase !== "/department") {
    return { className };
  }
  return {
    className: `${normalizeDepartmentTitleClass(className)} font-bold ${DEPARTMENT_PAGE_TITLE_CLASS}`.trim(),
    style: DEPARTMENT_PAGE_TITLE_FONT,
  };
}

/** @deprecated استخدم getDepartmentPageTitleAttrs */
export function withDepartmentPageTitle(portalBase: string, className: string): string {
  return getDepartmentPageTitleAttrs(portalBase, className).className;
}

/** خصائص h2/h3 للعناوين الفرعية في /department — خط + Bold مضمونان */
export function getDepartmentSectionTitleAttrs(
  portalBase: string,
  className: string
): { className: string; style?: CSSProperties } {
  if (portalBase !== "/department") {
    return { className };
  }
  return {
    className: `${normalizeDepartmentTitleClass(className)} font-bold ${DEPARTMENT_SECTION_TITLE_CLASS}`.trim(),
    style: DEPARTMENT_PAGE_TITLE_FONT,
  };
}

/** يضيف صنف العناوين الفرعية في /department فقط */
export function withDepartmentSectionTitle(portalBase: string, className: string): string {
  return getDepartmentSectionTitleAttrs(portalBase, className).className;
}
