import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

function IconDashboard() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 5.25a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V5.25ZM3.75 15.75a2.25 2.25 0 0 1 2.25-2.25h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function IconCollegeAccounts() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 6.75h4.5v4.5H4.5v-4.5ZM15 6.75h4.5v4.5H15v-4.5ZM4.5 15.75h4.5v4.5H4.5v-4.5ZM15 15.75h4.5v4.5H15v-4.5Z"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5"
      />
    </svg>
  );
}

function IconUploadCloud() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
      />
    </svg>
  );
}

function IconClipboardList() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75H9Zm0 4.5h3.75H9Zm3.75-9.75v-.735c0-1.036-.84-1.875-1.875-1.875H9.375c-1.036 0-1.875.84-1.875 1.875V6.75m8.25 0v10.5a2.25 2.25 0 0 1-2.25 2.25H8.25A2.25 2.25 0 0 1 6 17.25V6.75m12 0A2.25 2.25 0 0 0 15.75 4.5h-7.5A2.25 2.25 0 0 0 6 6.75"
      />
    </svg>
  );
}

function IconChartBar() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 5.25c0-.621.504-1.125 1.125-1.125h2.25C20.496 4.125 21 4.629 21 5.25v14.625c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V5.25Z"
      />
    </svg>
  );
}

function IconAcademic() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658.813A48.96 48.96 0 0 1 12 13.5a48.96 48.96 0 0 1 8.098-4.04 50.64 50.64 0 0 0-2.658-.814m15.482 0c.308.21.625.424.95.626m-.95-6.853a48.959 48.959 0 0 0-8.098 4.04 50.646 50.646 0 0 0-2.658.814 48.963 48.963 0 0 1-8.098-4.04m9.378 9.378-4.65-4.65a1.125 1.125 0 0 0-1.591 0l-4.65 4.65"
      />
    </svg>
  );
}

function IconBranches() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9.75v1.875A2.625 2.625 0 0 0 8.625 14.25H12m6.75-3v7.875a2.625 2.625 0 0 1-2.625 2.625H12" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg className="size-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.293c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.294c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export const dashboardNavItems: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", icon: <IconDashboard /> },
  { href: "/dashboard/situations-followup", label: "متابعة المواقف", icon: <IconClipboardList /> },
  { href: "/dashboard/exams", label: "الامتحانات", icon: <IconBook /> },
  { href: "/dashboard/students", label: "الطلاب", icon: <IconUsers /> },
  { href: "/dashboard/rooms", label: "القاعات", icon: <IconBuilding /> },
  { href: "/dashboard/college-accounts", label: "إدارة الحسابات", icon: <IconCollegeAccounts /> },
  { href: "/dashboard/formations-departments", label: "التشكيلات والأقسام", icon: <IconBranches /> },
  { href: "/dashboard/reports", label: "التقارير", icon: <IconDocument /> },
  { href: "/dashboard/settings", label: "الإعدادات", icon: <IconCog /> },
];

export type CollegeNavSection = {
  id: string;
  /** عنوان القسم في الشريط الجانبي */
  title: string;
  items: NavItem[];
};

/**
 * بوابة الكلية / التشكيل: ترتيب رسمي حسب مسار العمل (بيانات أساسية ← جداول ← مواقف ← مؤشرات).
 */
export const collegeDashboardNavSections: CollegeNavSection[] = [
  {
    id: "overview",
    title: "نظرة عامة",
    items: [{ href: "/dashboard/college", label: "لوحة الكلية", icon: <IconDashboard /> }],
  },
  {
    id: "master",
    title: "البيانات الأساسية",
    items: [
      { href: "/dashboard/college/subjects", label: "الأقسام والفروع", icon: <IconBranches /> },
      { href: "/dashboard/college/study-subjects", label: "المواد الدراسية", icon: <IconAcademic /> },
      { href: "/dashboard/college/rooms-management", label: "إدارة القاعات", icon: <IconBuilding /> },
    ],
  },
  {
    id: "planning",
    title: "التخطيط الامتحاني",
    items: [{ href: "/dashboard/college/exam-schedules", label: "الجداول الامتحانية", icon: <IconCalendar /> }],
  },
  {
    id: "situations",
    title: "المواقف الامتحانية",
    items: [
      { href: "/dashboard/college/upload-status", label: "رفع الموقف الامتحاني", icon: <IconUploadCloud /> },
      { href: "/dashboard/college/status-followup", label: "متابعة المواقف", icon: <IconClipboardList /> },
    ],
  },
  {
    id: "insights",
    title: "المؤشرات والتقارير",
    items: [
      { href: "/dashboard/college/statistics", label: "الإحصائيات والتقارير", icon: <IconChartBar /> },
      { href: "/dashboard/college/reports", label: "التقارير", icon: <IconDocument /> },
    ],
  },
];

/** قائمة مسطحة (للاستخدامات التي تحتاج مصفوفة واحدة). */
export const collegeDashboardNavItems: NavItem[] = collegeDashboardNavSections.flatMap((s) => s.items);

export function getDashboardNavForRole(role: string): NavItem[] {
  if (role === "COLLEGE") return collegeDashboardNavItems;
  return dashboardNavItems;
}
