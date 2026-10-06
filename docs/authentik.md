# Authentik — configuration et démo

Toute la configuration est **déclarative** : `infra/authentik/blueprints/rallly.yaml` est appliqué
automatiquement par le worker au démarrage (et à chaque modification du fichier).
Rien à cliquer pour installer ; ce document explique ce qui est créé et comment le démontrer.

Admin Authentik : `http://auth.<DOMAIN>:<HTTP_PORT>/if/admin/` — compte `akadmin` / `AUTHENTIK_ADMIN_PASSWORD`.

## 1. SSO OIDC (Authentik = IdP, Rallly = client)

| Élément | Valeur |
|---|---|
| Provider | OAuth2/OIDC `rallly`, client confidentiel, `client_id` = `OIDC_CLIENT_ID`, secret = `OIDC_CLIENT_SECRET` |
| Redirect URI (stricte) | `http://<DOMAIN>:<HTTP_PORT>/api/auth/callback/oidc` |
| Scopes | `openid`, `email`, `profile` |
| Application | `rallly` (slug utilisé dans l'URL de discovery) |
| Côté Rallly | `OIDC_DISCOVERY_URL=http://auth.<DOMAIN>:<HTTP_PORT>/application/o/rallly/.well-known/openid-configuration` ; `EMAIL_LOGIN_ENABLED=false` → connexion uniquement via Authentik |

**Démo :** ouvrir Rallly → *Se connecter avec Authentik* → `bob` → retour sur Rallly connecté, nom/email venant d'Authentik.

## 2. Policies par groupe

| Groupe | Droits |
|---|---|
| `rallly-admins` | Accès à Rallly **+** super-utilisateur Authentik (console admin) |
| `rallly-users` | Accès à Rallly uniquement |
| *(aucun groupe)* | **Refusé** sur Rallly |

Mécanisme : deux *group bindings* sur l'application `rallly` (Applications → Rallly → *Policy / Group / User Bindings*),
mode `any` → il suffit d'appartenir à l'un des deux groupes.

**Démo :**
- `alice` → Rallly OK **et** accès à `/if/admin/`
- `bob` → Rallly OK, pas d'admin
- `eve` → authentifiée sur Authentik mais **accès refusé** à Rallly

## 3. Invitation d'un utilisateur externe

Le blueprint crée le flow d'enrollment `rallly-invitation` :
`Invitation` → `Prompt` (username, nom, email, mot de passe) → `User Write` (type *external*, ajout au groupe `rallly-users`) → `User Login`.
Sans lien d'invitation valide, le flow refuse l'inscription.

**Démo (≈1 min) :**
1. Admin Authentik → *Directory → Invitations → Create* : nom `demo-invite`, flow `rallly-invitation`, *Single use* coché, expiration au choix.
2. Copier le lien généré (`…/if/flow/rallly-invitation/?itoken=…`).
3. Dans une fenêtre privée : ouvrir le lien → remplir le formulaire → compte créé et connecté.
4. Ouvrir Rallly → *Se connecter avec Authentik* → accès OK (l'invité est dans `rallly-users`).
5. Rouvrir le même lien → refusé (usage unique).

## Pièges rencontrés

- **Issuer OIDC** : Rallly (conteneur) doit joindre Authentik par **la même URL** que le navigateur, sinon l'`issuer` du token ne correspond pas.
  → alias réseau `auth.<DOMAIN>` sur le conteneur Caddy.
- **Provider créé par blueprint** : `grant_types` est vide par défaut → erreur *invalid_request / The request is otherwise malformed*.
  → `grant_types: [authorization_code, refresh_token]`.
- **Redirect URI** : correspondance stricte, port compris (`:8080` en local).
