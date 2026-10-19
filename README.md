# Moodly

Mood tracking anonyme pour les équipes, autour du **Miroir** : le manager pronostique le moral de son équipe, puis le compare à la réalité. Voir `Moodly - Dossier projet.docx`.

```
supabase/   schéma SQL, règles RLS, fonctions, données de démo
api/        Next.js : l'API (app/api) et la version web (login, saisie, miroir)
```

## Mise en place

1. **Base** : dans Supabase → SQL Editor, exécuter `supabase/migrations/001_init.sql`, puis `supabase/seed.sql` (démo).
2. **API** :
   ```bash
   cd api && npm install && npm run dev
   ```
   Les clés Supabase sont dans `api/.env`. Version web sur http://localhost:3000.
3. **Tests SQL** (Postgres en mémoire, aucune connexion nécessaire) : `npm run test:db` dans `api/`.

Comptes de démo : voir l'en-tête de `supabase/seed.sql`.

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
| GET | `/api/me` | tous | | `{ id, role: "employee" \| "manager", team: { id, name } }` |
| GET | `/api/tags` | tous | | `[{ id, label }]` |
| GET | `/api/moods/today` | collaborateur | | `{ submitted: bool }` |
| POST | `/api/moods` | collaborateur | `{ score: 1-5, tagIds: [1 à 3 ids] }` | 204 |
| POST | `/api/predictions` | manager | `{ score: 1-5 }` (ex. 3.5) | 204 |
| GET | `/api/mirror?days=30` | manager | | voir ci-dessous |

`/api/mirror` renvoie `{ "needs_prediction": true }` tant que le pronostic de la semaine n'est pas fait. Sinon :

```json
{
  "needs_prediction": false,
  "team_size": 8,
  "avg_daily_responses": 6.9,
  "days":  [{ "day": "2026-10-13", "team_avg": 4.29, "responses": 7 }],
  "weeks": [{ "week_start": "2026-10-12", "prediction": 3.5, "team_avg": 4.31,
              "gap": -0.81, "dominant_tag": null }]
}
```

- `days` : moyenne quotidienne, seulement pour les jours avec au moins 5 réponses.
- `weeks` : `gap = prediction - team_avg` (positif : le manager surestime). `dominant_tag` est rempli quand `|gap| > 1,5`.

## Anonymat

- La table `moods` n'a pas de colonne utilisateur. Une empreinte (hash utilisateur + jour + sel secret) bloque seulement les doubles saisies.
- RLS activée sans aucune policy sur `moods` : aucune lecture directe possible, même avec un token valide.
- Le manager ne voit que des moyennes, à partir de 5 réponses par jour.
- Le pronostic est obligatoire avant d'afficher le Miroir, et ne peut plus être modifié ensuite.
