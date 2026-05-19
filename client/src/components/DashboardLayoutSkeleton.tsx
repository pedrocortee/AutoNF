export function DashboardLayoutSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-pulse space-y-4 w-full max-w-4xl px-8">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-200 rounded w-1/2" />
        <div className="grid grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
