# 📚 Mes lectures : mise en ligne sur GitHub (environ 5 minutes)

Cette version n'a **pas besoin de Google**. Les livres sont gardés **sur ton téléphone**
(seules tes recherches de livres passent par internet : voir « Ce qui part sur internet »). Tu l'installes comme une vraie appli, et elle marche même sans réseau.

Les fichiers à mettre en ligne sont dans le dossier **`github`** :
`index.html`, `recherche.js`, `sw.js`, `manifest.webmanifest`, `tests-appli.js`, `zxing.min.js` (lecteur de code-barres),
`zxing-LICENSE.txt` (sa licence), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

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
2. **Glisse les 10 fichiers** du dossier `github` dans la page. Mets les fichiers eux-mêmes, pas le dossier.
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
  - **📂 Restaurer** remet tous tes livres à partir de ce fichier. Après une réinstallation, l'appli vide
    affiche directement un bouton **« J'ai une sauvegarde : récupérer mes livres »**.
    C'est aussi comme ça qu'on passe sur un **nouveau téléphone**.
  - L'appli te rappelle de sauvegarder si tu as modifié tes livres et que ta dernière sauvegarde date de plus d'une semaine.
  - ⚙️ Réglages indique si la mémoire est **protégée** (Chrome ne l'efface pas tout seul quand le téléphone manque de place).
- **L'appli ouverte deux fois** (l'appli + un onglet Chrome du site, deux onglets…) : les changements faits
  dans l'une et dans l'autre sont **réunis livre par livre**, au lieu que la dernière fenêtre efface ceux de l'autre.
- **Chaque navigateur a sa propre liste.** Si l'appli s'ouvre un jour avec un autre navigateur que Chrome
  (après un changement de navigateur par défaut), la liste paraît vide : les livres sont toujours dans Chrome.
- **Restaurer est sans risque :**
  - avant de remplacer tes livres, l'appli garde une **copie de sécurité** de ta bibliothèque actuelle ;
  - juste après, un bouton **Annuler** apparaît ;
  - plus tard, le bouton **↩️ Revenir à ma bibliothèque d'avant** reste dans Sauvegarde.
  - Un fichier abîmé ou trafiqué est vérifié et nettoyé avant d'entrer dans l'appli.
- **Si un enregistrement échoue** (téléphone plein…), un bandeau rouge reste affiché, avec **Réessayer** et **Sauvegarder**.
  Rien n'est perdu en silence.
- **Si l'appli n'arrive pas à lire tes livres au démarrage**, elle le dit au lieu d'afficher une liste vide.
  Tes livres ne sont pas effacés : ferme l'appli complètement et rouvre-la.

## 🔒 Ce qui part sur internet

Tes livres, notes, avis, citations et prêts restent **sur ton téléphone**. Mais quand tu cherches un livre,
le **titre, l'auteur ou l'ISBN** sont envoyés aux catalogues (BnF, Sudoc, Open Library, Apple, Google, Wikipédia)
et aux sites de couvertures (Decitre, Epagine, Amazon). Ces sites voient aussi ton adresse internet,
comme pour n'importe quelle page web. L'appli ne contient **aucune publicité ni aucun mouchard**.

- **🎯 D'après mes lectures** : tes goûts sont calculés sur le téléphone et ne sont jamais envoyés.
  Mais pour trouver les livres, l'appli envoie aux catalogues des recherches qui en découlent :
  le **nom d'un auteur** que tu as aimé, un **sujet** de tes livres, le **titre d'une série** que tu lis.
- Le lecteur de code-barres de secours est **rangé avec l'appli** (`zxing.min.js`) : aucun site tiers n'est contacté pour lui.
- Une règle de sécurité (« Content-Security-Policy ») empêche l'appli d'envoyer quoi que ce soit à d'autres sites
  que les catalogues de livres (les images de couvertures mises à part).

## 🧪 Vérifier que tout marche (tests)

Ouvre `https://TON-PSEUDO.github.io/mes-lectures/index.html?tests` : l'appli vérifie plus de 120 points
(stockage, restauration, rayons, touche retour, recherche par thème…) et affiche ✅ ou ❌ pour chacun.
Les tests travaillent dans une **mémoire à part** : tes vrais livres ne sont jamais touchés.
Ajoute `&enligne` à l'adresse pour tester aussi les vrais catalogues. À faire rarement : la BnF bloque
quelque temps ceux qui l'interrogent trop souvent.

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

**Scan rapide sans internet ?** Les livres sont ajoutés « à compléter », et l'appli les complète **toute seule**
dès que la connexion revient.

**Livres déjà enregistrés sans couverture ni pages ?** ⚙️ Réglages → **✨ Compléter mes livres**.

**Une couverture manque ou n'est pas la bonne ?** Ouvre le livre → **🔍 Trouver une couverture** :
l'appli te montre toutes celles qu'elle trouve (Decitre, librairies indépendantes, BnF, Apple, Open Library…),
tu touches la bonne. Sinon : **📷 Photo**.

---

## 👆 Naviguer

Sur le téléphone, **glisse le doigt vers la gauche ou la droite** pour passer d'un onglet à l'autre
(En cours → À lire → Découvrir → Lus → Abandonnés → Citations → Stats). Le défilement normal (haut/bas)
n'est pas gêné, et dans les zones qui défilent déjà de côté (calendrier, sélection du mois) le doigt les fait défiler.

- **＋** (en bas à droite) : *Un livre*, *Scanner un code-barres* ou *📦 Scan rapide* (plusieurs livres d'affilée).
- Sur un livre en cours : **📖 Où j'en suis** (avec **+10, +25, +50 p.** et **Fini ✓** en un geste) et **⋯** pour
  le chrono, une citation, « J'ai fini » ou modifier la fiche.
- Les filtres (genre, rayon, possession) et le tri sont rangés sous **⚙️ Filtres et tri** ; le nombre entre parenthèses
  indique combien sont actifs.
- **Toucher un livre ouvre son carnet** : sa progression, tes notes et citations (à ajouter, modifier ou supprimer),
  son historique et ses infos. « Modifier » ouvre la fiche complète ; « Supprimer ce livre… » est tout en bas.
- Une fiche modifiée n'est jamais fermée sans question, même avec « Annuler ».
- **⚙️ Réglages → Style** : *Android moderne* (par défaut), *Actuel* ou *Carnet de lecture*, chacun en clair ou en
  sombre (Thème : Auto, Clair, Sombre).
- **Icônes** : en *Android moderne* et *Actuel*, les boutons montrent des icônes dessinées au trait (le ⚙️, le 🎲, le 📷…
  de ce guide y apparaissent sous forme de dessins) ; en *Carnet de lecture*, ce sont les émojis.

## ✨ Découvrir de nouveaux livres

- **📬 La sélection du mois** (onglet ✨ Découvrir) : chaque mois, quand tu ouvres l'appli, elle prépare
  **5 livres que tu n'as pas**, dans **5 thèmes différents**, trouvés à **des endroits différents** :
  - 🏆 **Primé** : Goncourt, Renaudot, Femina, Médicis, Goncourt des lycéens, Fauve d'or d'Angoulême, prix Hugo…
  - 🌍 **Incontournable** : les livres les plus connus du genre (d'après Wikipédia)
  - 🆕 **Nouveauté** : parutions récentes (BnF)
  - ⭐ **Aimé des lecteurs** : très bien notés par beaucoup de lecteurs
  - 🏛️ **Classique** et 📚 **Référence** (éducation, enfance, travail social)

  Deux des cinq thèmes correspondent à ce que tu lis le plus, les trois autres te font sortir de tes habitudes.
  Pour chaque livre : couverture, résumé, raison de la proposition, et les boutons **＋ À lire**,
  **🛒 En librairie** et **✕ Pas pour moi** (le livre est remplacé et ne sera plus proposé).
- **🎯 D'après mes lectures / 🎲 Au hasard** (tirage au sort en ligne) : en mode **D'après mes lectures**,
  l'appli te propose soit un autre livre d'un auteur que tu as noté 4 ou 5 étoiles, soit un livre de tes rayons
  préférés. Les livres lus et bien notés comptent plus ; les livres abandonnés comptent contre.
  Ce calcul se fait sur ton téléphone ; seules les recherches qui en découlent (auteur, sujet, série) partent vers les catalogues.
- **🎲 Tirage au sort en ligne** (Découvrir, ou « Que lire ensuite ? » → 🌍 En ligne) : choisis un thème
  (ou 🎁 Surprise) et l'appli te trouve un livre que tu n'as pas encore. **23 thèmes** : romans, polar, SF, fantasy,
  BD, manga, jeunesse, jeunes adultes, classiques… et les rayons documentaires (Histoire, Politique & Société,
  Sciences humaines, Religion & Ésotérisme, Arts & Beaux livres, Tourisme & Voyages, Vie pratique & Loisirs,
  Économie, Entreprise & Droit, Sciences & Techniques), tirés parmi les livres récents classés ainsi par la BnF. Fais glisser la rangée de thèmes pour tous les voir.
- **🎲 Que lire ensuite → 📚 Dans ma liste** : tu peux aussi choisir un **rayon** de tes livres à lire.

## 🔎 Chercher des livres, avec une longueur maximale (onglet ✨ Découvrir)

**Chercher par : 🏷️ Thème · ✍️ Auteur · 📖 Titre.**
- **✍️ Auteur** : écris un nom (« Annie Ernaux », « Riad Sattouf »). Tu vois ses livres, avec une seule édition par livre.
- **📖 Titre** : écris un titre ou quelques mots du titre.
- **🏷️ Thème** : comme ci-dessous.

La longueur maximale marche avec les trois.


- Choisis un **rayon** (tous sauf Dictionnaires & Scolaire), puis si tu veux un **sous-rayon** avec « Affiner »
  (ex. Sciences humaines › Philosophie). Tu peux aussi **écrire un sujet** (« géopolitique », « écologie »…),
  seul ou en plus d'un rayon.
- Choisis une **longueur maximale** : 100, 200, 300 ou 500 pages, ou sans limite.
  Un livre de 200 pages apparaît bien avec « 200 p. ».
- Changer de thème ou de limite relance la recherche tout seul. **✕ Effacer les filtres** remet tout à zéro.
- Pour chaque livre : couverture, titre, auteur, **nombre de pages de l'édition indiquée** (éditeur, année),
  rayons, et les boutons **＋ À lire**, **📄 Fiche** (pour vérifier avant d'enregistrer) et **🛒 En librairie**.
- **Bon à savoir :**
  - Le nombre de pages change d'une édition à l'autre. L'appli montre celui de l'édition affichée,
    et parfois la fourchette des autres éditions.
  - Les livres dont le catalogue ne donne **pas le nombre de pages** ne sont jamais mélangés aux autres.
    Ils sont rangés à part (« ❔ … dont le nombre de pages n'est pas connu »).
  - Les livres d'idées (politique, histoire, philosophie…) viennent du catalogue de la **BnF**,
    d'après son classement officiel. Un livre de droit ou d'économie n'apparaît donc pas dans « Politique & Société ».
  - La BnF range tous les romans ensemble. Pour les romans (littérature, polar, SF et fantasy, romance,
    jeunes adultes, jeunesse) et la BD, l'appli part donc de
    livres connus du genre (Apple Books, prix, Wikipédia), puis cherche leur édition française. C'est un peu plus lent.
  - Peu de livres font moins de 100 pages : si rien n'est trouvé, l'appli te propose d'élargir la limite.

## 🏷️ Ranger mes livres par rayon (comme en librairie)

- Les livres sont rangés dans **17 rayons**, ceux des librairies (classification interprofessionnelle CLIL) :
  Littérature · Policier & Thriller · Science-fiction, Fantastique & Fantasy · Romance · Jeunes adultes · Jeunesse ·
  BD, Comics & Manga · Arts & Beaux livres · Histoire · Politique & Société · Sciences humaines · Religion & Ésotérisme ·
  Tourisme & Voyages · Vie pratique & Loisirs · Économie, Entreprise & Droit · Sciences & Techniques · Dictionnaires & Scolaire.
- Chaque rayon a ses **sous-rayons** (ex. Sciences humaines › Travail social & protection de l'enfance, Vie pratique › Cuisine).
- Le rangement vient du **classement officiel** du livre (BnF, Sudoc : code de classement, indice Dewey, sujets),
  et, pour préciser le genre d'un roman, des rayons des librairies en ligne. Comme en librairie, un polar est rangé
  dans **Policier & Thriller** seulement (pas aussi dans Littérature).
- **Dans chaque onglet**, le menu filtre par rayon ou sous-rayon (avec « ❔ Sans rayon »).
- **Stats → 🏷️ Mes livres par rayon** : touche un rayon pour voir ses livres, et « Affiner » par sous-rayon.
- **Pour les livres que tu avais déjà** : Stats → 🏷️ → **🔄 Chercher les rayons**
  (ou ⚙️ Réglages → ✨ Compléter mes livres). L'appli traite un livre à la fois, sans aller trop vite.
- **Dans la fiche d'un livre**, section 🏷️ Rayons : ✕ pour retirer, « ＋ Ajouter un rayon… » pour ajouter un rayon
  ou un sous-rayon ; « D'où viennent ces rayons ? » montre la raison de chacun.
- Tes anciennes corrections (de l'époque des « catégories ») sont **reprises automatiquement**, y compris depuis une ancienne sauvegarde.
- Les rayons font partie de la **sauvegarde** et de l'**export Excel** (colonne « Rayons »).

## 📝 Résumés

Quand tu ajoutes ou scannes un livre, l'appli récupère tout seule **le résumé** (celui de l'éditeur à la BnF,
la présentation d'Apple Books ou Wikipédia pour les grands classiques), **les thèmes** et **le genre**.
Ils sont dans la fiche du livre (📝 Résumé), et le début du résumé s'affiche sur les livres « À lire ».
Pour tes livres déjà enregistrés : ⚙️ Réglages → **✨ Compléter mes livres**.

## 🎲 🗓️ 🏆 📤 Les petits plus

- **🎲 Que lire ensuite ?** (onglet À lire) : choisis tes envies (court, long, genre, « sous la main »)
  et l'appli tire un livre au sort dans ta liste. Les livres épinglés et ceux à rendre bientôt ont plus de chances.
  En mode **🌍 En ligne**, elle tire un livre que tu n'as pas encore.
- **🗓️ Mon année de lecture** (Stats) : une case par jour, plus elle est foncée, plus tu as lu.
  Les cases orange = un livre fini. Touche un jour pour voir le détail.
- **🏆 Mes défis** (Stats) : 17 défis par an (Pavé, Sprint, Explorateur, Régulier…). L'appli te félicite
  quand tu en réussis un.
- **📤 Partager mon bilan** (Stats → Mon bilan) : crée une belle image de ton année (top 5, chiffres)
  à envoyer sur WhatsApp, Instagram…

---

## Mettre à jour l'appli plus tard

1. Dans ton dépôt sur GitHub : **Add file → Upload files**.
2. Glisse les fichiers modifiés **tous en même temps**. Pour cette mise à jour (version **2026.10.22-2**) :
   **`index.html`**, **`recherche.js`**, **`taxonomie.js`** (nouveau), **`sw.js`** et **`tests-appli.js`**. Ils remplacent les anciens.
   (Si tu n'avais pas encore envoyé la version 2026.10.20-2, ajoute aussi **`zxing.min.js`** et **`zxing-LICENSE.txt`**.)
   Au premier lancement de cette version, l'appli garde une copie de ta bibliothèque d'avant la mise à jour
   (Réglages → 💾 Sauvegarde → « Revenir à ma bibliothèque d'avant la mise à jour ») et te propose de faire une sauvegarde.
3. **Commit changes**, puis attends 1 à 2 minutes.
4. Sur le téléphone, ferme complètement l'appli et rouvre-la avec internet (deux fois si besoin).

**Vérifier la mise en ligne (2 minutes) :**
- ⚙️ Réglages, tout en bas : **« Version de l'appli : 2026.10.22-2 »**.
- Si l'appli affiche **« ⚠️ Mise à jour incomplète »**, un fichier manque ou est ancien : renvoie-les tous.
- Ouvre `https://TON-PSEUDO.github.io/mes-lectures/index.html?tests` : tout doit être ✅.

**Revenir à la version d'avant** (si une mise à jour pose problème) : sur GitHub, ouvre le dépôt →
**Commits** → la version précédente → **Browse files**, télécharge ses fichiers et renvoie-les avec **Upload files**.
Les livres de tes amis ne sont pas touchés (ils sont sur leurs téléphones). La version d'avant ces corrections
est aussi gardée sur ton PC : étiquette Git `avant-corrections-2026-10-20`.

**Sécurité du compte GitHub** : c'est lui qui décide du code que reçoivent tes amis. Active la
**double authentification** (GitHub → Settings → Password and authentication → Two-factor authentication).

Tes livres ne bougent pas : ils sont repris automatiquement dans la nouvelle mémoire
(plus grande), et une copie de sécurité de l'ancienne est gardée.
