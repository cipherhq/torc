import { Skeleton } from './ui/skeleton';

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${count} gap-6 mb-8`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
          <Skeleton className="w-12 h-12 rounded-2xl mb-4 bg-gray-200" />
          <Skeleton className="w-24 h-4 mb-2 bg-gray-200" />
          <Skeleton className="w-16 h-8 bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
      <div className="border-b border-gray-200 px-6 py-4 flex gap-8">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24 bg-gray-200" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-6 py-4 border-b border-gray-50 flex gap-8 items-center">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 w-20 bg-gray-200" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white shadow-sm border border-gray-100 rounded-[24px] p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0 bg-gray-200" />
            <div className="flex-1">
              <Skeleton className="w-48 h-5 mb-2 bg-gray-200" />
              <Skeleton className="w-full h-4 mb-3 bg-gray-200" />
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-16 rounded-2xl bg-gray-200" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActionCardsSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="bg-white rounded-[24px] p-6 mb-8 shadow-sm border border-gray-100">
      <Skeleton className="w-48 h-6 mb-6 bg-gray-200" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-2xl p-4 bg-gray-50 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <Skeleton className="w-5 h-5 rounded bg-gray-200" />
              <Skeleton className="w-8 h-6 bg-gray-200" />
            </div>
            <Skeleton className="w-28 h-4 mb-1 bg-gray-200" />
            <Skeleton className="w-36 h-3 bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AlertsSkeleton() {
  return (
    <div className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
      <Skeleton className="w-36 h-6 mb-6 bg-gray-200" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-gray-50">
            <Skeleton className="w-5 h-5 rounded-full flex-shrink-0 bg-gray-200" />
            <div className="flex-1">
              <Skeleton className="w-full h-4 mb-2 bg-gray-200" />
              <Skeleton className="w-16 h-3 bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="w-48 h-10 mb-2 bg-gray-200" />
        <Skeleton className="w-56 h-5 bg-gray-200" />
      </div>

      {/* Stats grid */}
      <StatCardsSkeleton count={4} />

      {/* Action cards */}
      <ActionCardsSkeleton count={9} />

      {/* Alerts + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AlertsSkeleton />
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
          <Skeleton className="w-32 h-6 mb-6 bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="w-full h-12 rounded-2xl bg-gray-200" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PayoutsTableSkeleton() {
  return (
    <div className="bg-white shadow-sm border border-gray-100 rounded-[24px] overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <Skeleton className="w-40 h-6 mb-1 bg-gray-200" />
        <Skeleton className="w-64 h-4 bg-gray-200" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-6 py-4 border-b border-gray-50 flex items-center gap-6">
          <div className="w-[20%]">
            <Skeleton className="w-32 h-4 mb-1 bg-gray-200" />
            <Skeleton className="w-40 h-3 bg-gray-200" />
          </div>
          <Skeleton className="w-10 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-4 bg-gray-200" />
          <Skeleton className="w-20 h-4 bg-gray-200" />
          <Skeleton className="w-16 h-8 rounded-xl bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
