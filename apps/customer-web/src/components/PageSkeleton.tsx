/**
 * Skeleton loading components for the customer app (dark theme).
 * Uses inline styles for bg-white/10 since the Skeleton component's
 * bg-accent may not render correctly in the dark theme context.
 */

export function ExploreShopSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Icon placeholder */}
          <div
            className="w-12 h-12 rounded-xl flex-shrink-0 skeleton-shimmer"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
          {/* Text placeholders */}
          <div className="flex-1 min-w-0">
            <div
              className="h-4 w-40 rounded skeleton-shimmer mb-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            />
            <div
              className="h-3 w-56 rounded skeleton-shimmer mb-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-12 rounded skeleton-shimmer"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
              <div
                className="h-3 w-16 rounded skeleton-shimmer"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
              <div
                className="h-3 w-14 rounded skeleton-shimmer"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <div
                className="flex-1 h-8 rounded-xl skeleton-shimmer"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
              <div
                className="flex-1 h-8 rounded-xl skeleton-shimmer"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExploreMapSkeleton() {
  return (
    <div>
      <div
        className="rounded-2xl skeleton-shimmer mb-4"
        style={{ height: 200, backgroundColor: 'rgba(255,255,255,0.05)' }}
      />
      <ExploreShopSkeleton count={3} />
    </div>
  );
}

export function ServiceCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="w-10 h-10 rounded-xl skeleton-shimmer mb-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
          <div
            className="h-4 w-20 rounded skeleton-shimmer mb-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
          <div
            className="h-3 w-full rounded skeleton-shimmer mb-1"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
          <div
            className="h-3 w-16 rounded skeleton-shimmer"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
        </div>
      ))}
    </div>
  );
}
