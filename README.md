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
docker compose -f compose.yaml -f compose.dev.yaml up -d
```

C'est le **mode dev** : pas de build d'image pour Rallly. [`infra/compose.dev.yaml`](infra/compose.dev.yaml) remplace le service `rallly`
par un conteneur `node:24-slim` qui monte le dépôt (bind mount) et lance `next dev`. Une modification du code est visible
dans le navigateur sans rien relancer. Le premier démarrage prend quelques minutes (`pnpm install`), les suivants sont rapides
grâce au volume `pnpm-store`. Logs : `docker compose logs -f rallly`.

Pour tester l'image de production, celle que la CI construit et publie : `docker compose pull && docker compose up -d`.

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

## Déploiement sur la VM

La VM est hébergée sur le serveur personnel de Lilian, avec l'accord du prof : une VM Incus (Debian 13, 4 vCPU, 8 Go de RAM,
60 Go de disque, Docker), **isolée** du réseau où elle tourne. Elle sort sur Internet (pour `git pull` et `docker compose pull`),
mais ne peut joindre ni le serveur, ni le réseau local. On n'y entre que par un **Cloudflare Tunnel**, connexion sortante du serveur
vers Cloudflare : la VM n'a besoin d'aucun port ouvert sur la box.

```
 navigateur ──HTTPS──► Cloudflare ──tunnel chiffré──► serveur ──HTTP──► VM : Caddy :80 ──► stack (comme en local)
             (certificat, Access)
```

| Adresse | Service | Accès |
|---|---|---|
| https://rallly-ynov.liliansonzogni.fr | Rallly | public, connexion via Authentik |
| https://auth-ynov.liliansonzogni.fr | Authentik | public (c'est lui qui authentifie) |
| https://mail-ynov.liliansonzogni.fr | Mailpit | **Cloudflare Access** : adresses `@ynov.com` de l'équipe et du prof, code à usage unique par mail |
| https://ssh-ynov.liliansonzogni.fr | SSH | **Cloudflare Access**, terminal dans le navigateur |

**Se connecter en SSH** : rien à installer. On ouvre `ssh-ynov`, on saisit son adresse `@ynov.com` et le code reçu par mail,
et un terminal s'ouvre dans le navigateur. Le compte Linux est le début de l'adresse (`prenom.nom`). Access signe pour chaque
session un certificat SSH valable quelques minutes : pas de mot de passe ni de clé à gérer. Chacun a `sudo` et `docker` dans la VM.

### Déployer

Premier déploiement, depuis la VM (dossier partagé `/srv/projet`) :
```bash
cd /srv/projet
git clone https://github.com/HugoDGS/rallly.git
cd rallly/infra
cp .env.example .env   # valeurs « VM » ci-dessous, secrets générés sur la VM (openssl rand)
docker compose pull
docker compose up -d
```

- Mettre à jour : `git pull && docker compose pull && docker compose up -d`.
- Démo d'une feature : mettre l'image de sa branche dans le `.env`, par exemple
  `RALLLY_IMAGE=ghcr.io/hugodgs/rallly:feature-block-past-dates`, puis `docker compose pull && docker compose up -d`.
  La VM ne construit jamais rien.
- Avant chaque gros déploiement, Lilian prend un instantané de la VM, pour pouvoir revenir en arrière.

### Local et VM

Le même `compose.yaml` sert partout, seul le `.env` change :

| | Local | VM |
|---|---|---|
| `DOMAIN` | `rallly.localhost` | `ynov.liliansonzogni.fr` (sert seulement aux alias internes et aux adresses mail de démo) |
| `HTTP_PORT` | 8080 | 80 |
| `RALLLY_HOST`, `AUTH_HOST`, `MAIL_HOST` | absents : `DOMAIN`, `auth.DOMAIN`, `mail.DOMAIN` | `rallly-ynov.`, `auth-ynov.`, `mail-ynov.liliansonzogni.fr` |
| `RALLLY_PUBLIC_URL`, `AUTH_PUBLIC_URL` | absents : `http://…:8080` | `https://rallly-ynov.liliansonzogni.fr`, `https://auth-ynov.liliansonzogni.fr` |
| TLS | aucun | terminé par Cloudflare. `TRUSTED_PROXIES=private_ranges` : Caddy garde le `X-Forwarded-Proto: https` du tunnel, sinon Authentik construit ses URL en http |
| Rallly | code monté + `next dev` (`compose.dev.yaml`) | image GHCR construite par la CI (`pull`) |
| Secrets | propres à chaque poste | générés sur la VM, jamais dans Git |
| Accès | le poste lui-même | Internet, via Cloudflare (Mailpit et SSH derrière Access) |

Trois choix à connaître :
- **Noms à un seul niveau** (`rallly-ynov.` et non `rallly.ynov.`) : le certificat gratuit de Cloudflare couvre
  `*.liliansonzogni.fr`, pas `*.ynov.liliansonzogni.fr`.
- **Rallly joint Authentik par l'URL publique**, comme le navigateur, en passant par Internet et le tunnel. L'issuer OIDC
  est donc le même des deux côtés. C'est pour ça que `DOMAIN` ne doit pas être un des noms publics : les alias réseau de Caddy
  enverraient Rallly sur `caddy:443`, qui n'écoute pas.
- **Exploitation** : instantané quotidien de la VM (gardé 7 jours), sauvegarde chiffrée chaque nuit du `.env` et des bases
  (`pg_dumpall`), alerte Discord si la VM ou le tunnel tombe.

## CI/CD

Le workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) se lance sur chaque pull request et à chaque push sur `main` ou sur une branche `feature/…` :

1. **Valider le Compose** : `docker compose config` avec un `.env` de test.
2. **Build** de l'image avec `infra/rallly/Dockerfile`.
3. **Test** : on lance l'image avec une base Postgres de test et on vérifie que `/api/status` répond (donc que les migrations passent et que le serveur démarre).
4. **Scan Trivy** : un rapport HIGH + CRITICAL est affiché dans le résumé du run, puis un second scan **fait échouer le job** s'il reste une faille CRITICAL corrigeable.
5. **Publication** : sur un push (pas sur une pull request) et si toutes les étapes d'avant sont vertes, l'image est poussée sur GHCR
   avec deux tags : le nom de la branche (`:main`, `:feature-poll-deadline`…, les `/` deviennent des `-`) et `:sha-<commit>`.
   Comme `main` ne contient pas les features, chaque branche de feature a sa propre image pour la démo sur la VM.

Chaque étape bloque la suivante : une image qui ne démarre pas ou qui a une faille critique n'est jamais publiée.
On bloque seulement sur CRITICAL : les HIGH restants viennent de dépendances indirectes de Rallly (`undici`, `brace-expansion`), qu'on ne peut pas mettre à jour sans risquer de casser l'application. Ils restent visibles dans le rapport.

Le déploiement est **tiré par la VM** (`git pull`, `docker compose pull`) : pas de runner GitHub auto-hébergé, car le dépôt est public (une pull request pourrait exécuter du code sur le serveur), et rien n'entre dans la VM depuis GitHub.

## Sécurité

- **Secrets hors de l'image et du dépôt** : ils sont dans `infra/.env`, ignoré par Git. Seul `.env.example` est commité.
- **Un seul port publié** : celui de Caddy. La base de données n'a pas de port publié et reste sur un réseau interne.
- **Utilisateurs non-root** : Rallly tourne en `rallly`, Authentik en `authentik`, Caddy et Mailpit en `nobody`. Postgres démarre en root puis passe sur l'utilisateur `postgres`.
- **Moindre privilège** : `cap_drop: ALL` et `no-new-privileges` sur tous les services. On rajoute seulement les capacités nécessaires à Postgres et Caddy (`NET_BIND_SERVICE`, demandée par son binaire).
- **Lecture seule** : Caddy et Mailpit sont en `read_only`, leurs fichiers temporaires vont dans un `tmpfs`. Caddy n'a plus de volume (pas de certificat à garder en HTTP).
- **Pas de socket Docker** : le worker Authentik ne monte pas `/var/run/docker.sock` (le Compose officiel le fait, on n'en a pas besoin).
- **Scan Trivy** à chaque build. Il bloque la publication s'il trouve une faille CRITICAL corrigeable (voir [CI/CD](#cicd)).
- **Moins d'appels sortants** : notre image ne contacte pas `api.rallly.co` et la télémétrie de Next.js est désactivée. Côté Authentik, la vérification des mises à jour et l'envoi des rapports d'erreur sont désactivés.

**Limites connues** : en local, HTTP sans TLS. Sur la VM, le TLS s'arrête chez Cloudflare : le trajet Cloudflare → serveur passe dans le tunnel chiffré, puis en HTTP sur le pont interne jusqu'à la VM. Mailpit n'a pas de mot de passe propre (sur la VM, il est derrière Cloudflare Access) et ne garde pas les mails (outil de lab). Un seul utilisateur Postgres pour les deux bases.

## Features Rallly

Chaque feature vit dans sa propre branche, qui ne contient que cette feature (en plus de l'infra). `main` ne contient que l'infrastructure.
Pour tester une feature en mode dev : `git switch <branche>`, le conteneur `rallly` recharge le code tout seul
(relancer `docker compose -f compose.yaml -f compose.dev.yaml restart rallly` si les dépendances ou le schéma Prisma changent).

| Feature | Responsable | Branche | Statut |
|---|---|---|---|
| #4 — Expiration automatique du sondage | Hugo | `feature/poll-deadline` | terminée |
| #5 — Bloquer le vote sur les dates passées | Lilian | `feature/block-past-dates` | à faire |
| Libre — Taux de participation | Leyna | `feature/Taux-de-participation` | à faire |

> Au départ on avait choisi la #9 (désactiver les commentaires), mais elle existe déjà dans Rallly. On l'a remplacée par la #4.

### #4 — Expiration automatique

L'organisateur fixe une date limite de vote (*Gérer → Date limite de vote*). Une fois la date passée, on ne peut plus voter ni modifier son vote.
Le formulaire disparaît et le serveur refuse aussi les votes envoyés directement à l'API. Un bandeau affiche « Clôture des votes le … », puis « Votes clos depuis le … ».
On réutilise la colonne `deadline` qui existait déjà dans la base, donc il n'y a pas de migration.

*Démo* : mettre une date limite dans 1 minute, voter (ça marche), attendre, revoter (c'est refusé).

### Feature libre — taux de participation

*Problème* : l'organisateur ne voit pas facilement combien de personnes ont déjà répondu avant de choisir un créneau.
*Solution* : sous le titre du sondage, on affiche le nombre de participants qui ont voté.


## Organisation Git

- `main` est protégée : on passe obligatoirement par une pull request, et la CI doit être verte pour merger.
- Une branche par sujet : `feature/…` pour les features, `infra/…` pour l'infrastructure.
- Les branches `feature/…` partent de `main` sans aucune feature et ne sont pas mergées dans `main` : on les garde telles quelles, une par feature.

## Équipe

| Membre | Rôle |
|---|---|
| Hugo Gomes Duarte | Infrastructure (Compose, Authentik, CI), feature #4 |
| Lilian Sonzogni | Déploiement sur la VM (Incus, Cloudflare Tunnel et Access), feature #5 |
| Leyna Belgherbi | Feature libre, schéma d'architecture, slides de la soutenance |

---

Rallly est distribué sous licence [AGPL-3.0](LICENSE).
