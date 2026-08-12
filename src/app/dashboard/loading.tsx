import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-[#8127cf] animate-spin" />
        <p className="text-sm font-bold text-[#4d4354]/50">Loading...</p>
      </div>
    </div>
  );
}
