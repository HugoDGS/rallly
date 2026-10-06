# Rallly + Authentik — projet « Dev avec Docker » (M2 FullStack)

Fork de [lukevella/rallly](https://github.com/lukevella/rallly) : Rallly self-hosted derrière un reverse proxy,
authentification SSO via Authentik (OIDC), déployé en local et sur VM Énov, avec CI GitHub Actions.

## Architecture

```
                navigateur
                    │  :HTTP_PORT (seul port exposé)
               ┌────▼────┐                                   réseau front
               │  Caddy  │──────────────┬───────────────┐
               └─────────┘              │               │
      auth.DOMAIN │          DOMAIN     │   mail.DOMAIN │
       ┌──────────▼───────┐      ┌──────▼─────┐   ┌─────▼─────┐
       │ authentik-server │◄OIDC─│   rallly   │──►│  mailpit  │
       │ authentik-worker │      │ (ce fork)  │   │ SMTP lab  │
       └──────────┬───────┘      └──────┬─────┘   └───────────┘
                  │                     │                 réseau back (internal)
                  └──────►┌──────────┐◄─┘
                          │ postgres │  bases : authentik, rallly
                          └──────────┘
```

| Service | Image | Rôle |
|---|---|---|
| caddy | `caddy:2.11-alpine` | Reverse proxy, point d'entrée unique |
| postgres | `postgres:16-alpine` | BDD Authentik + Rallly, réseau interne uniquement |
| authentik-server / worker | `ghcr.io/goauthentik/server:2026.8.3` | IdP OIDC ; config par blueprint |
| rallly | `ghcr.io/hugodgs/rallly:main` | Application (image construite par la CI depuis ce fork) |
| mailpit | `axllent/mailpit:v1.31` | SMTP de lab + webmail |

Fichiers : [`infra/compose.yaml`](infra/compose.yaml), [`infra/Caddyfile`](infra/Caddyfile),
[`infra/authentik/blueprints/rallly.yaml`](infra/authentik/blueprints/rallly.yaml), [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Démarrage local

Prérequis : Docker (ou Podman) avec Compose.

```bash
git clone https://github.com/HugoDGS/rallly.git && cd rallly/infra
cp .env.example .env
# remplir les secrets vides, ex. : openssl rand -base64 36 | tr -d '\n/+='
docker compose up -d
```

Premier démarrage ≈ 2 min (migrations Authentik). Puis :

| URL | |
|---|---|
| http://rallly.localhost:8080 | Rallly |
| http://auth.rallly.localhost:8080/if/admin/ | Admin Authentik (`akadmin`) |
| http://mail.rallly.localhost:8080 | Mailpit |

`*.localhost` est résolu automatiquement par les navigateurs : aucun `/etc/hosts` à modifier.
`HTTP_PORT=8080` car Docker/Podman *rootless* ne peut pas écouter sur un port < 1024.

### Comptes de démo

Mot de passe : `DEMO_PASSWORD` du `.env`.

| Compte | Groupe | Rallly | Admin Authentik |
|---|---|---|---|
| `alice` | rallly-admins | ✅ | ✅ |
| `bob` | rallly-users | ✅ | ❌ |
| `eve` | — | ❌ refusé | ❌ |

SSO, policies et invitation externe : voir [docs/authentik.md](docs/authentik.md).

## Déploiement VM Énov

1. Suivre la [doc Énov](https://github.com/Enov-Salle-Serveur/Documentation_Public/blob/main/README.md) : compte → VPN NetBird → clé SSH → création de la VM.
2. Sur la VM : installer Docker, puis
   ```bash
   git clone https://github.com/HugoDGS/rallly.git && cd rallly/infra
   cp .env.example .env   # DOMAIN=<IP_VM>.sslip.io, HTTP_PORT=80, secrets propres à la VM
   docker compose pull && docker compose up -d
   ```
3. Mise à jour : `git pull && docker compose pull && docker compose up -d`.

**Écarts local / VM** (même `compose.yaml`, seul le `.env` change) :

| | Local | VM |
|---|---|---|
| `DOMAIN` | `rallly.localhost` | `<IP_VM>.sslip.io` (DNS public qui résout vers l'IP) |
| `HTTP_PORT` | 8080 (rootless) | 80 |
| Secrets | propres à chaque dev | propres à la VM, partagés hors Git |

Si le résolveur DNS bloque les réponses en IP privée, ajouter les 3 noms dans le `/etc/hosts` du poste client.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml), sur chaque PR et sur `main` :

1. **compose** : `docker compose config` valide la stack.
2. **image** : build de l'image Rallly (`apps/web/Dockerfile`, `SELF_HOSTED=true`) → scan **Trivy** (HIGH/CRITICAL corrigeables, rapport dans le résumé du run) → **push sur GHCR** uniquement sur `main` (`:main` et `:sha-…`).

Le déploiement VM reste manuel (`docker compose pull`) : la VM n'est joignable que via le VPN.
Le package GHCR doit être passé en **public** (Package settings → Change visibility) pour que la VM puisse le tirer sans login.

## Sécurité

- **Secrets hors dépôt** : `infra/.env` ignoré par Git, seul `.env.example` est commité ; rien n'est inclus dans les images.
- **Surface réduite** : un seul port publié (Caddy) ; Postgres sur un réseau `internal` sans accès extérieur, aucun port exposé.
- **Moindre privilège** : `cap_drop: ALL` + `no-new-privileges` sur tous les services (seules les capacités nécessaires sont rajoutées à Postgres et Caddy) ; Caddy en `read_only`.
- **Non-root** : Rallly tourne en `nextjs`, Authentik en `authentik` ; contrairement au Compose officiel, le worker n'a **pas** le socket Docker (inutile sans outpost).
- **Scan** : Trivy à chaque build. Le scan est informatif (`exit-code 0`) : une partie des CVE vient de l'image de base `node` upstream, hors de notre contrôle ; on suit le rapport plutôt que de bloquer la CI.

**Limites assumées** : HTTP sans TLS (réseau privé VPN) ; webmail Mailpit sans authentification (SMTP de lab) ; un seul utilisateur Postgres pour les deux bases.

## Features Rallly

| Feature | Branche | Statut |
|---|---|---|
| #4 — Expiration automatique du sondage | `feature/poll-deadline` | ✅ |
| #5 — Bloquer le vote sur les dates/heures passées | `feature/block-past-dates` | à faire |
| Libre — Badge « échéance » | `feature/deadline-badge` | à faire |

> La #9 (désactiver les commentaires) était envisagée, mais elle est déjà entièrement livrée upstream ; remplacée par la #4.

**#4 — Expiration automatique**
*Périmètre :* l'organisateur fixe une date limite (*Gérer → Date limite de vote*). Une fois passée, plus aucun vote ne peut être ajouté ni modifié :
le formulaire disparaît et le serveur refuse toute écriture (`lockOpenPoll`, sous verrou de la ligne du sondage), même via un appel direct.
Un bandeau indique « Clôture des votes le … » puis « Votes clos depuis le … ». Réutilise la colonne `polls.deadline` existante : aucune migration.
*Démo :* fixer une date limite dans 1 minute → voter (OK) → attendre → le vote est refusé sans action de l'organisateur.

**Feature libre — badge « échéance »**
*Problème :* un participant ne voit pas d'un coup d'œil s'il est urgent de répondre.
*Périmètre :* sur la page d'un sondage, un badge affiche le temps restant avant le prochain créneau à venir
(« Prochain créneau dans 3 jours ») ou « Tous les créneaux sont passés ». Front uniquement, sans migration.

## Workflow Git

- `main` protégée : PR obligatoire, CI verte, 1 review.
- Une branche par feature (`feature/…`), une branche pour l'infra (`infra/…`).

## Équipe

| Membre | Rôle |
|---|---|
| Hugo Gomes Duarte | Infra (Compose, Authentik, CI) — feature #4 — feature libre |
| Lilian Sonzogni | Déploiement VM Énov — feature #5 |

---

Rallly est distribué sous licence [AGPL-3.0](LICENSE).
