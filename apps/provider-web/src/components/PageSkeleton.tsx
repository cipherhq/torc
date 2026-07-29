/**
 * Skeleton loading components for the provider app (dark theme).
 * Uses inline styles for dark-theme pulsing backgrounds since the
 * Skeleton component's bg-accent may not render correctly in dark mode.
 */

export function ExploreShopSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full rounded-2xl p-4 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Icon placeholder */}
          <div
            className="w-12 h-12 rounded-xl flex-shrink-0 animate-pulse"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          />
          {/* Text content */}
          <div className="flex-1 min-w-0">
            <div
              className="h-4 w-36 rounded animate-pulse mb-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            />
            <div
              className="h-3 w-52 rounded animate-pulse mb-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-12 rounded animate-pulse"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
              <div
                className="h-3 w-14 rounded animate-pulse"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
              <div
                className="h-3 w-16 rounded animate-pulse"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              />
            </div>
          </div>
          {/* Action button placeholder */}
          <div
            className="w-10 h-10 rounded-xl flex-shrink-0 animate-pulse"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
          />
        </div>
      ))}
    </div>
  );
}

export function EarningsSkeleton({ isDark = true }: { isDark?: boolean }) {
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const pulseBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const pulseLight = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  return (
    <div className="relative z-10">
      {/* Balance card skeleton */}
      <div className="px-6 mb-5">
        <div
          className="rounded-3xl p-6 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(0,140,229,0.3) 0%, rgba(0,112,184,0.3) 50%, rgba(0,90,148,0.3) 100%)',
          }}
        >
          <div className="h-4 w-28 rounded animate-pulse mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <div className="h-10 w-40 rounded animate-pulse mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <div className="h-3 w-36 rounded animate-pulse mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-12 rounded-2xl animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <div className="w-12 h-12 rounded-2xl animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
      </div>

      {/* Tab switcher skeleton */}
      <div className="px-6 mb-5">
        <div className="flex rounded-2xl p-1" style={{ backgroundColor: pulseBg }}>
          {['This Week', 'This Month', 'All Time'].map((label, i) => (
            <div
              key={i}
              className="flex-1 py-2.5 rounded-xl animate-pulse flex items-center justify-center"
              style={{ backgroundColor: i === 0 ? pulseLight : 'transparent' }}
            >
              <div className="h-3 w-16 rounded" style={{ backgroundColor: pulseBg }} />
            </div>
          ))}
        </div>
      </div>

      {/* Earnings breakdown skeleton */}
      <div className="px-6 mb-5">
        <div className="rounded-3xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
            <div className="h-4 w-36 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: pulseBg }} />
                  <div className="h-3 w-28 rounded animate-pulse" style={{ backgroundColor: pulseLight }} />
                </div>
                <div className="h-3 w-16 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
              </div>
            ))}
            <div className="border-t pt-3" style={{ borderColor: cardBorder }}>
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
                <div className="h-5 w-20 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats row skeleton */}
      <div className="px-6 mb-5">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-4 text-center"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <div className="w-5 h-5 mx-auto mb-1 rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
              <div className="h-3 w-16 mx-auto rounded animate-pulse mb-1" style={{ backgroundColor: pulseLight }} />
              <div className="h-5 w-20 mx-auto rounded animate-pulse" style={{ backgroundColor: pulseBg }} />
            </div>
          ))}
        </div>
      </div>

      {/* Chart skeleton */}
      <div className="px-6 mb-5">
        <div className="rounded-3xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <div className="h-4 w-40 rounded animate-pulse mb-4" style={{ backgroundColor: pulseBg }} />
          <div className="flex items-end gap-2 justify-between" style={{ height: 140 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t animate-pulse"
                  style={{
                    height: 30 + Math.random() * 80,
                    backgroundColor: pulseBg,
                  }}
                />
                <div className="h-2 w-6 rounded animate-pulse" style={{ backgroundColor: pulseLight }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
