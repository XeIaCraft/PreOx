import { GraduationCap, BookMarked, Layers, ShieldAlert, Search, Flame } from "lucide-react";
import type { OnboardingStep } from "@/components/onboarding-tour";

export const EL_PROFESOR_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: GraduationCap,
    title: "Bienvenue dans El Profesor",
    description:
      "Vos livres de référence deviennent des fiches structurées et des flashcards, pensées pour une maîtrise durable — pas pour du par-cœur de dernière minute.",
  },
  {
    icon: BookMarked,
    title: "Des fiches reliées à la source",
    description:
      "Chaque notion (définition, valeurs seuils, protocole, piège fréquent…) cite verbatim le passage du livre qui la fonde. Cliquez une citation « p. X » pour l'ouvrir directement dans le PDF.",
  },
  {
    icon: Layers,
    title: "Des flashcards qui s'adaptent à vous",
    description:
      "La répétition espacée (FSRS) vous représente chaque carte juste avant que vous ne risquiez de l'oublier. Répondez honnêtement « Incorrect »/« Correct » : le rythme s'ajuste à votre mémoire, pas l'inverse.",
  },
  {
    icon: ShieldAlert,
    title: "Révision globale et carnet d'erreurs",
    description:
      "Au-delà d'un chapitre à la fois : mélangez toutes les matières dues (pratique entrelacée, plus efficace à long terme) ou concentrez-vous sur vos cartes qui posent problème.",
  },
  {
    icon: Search,
    title: "Recherche et contributions",
    description:
      "Ctrl+K (ou l'icône loupe) pour retrouver une notion instantanément. Un passage manquant dans une fiche ? Sélectionnez-le dans le PDF pour proposer un complément.",
  },
  {
    icon: Flame,
    title: "Restez dans le rythme",
    description:
      "Série de révision, badges, carte du jour sur le tableau de bord : de quoi garder une régularité sans transformer l'outil en jeu superficiel.",
  },
];
