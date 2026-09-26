// Which interventions of the catalogue each reference protocol covers — so
// that every intervention gets a protocol even when the names differ
// (« Hémicolectomie droite » → « Colectomie par cœlioscopie »). Keyed by the
// reference protocol's id, which it keeps once imported. The protocol linked
// to an intervention in Paramètres still wins over this map.

// Same ids as reference-protocol-kit.ts (kept here to avoid an import cycle).
const pid = (n: number) => `5f1c0a10-0004-4000-8000-${String(n).padStart(12, "0")}`;

export interface CoverageItem {
  id: string;
  name?: string;
  category?: string;
  family?: string;
  approach?: string;
  population?: string;
}

const fold = (t: string) =>
  t
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Rule = { re?: RegExp; families?: string[]; categories?: string[]; population?: "adult" | "child" | "any"; approaches?: string[]; not?: RegExp };

const young = (s: CoverageItem) => s.population === "child" || s.population === "neonate";

/** Protocol number → what it covers. Population defaults to adults (no child entry). */
const COVERAGE: Record<number, Rule[]> = {
  1: [{ re: /prothese totale de hanche|prothese intermediaire de hanche|arthroscopie de hanche/ }],
  2: [{ re: /prothese totale de genou|prothese unicompartimentale/ }],
  3: [{ re: /col du femur|osteosynthese de la hanche|enclouage du femur|fracture du bassin|cotyle|fracture peri-?prothetique/ }],
  4: [{ re: /arthroscopie de l'epaule|butee de l'epaule|luxation acromio/ }],
  5: [{ re: /^cesarienne( programmee)?$|version par manoeuvre externe|cerclage/ }],
  6: [{ re: /cholecystectomie|voies biliaires|anastomose bilio/ }],
  7: [{ re: /colectomie|hemicolectomie|sigmoidectomie|retablissement de continuite|^stomie|resection de l'intestin grele|rectopexie/, not: /laparotomie|hartmann|volvulus/ }],
  8: [{ re: /hernie (inguinale|crurale|ombilicale)|cure de hernie inguinale$|cure de hernie ombilicale( par|$)|hernie inguinale par|cure de hernie inguinale robot/ }],
  9: [{ re: /amygdalectomie/, population: "child" }],
  10: [{ re: /thyroidectomie|lobo-isthmectomie|parathyroidectomie|cervicotomie/ }],
  11: [{ re: /transuretrale de prostate|vaporisation prostatique|enucleation de prostate|adenomectomie prostatique$/ }],
  12: [{ re: /hysterectomie par coelioscopie|hysterectomie robot|myomectomie (par coelioscopie|robot)|promontofixation|^hysterectomie$/ }],
  13: [{ re: /^cataracte$|injections intravitreennes|pterygion/ }],
  14: [{ re: /bariatrique|bypass gastrique|gastrectomie longitudinale|anneau gastrique/ }],
  15: [{ re: /arthroscopie du genou|arthroscopie de cheville/ }],
  16: [{ re: /chirurgie de la main|canal carpien|nerf ulnaire|dupuytren|kyste synovial|rhizarthrose/ }],
  17: [{ re: /hysteroscopie|curetage|aspiration endo-uterine|interruption volontaire|ponction ovocytaire|myomectomie par hysteroscopie|conisation/ }],
  18: [{ re: /^endoscopie digestive$|coloscopie|gastroscopie|hemorragie digestive : endoscopie|gastrostomie endoscopique/ }],
  19: [{ re: /chirurgie du sein|mastectomie|tumorectomie mammaire|curage axillaire/ }],
  20: [{ re: /appendicectomie/ }],
  21: [{ re: /colectomie par laparotomie|hartmann|colectomie totale|amputation abdomino-perineale/ }],
  22: [{ re: /hepatectomie|resection hepatique|kyste hydatique|prelevement de foie/ }],
  23: [{ re: /prostatectomie radicale|adenomectomie prostatique robot/ }],
  24: [{ re: /lobectomie pulmonaire|lobectomie robot|segmentectomie ou wedge par thoracoscopie|pneumonectomie par thoracoscopie|thymectomie par thoracoscopie|resection de bulles|reduction de volume pulmonaire/ }],
  25: [{ re: /thoracotomie|^pneumonectomie$|decortication pleurale|chirurgie de la paroi thoracique|^lobectomie par/ }],
  26: [{ re: /^craniotomie( pour tumeur)?$|fosse posterieure|anevrisme cerebral|chirurgie de l'epilepsie|decompression microvasculaire|chiari|hypophyse|base du crane|cranioplastie|tumeur intramedullaire/ }],
  27: [{ re: /hemorroidectomie/ }],
  28: [{ re: /avant-pied|chirurgie du pied$/ }],
  29: [{ re: /arthrodese (rachidienne|lombaire)|chirurgie des metastases osseuses rachid|fracture de vertebre/, not: /scoliose/ }],
  30: [{ re: /decompression lombaire|hernie discale$|cure de hernie discale|rachis mini-invasive/ }],
  31: [{ re: /coiffe des rotateurs/ }],
  32: [{ re: /fente labio-palatine/, population: "any" }],
  33: [{ re: /sous cec|valve (mitrale|tricuspide)|valvulaire|aorte thoracique|coeur battant|cardiopathies congenitales de l'adulte|assistance ventriculaire|pericardectomie|tamponnade|thrombo-endarteriectomie pulmonaire|transplantation cardiaque|canulation d'ecmo|remplacement valvulaire/ }],
  34: [{ re: /proctologie|fissure anale|fistule ou abces anal|sinus pilonidal|condylomes|prolapsus rectal/ }],
  35: [{ re: /eventration/ }],
  36: [{ re: /occlusion|peritonite|perforation|ulcere perfore|ischemie mesenterique|volvulus|hernie etranglee|laparotomie exploratrice|laparoscopie exploratrice|fasciite necrosante/ }],
  37: [{ re: /^gastrectomie|gastrostomie chirurgicale/, not: /longitudinale/ }],
  38: [{ re: /oesophagectomie/ }],
  39: [{ re: /fundoplicature|heller|splenectomie|^surrenalectomie par|surrenalectomie robot/ }],
  40: [{ re: /pancreat|duodenopancreatectomie|necrosectomie/ }],
  41: [{ re: /resection du rectum|exenteration pelvienne/ }],
  42: [{ re: /cytoreduction/ }],
  43: [{ re: /^surrenalectomie$|surrenalectomie ou chirurgie retroperitoneale/ }],
  44: [{ re: /exerese cutanee|lipome|adenectomie|debridement|abces ou collection de paroi|melanome|chambre implantable|catheter de dialyse|greffe de peau|curage inguinal|ablation de materiel|verneuil|malformations vasculaires/ }],
  45: [{ re: /transplantation (hepatique|pancreatique)/ }],
  46: [{ re: /aortique ouverte|anevrisme aortique rompu|pontage aorto|artere renale ou digestive/ }],
  47: [{ re: /endoprothese/ }],
  48: [{ re: /carotid/ }],
  49: [{ re: /pontage femoro|pontage axillo|endarteriectomie femorale|embolectomie|anevrisme poplite|angioplastie peripherique|revascularisation ouverte/ }],
  50: [{ re: /amputation (au-dessus|de membre inferieur|d'orteil)|pied diabetique/ }],
  51: [{ re: /fistule arterio-veineuse|desobstruction de fav/ }],
  52: [{ re: /varices/ }],
  53: [{ re: /nephrectomie|nephro-ureterectomie|pyeloplastie|prelevement de foie ou de rein/, not: /enfant|wilms/ }],
  54: [{ re: /cystectomie|cystoprostatectomie/ }],
  55: [{ re: /ureteroscopie|ureterorenoscopie|cystoscopie|transuretrale de vessie|lithotritie ou cystolithotomie|toxine botulique|uretrotomie|nephrostomie/ }],
  56: [{ re: /nephrolithotomie/ }],
  57: [{ re: /scrotal|hydrocele|orchidectomie|vasectomie|^circoncision$|implant penien|peyronie|torsion testiculaire|sphincter urinaire/ }],
  58: [{ re: /transplantation renale/ }],
  59: [{ re: /biopsies prostatiques|lithotritie extracorporelle|curietherapie/ }],
  60: [{ re: /hysterectomie par laparotomie|hysterectomie elargie|carcinologique de l'ovaire|endometriose/ }],
  61: [{ re: /hysterectomie vaginale|prolapsus|bandelette|vulvectomie|bartholin|fistule vesico-vaginale/, not: /rectal/ }],
  62: [{ re: /coelioscopie gynecologique|annexectomie|grossesse extra|kystectomie ovarienne|salpingectomie|torsion d'annexe|sterilisation tubaire|^myomectomie$/ }],
  63: [{ re: /cesarienne en urgence|hysterectomie d'hemostase|hemorragie du post-partum/ }],
  64: [{ re: /analgesie peridurale du travail|revision uterine|dechirure perineale|extraction instrumentale/ }],
  65: [{ re: /pendant la grossesse/ }],
  66: [{ re: /endonasale|sinus|septoplastie|rhinoplastie|epistaxis|os propres du nez|ronflement|^amygdalectomie$/ }],
  67: [{ re: /oreille|tympanoplastie|mastoidectomie|stapedotomie|implant cochleaire|otoplastie/, population: "any" }],
  68: [{ re: /microchirurgie laryngee|laser laryngo|laser larynge|panendoscopie|zenker|bronchoscopie rigide/ }],
  69: [{ re: /carcinologique tete et cou|laryngectomie|pharyngectomie|curage ganglionnaire cervical|glossectomie|transorale|tracheotomie|parotidectomie|sous-maxillaire/ }],
  70: [{ re: /aerateurs|frein de langue|adenoidectomie|tractus thyreoglosse|laryngomalacie|stenose sous-glottique|corps etranger bronchique/, population: "child" }],
  71: [{ re: /abces peri-amygdalien|hemorragie apres amygdalectomie|cellulite ou abces dentaire/, population: "any" }],
  72: [{ re: /dent|maxillo-faciale|mandibule|temporo-mandibulaire|osteotomie bimaxillaire|genioplastie|le fort/ }],
  73: [{ re: /vitrectomie|decollement de retine|glaucome|keratoplastie|voies lacrymales|paupieres|blepharoplastie/, not: /congenital/ }],
  74: [{ re: /strabisme|plaie du globe|enucleation ou evisceration|orbite/, population: "any" }, { re: /cataracte de l'enfant|glaucome congenital|retinopathie du premature/, population: "child" }],
  75: [{ re: /cervicale|laminoplastie/, categories: ["D", "K"] }],
  76: [{ re: /hematome (extradural|sous-dural)|derivation ventriculaire externe/ }],
  77: [{ re: /thrombectomie cerebrale|embolisation d'anevrisme/ }],
  78: [{ re: /craniotomie eveillee/ }],
  79: [{ re: /derivation (ventriculo|lombo)|ventriculocisternostomie|stimulation cerebrale|neurostimulateur|pompe intrathecale|stereotax|radiochirurgie/ }],
  80: [{ re: /mediastin|^thymectomie$|thymectomie par sternotomie/ }],
  81: [{ re: /tavi|mitraclip|auricule|fermeture percutanee/ }],
  82: [{ re: /ablation de fibrillation|ablation par catheter|pacemaker|sondes de stimulation|cardioversion|echographie transoesophagienne|coronarographie/ }],
  83: [{ re: /pneumothorax|talcage|drain thoracique|pleurectomie|hyperhidrose|defile thoraco/ }],
  84: [{ re: /poignet|avant-bras|coude|olecrane|scaphoide|membre superieur|chirurgie du poignet et de la main|reimplantation/ }],
  85: [{ re: /prothese d'epaule|humerus|clavicule/ }],
  86: [{ re: /ligamentoplastie|rotule|plateau tibial|enclouage du tibia|osteotomie tibiale|^osteotomie$|stabilisation de rotule|osteosynthese de membre|fixateur externe/ }],
  87: [{ re: /cheville|calcaneum|achille|arthrodese de cheville|chirurgie du pied/ }],
  88: [{ re: /reprise de prothese|infection de prothese|metastases osseuses|sarcome/ }],
  89: [{ re: /lavage articulaire|syndrome des loges|reduction de luxation|bursectomie/ }],
  90: [{ re: /augmentation mammaire|plastie mammaire|protheses mammaires|reconstruction mammaire par prothese|gynecomastie|lipofilling/ }],
  91: [{ re: /lambeau libre|lambeau pour escarre|lambeau pedicule ou libre|chirurgie plastique ou reconstructrice|affirmation de genre/ }],
  92: [{ re: /brule|brulure/ }],
  93: [{ re: /abdominoplastie|liposuccion|amaigrissement massif|lifting/ }],
  94: [{ re: /hernie (inguinale|ombilicale)|circoncision|phimosis|orchidopexie|hypospade|hydrocele|torsion/, population: "child" }],
  95: [{ re: /pylor|invagination/, population: "child" }],
  96: [{ re: /atresie|hernie diaphragmatique|laparoschisis|omphalocele|enterocolite|malformation anorectale|myelomeningocele|valves de l'uretre/, population: "child" }],
  97: [{ re: /nephrectomie de l'enfant|pyeloplastie de l'enfant|reimplantation ureterale|hirschsprung|appendicectomie/, population: "child" }],
  98: [{ re: /./, population: "child", categories: ["K", "L"], not: /scoliose|fente/ }],
  99: [{ re: /scoliose/, population: "child" }],
  100: [{ re: /./, population: "child", categories: ["X"], not: /catheterisme cardiaque/ }],
  101: [{ re: /craniostenose|moelle attachee|derivation ventriculo-peritoneale de l'enfant/, population: "child" }],
  102: [{ re: /pectus|malformation pulmonaire congenitale/, population: "child" }],
  103: [{ re: /cardiopathies congenitales de l'enfant|catheterisme cardiaque de l'enfant|canal arteriel/, population: "child" }],
  104: [{ re: /bronchoscopie souple|endoscopie bronchique|valves endobronchiques/ }],
  105: [{ re: /cpre|echo-endoscopie|mucosectomie|poem/ }],
  106: [{ re: /radiologie interventionnelle|chimio-embolisation|radiofrequence|ponction-biopsie|tips|drainage biliaire|filtre cave|embolisation uterine|biopsie hepatique|vertebroplastie|imagerie sous anesthesie|prelevement de moelle/ }],
  107: [{ re: /electroconvulsivo/ }],
  108: [{ re: /prelevement d'organes/ }],
  109: [{ re: /blood patch|bloc ou infiltration antalgique/ }],
  110: [{ re: /resection tracheale|transplantation pulmonaire/ }],
};

const RULES = new Map(Object.entries(COVERAGE).map(([n, rules]) => [pid(Number(n)), rules]));

/** Does this reference protocol cover this intervention? */
export function protocolCovers(protocolId: string, item: CoverageItem | undefined): boolean {
  if (!item?.name) return false;
  const rules = RULES.get(protocolId);
  if (!rules) return false;
  const name = fold(item.name);
  return rules.some((r) => {
    const pop = r.population ?? "adult";
    if (pop === "adult" && young(item)) return false;
    if (pop === "child" && !young(item)) return false;
    if (r.categories && !r.categories.includes(item.category ?? "")) return false;
    if (r.not && r.not.test(name)) return false;
    return r.re ? r.re.test(name) : true;
  });
}

/** Protocol ids the coverage names — to check they are reference protocols. */
export function coveredProtocolIds(): string[] {
  return [...RULES.keys()];
}
