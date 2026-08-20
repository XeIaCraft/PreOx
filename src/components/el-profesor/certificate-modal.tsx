"use client";

import { Printer } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export function CertificateModal({ bookTitle, userName, onClose }: { bookTitle: string; userName: string; onClose: () => void }) {
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Modal
      title="Certificat de maîtrise"
      onClose={onClose}
      size="md"
      footer={
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimer / enregistrer en PDF
        </Button>
      }
    >
      <div className="print-area rounded-[var(--radius-lg)] border-2 border-primary/30 bg-primary-tint/20 p-8 text-center print:border print:bg-transparent print:p-4">
        <div className="mx-auto flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-foreground-subtle">Certificat de maîtrise</p>
        <p className="mt-4 text-sm text-foreground-muted">Ce certificat atteste que</p>
        <p className="mt-2 font-serif-display text-2xl font-medium text-foreground">{userName}</p>
        <p className="mt-2 text-sm text-foreground-muted">a maîtrisé l&rsquo;intégralité des flashcards du livre</p>
        <p className="mt-2 font-serif-display text-xl font-medium text-primary-strong">{bookTitle}</p>
        <p className="mt-6 text-xs text-foreground-subtle">El Profesor — {today}</p>
      </div>
    </Modal>
  );
}
