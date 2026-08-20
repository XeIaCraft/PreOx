import { ChefHat, Sparkles, ShoppingBasket, GlassWater, Utensils, Settings } from "lucide-react";
import type { OnboardingStep } from "@/components/onboarding-tour";

export const A_TABLE_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: ChefHat,
    title: "Bienvenue dans À table",
    description:
      "Planifiez votre semaine, générez des idées de repas par IA, et gardez vos recettes, votre liste de courses et votre historique au même endroit.",
  },
  {
    icon: Sparkles,
    title: "Génération de repas par IA",
    description:
      "La barre « Générer des repas » propose des idées adaptées à vos goûts, régimes et objectifs (réglables dans Réglages). Glissez-déposez les propositions sur un jour de la semaine.",
    target: '[data-tour="a-table-generator"]',
  },
  {
    icon: ShoppingBasket,
    title: "Courses agrégées automatiquement",
    description:
      "La liste de courses additionne les ingrédients de tous vos repas planifiés — plus besoin de la recopier à la main. Cochez au fur et à mesure de vos achats.",
    target: '[data-tour="a-table-shopping"]',
  },
  {
    icon: GlassWater,
    title: "Repas spéciaux et invités",
    description:
      "Pour un repas à plusieurs plats avec des invités, « Repas spécial » compose un menu complet avec accords mets-vins, régénérable plat par plat.",
    target: '[data-tour="a-table-guest"]',
  },
  {
    icon: Utensils,
    title: "Mode cuisine guidé",
    description:
      "Ouvrez une recette et cliquez « Mode recette » : les étapes s'affichent une à une avec des minuteurs intégrés — plus besoin de faire défiler tout l'écran les mains pleines.",
  },
  {
    icon: Settings,
    title: "Vos clés API, vos données",
    description:
      "Renseignez votre propre clé Gemini (et Pexels en option) dans Réglages — vos recettes et préférences restent personnelles, isolées de celles des autres utilisateurs.",
    target: '[data-tour="a-table-settings"]',
  },
];
