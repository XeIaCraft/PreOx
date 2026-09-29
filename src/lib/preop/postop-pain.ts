// Expected acute postoperative pain by type of surgery: intensity (strong,
// moderate, low) and duration (shorter or longer than 48 h) — the classic
// table of the SFAR consensus conference on postoperative pain (1997,
// taken up in the 2008 formal recommendations: Ann Fr Anesth Reanim 2008,
// PMID 19026514), as taught at the university. Guides the analgesic plan
// before the intervention; PROSPECT gives the procedure-specific details.

import { fold } from "./catalog";

export type PainIntensity = "strong" | "moderate" | "low";

export interface ExpectedPain {
  intensity: PainIntensity;
  /** Longer than 48 h. */
  long: boolean;
  /** The line of the table it matched. */
  matched: string;
}

// Most specific first: « cholécystectomie cœlioscopique » before « cholécystectomie ».
const TABLE: [RegExp, PainIntensity, boolean, string][] = [
  [/cholecystectomie.*(coelio|laparoscop)|(coelio|laparoscop).*cholecystectomie/, "low", false, "cholécystectomie (cœlioscopie)"],
  [/resection (endoscopique )?(de (la )?)?prostate|rtup|rtu[- ]?p\b|resection transuretrale/, "low", false, "prostate (résection)"],
  [/circoncision|posthectomie/, "low", false, "circoncision"],
  [/\bivg\b|interruption volontaire|curetage|aspiration endo-?uterine|hysteroscopie/, "low", false, "IVG / curetage"],
  [/cataracte|vitrectomie|strabisme|trabeculectomie|ophtalm|chalazion|keratoplastie|dcr\b|dacryocysto/, "low", false, "chirurgie ophtalmologique"],
  [/cystoscopie|ureteroscopie|urs\b|sonde jj|lithotritie|biopsies? prostat|orchidopexie|hydrocele|vasectomie|meatotomie/, "low", false, "chirurgie urologique mineure"],
  [/oesophagectomie|oesophagogastrectomie/, "strong", true, "œsophagectomie"],
  [/hemorroidectomie|milligan|longo/, "strong", true, "hémorroïdectomie"],
  [/thoracotomie|pneumonectomie|lobectomie(?!.*(vats|thoracoscop|video))|decortication pleurale/, "strong", true, "thoracotomie"],
  [/amygdalectomie|adeno-?amygdalectomie/, "strong", true, "amygdalectomie"],
  [/cardiaque|pontage coronar|cec\b|remplacement valvulaire|plastie mitrale|sternotomie/, "moderate", true, "chirurgie cardiaque"],
  [/prothese totale (de (la )?)?hanche|\bpth\b|hanche/, "moderate", true, "hanche"],
  [/laryng|pharyng|glossectomie|evidement cervical|bucco-?pharyng/, "moderate", true, "chirurgie ORL (larynx, pharynx)"],
  [/stent|endoprothese|embolisation|laser|angioplastie/, "low", false, "geste endovasculaire (hors tableau : douleur faible)"],
  [/endarteriectomie carotid|carotid/, "moderate", false, "chirurgie carotidienne (hors tableau : incision cervicale)"],
  [/cystoprostatectomie|(?<!chole)cystectomie/, "strong", true, "chirurgie abdominale majeure (cystectomie)"],
  [/aort|pontage (femoro|ilio|axillo)|anevrisme|revascularisation|vasculaire(?!.*(enfant|hemangiome|malformation))/, "strong", true, "chirurgie vasculaire"],
  [/nephrectomie(?!.*(coelio|laparoscop|robot))|lombotomie|pyeloplastie ouverte|(?<!chole)cystectomie/, "strong", true, "chirurgie rénale"],
  [/prothese totale (du )?genou|\bptg\b|prothese d'epaule|arthroplastie|arthrodese|ligamentoplastie|osteotomie|coiffe des rotateurs|hallux valgus/, "strong", true, "chirurgie articulaire"],
  [/cholecystectomie/, "strong", false, "cholécystectomie (laparotomie)"],
  [/adenomectomie prostatique|adenomectomie.*voie haute|prostatectomie(?!.*(robot|coelio))/, "strong", false, "adénomectomie prostatique (voie haute)"],
  [/cesarienne/, "strong", false, "césarienne"],
  [/hysterectomie.*vagin/, "moderate", false, "hystérectomie vaginale"],
  [/hysterectomie.*(coelio|laparoscop|robot)/, "moderate", false, "cœlioscopie gynécologique"],
  [/hysterectomie/, "strong", false, "hystérectomie (voie abdominale)"],
  [/laparotomie|colectomie|gastrectomie|duodeno-?pancreatectomie|whipple|hepatectomie|sigmoidectomie|resection (du )?rectum|proctectomie|amputation abdomino|splenectomie(?!.*coelio)|hartmann|pancreatectomie/, "strong", true, "chirurgie abdominale sus- et sous-mésocolique"],
  [/appendicectomie/, "moderate", false, "appendicectomie"],
  [/hernie (inguinale|crurale|ombilicale)|cure de hernie|lichtenstein|tep\b|tapp\b/, "moderate", false, "hernie inguinale"],
  [/vats|thoracoscop|videothoracoscop/, "moderate", false, "vidéochirurgie thoracique"],
  [/mastectomie|tumorectomie|quadrantectomie|zonectomie/, "moderate", false, "mastectomie"],
  [/hernie discale|discectomie|microdiscectomie/, "moderate", false, "hernie discale"],
  [/thyroidectomie|parathyroidectomie|lobo-?isthmectomie/, "moderate", false, "thyroïdectomie"],
  [/craniotomie|neurochirurg|derivation ventricul|biopsie cerebrale/, "moderate", false, "neurochirurgie"],
  [/coelio.*(gyneco|ovaire|kyste|annex|trompe|endometriose|salping)|(annexectomie|kystectomie ovarienne|salpingectomie|ligature tubaire)/, "moderate", false, "cœlioscopie gynécologique"],
  [/conisation|bartholin|colposcopie|polype|myomectomie hysteroscop/, "moderate", false, "chirurgie gynécologique mineure"],
];

export const POSTOP_PAIN_SOURCE = "SFAR, conférence de consensus sur la douleur postopératoire (1997), reprise dans les recommandations formalisées d'experts 2008 (Ann Fr Anesth Reanim 2008, PMID 19026514).";

export const INTENSITY_LABEL: Record<PainIntensity, string> = { strong: "forte", moderate: "modérée", low: "faible" };

export function expectedPostopPain(surgeryName: string): ExpectedPain | null {
  const name = fold((surgeryName ?? "").replace(/œ/gi, "oe").replace(/æ/gi, "ae"));
  if (!name.trim()) return null;
  for (const [re, intensity, long, matched] of TABLE) if (re.test(name)) return { intensity, long, matched };
  return null;
}

/** The analgesic plan that goes with the expected pain. */
export function analgesiaFor(p: ExpectedPain): string[] {
  const base = "Analgésie multimodale anticipée : paracétamol et AINS (sauf contre-indication) débutés au bloc, antiémétique.";
  if (p.intensity === "low") return [base, "Opioïde faible ou oral de secours ; sortie le jour même souvent possible.", "Infiltration par le chirurgien ou bloc simple si réalisable."];
  if (p.intensity === "moderate")
    return [base, "ALR simple (bloc périphérique, infiltration, TAP ou bloc de paroi) ou titration de morphine en salle de réveil, relais oral.", p.long ? "Douleur > 48 h : analgésie de fond prescrite pour plusieurs jours, réévaluée (EVA au repos et à la mobilisation)." : "Relais oral dès la reprise des boissons."];
  return [
    base,
    "ALR continue (péridurale thoracique, cathéter périnerveux, bloc paravertébral ou de paroi) ou PCA de morphine ; kétamine peropératoire, lidocaïne IV si pas d'ALR (chirurgie abdominale).",
    p.long ? "Douleur forte > 48 h : cathéter ou PCA pour 48–72 h, surveillance (sédation, FR), prévention de la douleur chronique." : "Douleur forte < 48 h : analgésie puissante les deux premiers jours puis relais oral.",
  ];
}
