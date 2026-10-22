# Moodly

Mood tracking anonyme pour les équipes, autour du **Miroir** : le manager pronostique le moral de son équipe, puis le compare à la réalité. Voir `Moodly - Dossier projet.docx`.

```
supabase/   schéma SQL, règles RLS, fonctions, données de démo
api/        Next.js : l'API (app/api) et la version web (login, saisie, miroir, back-office admin)
```

## Mise en place

1. **Base** : dans Supabase → SQL Editor, exécuter les fichiers de `supabase/migrations/` dans l'ordre (`001_init.sql` à `007_weekly_questionnaire.sql`), puis `supabase/seed.sql` (démo).
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

Comptes de démo (mot de passe `moodly-demo`) : voir l'en-tête de `supabase/seed.sql`. `admin@moodly.test` ouvre le back-office sur `/admin` ; `thomas@`, `marc@` et `lina@moodly.test` sont managers.

## Démo

Sur la page de connexion, **Lancer la démo guidée** remet toute la démo à zéro (calée sur aujourd'hui) puis enchaîne 3 étapes avec un bandeau de guidage : Inès (collaboratrice) remplit le questionnaire, se place sur la matrice et découvre où ses réponses la situent, Thomas (manager) fait son pronostic et découvre le Miroir, puis le back-office RH. Les boutons Collaborateur / Manager / Admin entrent directement dans un rôle, eux aussi après remise à zéro.

- La remise à zéro (`private.demo_reset()`, migration 005) **efface tout ce qui n'est pas la démo** : à réserver à une base dédiée.
- `seed.sql` fait la même remise à zéro, rejouable à volonté.
- `DEMO_PASSWORD=` (vide) dans l'environnement de l'API désactive l'entrée en démo.

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
| POST | `/api/auth/demo` | public | `{ as: "employee" \| "manager" \| "admin", reset?: bool }` | idem, connecté au compte de démo |
| POST | `/api/auth/logout` | tous | | 204, révoque la session (et efface les cookies web) |
| GET | `/api/me` | tous | | `{ id, role: "employee" \| "manager" \| "admin", team: { id, name } \| null }` |
| GET | `/api/tags` | tous | | `[{ id, label }]` |
| GET | `/api/moods/week` | collaborateur | | `{ submitted, open, opens_on }` (fenêtre jeudi-vendredi) |
| POST | `/api/moods` | collaborateur | `{ pleasure, energy, impact: 1-5, answers: [9 notes 1-5], trend: -1/0/1, tagIds: [1 à 3 ids] }` | 204, une fois par semaine |
| POST | `/api/predictions` | manager | `{ pleasure, energy, impact: 1-5 }` (son équipe placée sur la matrice) | 204, une fois par semaine |
| GET | `/api/mirror?weeks=8` | manager | | voir ci-dessous |
| GET | `/api/actions` | manager, collaborateur | | `[{ id, week_start, label, factor, shared, done_at }]` (le collaborateur ne voit que les actions partagées) |
| POST | `/api/actions` | manager | `{ label, factor? }` (`intensite`, `autonomie`, `emotions`, `relations`, `sens`, `securite`) | `{ id }` (semaine en cours) |
| PATCH | `/api/actions` | manager | `{ id, done?: bool, shared?: bool }` | 204 |
| DELETE | `/api/actions` | manager | `{ id }` | 204 |
| GET | `/api/admin` | admin | | `{ stats, teams, users, tags }` (agrégats uniquement) |
| POST | `/api/admin/users` | admin | `{ email, password, role: "employee" \| "admin", teamId? }` | id du compte |
| PATCH | `/api/admin/users` | admin | `{ id, role, teamId? }` | 204 |
| DELETE | `/api/admin/users` | admin | `{ id }` | 204 |
| POST | `/api/admin/teams` | admin | `{ id?, name, managerId }` (sans id : création) | id de l'équipe |
| DELETE | `/api/admin/teams` | admin | `{ id }` (efface aussi son historique) | 204 |
| POST | `/api/admin/tags` | admin | `{ id?, label }` (sans id : création) | 204 |

`/api/mirror` renvoie `{ "needs_prediction": true }` tant que le pronostic de la semaine n'est pas fait. Sinon (semaines closes uniquement) :

```json
{
  "needs_prediction": false,
  "team_size": 8,
  "current": { "week_start": "2026-10-19", "responses": 3 },
  "last": { "week_start": "2026-10-12", "responses": 8, "team_avg": 4.17,
            "pleasure": 4.13, "energy": 4.13, "impact": 4.25,
            "zones": { "thriving": 5, "middle": 3 }, "energy_zones": { "enthusiasm": 7, "middle": 1 },
            "factors": { "intensite": 4, "autonomie": 3.5, "emotions": 3.88, "relations": 4.38, "sens": 3.75, "securite": 4.13 },
            "trend": { "better": 5, "same": 3, "worse": 0 }, "tags": ["Management", "Reconnaissance"] },
  "weeks": [{ "week_start": "2026-10-12", "prediction": 4, "forecast": { "pleasure": 4, "energy": 4, "impact": 4 },
              "team_avg": 4.17, "pleasure": 4.13, "energy": 4.13, "impact": 4.25, "responses": 8, "gap": -0.17,
              "dominant_tag": "Management", "factors": { "intensite": 4, "...": "..." } }]
}
```

- Une semaine (lundi → dimanche) n'est publiée qu'une fois close et avec au moins 5 réponses ; la semaine en cours ne montre que son nombre de réponses.
- Le pronostic (`forecast`) est un point sur la matrice et une utilité ; `prediction` en est la moyenne.
- Moral (`team_avg`) = moyenne des trois axes ; `gap = prediction - team_avg` (positif : le manager surestimait), angle mort au-delà de 1,5.
- Plan d'action : chaque action peut viser un facteur ; son effet se lit de la semaine close avant son lancement à la dernière semaine close (`weeks[].factors`).
- La matrice affichée est plaisir × énergie (`energy_zones` : `enthusiasm` « En forme », `serenity` « Serein·e », `tension` « Sous pression », `dejection` « À bout », `middle` « Mitigé », un axe à 3). Le 3e axe, l'impact (sentiment d'avoir été utile), s'affiche en jauge. `zones` (plaisir × impact) reste fourni mais n'est pas affiché.
- `factors` : les 6 facteurs de risques psychosociaux (Gollac) sur Q3 à Q11, de 1 à 5 (5 = favorable, Q6 inversée).

## Questionnaire hebdomadaire

Ouvert le **jeudi et le vendredi** (les comptes de démo y échappent), une réponse par semaine, environ 2 minutes :

1. 9 affirmations « Cette semaine… » (Q3 à Q11), la tendance par rapport à la semaine d'avant (Q12) et 1 à 3 sujets (Q13).
2. Le collaborateur se place lui-même : un point sur la matrice plaisir × énergie, et s'il s'est senti utile (impact).
3. On lui montre ensuite où ses réponses le situent (énergie : Q3 Q4 ; impact : Q5 Q9 Q10 ; plaisir : Q6 inversée, Q7 Q8 Q11) face à là où il s'est placé, sur la matrice et la jauge d'utilité. Cette comparaison reste sur son appareil.

## Anonymat

- La table `moods` n'a pas de colonne utilisateur. Une empreinte (hash utilisateur + semaine + sel secret) bloque seulement les doubles réponses.
- RLS activée sans aucune policy sur `moods` : aucune lecture directe possible, même avec un token valide.
- Le manager ne voit que des moyennes de semaines closes, à partir de 5 réponses : jamais une moyenne qui bouge réponse après réponse.
- Le pronostic est obligatoire avant d'afficher le Miroir, et ne peut plus être modifié ensuite.
- L'admin gère équipes, comptes et tags, mais ne voit que des agrégats : semaines closes avec au moins 5 réponses, comme le Miroir. Le rôle manager suit l'équipe (on le nomme depuis l'équipe).

## Version web

- **Collaborateur** (`/saisie`) : questionnaire de la semaine, placement sur la matrice et comparaison avec ses réponses. `/parcours` : sa trajectoire sur la matrice, son utilité ressentie, sa série et sa répartition sur 12 semaines, l'écart moyen entre son ressenti et ses réponses, export CSV. Ces données restent dans le navigateur (jamais envoyées).
- **Manager** (`/miroir`) : pronostic, graphe semaine par semaine, trajectoire de l'équipe sur la matrice, utilité ressentie, 6 facteurs de risques psychosociaux, tendance et sujets, plan d'action enregistré en base (suggestions, suivi, effet sur le moral la semaine suivante), export CSV et rapport PDF (impression).
- **Admin** (`/admin`) : équipes, comptes, sujets, matrice de l'entreprise (un point par équipe), export CSV et rapport PDF.
