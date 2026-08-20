export default function Loading() {
  return (
    <div className="animate-pulse space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-32 rounded bg-surface-muted" />
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-24 rounded-[var(--radius-md)] bg-surface-muted" />
          ))}
        </div>
      </div>

      <div className="h-24 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="h-4 w-40 rounded bg-surface-muted" />
        <div className="mt-3 h-3 w-full max-w-md rounded bg-surface-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-dashed border-border p-3">
            <div className="h-3 w-16 rounded bg-surface-muted" />
            <div className="mt-4 h-20 rounded-[var(--radius-md)] bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
