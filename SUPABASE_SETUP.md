# Supabase setup Prevly

## 1. Creer le projet

1. Creer un nouveau projet dans Supabase.
2. Aller dans `Project Settings > API`.
3. Copier :
   - `Project URL`
   - `anon public key`
4. Creer `.env.local` a la racine :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## 2. Creer les tables

Dans `SQL Editor`, executer le fichier :

```text
supabase/schema.sql
```

Il cree :

- `profiles`
- `dashboard_states`
- `tft_states`
- les policies RLS pour que chaque utilisateur ne voie que ses donnees
- le trigger de creation automatique de profil

## 3. Configurer Auth

Dans `Authentication > URL Configuration` :

- Site URL en local : `http://localhost:3000`
- Redirect URLs :
  - `http://localhost:3000/dashboard`
  - `http://localhost:3000/login`
  - `http://localhost:3000/signup`

Pour un test rapide, dans `Authentication > Providers > Email`, il est possible de desactiver temporairement la confirmation email.

## 4. Tester le parcours

1. `npm run dev`
2. Ouvrir `http://localhost:3000/signup`
3. Creer un compte test
4. Aller sur `/dashboard`
5. Importer un CSV/PDF
6. Aller sur `/tft`, completer le wizard ou charger DAO
7. Recharger la page : les donnees doivent revenir depuis Supabase
8. Se connecter dans un autre navigateur avec le meme compte : dashboard + TFT doivent etre recuperes

## Fallback local

Si les variables Supabase ne sont pas presentes, Prevly continue de fonctionner en `localStorage`.
Des que l'utilisateur est connecte, les donnees locales existantes sont poussees dans Supabase au prochain chargement/sauvegarde.
