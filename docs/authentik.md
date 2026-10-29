# Authentik : configuration et démo

Toute la configuration d'Authentik est dans un blueprint : [`infra/authentik/blueprints/rallly.yaml`](../infra/authentik/blueprints/rallly.yaml).
Le worker l'applique tout seul au démarrage, et à chaque fois que le fichier change. Il n'y a donc rien à configurer à la main.
Ce document explique ce que le blueprint crée et comment le montrer en démo.

Administration d'Authentik : `http://auth.<DOMAIN>:<HTTP_PORT>/if/admin/`, avec le compte `akadmin` et le mot de passe `AUTHENTIK_ADMIN_PASSWORD` du `.env`.

## 1. SSO avec OIDC

Authentik est le fournisseur d'identité, Rallly est le client.

| Élément | Valeur |
|---|---|
| Provider | `rallly`, de type OAuth2/OIDC, client confidentiel (`OIDC_CLIENT_ID` et `OIDC_CLIENT_SECRET` du `.env`) |
| Redirect URI | `http://<DOMAIN>:<HTTP_PORT>/api/auth/callback/oidc`, en correspondance stricte |
| Scopes | `openid`, `email`, `profile` |
| Application | `rallly` (c'est ce nom qui apparaît dans l'URL de discovery) |

Côté Rallly, on donne l'URL de discovery dans `OIDC_DISCOVERY_URL`. On met aussi `EMAIL_LOGIN_ENABLED=false` pour que la seule façon de se connecter soit de passer par Authentik.

*Démo* : ouvrir Rallly, cliquer sur « Authentik », se connecter avec `bob`. On revient sur Rallly connecté, avec le nom et l'e-mail de bob venant d'Authentik.

## 2. Accès par groupe

| Groupe | Droits |
|---|---|
| `rallly-admins` | accès à Rallly et à l'administration d'Authentik |
| `rallly-users` | accès à Rallly seulement |
| aucun groupe | accès à Rallly refusé |

L'application `rallly` a deux liaisons de groupe (*Applications → Rallly → Policy / Group / User Bindings*), en mode `any` :
il suffit d'être dans un des deux groupes pour avoir accès.

*Démo* :
- `alice` peut ouvrir Rallly et aussi l'administration d'Authentik (`/if/admin/`) ;
- `bob` peut ouvrir Rallly, mais pas l'administration ;
- `eve` arrive à se connecter sur Authentik, mais l'accès à Rallly lui est refusé.

## 3. Inviter un utilisateur externe

Le blueprint crée un flow d'inscription, `rallly-invitation`, qui enchaîne quatre étapes :
vérifier l'invitation, demander les infos (identifiant, nom, e-mail, mot de passe), créer le compte (de type *external*, dans le groupe `rallly-users`), puis connecter l'utilisateur.
Sans lien d'invitation valide, l'inscription est refusée.

*Démo* :
1. Dans l'administration d'Authentik : *Directory → Invitations → Create*. Nom `demo-invite`, flow `rallly-invitation`, cocher *Single use*.
2. Copier le lien généré (`…/if/flow/rallly-invitation/?itoken=…`).
3. Dans une fenêtre de navigation privée, ouvrir le lien et remplir le formulaire. Le compte est créé et connecté.
4. Ouvrir Rallly et se connecter avec Authentik : ça marche, puisque l'invité est dans `rallly-users`.
5. Rouvrir le même lien : il est refusé, car il ne sert qu'une fois.

## Problèmes rencontrés

- **Issuer OIDC** : Rallly, depuis son conteneur, doit joindre Authentik avec la même URL que le navigateur. Sinon l'`issuer` du token ne correspond pas et la connexion échoue.
  On a réglé ça en ajoutant l'alias réseau `auth.<DOMAIN>` au conteneur Caddy.
- **Provider créé par le blueprint** : par défaut, son champ `grant_types` est vide, ce qui donne l'erreur *invalid_request / The request is otherwise malformed*.
  Il faut écrire `grant_types: [authorization_code, refresh_token]` dans le blueprint.
- **Redirect URI** : la correspondance est stricte, port compris. En local, il ne faut pas oublier le `:8080`.
