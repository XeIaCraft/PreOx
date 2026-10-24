"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileDown, FileText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getCachedDashboard } from "@/lib/el-profesor/local-db";

type Format = "pdf" | "docx";
type ExportFile = { name: string; url: string; updatedAt: string | null; format: Format; volume: number };
type Volume = { number: number; title: string; ficheCount: number; pages: number; partTitles: string[] };
type Listing = { bookTitle: string; volumes: Volume[]; files: ExportFile[] };

const roundPages = (pages: number) => Math.round(pages / 10) * 10;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * « Exporter » on a book's table of contents (admins): the book as tomes, in
 * PDF and in Word for Google Docs, made from its current content — so it is
 * remade after adding illustrations or editing fiches. See api/el-profesor/export.
 */
export function BookExportButton({ bookId }: { bookId: string }) {
  const [canExport, setCanExport] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getCachedDashboard()
      .then((d) => setCanExport(Boolean(d?.effectiveIsAdmin)))
      .catch(() => setCanExport(false));
  }, []);

  if (!canExport) return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FileDown className="h-4 w-4" /> Exporter
      </Button>
      {open && <BookExportDialog bookId={bookId} onClose={() => setOpen(false)} />}
    </>
  );
}

function BookExportDialog({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [runAll, setRunAll] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/el-profesor/export?bookId=${encodeURIComponent(bookId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({ error: "Réponse illisible." }));
        if (!res.ok) throw new Error(data.error ?? "Échec du chargement.");
        if (!cancelled) setListing(data as Listing);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const generate = useCallback(
    async (volume: number, format: Format) => {
      const key = `${volume}:${format}`;
      setBusy((b) => new Set(b).add(key));
      setError(null);
      try {
        const res = await fetch("/api/el-profesor/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId, volume, format }) });
        const data = await res.json().catch(() => ({ error: "Réponse illisible." }));
        if (!res.ok) throw new Error(data.error ?? "Échec de l'export.");
        const files = data.files as ExportFile[];
        setListing((l) => (l ? { ...l, files: [...l.files.filter((f) => !(f.volume === volume && f.format === format)), ...files] } : l));
      } catch (err) {
        setError(`Tome ${volume} (${format === "pdf" ? "PDF" : "Word"}) : ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy((b) => {
          const next = new Set(b);
          next.delete(key);
          return next;
        });
      }
    },
    [bookId]
  );

  async function generateAll() {
    if (!listing) return;
    const jobs = listing.volumes.flatMap((v) => (["pdf", "docx"] as Format[]).map((f) => [v.number, f] as const));
    setRunAll({ done: 0, total: jobs.length });
    // One at a time: each tome is a long server job.
    for (const [i, [volume, format]] of jobs.entries()) {
      await generate(volume, format);
      setRunAll({ done: i + 1, total: jobs.length });
    }
    setRunAll(null);
  }

  const totalPages = listing ? roundPages(listing.volumes.reduce((n, v) => n + v.pages, 0)) : 0;

  return (
    <Modal
      title="Exporter le livre"
      description={listing ? `${listing.volumes.length} tomes · environ ${totalPages.toLocaleString("fr-BE")} pages · d'après le contenu actuel` : undefined}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {runAll && (
            <span className="mr-auto text-sm text-foreground-muted">
              {runAll.done}/{runAll.total} fichiers générés…
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={generateAll} disabled={!listing || Boolean(runAll) || busy.size > 0}>
            <RefreshCw className="h-4 w-4" /> Tout générer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground-muted">
          Chaque tome se génère à partir des fiches telles qu&apos;elles sont maintenant : après avoir ajouté des illustrations ou modifié des fiches, regénérez les tomes concernés.
          Un tome prend une à deux minutes.
        </p>
        <details className="rounded-[var(--radius-md)] border border-border bg-surface-muted/40 px-3 py-2 text-sm text-foreground-muted">
          <summary className="cursor-pointer font-medium text-foreground">Ouvrir un tome dans Google Docs</summary>
          <p className="mt-2">
            Téléchargez le fichier Word, puis dans Google Drive : <em>Nouveau → Importer un fichier</em>, et ouvrez-le avec Google Docs (clic droit → <em>Ouvrir avec → Google Docs</em>). Il devient un document
            modifiable. Un Google Doc étant limité à environ un million de caractères, un tome est découpé en deux ou trois cahiers.
          </p>
        </details>
        {error && <p className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
        {!listing && !error && (
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement des tomes…
          </p>
        )}
        {listing && (
          <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
            {listing.volumes.map((v) => (
              <li key={v.number} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Tome {v.number} — {v.title}
                  </p>
                  <p className="text-xs text-foreground-subtle">
                    {v.ficheCount} fiches · environ {roundPages(v.pages)} pages
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
                  {(["pdf", "docx"] as Format[]).map((format) => {
                    const files = listing.files.filter((f) => f.volume === v.number && f.format === format).sort((a, b) => a.name.localeCompare(b.name));
                    const working = busy.has(`${v.number}:${format}`);
                    return (
                      <div key={format} className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        {files.map((f, i) => (
                          <a
                            key={f.name}
                            href={f.url}
                            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-muted"
                            title={f.updatedAt ? `Généré le ${formatDate(f.updatedAt)}` : undefined}
                          >
                            {format === "pdf" ? <Download className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                            {format === "pdf" ? "PDF" : files.length > 1 ? `Word ${i + 1}/${files.length}` : "Word"}
                          </a>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => generate(v.number, format)} disabled={working || Boolean(runAll)}>
                          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          {files.length ? "Regénérer" : "Générer"} {format === "pdf" ? "PDF" : "Word"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
