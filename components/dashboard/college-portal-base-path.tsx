"use client";

import { createContext, useContext, type ReactNode } from "react";

const CollegePortalBasePathContext = createContext("/dashboard/college");

export function CollegePortalBasePathProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <CollegePortalBasePathContext.Provider value={value}>{children}</CollegePortalBasePathContext.Provider>
  );
}

/** مسار جذر بوابة التشكيل أو القسم لبناء الروابط الداخلية */
export function useCollegePortalBasePath(): string {
  return useContext(CollegePortalBasePathContext);
}
