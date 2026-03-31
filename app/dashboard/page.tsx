import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getUniversityWideDashboardStats } from "@/lib/university-wide-dashboard-stats";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const universityStats = await getUniversityWideDashboardStats();
  return <DashboardOverview universityStats={universityStats} />;
}
