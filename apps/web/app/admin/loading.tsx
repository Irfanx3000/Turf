import { DashboardPageSkeleton } from "@/components/loading/page-skeletons";

export default function Loading() {
  return (
    <div className="container py-8">
      <DashboardPageSkeleton />
    </div>
  );
}