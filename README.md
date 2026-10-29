# Rallly + Authentik — projet « Dev avec Docker »

Projet du module *Dev avec Docker* (M2 FullStack, Ynov). C'est un fork de [Rallly](https://github.com/lukevella/rallly),
un outil de sondage pour planifier des réunions. On l'héberge nous-mêmes avec Docker Compose,
derrière un reverse proxy, avec une connexion SSO via Authentik (OIDC). Une CI GitHub Actions construit et publie l'image.

## Architecture

```
                 navigateur
                     │  port HTTP_PORT (seul port publié)
                ┌────▼────┐                                réseau front
                │  Caddy  │──────────────┬───────────────┐
                └─────────┘              │               │
       auth.DOMAIN │           DOMAIN    │   mail.DOMAIN │
        ┌──────────▼───────┐      ┌──────▼─────┐   ┌─────▼─────┐
        │ authentik-server │◄OIDC─│   rallly   │──►│  mailpit  │
        │ authentik-worker │      │ (ce fork)  │   │ SMTP lab  │
        └──────────┬───────┘      └──────┬─────┘   └───────────┘
                   │                     │           réseau back (interne)
                   └──────►┌──────────┐◄─┘
                           │ postgres │  bases authentik + rallly
                           └──────────┘
```

| Service | Image | Rôle |
|---|---|---|
| caddy | `caddy:2.11-alpine` | Reverse proxy, point d'entrée unique |
| postgres | `postgres:16-alpine` | Base de données d'Authentik et de Rallly |
| authentik-server / worker | `ghcr.io/goauthentik/server:2026.8.3` | Fournisseur d'identité (SSO) |
| rallly | construite depuis [`infra/rallly/Dockerfile`](infra/rallly/Dockerfile) | L'application |
| mailpit | `axllent/mailpit:v1.31` | Faux serveur mail pour le lab (les mails sont visibles dans un webmail) |

- **2 réseaux** : `front` pour ce qui passe par Caddy, `back` pour la base. `back` est marqué `internal`, Postgres n'a donc aucun accès à l'extérieur.
- **Volume nommé** `postgres` : les données survivent à un `docker compose down`.
- Fichiers principaux : [`infra/compose.yaml`](infra/compose.yaml), [`infra/Caddyfile`](infra/Caddyfile),
  [`infra/authentik/blueprints/rallly.yaml`](infra/authentik/blueprints/rallly.yaml), [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Lancer le projet en local

Prérequis : Docker (ou Podman) avec Compose.

```bash
git clone https://github.com/HugoDGS/rallly.git
cd rallly/infra
cp .env.example .env
# remplir les valeurs vides du .env, par exemple avec : openssl rand -base64 36 | tr -d '\n/+='
docker compose up -d --build
```

Le premier build de l'image Rallly prend une dizaine de minutes. Pour récupérer l'image déjà construite par la CI à la place :
`docker compose pull && docker compose up -d`.

Une fois la stack démarrée (Authentik met 1 à 2 minutes au premier lancement) :

| URL | Service |
|---|---|
| http://rallly.localhost:8080 | Rallly |
| http://auth.rallly.localhost:8080/if/admin/ | Administration Authentik (compte `akadmin`) |
| http://mail.rallly.localhost:8080 | Mailpit |

Les navigateurs résolvent `*.localhost` tout seuls, il n'y a rien à ajouter dans `/etc/hosts`.
On utilise le port 8080 car Docker/Podman en mode *rootless* ne peut pas écouter sur un port inférieur à 1024.

Arrêter la stack : `docker compose down` (ajouter `-v` pour supprimer aussi les données).

### Comptes de démo

Ils sont créés automatiquement au démarrage. Mot de passe : la valeur de `DEMO_PASSWORD` dans le `.env`.

| Compte | Groupe Authentik | Accès à Rallly | Admin Authentik |
|---|---|---|---|
| `alice` | `rallly-admins` | oui | oui |
| `bob` | `rallly-users` | oui | non |
| `eve` | aucun | refusé | non |

La configuration d'Authentik (SSO, policies par groupe, invitation d'un utilisateur externe) est expliquée dans [docs/authentik.md](docs/authentik.md).

## Image Rallly

L'image est construite avec notre propre [`Dockerfile`](infra/rallly/Dockerfile), en deux étapes (multi-stage) :

1. **build** : installation des dépendances avec pnpm, puis compilation de Rallly. Les fichiers de dépendances sont copiés avant le code pour profiter du cache.
2. **image finale** : `node:24-slim` à jour (`apt-get upgrade`), avec uniquement le résultat de la compilation, et lancée avec un utilisateur `rallly` qui n'est pas root.

L'image finale fait environ 725 Mo, contre environ 1 Go pour l'image officielle de Rallly.
Au démarrage, le conteneur applique les migrations de la base puis lance le serveur. Un `HEALTHCHECK` vérifie `/api/status`.

## Déploiement sur la VM Énov

1. Suivre la [documentation Énov](https://github.com/Enov-Salle-Serveur/Documentation_Public/blob/main/README.md) : compte, VPN NetBird, clé SSH, création de la VM.
2. Sur la VM, installer Docker puis :
   ```bash
   git clone https://github.com/HugoDGS/rallly.git
   cd rallly/infra
   cp .env.example .env   # DOMAIN=<IP_VM>.sslip.io, HTTP_PORT=80 et des secrets propres à la VM
   docker compose pull
   docker compose up -d
   ```
3. Pour mettre à jour : `git pull && docker compose pull && docker compose up -d`.

On utilise le même `compose.yaml` en local et sur la VM, seul le `.env` change :

| | Local | VM |
|---|---|---|
| `DOMAIN` | `rallly.localhost` | `<IP_VM>.sslip.io` (sslip.io renvoie l'IP contenue dans le nom) |
| `HTTP_PORT` | 8080 | 80 |
| Image Rallly | construite en local (`--build`) | récupérée sur GHCR (`pull`) |
| Secrets | propres à chaque poste | propres à la VM, jamais dans Git |

Si le DNS du poste client bloque les réponses en IP privée, ajouter les trois noms dans son `/etc/hosts`.

## CI/CD

Le workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) se lance sur chaque pull request et sur `main` :

1. **Valider le Compose** : `docker compose config` avec un `.env` de test.
2. **Build** de l'image avec `infra/rallly/Dockerfile`.
3. **Test** : on lance l'image avec une base Postgres de test et on vérifie que `/api/status` répond (donc que les migrations passent et que le serveur démarre).
4. **Scan Trivy** : un rapport HIGH + CRITICAL est affiché dans le résumé du run, puis un second scan **fait échouer le job** s'il reste une faille CRITICAL corrigeable.
5. **Publication** : seulement sur `main` et si toutes les étapes d'avant sont vertes, l'image est poussée sur GHCR avec deux tags, `:main` et `:sha-<commit>`.

Chaque étape bloque la suivante : une image qui ne démarre pas ou qui a une faille critique n'est jamais publiée.
On bloque seulement sur CRITICAL : les HIGH restants viennent de dépendances indirectes de Rallly (`undici`, `brace-expansion`), qu'on ne peut pas mettre à jour sans risquer de casser l'application. Ils restent visibles dans le rapport.

Le déploiement sur la VM reste manuel (`docker compose pull`), car la VM n'est joignable que par le VPN.

## Sécurité

- **Secrets hors de l'image et du dépôt** : ils sont dans `infra/.env`, ignoré par Git. Seul `.env.example` est commité.
- **Un seul port publié** : celui de Caddy. La base de données n'a pas de port publié et reste sur un réseau interne.
- **Utilisateurs non-root** : Rallly tourne en `rallly`, Authentik en `authentik`, Caddy et Mailpit en `nobody`. Postgres démarre en root puis passe sur l'utilisateur `postgres`.
- **Moindre privilège** : `cap_drop: ALL` et `no-new-privileges` sur tous les services. On rajoute seulement les capacités nécessaires à Postgres et Caddy (`NET_BIND_SERVICE`, demandée par son binaire).
- **Lecture seule** : Caddy et Mailpit sont en `read_only`, leurs fichiers temporaires vont dans un `tmpfs`. Caddy n'a plus de volume (pas de certificat à garder en HTTP).
- **Pas de socket Docker** : le worker Authentik ne monte pas `/var/run/docker.sock` (le Compose officiel le fait, on n'en a pas besoin).
- **Scan Trivy** à chaque build. Pour l'instant le scan n'est pas bloquant : les vulnérabilités restantes viennent des dépendances Node de Rallly.
- **Moins d'appels sortants** : notre image ne contacte pas `api.rallly.co` et la télémétrie de Next.js est désactivée. Côté Authentik, la vérification des mises à jour et l'envoi des rapports d'erreur sont désactivés.

**Limites connues** : HTTP sans TLS (la VM n'est accessible que par le VPN), webmail Mailpit sans mot de passe et non conservé (outil de lab), un seul utilisateur Postgres pour les deux bases.

## Features Rallly

| Feature | Responsable | Branche | Statut |
|---|---|---|---|
| #4 — Expiration automatique du sondage | Hugo | `feature/poll-deadline` | terminée |
| #5 — Bloquer le vote sur les dates passées | Lilian | `feature/block-past-dates` | à faire |
| Libre — Taux de participation | Leyna | `feature/participation` | à faire |
| Bonus — Badge « prochain créneau » | Hugo | `feature/deadline-badge` | terminée |

> Au départ on avait choisi la #9 (désactiver les commentaires), mais elle existe déjà dans Rallly. On l'a remplacée par la #4.
> Le badge « prochain créneau » était notre première feature libre, quand on était 2. Depuis l'arrivée de Leyna, la feature libre est le taux de participation et le badge reste en bonus.

### #4 — Expiration automatique

L'organisateur fixe une date limite de vote (*Gérer → Date limite de vote*). Une fois la date passée, on ne peut plus voter ni modifier son vote.
Le formulaire disparaît et le serveur refuse aussi les votes envoyés directement à l'API. Un bandeau affiche « Clôture des votes le … », puis « Votes clos depuis le … ».
On réutilise la colonne `deadline` qui existait déjà dans la base, donc il n'y a pas de migration.

*Démo* : mettre une date limite dans 1 minute, voter (ça marche), attendre, revoter (c'est refusé).

### Feature libre — taux de participation

*Problème* : l'organisateur ne voit pas facilement combien de personnes ont déjà répondu avant de choisir un créneau.
*Solution* : sous le titre du sondage, on affiche le nombre de participants qui ont voté.

### Bonus — badge « prochain créneau »

*Problème* : en ouvrant un sondage, un participant ne voit pas tout de suite si c'est urgent de répondre.
*Solution* : sous le titre du sondage, un badge indique le temps restant avant le prochain créneau (« Prochain créneau dans 3 jours »),
ou « Tous les créneaux sont passés ». Modification uniquement côté interface.

## Organisation Git

- `main` est protégée : on passe obligatoirement par une pull request, et la CI doit être verte pour merger.
- Une branche par sujet : `feature/…` pour les features, `infra/…` pour l'infrastructure.

## Équipe

| Membre | Rôle |
|---|---|
| Hugo Gomes Duarte | Infrastructure (Compose, Authentik, CI), feature #4 |
| Lilian Sonzogni | Déploiement sur la VM Énov, feature #5 |
| Leyna Belgherbi | Feature libre, schéma d'architecture, slides de la soutenance |

---

Rallly est distribué sous licence [AGPL-3.0](LICENSE).
