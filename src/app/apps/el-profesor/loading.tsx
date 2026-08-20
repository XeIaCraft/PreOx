export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8 sm:px-6 xl:max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-[var(--radius-md)] bg-surface-muted" />
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-surface-muted" />
          <div className="h-4 w-64 rounded bg-surface-muted" />
        </div>
      </div>

      <div className="mt-6 h-10 rounded-[var(--radius-sm)] bg-surface-muted" />

      <div className="mt-6 space-y-8">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="h-5 w-48 rounded bg-surface-muted" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                  <div className="h-4 w-3/4 rounded bg-surface-muted" />
                  <div className="mt-3 h-1.5 w-full rounded-full bg-surface-muted" />
                  <div className="mt-6 flex gap-2">
                    <div className="h-8 w-20 rounded-full bg-surface-muted" />
                    <div className="h-8 w-20 rounded-full bg-surface-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
