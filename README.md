# PreOx

PreOx est un **hub applicatif** : une plateforme centrale qui donne accès à
plusieurs applications/modules, avec une gestion fine des droits par
utilisateur et par module. Cette V1 pose la base : landing page, authentification
(admin / utilisateur), gestion des utilisateurs, et logique d'accès aux
modules. Les applications métier elles-mêmes ne sont pas encore développées —
la structure est prête à les accueillir.

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
  lib/
    supabase/                   Clients Supabase (browser, server, admin) + types
    auth/dal.ts                 Data Access Layer : requireUser/requireProfile/requireAdmin
    apps.ts                     Résolution des modules accessibles pour un profil
    site-url.ts                 Résolution de l'URL publique (emails)
    icon-map.tsx                Icônes disponibles pour les modules
  proxy.ts                      Rafraîchissement de session + garde d'accès optimiste
supabase/
  migrations/                  Schéma, RLS, triggers
  seed.sql                     5 modules de démonstration
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
2. **Exécuter la migration** : ouvrez le **SQL Editor** du projet, collez le
   contenu de `supabase/migrations/20260101000000_init.sql`, exécutez.
   *(Si vous utilisez la CLI Supabase : `supabase db push`.)*
3. **(Optionnel) Charger les modules de démonstration** : faites de même avec
   `supabase/seed.sql` pour créer les 5 modules d'exemple (Cas cliniques,
   Fiches, Checklists, Révision, Outils spécialisés).
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
# Optionnel en local, recommandé en production :
# NEXT_PUBLIC_SITE_URL=https://votre-domaine.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` est **secrète** : elle n'est jamais préfixée par
`NEXT_PUBLIC_` et n'est utilisée que côté serveur (Server Actions
d'administration : invitation, suppression d'utilisateurs). Ne la commitez
jamais.

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
