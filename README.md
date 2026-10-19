# Moodly

Mood tracking anonyme pour les équipes, autour du **Miroir** : le manager pronostique le moral de son équipe, puis le compare à la réalité. Voir `Moodly - Dossier projet.docx`.

```
supabase/   schéma SQL, règles RLS, fonctions, données de démo
api/        Next.js : l'API (app/api) et la version web (login, saisie, miroir, back-office admin)
```

## Mise en place

1. **Base** : dans Supabase → SQL Editor, exécuter les fichiers de `supabase/migrations/` dans l'ordre (`001_init.sql` à `004_features.sql`), puis `supabase/seed.sql` (démo).
   Base déjà en place : exécuter seulement les migrations manquantes. Après `002_admin.sql`, nommer un premier admin :
   ```sql
   update profiles set role = 'admin', team_id = null
   where id = (select id from auth.users where email = 'emma@moodly.test');
   ```
2. **API** :
   ```bash
   cd api && npm install && npm run dev
   ```
   Les clés Supabase sont dans `api/.env`. Version web sur http://localhost:3000.
3. **Tests** (aucune connexion nécessaire) : `npm run test:db` (SQL sur un Postgres en mémoire) et `npm run test:csv` (export CSV) dans `api/`.

Comptes de démo : voir l'en-tête de `supabase/seed.sql` (`admin@moodly.test` ouvre le back-office sur `/admin`).

## Authentification

La version web utilise les mêmes routes : la connexion pose les tokens en cookies httpOnly, renouvelés automatiquement.

L'app iOS ne parle qu'à l'API (pas de SDK Supabase nécessaire) :

1. `POST /api/auth/login` avec `{ email, password }` → `{ access_token, refresh_token, expires_at }`.
2. Chaque appel envoie `Authorization: Bearer <access_token>`. L'API le transmet à Supabase : les règles RLS s'appliquent à l'utilisateur connecté.
3. Le token expire après 1 h (`expires_at`, timestamp Unix) : `POST /api/auth/refresh` avec `{ refresh_token }` renvoie une nouvelle paire. Déconnexion : `POST /api/auth/logout` puis supprimer les tokens du Keychain.

## Endpoints

Erreurs : `{ "error": "message" }` avec le code HTTP (401 token absent/invalide, 403 mauvais rôle, 409 déjà fait, 400 saisie invalide).

| Méthode | Route | Rôle | Corps | Réponse |
|---|---|---|---|---|
| POST | `/api/auth/login` | public | `{ email, password }` | `{ access_token, refresh_token, expires_at }` |
| POST | `/api/auth/refresh` | public | `{ refresh_token }` | idem |
| POST | `/api/auth/logout` | tous | | 204, révoque la session (et efface les cookies web) |
| GET | `/api/me` | tous | | `{ id, role: "employee" \| "manager" \| "admin", team: { id, name } \| null }` |
| GET | `/api/tags` | tous | | `[{ id, label }]` |
| GET | `/api/moods/today` | collaborateur | | `{ submitted: bool }` |
| POST | `/api/moods` | collaborateur | `{ impact: 1-5, pleasure: 1-5, tagIds: [1 à 3 ids] }` (ancien format `{ score }` encore accepté) | 204 |
| POST | `/api/predictions` | manager | `{ score: 1-5 }` (ex. 3.5) | 204 |
| GET | `/api/mirror?days=30` | manager | | voir ci-dessous |
| GET | `/api/actions` | manager | | `[{ id, week_start, label, done_at }]` (plan d'action de son équipe) |
| POST | `/api/actions` | manager | `{ label }` | `{ id }` (semaine en cours) |
| PATCH | `/api/actions` | manager | `{ id, done: bool }` | 204 |
| DELETE | `/api/actions` | manager | `{ id }` | 204 |
| GET | `/api/admin` | admin | | `{ stats, teams, users, tags }` (agrégats uniquement) |
| POST | `/api/admin/users` | admin | `{ email, password, role: "employee" \| "admin", teamId? }` | id du compte |
| PATCH | `/api/admin/users` | admin | `{ id, role, teamId? }` | 204 |
| DELETE | `/api/admin/users` | admin | `{ id }` | 204 |
| POST | `/api/admin/teams` | admin | `{ id?, name, managerId }` (sans id : création) | id de l'équipe |
| DELETE | `/api/admin/teams` | admin | `{ id }` (efface aussi son historique) | 204 |
| POST | `/api/admin/tags` | admin | `{ id?, label }` (sans id : création) | 204 |

`/api/mirror` renvoie `{ "needs_prediction": true }` tant que le pronostic de la semaine n'est pas fait. Sinon :

```json
{
  "needs_prediction": false,
  "team_size": 8,
  "avg_daily_responses": 6.9,
  "matrix": { "responses": 48, "impact": 3.5, "pleasure": 3.9,
              "zones": { "thriving": 17, "dreamer": 9, "robot": 4, "danger": 2, "middle": 16 },
              "zone_tags": { "robot": ["Charge de travail"] } },
  "days":  [{ "day": "2026-10-13", "team_avg": 4.29, "responses": 7 }],
  "weeks": [{ "week_start": "2026-10-12", "prediction": 3.5, "team_avg": 4.31,
              "impact": 4.4, "pleasure": 4.2, "gap": -0.81, "dominant_tag": null }]
}
```

- Matrice du bonheur au travail : chaque réponse est un point (impact, plaisir). `team_avg` est la moyenne des deux axes.
- `matrix` : 7 derniers jours sans aujourd'hui, jours d'au moins 5 réponses ; `null` sinon. Zones : `thriving` (impact et plaisir > 3), `dreamer` (impact < 3, plaisir > 3), `robot` (impact > 3, plaisir < 3), `danger` (les deux < 3), `middle` (un axe à 3).
- `zone_tags` : les 2 sujets les plus cités par zone, seulement pour les zones d'au moins 5 réponses.
- `weeks[].impact` / `pleasure` : point de la semaine sur la matrice (trajectoire de l'équipe).
- `days` : moyenne quotidienne, seulement pour les jours avec au moins 5 réponses.
- `weeks` : `gap = prediction - team_avg` (positif : le manager surestime). `dominant_tag` est rempli quand `|gap| > 1,5`.

## Anonymat

- La table `moods` n'a pas de colonne utilisateur. Une empreinte (hash utilisateur + jour + sel secret) bloque seulement les doubles saisies.
- RLS activée sans aucune policy sur `moods` : aucune lecture directe possible, même avec un token valide.
- Le manager ne voit que des moyennes, à partir de 5 réponses par jour.
- Le pronostic est obligatoire avant d'afficher le Miroir, et ne peut plus être modifié ensuite.
- L'admin gère équipes, comptes et tags, mais ne voit que des agrégats : jours passés avec au moins 5 réponses, comme le Miroir. Le rôle manager suit l'équipe (on le nomme depuis l'équipe).

## Version web

- **Collaborateur** (`/saisie`) : point sur la matrice + 1 à 3 sujets. `/parcours` : sa trajectoire, sa série et sa répartition par zone sur 30 jours, export CSV. Ces données restent dans le navigateur (jamais envoyées).
- **Manager** (`/miroir`) : pronostic, graphe, trajectoire de l'équipe sur la matrice avec sujets par zone, plan d'action enregistré en base (suggestions, suivi, effet sur le moral la semaine suivante), export CSV et rapport PDF (impression).
- **Admin** (`/admin`) : équipes, comptes, tags, matrice de l'entreprise (un point par équipe), export CSV et rapport PDF.
