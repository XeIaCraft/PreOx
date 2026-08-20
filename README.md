# PreOx

PreOx est un **hub applicatif** : une plateforme centrale qui donne accès à
plusieurs applications/modules, avec une gestion fine des droits par
utilisateur et par module. La base pose : landing page, authentification
(admin / utilisateur), gestion des utilisateurs, et logique d'accès aux
modules. Un premier module métier réel est branché — **À table**, un
planificateur de repas assisté par IA (portage natif d'une intégration
Home Assistant du même nom, voir plus bas) — les autres modules du hub
restent des emplacements réservés ("coming soon"), prêts à accueillir de
futurs développements.

## Stack technique

| Domaine | Choix |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Style | Tailwind CSS v4, design system maison (tokens dans `globals.css`) |
| Auth & données | Supabase (Auth + Postgres + Row Level Security) |
| Hébergement | Vercel |

Toute la logique d'autorisation est appliquée **côté base de données** via
des policies Row Level Security (RLS), pas uniquement côté interface : même
un appel direct à l'API Supabase avec la clé publique ne peut pas contourner
les droits.

### Nommage des variables d'environnement Supabase

Le projet utilise `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` comme demandé. Cette
clé correspond à ce que Supabase appelle indifféremment :

- la **clé "publishable"** (`sb_publishable_...`) sur les projets Supabase
  récents, ou
- la **clé "anon public"** (un long JWT) sur les projets plus anciens.

Ce sont deux noms pour le même rôle de clé côté client — collez simplement la
valeur trouvée dans **Project Settings → API → Project API keys** de votre
projet Supabase, quel que soit son intitulé exact. Aucune bibliothèque du
projet n'impose le nom `NEXT_PUBLIC_SUPABASE_ANON_KEY` : le code lit ses
propres variables d'environnement (`src/lib/supabase/env.ts`), donc tout le
projet est harmonisé sur `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Modèle de données & RBAC

Trois tables portent toute la logique d'accès (`supabase/migrations/20260101000000_init.sql`) :

- **`profiles`** — un profil par utilisateur (`id`, `email`, `full_name`,
  `role` ∈ `{admin, user}`). Créé automatiquement à l'inscription via un
  trigger sur `auth.users`.
- **`apps`** — le registre des modules du hub (`slug`, `name`, `description`,
  `icon`, `route`, `status` ∈ `{available, coming_soon}`, `sort_order`,
  `is_active`). C'est la table à enrichir quand un nouveau module est
  développé.
- **`user_app_access`** — la table de jointure qui accorde l'accès à un
  module (`app_id`) à un utilisateur (`user_id`), avec traçabilité
  (`granted_by`, `granted_at`).

Une fonction `is_admin()` (SQL, `security definer`) centralise la vérification
du rôle et alimente toutes les policies RLS. Un trigger dédié empêche un
utilisateur non-admin de modifier son propre `role` ou `email`, même en
appelant directement l'API Supabase.

Les administrateurs voient tous les modules comme débloqués (ils gèrent le
hub) ; les utilisateurs ne voient débloqués que les modules listés dans
`user_app_access`. Un module sans accès reste visible mais verrouillé (cadenas
+ message), plutôt que masqué — choix UX qui montre l'étendue du hub sans
donner accès au contenu.

## Structure du projet

```
src/
  app/
    page.tsx                    Landing page publique
    login/, forgot-password/,
    set-password/               Pages d'authentification
    auth/confirm/route.ts       Vérification des liens e-mail Supabase (invite, reset)
    apps/                       Espace utilisateur (protégé)
      layout.tsx                 Header + garde d'accès (requireProfile)
      page.tsx                   Grille des modules accessibles
      [slug]/page.tsx            Page générique d'un module (placeholder)
    admin/                      Panneau d'administration (protégé, admin uniquement)
      layout.tsx                  Garde d'accès (requireAdmin)
      page.tsx                    Vue d'ensemble (statistiques)
      users/                       Liste, invitation, fiche détaillée par utilisateur
      apps/                        CRUD des modules du hub
    actions/
      auth.ts                    Server actions : login, logout, reset/set password
      admin.ts                   Server actions admin : invitation, rôles, accès, modules
  components/
    ui/                         Primitives réutilisables (Button, Card, Input, Switch…)
    landing/                    Sections de la page d'accueil
    auth/                       Formulaires d'authentification
    hub/                        Header + carte de module de l'espace utilisateur
    admin/                      Composants du panneau d'administration
    a-table/                    Composants du module « À table » (voir plus bas)
    el-profesor/                Composants du module « El Profesor » (voir plus bas)
  lib/
    supabase/                   Clients Supabase (browser, server, admin) + types
    auth/dal.ts                 Data Access Layer : requireUser/requireProfile/requireAdmin
    apps.ts                     Résolution des modules accessibles pour un profil
    site-url.ts                 Résolution de l'URL publique (emails)
    icon-map.tsx                Icônes disponibles pour les modules
    gemini-shared.ts            Aides Gemini partagées (parsing JSON, unescape) — a-table + el-profesor
    a-table/                    Logique métier du module « À table » (voir plus bas)
    el-profesor/                Logique métier du module « El Profesor » (voir plus bas)
  proxy.ts                      Rafraîchissement de session + garde d'accès optimiste
supabase/
  migrations/                  Schéma, RLS, triggers (hub + modules À table, El Profesor)
  seed.sql                     Modules du hub (À table, El Profesor + 3 modules de démonstration)
```

### Pourquoi `proxy.ts` et pas `middleware.ts` ?

Ce projet est sur **Next.js 16**, qui renomme `middleware` en `proxy`
(fonctionnellement identique). `src/proxy.ts` rafraîchit la session Supabase
sur chaque requête et fait une vérification **optimiste** (authentifié ou
non). La vérification **fiable** du rôle admin se fait plus près des données,
dans `requireAdmin()` (`src/lib/auth/dal.ts`), appelée par `app/admin/layout.tsx`.
C'est la double couche recommandée par la documentation Next.js pour
l'authentification.

## Comptes & authentification

Il n'y a **pas d'inscription libre** : c'est un hub privé. Le flux est le
suivant :

1. Un administrateur invite un utilisateur depuis `/admin/users/new`
   (e-mail + nom + rôle initial).
2. Supabase envoie un e-mail d'invitation. Le lien ramène sur
   `/auth/confirm`, qui établit la session, puis redirige vers
   `/set-password`.
3. L'utilisateur choisit son mot de passe et atterrit sur `/apps`.
4. Ensuite, connexion classique par e-mail + mot de passe sur `/login`
   (avec un lien "mot de passe oublié" qui réutilise le même mécanisme
   `/auth/confirm` → `/set-password`).

Le rôle **admin** donne accès à `/admin` (protégé) en plus de `/apps`.

## Prérequis

- Node.js ≥ 20.9
- Un projet Supabase (gratuit) — [supabase.com](https://supabase.com)
- Un compte Vercel pour le déploiement

## Configuration Supabase (pas à pas)

1. **Créer le projet** sur [supabase.com](https://supabase.com/dashboard).
2. **Exécuter les migrations**, dans l'ordre, via le **SQL Editor** du
   projet : le contenu de `supabase/migrations/20260101000000_init.sql`
   (hub : profils, modules, accès), puis celui de
   `supabase/migrations/20260101000001_a_table.sql` (tables du module
   « À table »), puis celui de
   `supabase/migrations/20260101000002_el_profesor.sql` (tables du module
   « El Profesor » + création du bucket de stockage privé des PDF de
   chapitres), puis celui de
   `supabase/migrations/20260101000003_el_profesor_block_status.sql`
   (statut brouillon/publié par bloc de contenu, RLS renforcée), puis celui
   de `supabase/migrations/20260101000004_el_profesor_remaining_passes.sql`
   (estimation par l'IA du nombre de passes de complément restantes), puis
   celui de `supabase/migrations/20260101000005_el_profesor_flags.sql`
   (signalement d'erreur par les utilisateurs).
   *(Si vous utilisez la CLI Supabase : `supabase db push` applique tout
   dans l'ordre.)*
3. **Charger les modules du hub** : exécutez `supabase/seed.sql` — il active
   « À table » (`status='available'`, route `/apps/a-table`) et
   « El Profesor » (`status='available'`, route `/apps/el-profesor`), et
   crée 3 modules de démonstration (Cas cliniques, Checklists, Outils
   spécialisés).
4. **Configurer les redirections d'authentification** : Authentication →
   URL Configuration →
   - **Site URL** : `http://localhost:3000` en développement, votre domaine
     Vercel en production.
   - **Redirect URLs** : ajoutez `http://localhost:3000/auth/confirm` et
     `https://votre-domaine.vercel.app/auth/confirm` (et tout domaine de
     preview Vercel que vous utilisez).
5. **Vérifier les templates d'e-mail** (Authentication → Email Templates) :
   les templates par défaut de Supabase pointent déjà vers
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}`,
   ce qui correspond exactement à la route de ce projet. Vous pouvez
   personnaliser les textes (Invite user, Reset password) sans toucher à
   cette structure d'URL.
6. **Récupérer les clés API** : Project Settings → API. Vous aurez besoin de
   l'URL du projet, de la clé publique (anon/publishable) et de la clé
   `service_role` (secrète).
7. **Créer le premier administrateur** : invitez-vous vous-même comme décrit
   plus haut... mais comme aucun admin n'existe encore pour envoyer une
   invitation depuis `/admin`, créez votre premier compte directement dans
   Supabase (Authentication → Users → Add user → avec mot de passe), puis
   promouvez-le en SQL :

   ```sql
   update public.profiles set role = 'admin' where email = 'vous@exemple.com';
   ```

   Vous pouvez ensuite vous connecter sur `/login` et gérer tous les
   utilisateurs suivants depuis `/admin/users/new`.

## Variables d'environnement

Copiez `.env.local.example` vers `.env.local` et renseignez :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=votre-cle-anon-ou-publishable
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
A_TABLE_ENCRYPTION_KEY=$(openssl rand -base64 32)
# Optionnel en local, recommandé en production :
# NEXT_PUBLIC_SITE_URL=https://votre-domaine.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` et `A_TABLE_ENCRYPTION_KEY` sont **secrètes** :
jamais préfixées par `NEXT_PUBLIC_`, utilisées uniquement côté serveur (la
première pour les Server Actions d'administration — invitation, suppression
d'utilisateurs ; la deuxième pour chiffrer/déchiffrer les clés API Gemini/
Pexels de chaque utilisateur du module « À table », et la clé Gemini
partagée du module « El Profesor », voir plus bas). Ne les commitez jamais.

La clé API Gemini d'« El Profesor » ne se configure **pas** via une
variable d'environnement : un admin la renseigne depuis l'application
elle-même (bouton « Réglages IA » sur le tableau de bord du module), et
elle est stockée chiffrée en base avec `A_TABLE_ENCRYPTION_KEY`.

## Lancement en local

```bash
npm install
npm run dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

Scripts disponibles :

```bash
npm run dev         # Serveur de développement
npm run build        # Build de production
npm run start         # Démarrage du build de production
npm run lint           # ESLint
npm run typecheck       # Vérification TypeScript
```

## Déploiement sur Vercel

1. Poussez le dépôt sur GitHub.
2. Sur [vercel.com](https://vercel.com), importez le dépôt.
3. Renseignez les mêmes variables d'environnement que dans `.env.local`
   (Project Settings → Environment Variables) :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `A_TABLE_ENCRYPTION_KEY`
   - `NEXT_PUBLIC_SITE_URL` (l'URL finale de votre déploiement)
4. Déployez. Aucune configuration `next.config.ts` supplémentaire n'est
   nécessaire.
5. Pensez à ajouter l'URL de production (et les URLs de preview Vercel si
   vous en avez besoin) dans la liste **Redirect URLs** de Supabase
   (étape 4 de la configuration Supabase ci-dessus) — sans quoi les liens
   d'invitation et de réinitialisation de mot de passe échoueront en
   production.

## Ajouter un futur module métier

1. Créez le module dans `/admin/apps/new` (nom, slug, icône, description,
   statut, route).
2. Développez la page réelle sous `src/app/apps/<slug>/...` (elle remplacera
   la page générique `src/app/apps/[slug]/page.tsx` pour ce slug précis, une
   fois créée — Next.js privilégie la route statique la plus spécifique).
3. Attribuez l'accès aux utilisateurs concernés depuis leur fiche dans
   `/admin/users/<id>`.

Aucune autre modification de l'architecture n'est nécessaire : l'accès,
l'affichage dans le hub et la protection de route sont déjà gérés par la
structure existante.

## Module « À table »

Planificateur de repas assisté par IA : tableau hebdomadaire par
glisser-déposer, génération de propositions par Gemini, bibliothèque de
recettes, liste de courses agrégée, menus invités avec accords mets-vins,
import de recette (texte/photo), mode recette guidé avec minuteurs.

C'est un **portage natif** d'une intégration Home Assistant du même nom
(https://github.com/XeIaCraft/A-table) — pas un pont réseau vers Home
Assistant. Toute la logique métier (règles de génération, agrégation de la
liste de courses, prompts IA) est réimplémentée dans PreOx ; l'intégration
HA d'origine n'est plus utilisée à l'exécution.

**Différences volontaires par rapport à l'intégration HA d'origine :**

- **Multi-utilisateur** : chaque utilisateur a ses propres recettes,
  planning, courses et préférences (isolées par RLS,
  `supabase/migrations/20260101000001_a_table.sql`), et sa **propre clé
  API Gemini et Pexels** — pas de clé partagée côté serveur.
- **Vraies tables relationnelles** (une par type d'entité : `a_table_recipes`,
  `a_table_meal_cards`, `a_table_drafts`, `a_table_guest_menus`,
  `a_table_history`, `a_table_temporary_ingredients`, `a_table_settings`)
  plutôt qu'un blob JSON unique réécrit en entier à chaque sauvegarde —
  l'original ne tenait que par le mono-thread de Home Assistant.
- **Glisser-déposer** : change la colonne d'une carte (backlog ↔ jour) mais
  ne réordonne pas au sein d'une colonne — déjà une limite de l'intégration
  d'origine, conservée à l'identique plutôt que "corrigée" sans le demander.
- Transfert de la liste de courses vers une liste de tâches Home Assistant
  (`todo.add_item`) : sans objet ici, supprimé — la liste reste
  consultable/cochable nativement dans PreOx.
- Import de recette par photo : l'image est envoyée directement à Gemini
  (base64, en mémoire), jamais stockée.

**Clés API par utilisateur** : chaque personne configure ses propres clés
dans Réglages → Clés API, à l'intérieur du module (pas dans les variables
d'environnement du projet) :

- **Gemini** — clé gratuite sur [Google AI Studio](https://aistudio.google.com/apikey).
  Modèle par défaut : `gemini-3.1-flash-lite` (éditable).
- **Pexels** (facultatif, illustrations de plats) — clé gratuite sur
  [pexels.com/api](https://www.pexels.com/api/).

Les clés sont chiffrées at-rest (AES-256-GCM) avec la variable d'environnement
serveur `A_TABLE_ENCRYPTION_KEY` avant d'être stockées, et déchiffrées
uniquement à l'intérieur d'une Server Action juste avant l'appel à l'API
externe — jamais renvoyées en clair au navigateur.

## Module « El Profesor »

Génère des fiches de révision et des flashcards à partir de chapitres de
livres (un PDF = un chapitre), avec citation systématique de la source et
un système de révision espacée (FSRS) entièrement interne à PreOx — aucune
dépendance à Anki.

**Import et relecture, réservés aux admins du hub** (pas de rôle dédié) :

1. Créer un livre, puis importer un chapitre (PDF) depuis le tableau de
   bord du module.
2. Lancer l'extraction : le PDF est envoyé à Gemini (Files API — pas de
   limite de taille liée à l'upload inline, utile pour les chapitres
   scannés volumineux), qui identifie les sous-entités du chapitre (une
   fiche par sous-entité, découpage basé sur les sous-titres du livre
   lui-même), extrait des blocs de contenu **typés** (définition/mécanisme,
   valeurs & seuils, tableau comparatif, protocole par paliers,
   mnémotechnique, perle clinique, piège fréquent, formule, texte libre) et
   des flashcards — chaque bloc et chaque flashcard portent une **citation
   verbatim** (page + texte exact) du passage qui les fonde. Une passe de
   vérification IA signale ensuite les éléments dont la citation ou la
   fidélité au texte source semble douteuse.
3. Tout est stocké en brouillon (`draft`) — invisible des autres
   utilisateurs — jusqu'à relecture humaine dans l'écran de relecture (PDF
   affiché à côté du contenu généré, entièrement éditable, tableaux inclus)
   et publication, fiche par fiche ou en un clic pour tout le chapitre. Le
   statut brouillon/publié est porté par chaque bloc et chaque flashcard
   individuellement (pas seulement par la fiche), et appliqué par RLS, pas
   seulement par l'interface.
4. **Génération complémentaire** (bouton "Compléter" sur un chapitre déjà
   extrait ou publié) : relit le PDF en entier avec un résumé de ce qui est
   déjà couvert, et ne génère que les notions manquantes — jamais une
   redite de ce qui existe déjà. Les ajouts (nouveaux blocs sur une
   sous-entité existante, ou nouvelle sous-entité si un thème entier
   manquait) arrivent en brouillon sous la fiche concernée, même si elle
   est déjà publiée, et repassent par la même relecture avant publication.

**Consultation et révision, pour tout utilisateur ayant accès au module** :

- Bibliothèque en **lecture partagée** : le contenu publié est visible par
  tous, mais la progression de révision de chacun est strictement
  individuelle.
- Chaque fiche affiche le PDF source à côté ; cliquer sur une citation
  saute à la bonne page et surligne le passage exact (surlignage
  automatique sur le texte natif ; simple saut de page si la page est un
  scan sans calque texte).
- Révision **par chapitre** (jamais par livre — trop transversal) : une file
  « à réviser aujourd'hui » pilotée par l'algorithme FSRS, et une révision
  libre à la demande qui ne modifie jamais la planification (comme le mode
  "cram" d'Anki). Auto-évaluation façon Anki : réponse affichée, l'utilisateur
  juge lui-même correct/incorrect.

Le bucket de stockage privé des PDF (`el-profesor-pdfs`) est créé
automatiquement par la migration `20260101000002_el_profesor.sql` — aucune
étape manuelle dans le tableau de bord Supabase. Il n'a aucune policy
publique : tout accès passe par une Server Action qui vérifie les droits
puis génère une URL signée à courte durée de vie.

**Clé Gemini** : contrairement à « À table », l'extraction est une action
admin sur une bibliothèque partagée, pas une génération personnalisée par
utilisateur — une seule clé serveur suffit, pas de clé par utilisateur.
Elle se configure depuis l'application (bouton « Réglages IA » sur le
tableau de bord du module, réservé aux admins) et non via une variable
d'environnement — clé gratuite sur
[Google AI Studio](https://aistudio.google.com/apikey). Elle est chiffrée
at-rest (AES-256-GCM, même mécanisme que les clés d'« À table » ci-dessus)
avec `A_TABLE_ENCRYPTION_KEY`, dans une table dédiée (`el_profesor_secrets`)
dont la RLS n'autorise que les admins à la lire ou l'écrire — le modèle
(`el_profesor_settings.gemini_model`), lui, reste lisible par tout
utilisateur du module puisqu'il en a besoin pour l'action « proposer depuis
une sélection ».

## Sécurité

- Toutes les tables sensibles ont RLS activé ; les policies sont le dernier
  rempart, pas seulement l'UI.
- La clé `service_role` ne quitte jamais le serveur (Server Actions
  uniquement, jamais importée dans un Client Component).
- Les routes `/apps` et `/admin` sont protégées à trois niveaux : `proxy.ts`
  (redirection optimiste), la Data Access Layer (`requireProfile`/`requireAdmin`,
  vérité côté serveur), et RLS (vérité côté base de données).
- Un trigger PostgreSQL empêche un utilisateur d'auto-promouvoir son rôle,
  même via un appel direct à l'API Supabase.
