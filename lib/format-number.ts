const EN_NUMBER = new Intl.NumberFormat("en-US");

/** أرقام إنجليزية (1234) في كل الواجهة */
export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  try {
    return EN_NUMBER.format(n);
  } catch {
    return String(n);
  }
}

/** خصائص JSX لعرض رقم بأرقام لاتينية (1,234) */
export const latinNumProps = {
  lang: "en" as const,
  dir: "ltr" as const,
};
