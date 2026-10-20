# 📚 Mes lectures : mise en ligne sur GitHub (environ 5 minutes)

Cette version n'a **pas besoin de Google**. Les livres sont gardés **sur ton téléphone**
(rien ne part sur internet). Tu l'installes comme une vraie appli, et elle marche même sans réseau.

Les fichiers à mettre en ligne sont dans le dossier **`github`** :
`index.html`, `recherche.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

> **Tu as déjà installé l'appli ?** Va directement à
> [« Mettre à jour l'appli »](#mettre-à-jour-lappli-plus-tard) en bas de ce guide.

---

## 1. Créer le dépôt

1. Va sur **https://github.com** (connecté).
2. En haut à droite : **+ → New repository**.
3. **Repository name** : `mes-lectures`.
4. Coche **Public**. C'est obligatoire pour un site gratuit, et le site ne contient aucun de tes livres.
5. Clique sur **Create repository**.

## 2. Envoyer les fichiers

1. Sur la page du dépôt, clique sur le lien **« uploading an existing file »**.
2. **Glisse les 7 fichiers** du dossier `github` dans la page. Mets les fichiers eux-mêmes, pas le dossier.
3. En bas, clique sur **Commit changes**.

## 3. Activer le site

1. Dans le dépôt : **Settings** (onglet en haut), puis **Pages** (menu de gauche).
2. **Source** : *Deploy from a branch*.
3. **Branch** : `main` et `/ (root)`, puis **Save**.
4. Attends 1 à 2 minutes, puis recharge la page. Le lien de ton appli apparaît en haut :
   **`https://TON-PSEUDO.github.io/mes-lectures/`**

## 4. Installer sur Android

1. Ouvre le lien dans **Chrome** sur ton téléphone.
2. Chrome propose **« Installer l'application »**. Sinon : **⋮ → Installer l'application**
   (ou **Ajouter à l'écran d'accueil**).
3. L'icône 📖 **Lectures** apparaît sur ton écran d'accueil. Elle s'ouvre en plein écran,
   comme une vraie appli, même sans internet.

---

## ⚠️ À savoir : tes livres sont sur CE téléphone

- Le PC et le téléphone ont chacun **leur propre liste**. Ils ne se synchronisent pas.
- Si tu **désinstalles l'appli** ou si tu **effaces les données de Chrome**, tes livres
  sont supprimés. D'où la sauvegarde :
  - **Stats (ou ⚙️ Réglages) → 💾 Sauvegarder** télécharge un fichier `mes-lectures-sauvegarde-DATE.json`.
    Range-le dans ton Drive, ou envoie-le-toi par mail.
  - **📂 Restaurer** remet tous tes livres à partir de ce fichier.
    C'est aussi comme ça qu'on passe sur un **nouveau téléphone**.
  - L'appli te rappelle de sauvegarder si ta dernière sauvegarde date de plus d'un mois.

---

## 🔎 Comment l'appli trouve les livres

Elle interroge **en même temps** plusieurs catalogues gratuits, puis fusionne leurs réponses :

| Source | Pour quoi |
|---|---|
| **BnF** (Bibliothèque nationale de France) | presque tous les livres publiés en France, avec séries, tomes, couvertures |
| **Sudoc** (bibliothèques universitaires) | livres pros, universitaires, et beaucoup de livres étrangers |
| **Open Library** | livres en anglais, allemand, espagnol, italien… |
| **Apple Books** | recherche par titre très efficace, belles couvertures |
| **Google Books** | souvent saturé sans clé (voir ⚙️ Réglages pour ajouter ta clé gratuite) |

Sous la recherche, tu vois quelles sources ont répondu (✓ trouvé, – rien, ⛔ saturé, ✗ pas de réponse).

**Si un livre n'est pas trouvé :**
- par **code-barres** : le code est quand même noté. Tape le **titre** dans la recherche ;
- par **titre** : essaie juste le titre, ou juste le nom de l'auteur ;
- en dernier recours, remplis la fiche à la main. Avec le **📦 Scan rapide**, il est ajouté
  « ⚠️ à compléter » pour que tu n'oublies pas.

**Livres déjà enregistrés sans couverture ni pages ?** ⚙️ Réglages → **✨ Compléter mes livres**.

---

## Mettre à jour l'appli plus tard

1. Dans ton dépôt sur GitHub : **Add file → Upload files**.
2. Glisse les fichiers modifiés. Pour cette mise à jour : **`index.html`**, **`recherche.js`** (nouveau)
   et **`sw.js`**. Ils remplacent les anciens.
3. **Commit changes**, puis attends 1 à 2 minutes.
4. Sur le téléphone, ferme complètement l'appli et rouvre-la avec internet (deux fois si besoin).

Tes livres ne bougent pas : ils sont repris automatiquement dans la nouvelle mémoire
(plus grande), et une copie de sécurité de l'ancienne est gardée.
