import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  GraduationCap,
  HelpCircle,
  BellOff,
  Tag,
  Gauge,
  Archive,
  Settings,
  Plus,
  Flame,
  Target,
  Download,
  Award,
  Trophy,
  BookCheck,
  Star,
  Layers,
  ShieldAlert,
  Sparkles,
  ListTree,
  Search,
  Scissors,
  GitBranch,
  ClipboardCheck,
  SearchCheck,
  Zap,
  SlidersHorizontal,
  Link2,
  Share2,
  Files,
  ListChecks,
  Keyboard,
  Maximize2,
  FileText,
  BookMarked,
  Table2,
  ListOrdered,
  Lightbulb,
  Sigma,
  Flag,
  Copy,
  RotateCcw,
  ThumbsUp,
  ChevronLeft,
  Crop,
  ZoomIn,
  MessageCircle,
  Languages,
  Undo2,
  Timer,
  PenLine,
  Merge,
  FileSearch,
  Upload,
  Siren,
  Volume2,
  EyeOff,
  PenSquare,
  AlertTriangle,
  Menu,
  PanelRightOpen,
} from "lucide-react";

function IconRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-serif-display text-xl font-medium text-foreground">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-foreground-muted">{children}</div>
    </section>
  );
}

const TOC: { id: string; label: string }[] = [
  { id: "tableau-de-bord", label: "Tableau de bord" },
  { id: "lecture", label: "Lire une fiche" },
  { id: "pdf", label: "Le PDF et la couverture" },
  { id: "revision", label: "Réviser (répétition espacée)" },
  { id: "recherche", label: "Rechercher" },
  { id: "notions", label: "Notions" },
  { id: "admin", label: "Fonctions admin" },
  { id: "perso", label: "Raccourcis et personnalisation" },
];

export function GuideView({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-primary-tint text-primary-strong">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Guide d&apos;utilisation</h1>
          <p className="text-sm text-foreground-muted">Toutes les fonctionnalités d&apos;El Profesor, et ce que signifie chaque icône.</p>
        </div>
      </div>

      <p className="mt-5 text-sm text-foreground-muted">
        El Profesor transforme vos livres de référence (PDF, Word ou PowerPoint) en fiches structurées et en flashcards à répétition
        espacée. Ce guide couvre tout, de la lecture d&apos;une fiche à la génération de contenu par IA. Pour une prise en main rapide,
        l&apos;icône <HelpCircle className="inline h-4 w-4 align-text-bottom text-primary" /> sur le tableau de bord relance le
        tutoriel en 6 étapes.
      </p>

      <nav className="mt-5 flex flex-wrap gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-muted/50 p-3 text-xs">
        {TOC.filter((t) => t.id !== "admin" || isAdmin).map((t) => (
          <a key={t.id} href={`#${t.id}`} className="rounded-full border border-border bg-surface px-2.5 py-1 text-foreground-subtle hover:text-foreground">
            {t.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-5">
        <Section id="tableau-de-bord" title="Tableau de bord" icon={GraduationCap}>
          <p>
            La page d&apos;accueil du module liste vos livres, vos widgets de progression, et — si vous êtes admin — les outils de
            génération de contenu. Une bascule « Par livre / Par notion » change la liste : les livres de la bibliothèque, ou les
            notions — des livres fusionnés (voir la section Notions plus bas).
          </p>
          <p className="font-medium text-foreground">Barre du haut</p>
          <p>
            En dessous d&apos;une certaine largeur d&apos;écran, le guide, le tutoriel et les cartes exclues (ainsi que les entrées
            admin ci-dessous) se regroupent dans un seul menu{" "}
            <Menu className="inline h-3.5 w-3.5 align-text-bottom" /> pour ne pas surcharger l&apos;écran — les mêmes fonctions, juste
            rangées.
          </p>
          <ul className="space-y-1.5">
            <IconRow icon={HelpCircle}>Revoir le tutoriel de bienvenue.</IconRow>
            <IconRow icon={BellOff}>Vos flashcards que vous avez exclues de la révision.</IconRow>
            {isAdmin && (
              <>
                <IconRow icon={EyeOff}>
                  Vue admin / vue utilisateur — bascule votre propre session pour prévisualiser El Profesor exactement comme le
                  verrait un utilisateur normal (contenu brouillon masqué, outils de génération IA cachés), sans créer de second
                  compte.
                </IconRow>
                <IconRow icon={Tag}>Notions : fusionner des livres (admin).</IconRow>
                <IconRow icon={Gauge}>Tableau de bord qualité — doublons, fiches incomplètes (admin).</IconRow>
                <IconRow icon={Archive}>Livres archivés (admin).</IconRow>
                <IconRow icon={Settings}>Réglages IA : fournisseur, clés API, coûts (admin) — un point rouge signale une clé manquante.</IconRow>
                <IconRow icon={Plus}>Ajouter un livre (admin).</IconRow>
              </>
            )}
          </ul>
          <p className="font-medium text-foreground">En haut de page</p>
          <ul className="space-y-1.5">
            <IconRow icon={ArrowLeft}>Reprendre la lecture — reprend exactement où vous en étiez.</IconRow>
            <IconRow icon={Sparkles}>Carte du jour — une flashcard mise en avant, à retourner directement depuis le tableau de bord.</IconRow>
            <IconRow icon={Search}>Recherche dans toute la bibliothèque, et dans vos notes personnelles.</IconRow>
          </ul>
          <p className="font-medium text-foreground">En bas de page — stats et régularité</p>
          <ul className="space-y-1.5">
            <IconRow icon={Flame}>Série de jours consécutifs de révision.</IconRow>
            <IconRow icon={Target}>Objectif hebdomadaire de régularité, et objectif quotidien de cartes (cliquable pour changer 10/15/20/30).</IconRow>
            <IconRow icon={Download}>Export CSV de votre historique d&apos;activité.</IconRow>
            <IconRow icon={Award}>
              Badges de régularité et de maîtrise (avec <Trophy className="inline h-3.5 w-3.5 align-text-bottom" /> pour un livre
              entièrement maîtrisé et <BookCheck className="inline h-3.5 w-3.5 align-text-bottom" /> pour un chapitre).
            </IconRow>
            <IconRow icon={Star}>Vos livres et chapitres mis en favori (avec des thèmes personnalisés à éditer).</IconRow>
            <IconRow icon={Layers}>Révision globale — toutes les cartes dues, tous chapitres mélangés (plus efficace qu&apos;un seul chapitre à la fois).</IconRow>
            <IconRow icon={ShieldAlert}>
              Carnet d&apos;erreurs — vos cartes les plus difficiles, les fiches jamais révisées depuis longtemps (admin), et les cartes
              où vous étiez « sûr(e) » mais vous vous êtes trompé(e) — le signal le plus utile en clinique.
            </IconRow>
            <IconRow icon={AlertTriangle}>
              Alerte de péremption — chapitres déjà maîtrisés dont des cartes sont en retard de plus de 60 jours sur leur échéance : le
              risque d&apos;oubli y est le plus élevé.
            </IconRow>
            <IconRow icon={Sparkles}>
              Synthèse IA à la demande de vos points faibles récurrents — apparaît dès que vous avez au moins une carte difficile.
            </IconRow>
          </ul>
          {isAdmin && (
            <>
              <p className="font-medium text-foreground">Par livre (admin)</p>
              <ul className="space-y-1.5">
                <IconRow icon={ListTree}>Table des matières visuelle.</IconRow>
                <IconRow icon={Search}>Rechercher dans ce livre.</IconRow>
                <IconRow icon={Plus}>Importer un chapitre (PDF, Word ou PowerPoint).</IconRow>
                <IconRow icon={Scissors}>
                  Diviser un PDF en chapitres — uploadez le PDF complet du livre, l&apos;IA (Gemini) suggère où commence chaque
                  chapitre (entièrement modifiable), ou saisissez vous-même la première et la dernière page de chacun.
                </IconRow>
                <IconRow icon={GitBranch}>Nouvelle édition d&apos;un livre existant (archive l&apos;ancienne édition).</IconRow>
                <IconRow icon={Archive}>Archiver le livre (un export JSON est téléchargé automatiquement, réversible).</IconRow>
              </ul>
              <p className="font-medium text-foreground">Par chapitre (admin)</p>
              <ul className="space-y-1.5">
                <IconRow icon={Sparkles}>
                  Extraire — lance la génération des fiches/flashcards depuis le PDF. Avec Claude, plusieurs chapitres peuvent être
                  sélectionnés (cases à cocher) et soumis en un seul lot, moitié prix, sans avoir à garder l&apos;onglet ouvert — le
                  résultat arrive automatiquement.
                </IconRow>
                <IconRow icon={SearchCheck}>Compléter — une passe de complément pour combler les trous de couverture restants.</IconRow>
                <IconRow icon={Zap}>
                  Jusqu&apos;à couverture — enchaîne automatiquement les passes de complément jusqu&apos;à couverture quasi complète,
                  sans repasser par vous à chaque fois.
                </IconRow>
                <IconRow icon={ClipboardCheck}>Relire &amp; publier — une fois l&apos;extraction terminée, avant que le contenu soit visible des utilisateurs.</IconRow>
              </ul>
            </>
          )}
        </Section>

        <Section id="lecture" title="Lire une fiche" icon={BookMarked}>
          <p>
            Chaque fiche est découpée en blocs typés, reconnaissables par leur icône : <BookMarked className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
            définition/mécanisme, <Gauge className="inline h-3.5 w-3.5 align-text-bottom" /> valeurs &amp; seuils,{" "}
            <Table2 className="inline h-3.5 w-3.5 align-text-bottom" /> tableau comparatif,{" "}
            <ListOrdered className="inline h-3.5 w-3.5 align-text-bottom" /> protocole,{" "}
            <Lightbulb className="inline h-3.5 w-3.5 align-text-bottom" /> mnémotechnique,{" "}
            <Sparkles className="inline h-3.5 w-3.5 align-text-bottom" /> perle clinique,{" "}
            <ShieldAlert className="inline h-3.5 w-3.5 align-text-bottom" /> piège fréquent,{" "}
            <Sigma className="inline h-3.5 w-3.5 align-text-bottom" /> formule.
          </p>
          <p>
            Une pastille « Source externe » remplace le numéro de page sur une citation issue d&apos;un article ou d&apos;une source
            importée plutôt que du PDF du chapitre — pas une citation muette, une limite structurelle rendue lisible.
          </p>
          <ul className="space-y-1.5">
            <IconRow icon={Copy}>Copier le texte d&apos;un bloc, ou de la fiche entière.</IconRow>
            <IconRow icon={Flag}>
              Signaler une erreur sur un bloc précis (relu par un admin) — un signalement peut ensuite recevoir une correction
              suggérée par IA, jamais publiée sans validation.
            </IconRow>
            <IconRow icon={PenSquare}>
              Proposer une flashcard manuelle sur une notion, depuis la page du chapitre — rejoint la même file de relecture admin que
              le contenu généré par IA, jamais publiée directement.
            </IconRow>
            <IconRow icon={RotateCcw}>
              « À revoir bientôt »/<ThumbsUp className="inline h-3.5 w-3.5 align-text-bottom" /> « je m&apos;en souviens encore » — une
              répétition espacée à l&apos;échelle du bloc, indépendante des flashcards.
            </IconRow>
            <IconRow icon={Star}>Mettre le livre/chapitre en favori — reste directement dans la barre du haut.</IconRow>
            <IconRow icon={Gauge}>
              Progression de cette fiche (icône <Gauge className="inline h-3.5 w-3.5 align-text-bottom" /> à côté des Options) —
              pourcentage de lecture (au fil du scroll) et de maîtrise en révision (flashcards de cette fiche), chacun
              réinitialisable indépendamment. Même chose sur une synthèse de notion.
            </IconRow>
            <IconRow icon={SlidersHorizontal}>
              Options de la fiche (piste 2026-08-28) — regroupe tout le reste dans une même fenêtre pour ne pas surcharger la barre :
              mise en page (actuelle/livre/sommaire), taille du texte, texte justifié, confort de lecture (sépia), police adaptée
              dyslexie, mode focus, raccourcis clavier, téléchargement et impression, ainsi que les outils admin ci-dessous.
            </IconRow>
            <IconRow icon={FileText}>Afficher/masquer le PDF source (plein écran sur mobile).</IconRow>
          </ul>
          <p>
            En bas de chaque fiche : des questions-réponses libres entre utilisateurs (
            <MessageCircle className="inline h-3.5 w-3.5 align-text-bottom" />).
          </p>
          {isAdmin && (
            <>
              <p className="font-medium text-foreground">Outils admin (dans le menu Options)</p>
              <p>
                Pour l&apos;instant réservés à l&apos;admin — pas de génération de contenu par IA côté utilisateur :
              </p>
              <ul className="space-y-1.5">
                <IconRow icon={Link2}>Copier un lien vers cette fiche.</IconRow>
                <IconRow icon={Share2}>Rendre la fiche consultable via un lien public (réversible).</IconRow>
                <IconRow icon={Files}>Imprimer tout le chapitre.</IconRow>
                <IconRow icon={ListChecks}>Mode quiz — en cours de révision, temporairement indisponible.</IconRow>
                <IconRow icon={Languages}>Traduire la fiche à la volée (jamais enregistrée).</IconRow>
              </ul>
            </>
          )}
        </Section>

        <Section id="pdf" title="Le PDF et la couverture" icon={FileText}>
          <p>
            Sur tablette et ordinateur, le PDF du chapitre est rétracté par défaut pour laisser toute la place à la fiche —{" "}
            <PanelRightOpen className="inline h-3.5 w-3.5 align-text-bottom" /> l&apos;affiche à côté d&apos;un clic, et il se
            rouvre automatiquement dès que vous cliquez sur une citation « p. X » dans une fiche, directement à la bonne page et au
            bon passage.
          </p>
          <ul className="space-y-1.5">
            <IconRow icon={ChevronLeft}>Navigation page par page, ou numéro de page directement.</IconRow>
            <IconRow icon={Crop}>(Admin) Capturer une image du PDF pour illustrer une flashcard.</IconRow>
            <IconRow icon={Layers}>
              « Couverture » — surligne en vert les passages déjà repris dans une fiche, en bleu ceux repris dans une flashcard.
              Cliquer un passage surligné ouvre un panneau indiquant précisément quel bloc ou quelle carte le couvre, avec un lien
              direct pour l&apos;ouvrir.
            </IconRow>
            <IconRow icon={ZoomIn}>Zoom, plein écran.</IconRow>
          </ul>
          <p>
            Sélectionner du texte dans le PDF propose de l&apos;utiliser pour créer un nouveau bloc ou une flashcard — utile pour un
            passage que la génération automatique aurait manqué.
          </p>
        </Section>

        <Section id="revision" title="Réviser (répétition espacée)" icon={Layers}>
          <p>
            Les flashcards utilisent l&apos;algorithme FSRS : plus vous répondez honnêtement, plus le rythme de révision de chaque
            carte s&apos;ajuste précisément à votre mémoire — inutile d&apos;essayer de « tricher » en répondant toujours correct,
            l&apos;algorithme perd alors son intérêt. Ses paramètres sont réoptimisés périodiquement pour votre historique personnel
            une fois assez de révisions accumulées, plutôt que de rester génériques.
          </p>
          <ul className="space-y-1.5">
            <IconRow icon={ThumbsUp}>
              Retournez la carte (tap ou espace), puis notez-vous : « Encore », « Difficile », « Correct » ou « Facile ».
            </IconRow>
            <IconRow icon={Undo2}>Annuler la dernière réponse si vous vous êtes trompé de bouton.</IconRow>
            <IconRow icon={Timer}>Minuteur Pomodoro optionnel (25 min / pause 5 min).</IconRow>
            <IconRow icon={PenLine}>Mode dictée — tapez la réponse avant de la révéler, pour vous tester plus sévèrement.</IconRow>
            <IconRow icon={Volume2}>
              Mode audio mains libres — question et réponse lues à voix haute, notation d&apos;un geste, pour réviser sans regarder
              l&apos;écran (trajets, gardes).
            </IconRow>
            <IconRow icon={BellOff}>Exclure une carte de vos révisions (réversible depuis l&apos;icône en haut du tableau de bord).</IconRow>
            <IconRow icon={Maximize2}>Mode plein écran sans distraction.</IconRow>
          </ul>
          <p>
            Avant de révéler la réponse, la carte demande parfois « Hésitant(e) » ou « Sûr(e) » (1/2 ou ←/→ au clavier) : les réponses
            fausses données avec assurance sont suivies séparément dans le carnet d&apos;erreurs — l&apos;état le plus dangereux en
            clinique, que la notation correct/incorrect seule ne distingue pas. Certaines cartes sont à trous (cloze) plutôt que
            recto/verso classique : le passage masqué se révèle avec le reste de la réponse.
          </p>
          <p>
            Plusieurs modes : révision du jour par chapitre (uniquement les cartes dues), révision libre (tout le chapitre, plafonnée
            par défaut pour rester raisonnable, jamais prise en compte dans la planification), révision globale (mélange tous les
            chapitres dus — la pratique entrelacée retient mieux qu&apos;un chapitre isolé), carnet d&apos;erreurs (vos cartes les plus
            difficiles), et révision des notions (livres fusionnés) depuis la vue « Par notion ».
          </p>
        </Section>

        <Section id="recherche" title="Rechercher" icon={Search}>
          <p>
            <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>/
            <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs">Cmd</kbd> +{" "}
            <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs">K</kbd> ouvre la recherche
            dans toute la bibliothèque (ou un seul livre depuis sa page). Une recherche séparée, accessible depuis le tableau de
            bord, ne porte que sur vos notes personnelles.
          </p>
        </Section>

        <Section id="notions" title="Notions" icon={Tag}>
          <p>
            Une « notion » est un <strong>livre fusionné</strong> : plusieurs livres de la bibliothèque réunis en un seul, construit pour
            apprendre. L&apos;IA bâtit une nouvelle table des matières (parties, sous-parties, chapitres, fiches) qui suit une progression
            logique, puis rédige chaque fiche à partir des fiches de tous les livres qui traitent du même sujet — sans perte
            d&apos;information : tout ce que disent les livres est repris, dit une fois quand ils disent la même chose, et un contrôle de
            couverture réintègre ce qui aurait été oublié (en dernier recours tel quel, marqué « à vérifier »).
          </p>
          <p>
            Quand les livres se contredisent, un bloc <strong>Divergence entre sources</strong> cite ce que dit chacun. Chaque fiche se
            termine par un bloc <strong>À retenir par cœur</strong>. Touchez un passage (ou une référence sous un bloc) pour ouvrir la page
            du PDF du livre d&apos;où il vient — le choix vous est proposé quand il vient de plusieurs livres. Des illustrations sont
            suggérées là où elles aident, avec la page du livre qui en montre une quand elle existe.
          </p>
          <p>
            Les flashcards sont fusionnées elles aussi : une fois un chapitre de la notion publié, ses cartes remplacent celles des livres
            sources (qui sortent de vos révisions, pour ne jamais réviser deux fois la même chose), et chaque carte fusionnée reprend votre
            historique le plus avancé parmi les cartes qu&apos;elle remplace. La vue « Par notion » du tableau de bord liste les notions,
            chapitre par chapitre, pour lire et réviser.
          </p>
          {isAdmin && (
            <ul className="space-y-1.5">
              <IconRow icon={Plus}>
                Créer une notion depuis la page Notions : choisir les livres, inclure ou non les fiches pas encore publiées, choisir
                l&apos;IA (Gemini, plus rapide ; Claude en lots, moitié prix) et le modèle — le coût estimé s&apos;affiche avant de lancer.
                La table des matières est établie d&apos;abord (chaque fiche des livres y trouve sa place, c&apos;est vérifié) ; la rédaction
                se lance ensuite chapitre par chapitre (un, plusieurs ou tous, coût affiché), quand vous voulez, pour étaler la dépense.
                Tout continue côté serveur, fenêtre fermée.
              </IconRow>
              <IconRow icon={Sparkles}>Relire et publier chaque chapitre (ou tous les chapitres prêts d&apos;un coup) ; tout reste modifiable comme un livre.</IconRow>
              <IconRow icon={FileSearch}>
                « Vérifier l&apos;actualité » d&apos;une fiche : exporter la fiche vers une IA avec recherche web, coller sa réponse, voir
                chaque changement proposé puis l&apos;appliquer — les passages modifiés sont marqués « à vérifier », avec leur référence.
              </IconRow>
              <IconRow icon={Merge}>Supprimer une notion rend leurs cartes aux livres sources, avec leur propre historique.</IconRow>
              <IconRow icon={Tag}>Les anciennes notions (synthèses, contradictions, recommandations, calculateurs de dose) restent accessibles depuis la page Notions.</IconRow>
            </ul>
          )}
        </Section>

        {isAdmin && (
          <Section id="admin" title="Fonctions admin" icon={Settings}>
            <p>
              Réglages IA (icône <Settings className="inline h-3.5 w-3.5 align-text-bottom" /> du tableau de bord) : choix du
              fournisseur (Gemini ou Claude), clés API, modèle utilisé, un plafond de dépense mensuel optionnel (bloque les nouvelles
              soumissions et alerte à l&apos;approche), et un panneau de suivi — consommation des 24 dernières heures/7 jours avec
              coût estimé, détail par modèle, et « Lots Claude récents » (statut et coût de chaque lot soumis). Sur le tableau de
              bord, sélectionner des chapitres avant de lancer un lot affiche une estimation de coût avant même de valider.
            </p>
            <ul className="space-y-1.5">
              <IconRow icon={Gauge}>
                Tableau de bord qualité — fiches incomplètes, doublons de flashcards, sous-entités à fusionner, et cartes
                « sangsues » (échec fréquent, souvent mal formulées) avec reformulation suggérée par IA en un clic.
              </IconRow>
              <IconRow icon={ClipboardCheck}>Relecture avant publication — mêmes outils que la lecture normale, plus l&apos;édition des blocs/flashcards et le filtre « à vérifier seulement ».</IconRow>
              <IconRow icon={EyeOff}>Convertir une flashcard en texte à trous (cloze) directement depuis son éditeur.</IconRow>
              <IconRow icon={Siren}>
                Marquer un bloc comme référence d&apos;urgence — sur du contenu déjà relu et publié uniquement, aucune nouvelle
                génération. Le mode urgence qui les rassemblait a été retiré du tableau de bord d&apos;El Profesor pour rejoindre un
                module dédié ; le marquage reste possible en attendant.
              </IconRow>
              <IconRow icon={Upload}>
                Importer un contenu généré ailleurs (ex. Claude.ai) — copiez le prompt fourni, collez le JSON obtenu en retour ; les
                citations sont revérifiées contre le PDF comme pour une génération automatique. Les PDF scannés (sans couche texte)
                passent désormais par un OCR automatique à l&apos;import.
              </IconRow>
              <IconRow icon={Archive}>
                Archiver un livre (export JSON automatique, réversible) — la page « Livres archivés » permet de le réexporter ou de
                le réactiver.
              </IconRow>
            </ul>
          </Section>
        )}

        <Section id="perso" title="Raccourcis et personnalisation" icon={Keyboard}>
          <ul className="space-y-1.5">
            <IconRow icon={HelpCircle}>Revoir le tutoriel de bienvenue à tout moment.</IconRow>
            <IconRow icon={Keyboard}>
              Raccourcis clavier (touche « ? ») : navigation entre sous-entités (↑/↓), mode focus (F), recherche (Ctrl/Cmd+K), et en
              révision : espace pour retourner, ←/→ ou 1/2 pour répondre, Ctrl/Cmd+Z pour annuler.
            </IconRow>
          </ul>
          <p>
            Une bannière apparaît si votre connexion est coupée sur une page de chapitre déjà consultée : la lecture reste possible
            (contenu mis en cache), mais les fonctions IA, la révision et le chargement du PDF peuvent ne pas répondre tant que la
            connexion n&apos;est pas rétablie.
          </p>
        </Section>
      </div>
    </div>
  );
}
