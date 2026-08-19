import type { Appetite, GuestCourseKey, Placement } from "./types";

export const PLACEMENTS: Placement[] = [
  "backlog",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_PLACEMENTS: Placement[] = PLACEMENTS.filter((p) => p !== "backlog");

export const DAY_LABELS: Record<Placement, string> = {
  backlog: "À cuisiner",
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

export const WEEKDAY_INDEX: Record<Placement, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
  backlog: -1,
};

export const APPETITE_MULTIPLIERS: Record<Appetite, number> = {
  low: 0.8,
  normal: 1.0,
  high: 1.25,
};

export const APPETITE_LABELS: Record<Appetite, string> = {
  low: "Petit appétit",
  normal: "Appétit normal",
  high: "Gros appétit",
};

export const TIME_PROFILE_LABELS: Record<string, string> = {
  quick: "Rapide (≤ 20 min)",
  normal: "Normal (≤ 60 min)",
  chill: "Tranquille (> 60 min)",
};

export const COMPLEXITY_LABELS: Record<string, string> = {
  simple: "Simple",
  medium: "Intermédiaire",
  free: "Libre",
};

export const DIET_OPTIONS = [
  { value: "everything", label: "Je mange de tout" },
  { value: "vegetarian", label: "Végétarien" },
  { value: "vegan", label: "Végétalien / vegan" },
  { value: "pescatarian", label: "Pesco-végétarien" },
  { value: "no_pork", label: "Sans porc" },
  { value: "no_lactose", label: "Sans lactose" },
  { value: "no_gluten", label: "Sans gluten" },
  { value: "paleo", label: "Paléo" },
  { value: "keto", label: "Cétogène" },
  { value: "other", label: "Autre régime / restriction" },
];

export const ALLERGY_OPTIONS = [
  { value: "gluten", label: "Gluten" },
  { value: "lactose", label: "Lactose" },
  { value: "crustaceans", label: "Crustacés" },
  { value: "eggs", label: "Œufs" },
  { value: "fish", label: "Poissons" },
  { value: "soy", label: "Soja" },
  { value: "peanuts", label: "Arachides" },
  { value: "tree_nuts", label: "Fruits à coque" },
  { value: "celery", label: "Céleri" },
  { value: "mustard", label: "Moutarde" },
  { value: "molluscs", label: "Mollusques" },
  { value: "sesame", label: "Sésame" },
  { value: "other", label: "Autres allergies" },
];

export const EQUIPMENT_OPTIONS = [
  { value: "microwave", label: "Micro-ondes" },
  { value: "oven", label: "Four" },
  { value: "stovetop", label: "Plaques de cuisson" },
  { value: "deep_fryer", label: "Friteuse" },
  { value: "air_fryer", label: "Air fryer" },
  { value: "blender", label: "Mixeur" },
  { value: "food_processor", label: "Robot cuiseur" },
  { value: "steamer", label: "Cuiseur vapeur" },
  { value: "rice_cooker", label: "Rice cooker" },
  { value: "pressure_cooker", label: "Autocuiseur / cocotte-minute" },
  { value: "grill", label: "Gril" },
  { value: "griddle", label: "Plancha" },
  { value: "waffle_iron", label: "Gaufrier" },
  { value: "sandwich_maker", label: "Appareil à croque-monsieur" },
  { value: "raclette_maker", label: "Appareil à raclette" },
  { value: "bread_machine", label: "Machine à pain" },
];

export const OBJECTIVE_OPTIONS = [
  { value: "reduce_mental_load", label: "Diminuer la charge mentale" },
  { value: "eat_balanced", label: "Manger plus équilibré" },
  { value: "eat_seasonal", label: "Manger de saison" },
  { value: "discover_new_recipes", label: "Découvrir de nouvelles recettes" },
  { value: "eat_less_meat", label: "Manger moins de viande" },
  { value: "reduce_grocery_budget", label: "Réduire le budget des courses" },
  { value: "reduce_food_waste", label: "Réduire le gaspillage alimentaire" },
  { value: "quick_meals", label: "Préparer des repas rapides" },
  { value: "reduce_ultra_processed", label: "Réduire les aliments ultra-transformés" },
];

export const MAX_OBJECTIVES = 3;

export const GUEST_COURSE_KEYS: GuestCourseKey[] = ["aperitif", "entree", "plat", "dessert"];

export const GUEST_COURSE_LABELS: Record<GuestCourseKey, string> = {
  aperitif: "Apéritif",
  entree: "Entrée",
  plat: "Plat",
  dessert: "Dessert",
};

export const DRAFT_BATCH_SIZE = 4;

interface ShoppingCategory {
  key: string;
  label: string;
  keywords: string[];
}

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  {
    key: "produce",
    label: "Fruits & légumes",
    keywords: [
      "tomate", "salade", "carotte", "oignon", "ail", "pomme", "banane", "citron", "poivron",
      "courgette", "aubergine", "champignon", "brocoli", "épinard", "avocat", "concombre",
      "fraise", "orange", "poire", "raisin", "herbe", "persil", "basilic", "coriandre",
      "pomme de terre", "patate",
    ],
  },
  {
    key: "protein",
    label: "Protéines",
    keywords: [
      "poulet", "bœuf", "boeuf", "porc", "poisson", "saumon", "thon", "crevette", "œuf", "oeuf",
      "tofu", "jambon", "dinde", "agneau", "steak", "lardons", "merguez", "chorizo",
    ],
  },
  {
    key: "starch",
    label: "Féculents & céréales",
    keywords: [
      "pâtes", "riz", "pain", "farine", "quinoa", "semoule", "boulgour", "lentille", "haricot",
      "pois chiche", "avoine", "polenta",
    ],
  },
  {
    key: "dairy",
    label: "Produits laitiers",
    keywords: [
      "lait", "fromage", "yaourt", "beurre", "crème", "parmesan", "mozzarella", "chèvre", "feta",
    ],
  },
  {
    key: "pantry",
    label: "Épicerie & conserves",
    keywords: [
      "huile", "vinaigre", "sauce", "conserve", "bouillon", "sucre", "sel", "miel", "moutarde",
      "concentré de tomate", "coulis",
    ],
  },
  {
    key: "spices",
    label: "Épices & aromates",
    keywords: [
      "poivre", "cumin", "paprika", "curry", "cannelle", "gingembre", "piment", "épice", "curcuma",
      "muscade", "vanille",
    ],
  },
  {
    key: "frozen",
    label: "Surgelés",
    keywords: ["surgelé", "surgelée", "glace"],
  },
];

export const SHOPPING_OTHER_CATEGORY = { key: "other", label: "Autres" };
