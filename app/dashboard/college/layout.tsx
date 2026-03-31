import { CollegeQuickActionsProvider } from "./college-quick-actions";

export default function CollegeLayout({ children }: { children: React.ReactNode }) {
  return <CollegeQuickActionsProvider>{children}</CollegeQuickActionsProvider>;
}
