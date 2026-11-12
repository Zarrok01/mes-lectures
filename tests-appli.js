/* =====================================================================
   Tests de l'appli « Mes lectures »
   Ouvrir : index.html?tests  (mémoire séparée « test-mes-lectures » : les vrais livres ne sont jamais touchés)
   Chaque test affiche : ce qui est vérifié, le résultat attendu, le résultat obtenu, réussi ou échoué.
   Les tests marqués 🌐 interrogent les vrais catalogues (internet nécessaire).
   ===================================================================== */
(async () => {
  const resultats = [];
  const filtreTest = new URLSearchParams(location.search).get('only');
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  async function test(nom, attendu, fn) {
    if (filtreTest && !nom.includes(filtreTest)) return;
    let obtenu, ok; window.testEnCours = nom;
    // (chaque test repart avec des catalogues disponibles ; les tests 🌐 gardent la pause, pour ménager la vraie BnF)
    if (!nom.startsWith('🌐') && Recherche._reprendreCatalogues) Recherche._reprendreCatalogues();
    try { obtenu = await fn(); ok = egal(obtenu, attendu); }
    catch (e) { obtenu = 'ERREUR : ' + (e && e.message || e); ok = false; }
    resultats.push({nom, attendu, obtenu, ok});
  }
  const ids = l => l.map(c => c.id);
  const cats = b => ids(Recherche.rayons(b));
  const vider = async () => { books = []; goal = 0; await Store.persist(); localStorage.removeItem(CLE + '-data'); };
  const fiche = (titre, extra) => norm({...blankBook('a_lire'), id: 't-' + titre, titre, auteur: 'Auteur Test', ...extra});
  // Les tests 🌐 interrogent vraiment les catalogues (BnF…) : seulement sur demande (index.html?tests&enligne),
  // pour ne pas fatiguer la BnF, qui bloque un moment ceux qui l'interrogent trop souvent
  const enLigne = new URLSearchParams(location.search).has('enligne') && navigator.onLine !== false;

  // Pas de vraies fenêtres de confirmation pendant les tests
  const vraiConfirm = window.confirm;
  let reponseConfirm = true, confirmDemande = 0;
  window.confirm = () => { confirmDemande++; return reponseConfirm; };
  // (la fenêtre de confirmation de l'appli reçoit aussi la réponse prévue, et compte comme une question posée)
  const repondeur = new MutationObserver(() => {
    if (!$('#askOv').classList.contains('show')) return;
    confirmDemande++; setTimeout(() => $(reponseConfirm ? '#askOui' : '#askNon').click(), 0);
  });
  if ($('#askOv')) repondeur.observe($('#askOv'), {attributes: true, attributeFilter: ['class']});

  await vider();
  // Mémoire de test propre : les livres « déjà proposés » ou refusés lors d'un passage précédent ne doivent pas fausser celui-ci
  prefs.proposes = []; prefs.nonMerci = []; prefs.selection = null;
  prefs.animation = 'aucune';   // (la suite reste rapide ; les tests d'animation choisissent leur mode eux-mêmes)
  prefs.consultation = 'continue';   // (les sections 12 et 13 testent la fiche qui défile ; la section 14 choisit le livre)
  savePrefs();

  /* ---------- 1. Rayons de librairie (règles de rangement) ---------- */
  const B = (c, l) => ({c, l, s: 'BnF'});
  const rs = b => { const x = Recherche.classer(b); return [...x.rayons, ...x.sous].map(c => c.id); };
  await test('Rayon : code BnF 320 → Politique & Société', ['politique'], () => cats({classements: [B('686', '320'), B('676', '320.533 094')]}));
  await test('Rayon : histoire de la Syrie avec « Politique et gouvernement » → Histoire seulement', ['histoire'],
    () => cats({classements: [B('676', '956.910 4'), B('686', '940'), B('606', 'Syrie -- Politique et gouvernement')]}));
  await test('Rayon : droit social → Économie, Entreprise & Droit › Droit (pas Politique)', ['eco', 'eco/droit'], () => rs({classements: [B('676', '344.01'), B('606', 'Droit social')]}));
  await test('Rayon : plusieurs rayons (320.01 + 342)', ['politique', 'eco'], () => cats({classements: [B('676', '342.040 1'), B('676', '320.01')]}));
  await test('Rayon : anglais « Political science »', ['politique'], () => cats({sujets: ['Political science', 'Politics and government']}));
  await test('Rayon : « Économie politique » → Économie', ['eco'], () => cats({sujets: ['Économie politique']}));
  await test('Rayon : livre sans aucune donnée → aucun', [], () => cats({titre: 'X'}));
  await test('Rayon : sujet inconnu → aucun', [], () => cats({sujets: ['Zzzz inconnu']}));
  await test('Rayon : rayon Apple « SF et fantasy » sur un roman classé 803 → Imaginaire seulement', ['imaginaire', 'imaginaire/sf', 'imaginaire/fantasy'],
    () => rs({classements: [B('686', '803')], sujets: ['Science-fiction et fantasy']}));
  await test('Rayon : le rayon Apple « Histoire » n\'ajoute pas Histoire à un roman classé', ['litterature', 'litterature/romans'],
    () => rs({classements: [B('686', '803')], sujets: ['Histoire']}));
  await test('Rayon : correction à la main (retiré / ajouté)', ['histoire'],
    () => cats({classements: [B('686', '320')], catNon: ['politique'], catOui: ['histoire']}));
  await test('Rayon : la raison garde la source d\'origine', 'BnF : classement 320 (Sciences politiques)',
    () => Recherche.rayons({classements: [B('686', '320')]})[0].raisons[0]);
  await test('Rayon : texte « philo » → Sciences humaines › Philosophie', 'shs|shs/philo', () => { const t = Recherche.rayonPourTexte('philo'); return t.rayon.id + '|' + t.sous; });
  await test('Rayons : un livre-exemple par rayon (codes et sujets réels)', [], () => {
    const cas = [
      [{classements: [B('676', '641.5')]}, ['pratique', 'pratique/cuisine']],
      [{classements: [B('686', '803'), B('606', 'Roman sentimental')]}, ['romance']],
      [{classements: [B('686', '803')], sujets: ['Ados']}, ['ya']],
      [{classements: [B('676', '914.4')]}, ['voyages', 'voyages/guides']],
      [{classements: [B('676', '133.5')]}, ['religion', 'religion/esoterisme']],
      [{classements: [B('676', '362.7')]}, ['shs', 'shs/social']],
      [{classements: [B('676', '005.1')]}, ['sciences', 'sciences/info']],
      [{classements: [B('676', '327.1')]}, ['politique', 'politique/ri']],
      [{classements: [B('676', '944.04')]}, ['histoire', 'histoire/moderne', 'histoire/france']],
      [{classements: [B('676', '741.5952')]}, ['bd', 'bd/mangas']],
      [{classements: [B('676', '791.43')]}, ['art', 'art/cinema']],
      [{classements: [B('676', '158.1')]}, ['pratique', 'pratique/perso']],
      [{classements: [B('676', '649.1')]}, ['pratique', 'pratique/famille']],
      [{classements: [B('676', '423')]}, ['reference']],
      [{classements: [B('676', '843.914')]}, ['litterature', 'litterature/romans']]
    ];
    return cas.filter(([b, attendu]) => !egal(rs(b), attendu)).map(([b, attendu]) => JSON.stringify(b.classements.map(k => k.l)) + ' → ' + rs(b).join(',') + ' (attendu ' + attendu.join(',') + ')');
  });
  await test('Rayon de genre : un polar n\'est pas aussi rangé dans Littérature', ['polar', 'polar/policier'],
    () => rs({classements: [B('686', '803'), B('606', 'Romans policiers')]}));
  await test('Rayon de genre : la poésie fantastique garde Littérature › Poésie', ['litterature', 'imaginaire', 'litterature/poesie', 'imaginaire/fantastique'],
    () => rs({classements: [B('676', '841'), B('606', 'Fantastique')]}));
  await test('Rayon de genre : un ajout à la main de Littérature est respecté', ['litterature', 'polar', 'polar/policier'],
    () => rs({classements: [B('686', '803'), B('606', 'Romans policiers')], catOui: ['litterature']}));
  await test('Corrections : ajouter un sous-rayon ajoute son rayon', ['shs', 'shs/social'], () => rs({titre: 'X', catOui: ['shs/social']}));
  await test('Corrections : retirer le seul sous-rayon retire le rayon', [], () => rs({classements: [B('686', '1')], catNon: ['shs/philo']}));
  await test('Corrections : retirer un sous-rayon garde le rayon s\'il a une autre raison', ['shs', 'shs/psycho'],
    () => rs({classements: [B('676', '152.4'), B('606', 'Philosophie')], catNon: ['shs/philo']}));
  await test('Rangement recalculé quand la fiche change sur place (même nombre de classements)', 'politique|histoire', () => {
    const b = {classements: [B('676', '320')]}; const a = cats(b).join();
    b.classements[0] = B('676', '944'); return a + '|' + cats(b).join();
  });
  await test('Conversion des anciens noms', ['shs/philo', 'shs/social', 'politique/societe', 'bd/bd', 'polar/noir', 'politique', ''],
    () => ['philo', 'social/enfance', 'socio/genre', 'bd/franco', 'polar/noir', 'politique', 'zzz'].map(Recherche.convertirAncienId));
  // (relecture finale : corriger à la main le genre d'un roman de la BnF, tous classés 803)
  await test('Correction du genre : retirer « Policier » d\'un roman 803 le remet en Littérature › Romans', ['litterature', 'litterature/romans'],
    () => rs({classements: [B('686', '803'), B('606', 'Romans policiers')], catNon: ['polar']}));
  await test('Correction du genre : ajouter « Policier » à un roman 803 le sort de Littérature', ['polar'],
    () => rs({classements: [B('686', '803')], catOui: ['polar']}));
  await test('Sous-rayons : l\'indice le plus précis ne donne pas un second sous-rayon faux', [], () => {
    const cas = [
      [{classements: [B('676', '577.27')]}, ['sciences', 'sciences/terre']],
      [{classements: [B('676', '944.083')]}, ['histoire', 'histoire/depuis1945', 'histoire/france']],
      [{classements: [B('676', '940.55')]}, ['histoire', 'histoire/depuis1945']],
      [{classements: [B('676', '801.95')]}, ['litterature', 'litterature/essais']],
      [{classements: [B('676', '944.081')]}, ['histoire', 'histoire/contemporaine', 'histoire/france']]
    ];
    return cas.filter(([b, attendu]) => !egal(rs(b), attendu)).map(([b, attendu]) => b.classements[0].l + ' → ' + rs(b).join(',') + ' (attendu ' + attendu.join(',') + ')');
  });
  // (points mineurs de la relecture, mots validés par Elias le 21/10/2026 : vins, entreprise, médias, migrations humaines ;
  //  santé, nature et internet servent seulement à préciser un rayon déjà trouvé)
  await test('Mots des sujets : vins, entreprise, médias, migrants rangés ; « migrations » seul et « santé » seul non', [], () => {
    const cas = [
      [{sujets: ['Vins']}, ['pratique', 'pratique/cuisine']],
      [{sujets: ['Entreprises -- Gestion']}, ['eco', 'eco/entreprise']],
      [{sujets: ['Médias -- Aspect politique']}, ['politique', 'politique/societe']],
      [{sujets: ['Réfugiés']}, ['politique', 'politique/societe']],
      [{sujets: ['Migrations humaines']}, ['politique', 'politique/societe']],
      [{sujets: ['Oiseaux -- Migrations']}, []],
      [{sujets: ['Santé publique']}, []],
      [{sujets: ['Nature']}, []]
    ];
    return cas.filter(([b, attendu]) => !egal(rs(b), attendu)).map(([b, attendu]) => b.sujets[0] + ' → ' + rs(b).join(',') + ' (attendu ' + attendu.join(',') + ')');
  });
  await test('Mots « santé », « nature », « internet » : ils précisent un rayon déjà trouvé', 'pratique,pratique/sante,pratique/maison|pratique,pratique/cuisine,pratique/nature|politique,politique/societe', () =>
    [rs({classements: [B('676', '646.7')], sujets: ['Santé']}), rs({classements: [B('676', '641')], sujets: ['Nature']}),
      rs({classements: [B('676', '320')], sujets: ['Internet']})].map(l => l.join()).join('|'));
  await test('Dewey 745 (design) → Arts › Architecture & design ; 745.5 (loisirs créatifs) → Vie pratique › Maison', 'art,art/archi|pratique,pratique/maison',
    () => rs({classements: [B('676', '745.2')]}).join() + '|' + rs({classements: [B('676', '745.5')]}).join());
  await test('Corrections : retirer le sous-rayon qui justifiait seul le rayon retire aussi les sous-rayons trouvés par affinage', [],
    () => rs({classements: [B('676', '362.7')], sujets: ['Apprentissage'], catNon: ['shs/social']}));
  await test('Rayons en ligne : « Humour » ou « Biographies » n\'ajoutent pas Littérature à un essai classé', ['politique'],
    () => cats({classements: [B('676', '320')], sujets: ['Humour', 'Biographies']}));

  /* ---------- 2. Nettoyage des fiches (sauvegarde abîmée ou trafiquée) ---------- */
  await test('Fiche : date piégée effacée (pas de code dans l\'appli)', '', () => norm({titre: 'a', pretRetour: '0<img src=x onerror=alert(1)>'}).pretRetour);
  await test('Fiche : nombre de pages piégé effacé', '', () => norm({titre: 'a', pagesTotal: '<b>12</b>'}).pagesTotal);
  await test('Fiche : statut inconnu → « À lire »', 'a_lire', () => norm({titre: 'a', statut: 'pirate'}).statut);
  await test('Fiche : titre qui n\'est pas du texte → « Sans titre »', 'Sans titre', () => norm({titre: {x: 1}}).titre);
  await test('Fiche : citations abîmées écartées', 1, () => norm({titre: 'a', citations: [null, 5, {texte: 'Une phrase'}, {texte: ''}]}).citations.length);
  await test('Fiche : date valide conservée', '2026-03-15', () => norm({titre: 'a', dateFin: '2026-03-15'}).dateFin);
  await test('Fiche : note hors limites ramenée à 5', 5, () => norm({titre: 'a', note: 99}).note);
  await test('Date illisible jamais affichée telle quelle', '', () => fdate('<script>'));
  // (audit du 21/10/2026, A-02 : le numéro de champ d'un classement était affiché sans échappement dans la fiche)
  const PIEGE = '<img src=x onerror="window.__piegeClassement=1">';
  await test('Fiche : classement au numéro de champ piégé écarté, les vrais gardés', ['686'],
    () => norm({titre: 'a', classements: [{c: PIEGE, l: 'x'}, {c: '686', l: '320'}, {c: '6060', l: 'y'}]}).classements.map(k => k.c));
  await test('Fiche : un numéro de champ piégé n\'est jamais interprété dans « D\'où viennent ces catégories ? »', 'texte|aucune image|rien exécuté', async () => {
    window.__piegeClassement = 0;
    // (fiche passée directement, sans nettoyage : vérifie aussi la protection à l'affichage)
    openForm({...norm({titre: 'Piège', id: 't-piege'}), classements: [{c: PIEGE, l: 'x', s: 'BnF'}]}); await pause(150);
    const box = $('#f_cats');
    const r = (box.textContent.includes('onerror') ? 'texte' : 'absent') + '|' + (box.querySelector('img') ? 'IMAGE INJECTÉE' : 'aucune image') + '|' +
      (window.__piegeClassement ? 'CODE EXÉCUTÉ' : 'rien exécuté');
    closeM(); await pause(250);
    return r;
  });

  /* ---------- 3. Stockage ---------- */
  await test('Stockage : enregistrer puis relire', ['t-Un'], async () => {
    books = [fiche('Un')]; await Store.persist();
    const d = await Store.load(); return d.books.map(b => b.id);
  });
  await test('Stockage (D1) : après un échec de la mémoire principale, la copie de secours est relue au lancement suivant', ['t-Un', 't-Deux'], async () => {
    const vraiSet = Store.set, vraiEcrire = Store.ecrire;
    Store.set = Store.ecrire = () => Promise.reject(new Error('mémoire pleine (simulée)'));
    books = [fiche('Un'), fiche('Deux')]; await Store.persist();
    Store.set = vraiSet; Store.ecrire = vraiEcrire;
    const d = await Store.load(); return d.books.map(b => b.id);
  });
  await test('Stockage (D1) : quand la mémoire principale remarche, la copie de secours est supprimée', null, async () => {
    await Store.persist(); return localStorage.getItem(CLE + '-data');
  });
  await test('Stockage (D2) : mémoire illisible au démarrage → erreur claire, et plus aucune écriture', 'lecture impossible|bloque', async () => {
    const vraiGet = Store.get; Store.get = () => Promise.reject(new Error('illisible (simulé)'));
    let msg = '';
    try { await Store.load(); } catch (e) { msg = e.message; }
    Store.get = vraiGet;
    const etat = Store.bloque ? 'bloque' : 'non bloqué';
    Store.bloque = false;
    return msg + '|' + etat;
  });
  await test('Stockage (D3) : un enregistrement interrompu est signalé (bandeau)', true, async () => {
    const vraiSet = Store.set, vraiEcrire = Store.ecrire, vraiLs = localStorage.setItem;
    Store.set = Store.ecrire = () => Promise.reject(new Error('interrompu (simulé)'));
    Storage.prototype.setItem = function () { throw new Error('plein (simulé)'); };
    try { await Store.persist(); } finally { Store.set = vraiSet; Store.ecrire = vraiEcrire; Storage.prototype.setItem = vraiLs; }
    const vu = Store.erreur && !$('#notice').hidden && $('#notice').textContent.includes('pas enregistrées');
    await Store.persist();
    return vu && !Store.erreur;
  });

  /* ---------- 4. Restauration ---------- */
  const restaurer = async (contenu) => {
    const f = new File([typeof contenu === 'string' ? contenu : JSON.stringify(contenu)], 'test.json', {type: 'application/json'});
    const dt = new DataTransfer(); dt.items.add(f); $('#pick_backup').files = dt.files;
    $('#pick_backup').onchange({target: $('#pick_backup')});
    await pause(300);
  };
  await test('Restauration : un fichier qui n\'est pas une sauvegarde est refusé', 'Ce fichier n\'est pas une sauvegarde de l\'appli', async () => {
    await restaurer('{"bonjour": 1}'); return $('#toast').textContent;
  });
  await test('Restauration (D4, S1, S2) : copie de sécurité, fiches nettoyées, entrées illisibles écartées', '2 livres|1 écartée|copie:1|date propre', async () => {
    books = [fiche('Avant')]; await Store.persist();
    await restaurer({app: 'mes-lectures', version: 2, date: new Date().toISOString(), goal: 3,
      books: [{id: 'r1', titre: 'Restauré', statut: 'lu', pretRetour: '0<img src=x onerror=alert(1)>'}, {id: 'r1', titre: 'Même id'}, 'n\'importe quoi']});
    const ecarte = $('#modal').textContent.includes('1 entrée illisible');
    $('#r_ok').click(); await pause(400);
    const copie = await Store.get('avant-restauration');
    return `${books.length} livres|${ecarte ? '1 écartée' : '?'}|copie:${copie.books.length}|${books.every(b => !b.pretRetour) ? 'date propre' : 'DATE PIÉGÉE'}`;
  });
  await test('Restauration : deux fiches avec le même identifiant sont séparées', 2, () => new Set(books.map(b => b.id)).size);
  await test('Restauration : « Revenir à ma bibliothèque d\'avant » remet les livres', ['t-Avant'], async () => {
    await annulerRestauration(); return books.map(b => b.id);
  });
  await test('Restauration : on peut ré-annuler (échange)', 2, async () => { await annulerRestauration(); return books.length; });
  await test('Catégories identiques après sauvegarde puis restauration', true, async () => {
    books = [fiche('Cat', {classements: [B('686', '320')], catOui: ['histoire']})]; await Store.persist();
    const avant = cats(books[0]);
    await restaurer({app: 'mes-lectures', version: 2, date: new Date().toISOString(), goal: 0, books: JSON.parse(JSON.stringify(books))});
    $('#r_ok').click(); await pause(400);
    return egal(cats(books[0]), avant) && egal(avant, ['histoire', 'politique']);
  });

  /* ---------- 5. « Compléter mes livres » n'écrase rien (D5) ---------- */
  await test('Compléter (D5) : une modification faite pendant la recherche est gardée', 'Mon auteur|312', async () => {
    books = [fiche('Edit', {auteur: '', pagesTotal: ''})];
    books[0] = {...books[0], auteur: 'Mon auteur'};          // modifié « pendant » la recherche
    appliquer('t-Edit', {auteur: 'Auteur du catalogue', pagesTotal: 312});
    return books[0].auteur + '|' + books[0].pagesTotal;
  });
  await test('Compléter : le livre supprimé entre-temps n\'est pas recréé', 0, async () => {
    books = []; appliquer('t-Edit', {auteur: 'X'}); return books.length;
  });

  /* ---------- 6. Touche retour d'Android (E1) et fiche modifiée (E2) ---------- */
  await test('Retour : ouvrir une fenêtre ajoute une étape « retour »', true, async () => {
    openForm(null); await pause(50); return !!(history.state && history.state.fenetre);
  });
  await test('Retour : la touche retour ferme la fenêtre (pas l\'appli)', false, async () => {
    history.back(); await pause(250); return $('#ov').classList.contains('show');
  });
  await test('Retour : fiche modifiée → on demande avant de fermer, « Non » la garde ouverte', 'demandé|ouverte', async () => {
    openForm(null); await pause(50);
    $('#f_titre').value = 'Texte tapé'; $('#f_titre').dispatchEvent(new Event('input', {bubbles: true}));
    confirmDemande = 0; reponseConfirm = false;
    history.back(); await pause(250);
    const r = (confirmDemande ? 'demandé' : 'pas demandé') + '|' + ($('#ov').classList.contains('show') ? 'ouverte' : 'fermée');
    reponseConfirm = true; closeM(); await pause(250);
    return r;
  });
  await test('Fond grisé : fiche non modifiée → fermée sans question', 'fermée|0', async () => {
    openForm(null); await pause(50); confirmDemande = 0;
    $('#ov').click(); await pause(100);
    return ($('#ov').classList.contains('show') ? 'ouverte' : 'fermée') + '|' + confirmDemande;
  });
  // (ergonomie, défaut 1 : le bouton « Annuler » fermait une fiche modifiée sans rien demander)
  await test('Bouton « Annuler » : fiche modifiée → on demande avant de fermer, « Non » la garde ouverte', 'demandé|ouverte', async () => {
    openForm(null); await pause(50);
    $('#f_avis').value = 'Un avis tapé'; $('#f_avis').dispatchEvent(new Event('input', {bubbles: true}));
    confirmDemande = 0; reponseConfirm = false;
    document.querySelector('#modal [data-close]').click(); await pause(100);
    const r = (confirmDemande ? 'demandé' : 'pas demandé') + '|' + ($('#ov').classList.contains('show') ? 'ouverte' : 'fermée');
    reponseConfirm = true; modalModifie = false; closeM(); await pause(250);
    return r;
  });
  // (ergonomie, défaut 3 : notes en pastille blanc sur jaune ou vert clair, contraste 2,2 à 3,4 pour 4,5 exigés)
  // (lot V5, U2 : la pastille colorée est devenue « ★★★★☆ 4/5 » ; on vérifie le chiffre écrit, ≥ 4,5 sur le fond réel)
  await test('Notes : « n/5 » lisible (au moins 4,5) pour les notes 1 à 5', [], async () => {
    books = [1, 2, 3, 4, 5].map(n => fiche('Note ' + n, {statut: 'lu', note: n}));
    ui.tab = 'lu'; render();
    const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(x => +x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const fond = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
    const ratio = el => { const a = lum(getComputedStyle(el).color), b = lum(fond(el)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const faibles = [1, 2, 3, 4, 5].map(n => [n, [...document.querySelectorAll('#list .card .note b')].find(b => b.textContent === n + '/5')]).filter(([, el]) => !el || ratio(el) < 4.5)
      .map(([n, el]) => 'note ' + n + ' : ' + (el ? ratio(el).toFixed(2) : 'absente'));
    ui.tab = 'en_cours'; render();
    return faibles;
  });
  // (ergonomie, défaut 2 : la dernière page tapée était perdue si on fermait la fiche « Bravo, livre terminé »)
  await test('« Où j\'en suis » : la dernière page est gardée même si on ferme la fiche « Bravo »', '200|200', async () => {
    books = [fiche('Presque fini', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 150})];
    openPage(books[0]); $('#p_val').value = '200'; $('#p_ok').click(); await pause(100);
    modalModifie = false; closeM(); await pause(250);
    const b = books[0]; return b.pageActuelle + '|' + (b.journal.find(e => e.page === 200) || {}).page;
  });
  await test('Bouton « Annuler » : fiche non modifiée → fermée sans question', 'fermée|0', async () => {
    openForm(null); await pause(50); confirmDemande = 0;
    document.querySelector('#modal [data-close]').click(); await pause(250);
    return ($('#ov').classList.contains('show') ? 'ouverte' : 'fermée') + '|' + confirmDemande;
  });

  /* ---------- 7. Une recherche lente ne remplit pas la mauvaise fiche (R1) ---------- */
  await test('Recherche (R1) : le résultat d\'une fiche fermée n\'arrive pas dans la suivante', '', async () => {
    const vrai = Recherche.parTexte;
    let lacher; Recherche.parTexte = () => new Promise(r => { lacher = () => r([{titre: 'Résultat tardif', auteur: 'X', covers: []}]); });
    openForm(null); $('#s_q').value = 'lent'; const p = doSearch();
    closeM(); openForm(null);                 // une autre fiche est ouverte entre-temps
    lacher(); await p; await pause(50);
    const contenu = $('#s_res').textContent;
    Recherche.parTexte = vrai; closeM(); await pause(250);
    return contenu.includes('Résultat tardif') ? 'Résultat tardif' : '';
  });

  /* ---------- 8. Non-régression ---------- */
  await test('Ajouter, modifier, changer de statut, supprimer, annuler', 'ajouté|en_cours|supprimé|remis', async () => {
    books = []; const b = fiche('Cycle'); save(b);
    const r1 = books.some(x => x.id === b.id) ? 'ajouté' : '?';
    quick('start', books.find(x => x.id === b.id));
    const r2 = books.find(x => x.id === b.id).statut;
    remove(books.find(x => x.id === b.id)); const r3 = books.length === 0 ? 'supprimé' : '?';
    $('#toastBtn').click(); const r4 = books.length === 1 ? 'remis' : '?';
    return [r1, r2, r3, r4].join('|');
  });
  await test('Navigation : quatre espaces principaux et sous-navigation des statuts', 'bibliotheque,decouvrir,carnet,stats|en_cours,a_lire,lu,abandon', () => {
    ui.tab = 'en_cours'; render();
    const espaces = [...document.querySelectorAll('#tabs [data-space]')].map(x => x.dataset.space).join(',');
    const statuts = [...document.querySelectorAll('#main .library-nav [data-tab]')].map(x => x.dataset.tab).join(',');
    for (const t of ['en_cours', 'a_lire', 'decouvrir', 'lu', 'abandon', 'notes', 'citations', 'stats']) { ui.tab = t; render(); }
    ui.tab = 'a_lire'; render(); return espaces + '|' + statuts;
  });
  await test('Carnet : notes et citations partagent un espace avec recherche séparée', 'notes|2|recherche|citations|1', () => {
    books = [fiche('Carnet A', {notes: [{id: 'n-1', texte: 'Lire la forêt', date: today(), page: '8'}, {id: 'n-2', texte: 'À retenir', date: today()}], citations: [{id: 'c-1', texte: 'Dans la forêt', page: '9'}]})];
    // (« $ » ne renvoie qu'un élément : on compte avec querySelectorAll)
    const nb = sel => document.querySelectorAll(sel).length;
    ui.tab = 'notes'; ui.nq = ''; render(); const a = $('#tabs [data-space="carnet"]').textContent.includes('3') && nb('#nlist .carnet-entry') === 2 ? 'notes|2' : '?';
    ui.nq = 'forêt'; renderNotes(); const n = nb('#nlist .carnet-entry');
    ui.tab = 'citations'; render(); const b = nb('#qlist .quote') === 1 && $('#main .carnet-nav [data-tab="citations"]').classList.contains('on') ? 'citations|1' : '?';
    ui.nq = ''; ui.tab = 'a_lire'; render(); return a + '|' + (n === 1 ? 'recherche' : '?') + '|' + b;
  });
  await test('Filtre par catégorie et tri « les plus courts »', ['Court', 'Long'], () => {
    books = [fiche('Long', {pagesTotal: 400, classements: [B('686', '320')]}), fiche('Court', {pagesTotal: 90, classements: [B('686', '320')]}), fiche('Roman', {classements: [B('686', '803')]})];
    ui.tab = 'a_lire'; ui.cat = 'politique'; ui.sort = 'pages'; render();
    const l = [...document.querySelectorAll('#list .card .t')].map(e => e.textContent.trim());
    ui.cat = ''; ui.sort = 'recent'; render(); return l;
  });
  await test('Export Excel : colonne « Rayons » et cellule « =formule » neutralisée', 'Rayons|\'=1+1', () => {
    books = [fiche('=1+1', {classements: [B('686', '320')]})];
    let csv = ''; const dl = window.download; window.download = (n, c) => { csv = c; };
    doExport('excel'); window.download = dl;
    return (csv.includes('"Rayons"') ? 'Rayons' : '?') + '|' + (csv.includes('"\'=1+1"') ? '\'=1+1' : 'non neutralisée');
  });
  await test('Export : les dimensions confirmées et les étiquettes sont incluses', true, () => {
    books = [fiche('Export', {classif: {genre: 'roman', sousGenres: ['roman/historique'], themes: ['famille'], ambiances: ['contemplatif']}, etiquettes: ['Club']})];
    let csv = ''; const dl = window.download; window.download = (n, c) => { csv = c; };
    doExport('excel'); window.download = dl;
    return ['Genre confirmé', 'Sous-genres confirmés', 'Thèmes confirmés', 'Ambiances confirmées', 'Étiquettes personnelles', 'Roman', 'Famille', 'Club'].every(x => csv.includes('"' + x + '"'));
  });

  /* ---------- 8 bis. Étape 5 : stabilisation ---------- */
  await test('Hors ligne (R2) : un livre scanné sans internet n\'est pas « introuvable »', 'pas de connexion|à compléter', async () => {
    books = []; const vrai = Recherche.parIsbn;
    Recherche.parIsbn = async () => { Recherche.dernierStatut = {BnF: 'erreur', Sudoc: 'erreur', 'Open Library': 'erreur', Google: 'erreur'}; return []; };
    bulkSeen = new Set(); await bulkCode('9782070612758'); Recherche.parIsbn = vrai;
    const ligne = $('#bulkList') ? $('#bulkList').textContent : document.body.textContent;
    return (ligne.includes('pas de connexion') ? 'pas de connexion' : '?') + '|' + (books[0] && books[0].aCompleter ? 'à compléter' : '?');
  });
  await test('Hors ligne (R2) : quand internet revient, le livre scanné est complété tout seul', 'Le Petit Prince|complet', async () => {
    const vrai = Recherche.parIsbn;
    Recherche.parIsbn = async () => [{titre: 'Le Petit Prince', auteur: 'Antoine de Saint-Exupéry', isbn: '9782070612758', pagesTotal: 96, covers: []}];
    await reprendreScans(); Recherche.parIsbn = vrai;
    return books[0].titre + '|' + (books[0].aCompleter ? 'encore à compléter' : 'complet');
  });
  await test('Hors ligne (R2) : un livre complété à la main entre-temps n\'est pas écrasé', 'Mon titre', async () => {
    books = [norm({...blankBook('a_lire'), id: 't-scan', titre: 'Mon titre', isbn: '9782070612758', aCompleter: false})];
    const vrai = Recherche.parIsbn; Recherche.parIsbn = async () => [{titre: 'Autre titre', covers: []}];
    await completerScan(books[0]); Recherche.parIsbn = vrai; return books[0].titre;
  });
  await test('Hors ligne : un livre vraiment inconnu des catalogues n\'est plus redemandé à chaque ouverture', 'plus réessayé|0 appel', async () => {
    books = [norm({...blankBook('a_lire'), id: 't-inconnu', titre: 'Livre 9780000000002', isbn: '9782070612758', aCompleter: true, horsLigne: true})];
    const vrai = Recherche.parIsbn; let appels = 0;
    Recherche.parIsbn = async () => { appels++; Recherche.dernierStatut = {BnF: 'rien', Sudoc: 'rien', 'Open Library': 'rien', Google: 'rien'}; return []; };
    await reprendreScans(); appels = 0; await reprendreScans();       // 2e ouverture
    Recherche.parIsbn = vrai;
    return (books[0].horsLigne ? 'encore réessayé' : 'plus réessayé') + '|' + appels + ' appel';
  });
  await test('Sélection du mois : un seul essai automatique par jour', 'essai bloqué', async () => {
    const avant = prefs.selectionEssai, sel = prefs.selection;
    prefs.selection = null; prefs.selectionEssai = today();
    const vrai = Recherche.selection; let appele = false; Recherche.selection = async () => { appele = true; return []; };
    await genSelection(); Recherche.selection = vrai; prefs.selectionEssai = avant; prefs.selection = sel; savePrefs();
    return appele ? 'relancé' : 'essai bloqué';
  });
  await test('BnF ménagée : changer la limite de pages ne renvoie aucune demande au catalogue', '1 demande puis 0', async () => {
    const vrai = window.fetch; let n = 0;
    window.fetch = async () => { n++; return new Response('<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords></srw:searchRetrieveResponse>', {status: 200}); };
    try {
      const sujet = 'essai memoire ' + Date.now();
      await Recherche.parTheme({texte: sujet, max: 100}, {}); const a = n; n = 0;
      await Recherche.parTheme({texte: sujet, max: 300}, {});
      return a + ' demande puis ' + n;
    } finally { window.fetch = vrai; }
  });
  await test('Réseau (R3) : une réponse qui n\'arrive jamais en entier est coupée (pas de blocage)', 'terminé', async () => {
    const vrai = window.fetch;
    window.fetch = (url, o) => Promise.resolve(new Response(new ReadableStream({start(c) { o && o.signal && o.signal.addEventListener('abort', () => c.error(new DOMException('coupé', 'AbortError'))); }}), {status: 200}));
    try {
      const fin = await Promise.race([Recherche.resume({titre: 'Livre test lent'}).then(() => 'terminé', () => 'terminé'), pause(25000).then(() => 'BLOQUÉ')]);
      return fin;
    } finally { window.fetch = vrai; }
  });
  const contraste = (a, b) => {
    const lum = c => { const v = c.match(/\d+/g).slice(0, 3).map(x => +x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  for (const theme of ['light', 'dark']) {
    await test(`Contraste (E3) : bouton vert lisible en mode ${theme === 'dark' ? 'sombre' : 'clair'} (≥ 4,5)`, true, () => {
      const avant = document.documentElement.dataset.theme; document.documentElement.dataset.theme = theme;
      const b = document.createElement('button'); b.className = 'btn pri'; b.textContent = 'Test'; document.body.appendChild(b);
      const cs = getComputedStyle(b), r = contraste(cs.color, cs.backgroundColor);
      b.remove(); document.documentElement.dataset.theme = avant; return r >= 4.5;
    });
  }
  await test('Messages (E4) : un long message passe à la ligne (bouton visible)', 'normal', () => getComputedStyle($('#toast')).whiteSpace);
  await test('Recherche (E5) : un livre d\'un autre onglet est signalé', 'Lus (1)', () => {
    books = [fiche('Dune', {statut: 'lu'}), fiche('Autre')]; ui.tab = 'a_lire'; ui.q = 'dune'; render();
    const t = ($('.ailleurs') || {}).textContent || ''; ui.q = ''; render();
    return t.includes('Lus (1)') ? 'Lus (1)' : t;
  });
  await test('Scan (B1) : lecteur intégré sans moteur de lecture → lecteur de secours', false, async () => {
    const avant = window.BarcodeDetector; window.BarcodeDetector = class { static async getSupportedFormats() { return []; } };
    lecteurOk = null; const r = await lecteurIntegre();
    if (avant) window.BarcodeDetector = avant; else delete window.BarcodeDetector; lecteurOk = null;
    return r;
  });
  await test('Fiche (D6) : un résultat sans série n\'efface pas la série tapée', 'Ma série', async () => {
    openForm(null); $('#f_serie').value = 'Ma série';
    fillFrom({titre: 'Un titre', covers: []});
    const v = $('#f_serie').value; modalModifie = false; closeM(); await pause(250); return v;
  });

  /* ---------- 8 quater. Récupérer une sauvegarde dès l'ouverture ---------- */
  await test('Appli vide : le premier écran propose de récupérer une sauvegarde', true, () => {
    books = []; ui.tab = 'en_cours'; ui.q = ''; ui.genre = ''; ui.own = ''; ui.cat = ''; render();
    return !!document.querySelector('#list [data-export="restore"]');
  });
  await test('Appli avec des livres : ce bouton n\'apparaît plus', false, () => {
    books = [fiche('Un livre')]; ui.tab = 'en_cours'; render();
    return !!document.querySelector('#list [data-export="restore"]');
  });
  await test('Sauvegarde : tout fichier peut être choisi (aucun filtre de type)', '', () => $('#pick_backup').getAttribute('accept') || '');
  await test('Sauvegarde : un fichier qui n\'en est pas une (ex. une photo) est refusé', 'Ce fichier n\'est pas une sauvegarde de l\'appli', async () => {
    const f = new File([new Uint8Array([137, 80, 78, 71, 13, 10])], 'photo.png', {type: 'image/png'});
    const dt = new DataTransfer(); dt.items.add(f); $('#pick_backup').files = dt.files;
    $('#pick_backup').onchange({target: $('#pick_backup')}); await pause(300);
    return $('#toast').textContent;
  });

  /* ---------- 8 ter. Tirage au sort : toutes les catégories ---------- */
  const attendus = ['roman', 'polar', 'sf', 'fantasy', 'bd', 'manga', 'histoire', 'essai', 'perso', 'social', 'romance', 'classique', 'jeunesse', 'ya',
    'cat:histoire', 'cat:politique', 'cat:shs', 'cat:religion', 'cat:art', 'cat:voyages', 'cat:pratique', 'cat:eco', 'cat:sciences'];
  await test('Tirage en ligne : toutes les catégories sont proposées', [], () => attendus.filter(id => !Recherche.THEMES_TIRAGE.some(t => t.id === id)));
  await test('Tirage en ligne : jamais « Dictionnaires & Scolaire »', false, () => Recherche.THEMES_TIRAGE.some(t => t.id === 'cat:reference'));
  await test('Tirage en ligne : les mêmes thèmes dans Découvrir et dans « Que lire ensuite »', true, async () => {
    const avant = prefs.tirage; prefs.tirage = 'hasard';   // (les thèmes s'affichent en mode « Au hasard »)
    ui.tab = 'decouvrir'; render(); const dc = document.querySelectorAll('#dc_theme [data-v]').length;
    pick.mode = 'ligne'; openNext(); const nx = document.querySelectorAll('#nx_theme [data-v]').length; closeM(); await pause(250);
    prefs.tirage = avant;
    return dc === Recherche.THEMES_TIRAGE.length + 1 && nx === dc;
  });
  await test('Que lire ensuite : tirage parmi mes livres d\'une catégorie', ['t-Pol'], async () => {
    books = [fiche('Pol', {classements: [B('686', '320')]}), fiche('Roman', {classements: [B('686', '803')]}), fiche('Rien')];
    pick.mode = 'liste'; pick.len = ''; pick.genre = ''; pick.dispo = false; openNext();
    const chips = [...document.querySelectorAll('#nx_cat [data-v]')].map(b => b.dataset.v);
    document.querySelector('#nx_cat [data-v="politique"]').click();
    const ids = nextCandidates().map(b => b.id);
    pick.cat = ''; closeM(); await pause(250);
    return chips.includes('litterature') ? ids : ['chips manquantes'];
  });

  /* ---------- 8 quinquies. Tirage « d'après mes lectures » ---------- */
  await test('Goûts : livres lus et bien notés en tête, livres abandonnés écartés', 'fantasy,cat:politique|polar absent|2 aimés', () => {
    books = [fiche('F1', {statut: 'lu', note: 5, genre: 'SF / Fantasy'}), fiche('F2', {statut: 'lu', note: 4, genre: 'SF / Fantasy'}),
      fiche('P1', {statut: 'a_lire', classements: [B('686', '320')]}), fiche('Po', {statut: 'abandon', genre: 'Polar / Thriller'})];
    const g = mesGouts();
    return g.themes.map(t => t[0]).join(',') + '|' + (g.themes.some(t => t[0] === 'polar') ? 'polar présent' : 'polar absent') + '|' + g.aimes.length + ' aimés';
  });
  await test('Choix « D\'après mes lectures / Au hasard » dans Découvrir et dans Que lire ensuite', 'dc:perso sans thèmes|dc:hasard avec thèmes|nx:perso', async () => {
    prefs.tirage = 'perso'; ui.tab = 'decouvrir'; render();
    const a = '$dc:' + (document.querySelector('#dc_inspi .on').dataset.v) + (document.querySelector('#dc_theme') ? ' avec thèmes' : ' sans thèmes');
    document.querySelector('#dc_inspi [data-v="hasard"]').click();
    const b = 'dc:' + inspiration() + (document.querySelector('#dc_theme') ? ' avec thèmes' : ' sans thèmes');
    document.querySelector('#dc_inspi [data-v="perso"]').click();
    pick.mode = 'ligne'; openNext(); const c = 'nx:' + document.querySelector('#nx_inspi .on').dataset.v; closeM(); await pause(250);
    return [a.slice(1), b, c].join('|');
  });

  /* ---------- 8 sexies. Découvrir : chercher par thème, auteur ou titre ---------- */
  await test('Découvrir : choisir « Auteur » cache les thèmes et change l\'aide', 'auteur|sans thèmes|Un auteur', () => {
    ui.tab = 'decouvrir'; rech.par = 'theme'; render();
    document.querySelector('#rq_par [data-v="auteur"]').click();
    return rech.par + '|' + (document.querySelector('#rq_cats') ? 'avec thèmes' : 'sans thèmes') + '|' + ($('#rq').placeholder.startsWith('Un auteur') ? 'Un auteur' : $('#rq').placeholder);
  });
  await test('Découvrir : la recherche par auteur envoie bien un auteur (avec la limite de pages)', '{"auteur":"Victor Hugo","max":300}', async () => {
    const vrai = Recherche.parTheme; let recu = null;
    Recherche.parTheme = async o => { recu = {auteur: o.auteur, max: o.max}; return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
    rech.par = 'auteur'; rech.texte = 'Victor Hugo'; rech.max = 300; await lancerRech();
    Recherche.parTheme = vrai; return JSON.stringify(recu);
  });
  await test('Découvrir : la recherche par titre envoie bien un titre', '{"titre":"Dune"}', async () => {
    const vrai = Recherche.parTheme; let recu = null;
    Recherche.parTheme = async o => { recu = {titre: o.titre}; return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
    rech.par = 'titre'; rech.texte = 'Dune'; await lancerRech();
    Recherche.parTheme = vrai; rech.par = 'theme'; rech.texte = ''; rech.max = 0; rech.etat = ''; return JSON.stringify(recu);
  });
  await test('Découvrir : genre, sous-genre, thème et ambiance restent sélectionnés ; genre, sous-genre et thème partent au catalogue (pas les ambiances)', 'genre|sous-genre|thème|ambiance|Roman Historique Deuil', async () => {
    const vrai = Recherche.parTheme; let termes = '';
    rech.par = 'theme'; rech.cat = ''; rech.sous = ''; rech.texte = ''; rech.classif = []; rech.lastClassif = []; rech.dimensionClassement = ''; rech.max = 0; rech.etat = ''; ui.tab = 'decouvrir'; render();
    const clic = sel => { const el = document.querySelector(sel); if (!el) throw Error('introuvable: ' + sel + ' ; panel=' + !!$('#rq_tax_values')); el.click(); };
    clic('#rq_tax_values [data-rqclassif="genre|roman"]');
    clic('#rq_tax_dims [data-rqdim="sousGenres"]');
    clic('#rq_tax_values [data-rqclassif="sousGenres|roman/historique"]');
    clic('#rq_tax_dims [data-rqdim="themes"]');
    clic('#rq_tax_values [data-rqclassif="themes|deuil"]');
    clic('#rq_tax_dims [data-rqdim="ambiances"]');
    clic('#rq_tax_values [data-rqclassif="ambiances|sombre"]');
    const selection = rech.classif.map(x => ({genre: 'genre', sousGenres: 'sous-genre', themes: 'thème', ambiances: 'ambiance'}[x.dim])).join('|');
    Recherche.parTheme = async o => { termes = [o.texte, ...(o.criteres || [])].filter(Boolean).join(' '); return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
    try { await lancerRech(); } finally { Recherche.parTheme = vrai; }
    rech.classif = []; rech.lastClassif = []; rech.etat = ''; rech.texte = ''; render();
    return selection + '|' + termes;
  });

  /* ---------- 8 octies. Sous-catégories et « d'après mes lectures » (5 livres) ---------- */
  await test('Sous-rayons : 327 → Géopolitique, 362.7 → Travail social', ['politique/ri', 'shs/social'], () =>
    [...Recherche.sousRayons({classements: [B('686', '320'), B('676', '327.101')]}), ...Recherche.sousRayons({classements: [B('686', '360'), B('676', '362.709 44')]})].map(z => z.id));
  await test('Bibliothèque : filtre par sous-catégorie', ['Géopo'], () => {
    books = [fiche('Géopo', {classements: [B('686', '320'), B('676', '327.1')]}), fiche('Élections', {classements: [B('686', '320'), B('676', '324.6')]})];
    ui.tab = 'a_lire'; ui.cat = 'sous:politique/ri'; render();
    const l = [...document.querySelectorAll('#list .card .t')].map(e => e.textContent.trim()); ui.cat = ''; render(); return l;
  });
  await test('Mon profil : série à continuer, auteurs, sujets précis', 'Les Annales|2 auteurs|Géopolitique & relations internationales,Idées politiques,Fascisme', () => {
    books = [fiche('T1', {statut: 'lu', note: 5, serie: 'Les Annales', tome: 1, auteur: 'Terry Pratchett'}),
      fiche('Géo', {statut: 'lu', note: 4, auteur: 'Pascal Boniface', classements: [B('686', '320'), B('676', '327.1'), B('606', 'Fascisme -- Italie')]})];
    const p = monProfil();
    return p.series.map(b => b.serie).join() + '|' + p.auteurs.length + ' auteurs|' + p.sujets.map(x => x.nom).join(',');
  });
  await test('D\'après mes lectures : 5 livres, avec la raison de chacun (série, auteur, sujet, catégorie)', 'Suite|aimé|Même sujet|Tu lis souvent|5', async () => {
    books = [fiche('T1', {statut: 'lu', note: 5, serie: 'Les Annales', tome: 1, auteur: 'Terry Pratchett', genre: 'SF / Fantasy'}),
      fiche('Géo', {statut: 'lu', note: 4, auteur: 'Pascal Boniface', classements: [B('686', '320'), B('676', '327.1')]})];
    const v = {t: Recherche.parTexte, th: Recherche.parTheme, d: Recherche.decouvrir, c: Recherche.couverture}; let n = 0;
    Recherche.couverture = async () => 'https://exemple.invalid/couverture.jpg';
    const livre = (titre, extra) => ({titre, auteur: 'X', covers: [], ...extra});
    Recherche.parTexte = async q => /annales 2/i.test(q) ? [livre('Les Annales T2', {serie: 'Les Annales', tome: 2, auteur: 'Terry Pratchett'})]
      : /pratchett/i.test(q) ? [livre('Mortimer ' + (++n), {auteur: 'Terry Pratchett'})] : /boniface/i.test(q) ? [livre('Géopolitique ' + (++n), {auteur: 'Pascal Boniface'})] : [];
    Recherche.parTheme = async () => ({res: [livre('Sujet ' + (++n))], inconnus: [], erreur: ''});
    Recherche.decouvrir = async () => ({...livre('Thème ' + (++n)), raison: ''});
    try {
      const box = document.createElement('div'); await drawPerso(box, null);
      const r = lastTirage.map(x => x.raison).join(' / ');
      return [r.includes('Suite de « Les Annales »') ? 'Suite' : '-', r.includes('Parce que tu as aimé') ? 'aimé' : '-', r.includes('Même sujet') ? 'Même sujet' : '-',
        r.includes('Tu lis souvent') ? 'Tu lis souvent' : '-', lastTirage.length].join('|');
    } finally { Object.assign(Recherche, {parTexte: v.t, parTheme: v.th, decouvrir: v.d, couverture: v.c}); }
  });
  await test('Tirage au hasard : 5 livres par demande', 5, async () => {
    const v = Recherche.decouvrir; let n = 0; Recherche.decouvrir = async () => ({titre: 'Hasard ' + (++n), auteur: 'X', covers: []});
    try { const box = document.createElement('div'); await drawOnline('roman', box, null); return box.querySelectorAll('.sug').length; } finally { Recherche.decouvrir = v; }
  });
  await test('Tirage : « Pas pour moi » retire le livre de la rangée', 4, async () => {
    ui.tab = 'decouvrir'; render(); const box = $('#dc_res'); box.innerHTML = tirageHtml(lastTirage);
    box.querySelector('.sug [data-sug="non"]').click(); await pause(100);
    return box.querySelectorAll('.sug').length;
  });

  /* ---------- 8 septies. Recherche par auteur ---------- */
  await test('Auteur : une BD garde tous ses auteurs (chercher le dessinateur la trouve)', ['René Goscinny', 'Albert Uderzo'], () => {
    const x = `<r xmlns:m="m"><m:datafield tag="200"><m:subfield code="a">Astérix le Gaulois</m:subfield></m:datafield>
      <m:datafield tag="700"><m:subfield code="a">Goscinny</m:subfield><m:subfield code="b">René</m:subfield><m:subfield code="4">690</m:subfield></m:datafield>
      <m:datafield tag="702"><m:subfield code="a">Uderzo</m:subfield><m:subfield code="b">Albert</m:subfield><m:subfield code="4">440</m:subfield></m:datafield>
      <m:datafield tag="702"><m:subfield code="a">Préfacier</m:subfield><m:subfield code="b">Jean</m:subfield><m:subfield code="4">080</m:subfield></m:datafield></r>`;
    return Recherche._parseUnimarc(new DOMParser().parseFromString(x, 'application/xml').documentElement).noms;
  });
  await test('Auteur : passer en mode Auteur enlève la limite de pages', 0, () => {
    ui.tab = 'decouvrir'; rech.par = 'theme'; rech.max = 100; render();
    document.querySelector('#rq_par [data-v="auteur"]').click();
    const m = rech.max; rech.par = 'theme'; render(); return m;
  });
  await test('Auteur : si la BnF ne répond pas, Apple Books prend le relais (avec un message)', 'bnf|livres trouvés|tous de l\'auteur', async () => {
    const vrai = window.fetch;
    window.fetch = (url, o) => {
      if (String(url).includes('catalogue.bnf.fr')) return Promise.reject(new TypeError('BnF bloquée (simulé)'));
      if (String(url).includes('itunes.apple.com')) return Promise.resolve(new Response(JSON.stringify({results: [
        {trackName: 'La place', artistName: 'Annie Ernaux', description: 'Le récit de la vie de son père et de la distance sociale', releaseDate: '2010-01-01'},
        {trackName: 'The Years', artistName: 'Annie Ernaux', description: 'The story of a life and of the times', releaseDate: '2018-01-01'},
        {trackName: 'Annie Ernaux, une œuvre', artistName: 'Autre Personne', description: 'Une étude de son œuvre et de la société', releaseDate: '2020-01-01'}]}), {status: 200}));
      return vrai(url, o);
    };
    try {
      // (premier appel de la page pour cet auteur : rien en mémoire, la BnF « simulée bloquée » est bien interrogée)
      const r = await Recherche.parTheme({auteur: 'Annie Ernaux', max: 0}, {});
      const titres = r.res.map(x => x.titre);
      return [r.note, titres.length === 1 && titres[0] === 'La place' ? 'livres trouvés' : 'trouvés : ' + titres.join(' + '),
        r.res.every(x => /ernaux/i.test(x.auteur)) ? 'tous de l\'auteur' : 'auteur faux'].join('|');
    } finally { window.fetch = vrai; }
  });

  /* ---------- 8 nonies. Corrections du 20/10/2026 (audit) ---------- */
  // D2 : deux fenêtres (l'appli + un onglet Chrome) ouvertes sur la même bibliothèque
  const autreFenetre = async (liste, decalage) => {
    const savedAt = new Date(Date.now() + (decalage || 1000)).toISOString();
    await Store.set('data', {books: liste, goal: 0, savedAt}); await Store.set('version', {savedAt, par: 'autre-fenetre'});
  };
  await test('Deux fenêtres (D2) : mes changements et ceux de l\'autre fenêtre sont gardés tous les deux', 't-A:vu ici,t-B:vu ailleurs,t-C:|3', async () => {
    books = [fiche('A'), fiche('B')]; await Store.persist();
    await autreFenetre([books[0], {...books[1], avis: 'vu ailleurs'}, fiche('C')]);
    books[0] = {...books[0], avis: 'vu ici'}; await Store.persist();
    const d = await Store.get('data');
    return d.books.map(b => b.id + ':' + (b.avis || '')).sort().join(',') + '|' + books.length;
  });
  await test('Deux fenêtres (D2) : un livre supprimé dans l\'autre fenêtre ne revient pas', 't-A', async () => {
    books = [fiche('A'), fiche('B')]; await Store.persist();
    await autreFenetre([books[0]], 2000);
    books[0] = {...books[0], note: 4}; await Store.persist();
    return (await Store.get('data')).books.map(b => b.id).join(',');
  });
  await test('Deux fenêtres (D2) : en revenant sur l\'appli, la liste changée ailleurs est relue', 't-A,t-D', async () => {
    books = [fiche('A')]; await Store.persist();
    await autreFenetre([books[0], fiche('D')], 3000);
    await Store.relire(); return books.map(b => b.id).join(',');
  });
  await test('Enregistrements groupés : 5 changements rapides → au plus 2 écritures, rien de perdu', '≤2|5', async () => {
    books = []; await Store.persist();
    const vrai = Store.ecrire; let n = 0; Store.ecrire = function () { n++; return vrai.apply(this, arguments); };
    try { for (let k = 0; k < 5; k++) { books.push(fiche('G' + k)); Store.persist(); } await Store.persist(); }
    finally { Store.ecrire = vrai; }
    return (n <= 2 ? '≤2' : n + ' écritures') + '|' + (await Store.get('data')).books.length;
  });
  await test('Mémoire illisible (D3) : la restauration est refusée (au lieu de faire croire qu\'elle a marché)', 'refusée|1 livre|bandeau', async () => {
    books = [fiche('Garde')]; Store.bloque = true;
    try {
      await restaurer({app: 'mes-lectures', version: 2, date: new Date().toISOString(), goal: 0, books: [{id: 'x', titre: 'Autre'}]});
      const refus = $('#toast').textContent.includes('Restauration impossible') && !$('#ov').classList.contains('show');
      await Store.persist();
      return [refus ? 'refusée' : 'acceptée', plural(books.length, 'livre'), !$('#notice').hidden && $('#notice').textContent.includes('ne peuvent pas être lus') ? 'bandeau' : 'pas de bandeau'].join('|');
    } finally { Store.bloque = false; paintNotice(); }
  });
  await test('Mémoire illisible (D3) : le Scan rapide est refusé', 'refusé', async () => {
    Store.bloque = true;
    try { await openBulk(); return !$('#bulkOv').classList.contains('show') && $('#toast').textContent.includes('Impossible d\'ajouter') ? 'refusé' : 'ouvert'; }
    finally { Store.bloque = false; closeBulk(); paintNotice(); }
  });
  await test('Pages (F1) : origine gardée (édition, estimation) ; une origine inconnue ou piégée est effacée', 'edition|estimation|-|-', () => [
    bookFrom({titre: 'a', isbn: '9782070612758', pagesTotal: 96}, 'a_lire').pagesSource,
    bookFrom({titre: 'a', pagesTotal: 96}, 'a_lire').pagesSource,
    norm({titre: 'a', pagesTotal: 96, pagesSource: 'constructor'}).pagesSource || '-',
    norm({titre: 'a', pagesSource: 'edition'}).pagesSource || '-'].join('|'));
  await test('Pages (F1) : « Compléter mes livres » trouvé par le titre → nombre de pages marqué « estimé »', '254|estimation', async () => {
    books = [fiche('Mon livre', {auteur: 'Jean Test', pagesTotal: '', couverture: 'https://exemple.invalid/c.jpg'})];
    const v = {i: Recherche.parIsbn, t: Recherche.parTexte, c: Recherche.completer};
    Recherche.parIsbn = async () => [];
    Recherche.parTexte = async () => [{titre: 'Mon livre', auteur: 'Jean Test', pagesTotal: 254, isbn: '9782070612758', pagesSource: 'edition', covers: [], sources: ['BnF']}];
    Recherche.completer = async x => x;
    try { await fillFiche(books[0]); } finally { Object.assign(Recherche, {parIsbn: v.i, parTexte: v.t, completer: v.c}); }
    return books[0].pagesTotal + '|' + books[0].pagesSource;
  });
  await test('Pages (F1) : la médiane d\'Open Library (toutes éditions) n\'est plus prise pour un nombre de pages', '', async () => {
    const vrai = window.fetch;
    // (les autres catalogues répondent « rien » : une panne simulée mettrait la BnF en pause pour les tests suivants)
    const vide = '<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords></srw:searchRetrieveResponse>';
    window.fetch = url => Promise.resolve(String(url).includes('openlibrary.org/search')
      ? new Response(JSON.stringify({docs: [{title: 'Livre médian', author_name: ['Paul Médian'], number_of_pages_median: 321}]}), {status: 200})
      : String(url).includes('catalogue.bnf.fr') ? new Response(vide, {status: 200}) : new Response('{}', {status: 200}));
    try { const r = await Recherche.parTexte('Livre médian Paul Médian'); return r.length ? String(r[0].pagesTotal) : 'aucun résultat'; }
    finally { window.fetch = vrai; }
  });
  await test('Pages (F1) : un nombre tapé à la main est noté « à la main »', 'manuel', async () => {
    books = [fiche('Main', {pagesTotal: 120, pagesSource: 'edition', resumeTente: true, classTente: true, couverture: 'https://exemple.invalid/c.jpg'})];   // (rien à chercher en ligne après l'enregistrement)
    openForm(books[0]); $('#f_total').value = '135'; $('#f_save').click(); await pause(300);
    return books[0].pagesSource;
  });
  await test('Pages (F3) : une pagination « environ » ([ca 90] p.) n\'entre pas dans un filtre strict', '0 dans la liste|1 à part', async () => {
    const vrai = window.fetch;
    const notice = `<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:m="info:lc/xmlns/marcxchange-v2"><srw:numberOfRecords>1</srw:numberOfRecords><srw:records><srw:record><srw:recordData><m:record>
      <m:datafield tag="010"><m:subfield code="a">978-2-07-061275-8</m:subfield></m:datafield><m:datafield tag="101"><m:subfield code="a">fre</m:subfield></m:datafield>
      <m:datafield tag="200"><m:subfield code="a">Livre approximatif</m:subfield></m:datafield><m:datafield tag="215"><m:subfield code="a">1 vol. non paginé [ca 90] p.</m:subfield></m:datafield>
      <m:datafield tag="700"><m:subfield code="a">Test</m:subfield><m:subfield code="b">Jean</m:subfield><m:subfield code="4">070</m:subfield></m:datafield>
      </m:record></srw:recordData><srw:recordIdentifier>ark:/12148/test</srw:recordIdentifier></srw:record></srw:records></srw:searchRetrieveResponse>`;
    window.fetch = async () => new Response(notice, {status: 200});
    try { const r = await Recherche.parTheme({texte: 'approximatif ' + Date.now(), max: 100}, {}); return r.res.length + ' dans la liste|' + r.inconnus.length + ' à part'; }
    finally { window.fetch = vrai; }
  });
  await test('Fiche (D5) : un résumé arrivé en arrière-plan pendant que la fiche est ouverte n\'est pas effacé', 'Résumé trouvé|Mon avis', async () => {
    books = [fiche('Fond', {resume: '', resumeTente: true, classTente: true, couverture: 'https://exemple.invalid/c.jpg'})];
    openForm(books[0]);
    books[0] = {...books[0], resume: 'Résumé trouvé', resumeTente: true};   // complété « pendant » la saisie
    $('#f_avis').value = 'Mon avis'; $('#f_save').click(); await pause(300);
    return books[0].resume + '|' + books[0].avis;
  });
  await test('Fiche (D6) : ajouter à la main un livre déjà présent → on demande ; « Non » ne crée pas de doublon', 'demandé|1 livre', async () => {
    books = [fiche('Dune', {auteur: 'Frank Herbert'})];
    openForm(null); $('#f_titre').value = 'Dune'; $('#f_auteur').value = 'Frank Herbert';
    confirmDemande = 0; reponseConfirm = false; $('#f_save').click(); await pause(200);
    const r = (confirmDemande ? 'demandé' : 'pas demandé') + '|' + plural(books.length, 'livre');
    reponseConfirm = true; modalModifie = false; closeM(); await pause(250); return r;
  });
  await test('Version : index.html, recherche.js et taxonomie.js ont le même numéro (affiché dans les Réglages)', true, async () => {
    openSettings(); const vu = $('#modal').textContent.includes('Version de l\'appli : ' + VERSION); closeM(); await pause(250);
    return Recherche.VERSION === VERSION && typeof Taxonomie !== 'undefined' && Taxonomie.VERSION === VERSION && vu;
  });
  await test('Sécurité : politique de contenu active (l\'appli ne parle qu\'aux catalogues prévus)', true, () => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return !!m && /connect-src 'self' https:\/\/catalogue\.bnf\.fr/.test(m.content) && /object-src 'none'/.test(m.content);
  });
  await test('Confidentialité : le texte « d\'après mes lectures » dit ce qui part vers les catalogues', true, () => {
    // (formulation du 23/10/2026 : « seules des recherches liées à un auteur, un sujet, un classement confirmé ou une série partent vers les catalogues »)
    prefs.tirage = 'perso'; ui.tab = 'decouvrir'; render(); const t = $('#main').textContent; return t.includes('tes goûts restent sur ton téléphone') && /seules des recherches[^.]*partent vers les catalogues/.test(t);
  });
  await test('Code-barres : le lecteur de secours est rangé avec l\'appli (aucun site tiers)', true, async () => {
    await loadZXing(); return !!window.ZXing && !document.querySelector('script[src*="unpkg"]') && !!document.querySelector('script[src="zxing.min.js"]');
  });

  /* ---------- 8 decies. Rayons : recherche et tirage ---------- */
  // Faux catalogue BnF : note chaque requête et répond « 0 livre »
  const fauxBnf = async (fn) => {
    const vrai = window.fetch, requetes = [];
    window.fetch = async url => {
      const u = String(url); if (u.includes('catalogue.bnf.fr')) requetes.push(decodeURIComponent(u.split('query=')[1] || ''));
      return new Response('<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords><srw:records/></srw:searchRetrieveResponse>', {status: 200});
    };
    try { await fn(); } finally { window.fetch = vrai; Recherche._oublierBnf(); }
    return requetes;
  };
  // (fiabilité du banc, 31/10/2026 : une panne simulée mettait la BnF en pause 5 minutes pour les tests suivants,
  // qui échouaient par intermittence ; chaque test repart désormais avec des catalogues disponibles, sauf les tests 🌐)
  await test('Banc de tests : une panne simulée de la BnF la met bien en pause…', 'en pause', async () => {
    const vrai = window.fetch; window.fetch = url => String(url).includes('catalogue.bnf.fr') ? Promise.reject(new TypeError('panne simulée')) : vrai(url);
    try { let e = ''; for (let k = 0; k < 3 && e !== 'pause'; k++) e = (await Recherche.parTheme({texte: 'panne ' + k + ' ' + Date.now(), max: 0}, {})).erreur; return e === 'pause' ? 'en pause' : 'pas de pause (' + e + ')'; }
    finally { window.fetch = vrai; }
  });
  await test('Banc de tests : … mais le test suivant repart avec la BnF disponible', 'pas d’erreur|BnF interrogée', async () => {
    const q = []; const e = await (async () => { let r; q.push(...await fauxBnf(async () => { r = await Recherche.parTheme({texte: 'reprise ' + Date.now(), max: 0}, {}); })); return r.erreur; })();
    return (e || 'pas d’erreur') + '|' + (q.length ? 'BnF interrogée' : 'BnF pas interrogée');
  });
  // (relecture du 23/10 : l'enchaînement exact « Policier Thriller Roman Deuil Sombre » ne correspond à presque aucune notice)
  await test('Recherche par critères (genre, thème…) : une condition par critère ; un rayon de fiction seul ne demande aucun sujet', 'par critère|rayon seul sans sujet', async () => {
    const q = await fauxBnf(() => Recherche.parTheme({cat: 'polar', criteres: ['Roman', 'Deuil'], max: 0}, {}));
    const q2 = await fauxBnf(() => Recherche.parTheme({criteres: ['Roman historique', 'Deuil'], max: 0}, {}));
    const q3 = await fauxBnf(() => Recherche.parTheme({cat: 'polar', max: 0}, {}));
    const ok = q.length && q[0].includes('bib.subject all "Roman" and bib.subject all "Deuil"') && q2.length && q2[0].includes('bib.subject all "Roman historique" and bib.subject all "Deuil"');
    return [ok ? 'par critère' : JSON.stringify([q[0], q2[0]]).slice(0, 240), q3.some(x => x.includes('bib.subject')) ? 'sujet envoyé !' : 'rayon seul sans sujet'].join('|');
  });
  await test('Découvrir : le nom du rayon n\'est pas glissé dans les mots cherchés ; les ambiances ne partent pas au catalogue', 'polar||Roman,Deuil|ambiance seule : message', async () => {
    const vrai = Recherche.parTheme; let crit = null; Recherche.parTheme = async o => { crit = o; return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
    try {
      Object.assign(rech, {par: 'theme', cat: 'polar', sous: '', texte: '', classif: [{dim: 'genre', id: 'roman'}, {dim: 'themes', id: 'deuil'}, {dim: 'ambiances', id: 'sombre'}]});
      await lancerRech(); const r = [crit ? crit.cat : '?', crit ? crit.texte || '' : '?', crit ? (crit.criteres || []).join(',') : '?'];
      crit = null; Object.assign(rech, {cat: '', texte: '', classif: [{dim: 'ambiances', id: 'sombre'}]}); await lancerRech();
      r.push(!crit && /ambiances/i.test($('#toast').textContent) ? 'ambiance seule : message' : '?'); return r.join('|');
    } finally { Recherche.parTheme = vrai; rech.tok++; Object.assign(rech, {cat: '', texte: '', classif: [], etat: '', res: [], inconnus: []}); }
  });
  await test('Recherche par thème : tous les rayons sauf « Dictionnaires & Scolaire »', 'reference absent|romance,ya,voyages,pratique,shs présents', () => {
    const ids = Recherche.THEMES_RECHERCHE.map(r => r.id);
    return (ids.includes('reference') ? 'reference présent' : 'reference absent') + '|' +
      (['romance', 'ya', 'voyages', 'pratique', 'shs'].every(id => ids.includes(id)) ? 'romance,ya,voyages,pratique,shs présents' : ids.join(','));
  });
  await test('Rayon trop large (Sciences humaines) : ses 5 sous-rayons interrogés à tour de rôle, 20 termes au plus', 'philo,psycho,socio,education,social|max 20|fin', async () => {
    // (texte unique : la BnF garde ses réponses 30 minutes, ces requêtes ne doivent pas croiser celles du test « cat:philo »)
    let r, cur = {}, tours = 0; const texte = 'rotation ' + Date.now();
    const q = await fauxBnf(async () => { do { r = await Recherche.parTheme({cat: 'shs', texte, max: 0}, cur); } while (!r.fin && ++tours < 6); });
    const vus = [['philo', '"100"'], ['psycho', '"150"'], ['socio', '"301"'], ['education', '"370"'], ['social', '"361"']].filter(([, m]) => q.some(x => x.includes(m))).map(([n]) => n);
    const max = Math.max(...q.map(x => (x.match(/bib\.(dewey|subject)/g) || []).length));
    return vus.join(',') + '|' + (max <= 20 ? 'max 20' : 'max ' + max) + '|' + (r.fin ? 'fin' : 'pas fini');
  });
  await test('Rayon « Économie, Entreprise & Droit » : une seule requête réunit ses sous-rayons', 1, async () => {
    const q = await fauxBnf(() => Recherche.parTheme({cat: 'eco', max: 0}, {}));
    return q.filter(x => x.includes('"658"') && x.includes('"340"')).length;
  });
  await test('Tirage : un ancien thème « cat:philo » cherche en Philosophie', 'philo seulement', async () => {
    const q = await fauxBnf(() => Recherche.decouvrir('cat:philo', {exclude: () => false}));
    return q.length && q.every(x => x.includes('"100"') && !x.includes('"150"')) ? 'philo seulement' : JSON.stringify(q);
  });
  await test('Tirage : thème « Jeunes adultes » disponible', true, () => Recherche.THEMES_TIRAGE.some(t => t.id === 'ya'));
  await test('Rayon trop large : une requête refusée par la BnF ne bloque pas les autres sous-rayons', 'philo,psycho,socio,education,social|fin|pas d\'erreur', async () => {
    const vrai = window.fetch, q = [], texte = 'refus ' + Date.now();
    window.fetch = async url => {
      const u = String(url), r = decodeURIComponent(u.split('query=')[1] || ''); if (u.includes('catalogue.bnf.fr')) q.push(r);
      // (la requête Philosophie est refusée par le catalogue, les autres répondent « 0 livre »)
      const refus = r.includes('"100"') ? '<srw:diagnostics><diag:diagnostic xmlns:diag="http://www.loc.gov/zing/srw/diagnostic/"><diag:message>refusée</diag:message></diag:diagnostic></srw:diagnostics>' : '';
      return new Response('<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords><srw:records/>' + refus + '</srw:searchRetrieveResponse>', {status: 200});
    };
    let r, cur = {}, tours = 0;
    try { do { r = await Recherche.parTheme({cat: 'shs', texte, max: 0}, cur); } while (!r.fin && !r.erreur && ++tours < 6); }
    finally { window.fetch = vrai; Recherche._oublierBnf(); }
    const vus = [['philo', '"100"'], ['psycho', '"150"'], ['socio', '"301"'], ['education', '"370"'], ['social', '"361"']].filter(([, m]) => q.some(x => x.includes(m))).map(([n]) => n);
    return vus.join(',') + '|' + (r.fin ? 'fin' : 'pas fini') + '|' + (r.erreur ? 'erreur ' + r.erreur : 'pas d\'erreur');
  });
  await test('Faux catalogue : ses réponses ne restent pas en mémoire pour les tests suivants', 1, async () => {
    const o = {cat: 'shs', sous: 'shs/social', texte: 'memoire ' + Date.now(), max: 0};
    await fauxBnf(() => Recherche.parTheme(o, {}));
    return (await fauxBnf(() => Recherche.parTheme(o, {}))).length;
  });

  /* ---------- 8 undecies. Rayons : écrans et conversion des anciennes données ---------- */
  await test('Conversion : anciennes corrections converties, inconnues écartées, doublons fusionnés', '["shs/philo"]|["shs/social"]', () => {
    const b = norm({titre: 'a', catOui: ['philo', 'zzz', 'philo', 'shs/philo'], catNon: ['social/enfance']});
    return JSON.stringify(b.catOui) + '|' + JSON.stringify(b.catNon);
  });
  await test('Conversion : une ancienne sauvegarde garde ses corrections', 'histoire,politique,shs|shs/philo', async () => {
    books = [];
    await restaurer({app: 'mes-lectures', version: 2, date: new Date().toISOString(), goal: 0,
      books: [{id: 'v1', titre: 'Vieux', statut: 'lu', classements: [B('686', '320')], catOui: ['philo', 'histoire']}]});
    $('#r_ok').click(); await pause(400);
    return cats(books[0]).join() + '|' + Recherche.sousRayons(books[0]).map(z => z.id).filter(id => id.startsWith('shs')).join();
  });
  await test('Dernier thème cherché : ancien nom converti, nouveau nom gardé', '{"cat":"shs","sous":"shs/philo"}|{"cat":"politique","sous":""}|{"cat":"","sous":""}',
    () => [rechDepuisMemo('philo'), rechDepuisMemo('politique'), rechDepuisMemo('zzz')].map(x => JSON.stringify(x)).join('|'));
  await test('Dernier thème cherché : un sous-rayon qu\'on ne peut pas chercher à la BnF n\'est pas repris', '{"cat":"litterature","sous":""}',
    () => JSON.stringify(rechDepuisMemo('bio')));
  await test('Fiche : ajouter « Travail social » puis retirer le rayon', 'shs,shs/social|vide', async () => {
    openForm(fiche('Fiche rayons')); await pause(100);
    const sel = $('#f_catadd'); sel.value = 'shs/social'; sel.dispatchEvent(new Event('change', {bubbles: true}));
    const a = idsRangement(form).join();
    document.querySelector('#f_cats [data-catnon="shs"]').click();
    const b = idsRangement(form).join() || 'vide';
    closeM(); await pause(250);
    return a + '|' + b;
  });
  await test('Fiche : le menu « Ajouter » propose les sous-rayons, groupés par rayon', 'groupes:17|Travail social', async () => {
    openForm(fiche('Menu')); await pause(100);
    const g = document.querySelectorAll('#f_catadd optgroup').length;
    const t = [...document.querySelectorAll('#f_catadd option')].some(o => o.value === 'shs/social' && o.textContent.includes('Travail social'));
    closeM(); await pause(250);
    return 'groupes:' + g + '|' + (t ? 'Travail social' : 'absent');
  });
  await test('Export Excel : colonne « Rayons » au format Rayon › sous-rayon', 'Politique & Société › Géopolitique & relations internationales',
    () => rayonsTexte(fiche('Exp', {classements: [B('686', '320'), B('676', '327.1')]})));
  await test('Écrans : le mot « Rayon » remplace « Catégorie »', 'Tous les rayons|Mes livres par rayon', async () => {
    books = [fiche('Pol', {classements: [B('686', '320')]})]; ui.tab = 'a_lire'; render();
    const a = document.querySelector('#cat option') ? document.querySelector('#cat option').textContent : '?';
    ui.tab = 'stats'; render(); const b = /Mes livres par rayon/.test($('#main').textContent) ? 'Mes livres par rayon' : '?';
    ui.tab = 'en_cours'; render();
    return a + '|' + b;
  });

  /* ---------- 8 duodecies. Ergonomie : retouches rapides ---------- */
  await test('Bouton ＋ unique : propose Ajouter un livre, Scanner, Scan rapide (plus de second bouton flottant)', 'livre,scan,rapide|pas de bouton Scan rapide|fiche ouverte', async () => {
    $('#fab').click(); await pause(50);
    const choix = [...document.querySelectorAll('#modal [data-ajout]')].map(b => b.dataset.ajout).join();
    const seul = document.getElementById('bulkBtn') ? 'bouton Scan rapide présent' : 'pas de bouton Scan rapide';
    document.querySelector('#modal [data-ajout="livre"]').click(); await pause(50);
    const fiche = $('#f_titre') ? 'fiche ouverte' : 'pas de fiche';
    modalModifie = false; closeM(); await pause(250);
    return choix + '|' + seul + '|' + fiche;
  });
  await test('« Où j\'en suis » en un geste : +25 p. enregistre tout de suite', '65|fermée', async () => {
    books = [fiche('En route', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 40})];
    openPage(books[0]); document.querySelector('#modal [data-plus="25"]').click(); await pause(250);
    return books[0].pageActuelle + '|' + ($('#ov').classList.contains('show') ? 'ouverte' : 'fermée');
  });
  await test('Filtres repliés sous « Filtres et tri », avec le nombre de filtres actifs', 'replié|⚙️ Filtres et tri|⚙️ Filtres et tri (1)', async () => {
    books = [fiche('Un roman', {genre: 'Roman'}), fiche('Un essai', {genre: 'Essai'})]; ui.tab = 'a_lire'; ui.genre = ''; ui.filtres = false; render();
    const d = $('#filtres'); if (!d || !d.contains($('#genre'))) return 'pas de panneau Filtres';
    const a = (d.open ? 'ouvert' : 'replié') + '|' + d.querySelector('summary').textContent.trim();
    $('#genre').value = 'Roman'; $('#genre').dispatchEvent(new Event('change', {bubbles: true}));
    const b = $('#filtres summary').textContent.trim();
    ui.genre = ''; render();
    return a + '|' + b;
  });
  await test('Cartes « En cours » : « Où j\'en suis » et « ⋯ » (chrono, citation, fini, modifier)', 'pages,plus|timer,quote,fini,edit', async () => {
    books = [fiche('Lecture', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 10})]; ui.tab = 'en_cours'; render();
    const visibles = [...document.querySelectorAll('#list .card .acts [data-act]')].map(b => b.dataset.act).join();
    document.querySelector('#list .card [data-act="plus"]').click(); await pause(50);
    const menu = [...document.querySelectorAll('#modal [data-act]')].map(b => b.dataset.act).join();
    modalModifie = false; closeM(); await pause(250);
    return visibles + '|' + menu;
  });
  await test('Confirmations dans l\'appli : plus de fenêtre système du navigateur', 'question dans l\'appli|0 fenêtre système', async () => {
    let systeme = 0; const avant = window.confirm; window.confirm = () => { systeme++; return false; };
    reponseConfirm = false;
    openForm(null); await pause(50);
    $('#f_avis').value = 'Un avis'; $('#f_avis').dispatchEvent(new Event('input', {bubbles: true}));
    // (le répondeur des tests compte la question posée dans l'appli, puis y répond « Non »)
    confirmDemande = 0; document.querySelector('#modal [data-close]').click(); await pause(100);
    const vu = confirmDemande ? 'question dans l\'appli' : 'pas de question dans l\'appli';
    window.confirm = avant; reponseConfirm = true; modalModifie = false; closeM(); await pause(250);
    return vu + '|' + systeme + ' fenêtre système';
  });
  await test('Moins d\'animations quand le téléphone le demande (réglage d\'accessibilité)', true, () =>
    [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.media && /prefers-reduced-motion:\s*reduce/.test(r.media.mediaText) && /slide-l/.test(r.cssText)); } catch (e) { return false; } }));

  /* ---------- 10. Phase 1 : styles et palettes ---------- */
  const COMBOS = [['jardin', 'light'], ['jardin', 'dark'], ['editorial', 'light'], ['editorial', 'dark'], ['android', 'light'], ['android', 'dark'], ['actuel', 'light'], ['actuel', 'dark'], ['carnet', 'light'], ['carnet', 'dark']];
  const avecStyle = async (style, theme, fn) => {
    const s0 = prefs.style, t0 = prefs.theme; prefs.style = style; prefs.theme = theme; applyTheme();
    try { return await fn(); } finally { prefs.style = s0; prefs.theme = t0; applyTheme(); }
  };
  // (valeurs du §3 du design : fond, texte, accent, texte sur accent)
  const PALETTE_ATTENDUE = {
    // (lot 32 : Jardin de nuit, contrat §2.1 et §2.2)
    'jardin/light': '#FAF7F1 #161412 #A8341F #FFFFFF', 'jardin/dark': '#0D1020 #ECEEF6 #F2D08A #0D1020',
    // (plan maître, phase 1 : style Éditorial, design 01-design-system.md §7)
    'editorial/light': '#F7F5F0 #1E1D1F #9A3F55 #FFFFFF', 'editorial/dark': '#141416 #F2EFEC #E3A9B4 #1A1416',
    'android/light': '#f5faf4 #191c19 #1b6c3d #ffffff', 'android/dark': '#101410 #e0e4dc #9bd5a8 #00391a',
    'actuel/light': '#f2f2f0 #141414 #0b7f45 #ffffff', 'actuel/dark': '#0d0d0d #f1f1f1 #2ecc71 #04210f',
    // (palette Carnet revue le 23/10/2026, accent bordeaux de la direction A ; contrastes vérifiés : texte 13,4 / 15,5, accent 6,7 / 7,5)
    'carnet/light': '#F6F1E8 #252723 #843F4B #ffffff', 'carnet/dark': '#191A18 #F6F1E8 #D69AA4 #191A18'
  };
  const lirePalette = el => ['--fond', '--texte', '--accent', '--sur-accent'].map(v => getComputedStyle(el).getPropertyValue(v).trim()).join(' ');
  await test('Style : Jardin de nuit par défaut (préférence absente ou inconnue)', 'jardin|jardin', () => {
    const s0 = prefs.style; delete prefs.style; applyTheme(); const a = document.documentElement.dataset.style;
    prefs.style = 'xyz'; applyTheme(); const b = document.documentElement.dataset.style;
    prefs.style = s0; applyTheme(); return a + '|' + b;
  });
  await test('Style : les 10 palettes ont les valeurs du design', [], async () => {
    const fautes = [];
    for (const [s, t] of COMBOS) await avecStyle(s, t, () => { const v = lirePalette(document.documentElement); if (v !== PALETTE_ATTENDUE[s + '/' + t]) fautes.push(s + '/' + t + ' : ' + v); });
    return fautes;
  });
  await test('Style : un aperçu garde sa palette même si la page est dans un autre style', '#F6F1E8 #252723 #843F4B #ffffff', async () =>
    avecStyle('android', 'dark', () => { const s = document.createElement('span'); s.dataset.style = 'carnet'; s.dataset.theme = 'light'; document.body.appendChild(s); const v = lirePalette(s); s.remove(); return v; }));
  await test('Style : choix dans les Réglages, immédiat et gardé', 'carnet|carnet|5 aperçus|jardin', async () => {
    const s0 = prefs.style; openSettings(); await pause(50);
    document.querySelector('#st_style [data-st="carnet"]').click();
    const r = document.documentElement.dataset.style + '|' + JSON.parse(localStorage.getItem(CLE + '-prefs')).style + '|' + document.querySelectorAll('#st_style .apercu').length + ' aperçus'
      + '|' + document.querySelector('#st_style [data-st]').dataset.st;
    prefs.style = s0; savePrefs(); applyTheme(); closeM(); await pause(250);
    return r;
  });
  await test('Style : la barre du navigateur prend la couleur de l\'en-tête', '#f5faf4|#141414|#FFFDF9|#141416|#FAF7F1|#0D1020', async () => {
    const lire = () => document.querySelector('meta[name="theme-color"]').content;
    return (await avecStyle('android', 'light', lire)) + '|' + (await avecStyle('actuel', 'light', lire))
      + '|' + (await avecStyle('editorial', 'light', lire)) + '|' + (await avecStyle('editorial', 'dark', lire))
      + '|' + (await avecStyle('jardin', 'light', lire)) + '|' + (await avecStyle('jardin', 'dark', lire));
  });
  /* ---------- 10 bis A. Plan maître, phase 1 : style Éditorial ---------- */
  const VARS_PALETTE = ['--fond', '--surface', '--surface-2', '--texte', '--texte-doux', '--trait', '--accent', '--sur-accent', '--accent-doux', '--sur-accent-doux',
    '--barre', '--texte-barre', '--texte-barre-doux', '--barre-2', '--danger', '--alerte'];
  // (Éditorial : design §7 ; les 6 autres : instantané du 25/10/2026, ils ne doivent pas bouger)
  const PALETTE_COMPLETE = {
    // (lot 32 : Jardin de nuit — barre = fond, comme l'Éditorial ; danger Jour plus sombre que le vermillon, D9)
    'jardin/light': '#FAF7F1 #FFFDF9 #F1ECE2 #161412 #5F5A54 #E2DBCF #A8341F #FFFFFF #F6E0DA #7A2414 #FAF7F1 #161412 #5F5A54 #F1ECE2 #8C1D18 #7A5A00',
    'jardin/dark': '#0D1020 #151A2E #1E2440 #ECEEF6 #A3AAC2 #262D4A #F2D08A #0D1020 #3A3424 #F6E2B5 #0D1020 #ECEEF6 #A3AAC2 #1E2440 #FF9F95 #F4B183',
    'editorial/light': '#F7F5F0 #FFFDF9 #EEEAE3 #1E1D1F #5A5658 #E0DBD3 #9A3F55 #FFFFFF #F6E4E8 #6B2738 #FFFDF9 #1E1D1F #5A5658 #EEEAE3 #B3261E #7A5A00',
    'editorial/dark': '#141416 #1C1C1F #26262A #F2EFEC #B9B3AF #36363C #E3A9B4 #1A1416 #3B2A30 #F4CDD4 #141416 #F2EFEC #B9B3AF #26262A #FF9B91 #E5C07B',
    'android/light': '#f5faf4 #ffffff #e6f2e8 #191c19 #414941 #c1c9be #1b6c3d #ffffff #b6f1c4 #00210e #f5faf4 #191c19 #414941 #e6f2e8 #ba1a1a #7a5900',
    'android/dark': '#101410 #181d18 #212a22 #e0e4dc #c0c9bc #414941 #9bd5a8 #00391a #1f5130 #b6f1c4 #101410 #e0e4dc #c0c9bc #212a22 #ffb4ab #f3c14c',
    'actuel/light': '#f2f2f0 #ffffff #f6f6f4 #141414 #5f5f5f #e4e4e0 #0b7f45 #ffffff #e0f2e8 #0a5c33 #141414 #ffffff #a8a8a8 #262626 #c0392b #8a5a00',
    'actuel/dark': '#0d0d0d #191919 #222222 #f1f1f1 #a3a3a3 #2b2b2b #2ecc71 #04210f #143022 #8fe3b0 #000000 #ffffff #a3a3a3 #1f1f1f #ff8a7a #f3c14c',
    'carnet/light': '#F6F1E8 #FFFCF6 #EDE4D7 #252723 #5E574C #DED5C8 #843F4B #ffffff #F1E1E2 #642B36 #EDE4D7 #252723 #5E574C #DED5C8 #A52A2A #6E5A2E',
    'carnet/dark': '#191A18 #252723 #302F2A #F6F1E8 #C4BFB5 #41413B #D69AA4 #191A18 #41272D #F1C4CC #191A18 #F6F1E8 #C4BFB5 #302F2A #FF9B91 #C5A775'
  };
  await test('Éditorial : les 16 couleurs des 10 palettes (Jardin et Éditorial du design, 3 anciens styles inchangés)', [], async () => {
    const fautes = [];
    for (const [s, t] of COMBOS) await avecStyle(s, t, () => {
      const v = VARS_PALETTE.map(x => getComputedStyle(document.documentElement).getPropertyValue(x).trim()).join(' ');
      if (v !== PALETTE_COMPLETE[s + '/' + t]) fautes.push(s + '/' + t + ' : ' + v);
    });
    return fautes;
  });
  await test('Éditorial : formes du design (angles, ombre, bordure, couvertures)', '6px 12px 20px 999px none 0px 30% 34%', () =>
    avecStyle('editorial', 'light', () => ['--r-s', '--r-m', '--r-l', '--r-pilule', '--ombre-1', '--bordure-carte', '--couv-s', '--couv-l']
      .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim()).join(' ')));
  /* ---------- Lot 32 : style Jardin de nuit (palettes) ---------- */
  const hexVersRgb = h => { const n = parseInt(h.replace('#', ''), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  await test('Jardin : formes de l’Éditorial (angles, ombre, bordure, couvertures)', '6px 12px 20px 999px none 0px 30% 34%', () =>
    avecStyle('jardin', 'light', () => ['--r-s', '--r-m', '--r-l', '--r-pilule', '--ombre-1', '--bordure-carte', '--couv-s', '--couv-l']
      .map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim()).join(' ')));
  await test('Jardin : contours de champs ≥ 3 (fond, surface, surface 2), clair et sombre', 'light ok|dark ok', async () => {
    const r = [];
    for (const t of ['light', 'dark']) await avecStyle('jardin', t, () => {
      const v = x => getComputedStyle(document.documentElement).getPropertyValue(x).trim();
      const k = ['--fond', '--surface', '--surface-2'].map(f => contraste(hexVersRgb(v('--trait-champ')), hexVersRgb(v(f))));
      r.push(t + (k.every(c => c >= 3) ? ' ok' : ' ' + k.map(c => c.toFixed(2)).join('/')));
    });
    return r.join('|');
  });
  await test('Jardin : aperçus des Réglages — chacun garde sa palette, quel que soit le style de la page', 'jardin dans carnet ok|carnet dans jardin ok', async () => {
    const lireDans = (st, th) => { const s = document.createElement('span'); s.dataset.style = st; s.dataset.theme = th; document.body.appendChild(s); const v = lirePalette(s); s.remove(); return v; };
    const a = await avecStyle('carnet', 'light', () => lireDans('jardin', 'dark'));
    const b = await avecStyle('jardin', 'dark', () => lireDans('carnet', 'light'));
    return [a === PALETTE_ATTENDUE['jardin/dark'] ? 'jardin dans carnet ok' : a, b === PALETTE_ATTENDUE['carnet/light'] ? 'carnet dans jardin ok' : b].join('|');
  });
  await test('Jardin : Réglages — 5 cartes de style, « Jardin de nuit » en premier sur toute la largeur, rien ne dépasse', 'pleine largeur|2 colonnes dessous|rien ne dépasse', () => avecStyle('jardin', 'light', async () => {
    openSettings(); await pause(60);
    // (« toute la largeur » = de la gauche de la 2e carte à la droite de la 3e : le cadre du sélecteur a sa marge intérieure)
    const b = [...document.querySelectorAll('#st_style [data-st]')], R = b.map(x => x.getBoundingClientRect());
    const r = [b[0].dataset.st === 'jardin' && Math.abs(R[0].left - R[1].left) < 1 && Math.abs(R[0].right - R[2].right) < 1 ? 'pleine largeur' : b[0].dataset.st + ' ' + R[0].left + '-' + R[0].right,
      b.length === 5 && b[1].getBoundingClientRect().top === b[2].getBoundingClientRect().top ? '2 colonnes dessous' : 'pas en colonnes',
      b.every(x => x.scrollWidth <= x.clientWidth + 1) ? 'rien ne dépasse' : 'texte coupé'];
    closeM(); await pause(250); return r.join('|');
  }));
  await test('Éditorial : un aperçu des Réglages garde sa palette dans un autre style', '#141416 #F2EFEC #E3A9B4 #1A1416', async () =>
    avecStyle('carnet', 'light', () => { const s = document.createElement('span'); s.dataset.style = 'editorial'; s.dataset.theme = 'dark'; document.body.appendChild(s); const v = lirePalette(s); s.remove(); return v; }));
  await test('Éditorial : le livre garde sa palette (mêmes couleurs qu\'en Android moderne, clair et sombre)', 'clair identique|sombre identique', async () => {
    const VARS_LIVRE = ['--livre-papier', '--livre-encre', '--livre-doux', '--livre-or', '--livre-or-texte', '--livre-vert', '--livre-bordeaux', '--livre-tranche'];
    const lire = () => VARS_LIVRE.map(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim()).join(' '), r = [];
    for (const [t, nom] of [['light', 'clair'], ['dark', 'sombre']]) r.push(nom + ((await avecStyle('editorial', t, lire)) === (await avecStyle('android', t, lire)) ? ' identique' : ' différent'));
    return r.join('|');
  });
  // (lot 32 : 5 styles — Jardin de nuit seul sur la première ligne, puis 2 lignes de 2)
  await test('Réglages : les 5 styles tiennent sur 3 lignes (1, puis 2 de 2), sans débordement', 'sans débordement|3 lignes|2 colonnes', async () => {
    openSettings(); await pause(50);
    const box = $('#st_style'), bs = [...box.querySelectorAll('[data-st]')];
    const r = (box.scrollWidth <= box.clientWidth + 1 ? 'sans débordement' : 'déborde de ' + (box.scrollWidth - box.clientWidth) + ' px')
      + '|' + new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size + ' lignes'
      + '|' + new Set(bs.map(b => Math.round(b.getBoundingClientRect().left))).size + ' colonnes';
    closeM(); await pause(250); return r;
  });

  // Pose des composants d'essai dans la page, mesure, puis les retire
  const mesurerComposants = fn => {
    const d = document.createElement('div');
    d.innerHTML = '<div class="card">c</div><span class="chip">p</span><button type="button" class="btn">B</button>'
      + '<span class="chip suggere">s</span><span class="chip warn">w</span><span class="chip late">l</span>'
      + '<button type="button" class="subtab">a</button><button type="button" class="subtab on">b</button><button type="button" class="btn on">o</button>'
      + '<i class="sonde-accent"></i>';
    document.body.appendChild(d);
    try { return fn(s => d.querySelector(s)); } finally { d.remove(); }
  };
  const transparent = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  await test('Éditorial : cartes, puces et boutons sans contour ; puces à sens et choix actifs gardent le leur',
    'carte 0px|puce sans contour|bouton sans contour, 48 px|suggéré en pointillés|à compléter : contour|en retard : contour|statut actif : contour rose|bouton actif : contour rose', () =>
    avecStyle('editorial', 'light', () => mesurerComposants(q => {
      const cs = s => getComputedStyle(q(s)), sonde = q('.sonde-accent'); sonde.style.color = 'var(--accent)'; const rose = getComputedStyle(sonde).color;
      return [
        'carte ' + cs('.card').borderTopWidth,
        transparent(cs('.chip:not(.suggere):not(.warn):not(.late)').borderTopColor) ? 'puce sans contour' : 'puce avec contour',
        (transparent(cs('.btn:not(.on)').borderTopColor) ? 'bouton sans contour' : 'bouton avec contour') + ', ' + (q('.btn:not(.on)').getBoundingClientRect().height >= 47.5 ? '48 px' : 'trop petit'),
        cs('.chip.suggere').borderTopStyle === 'dashed' && !transparent(cs('.chip.suggere').borderTopColor) ? 'suggéré en pointillés' : 'suggéré sans pointillés',
        transparent(cs('.chip.warn').borderTopColor) ? 'à compléter : sans contour' : 'à compléter : contour',
        transparent(cs('.chip.late').borderTopColor) ? 'en retard : sans contour' : 'en retard : contour',
        cs('.subtab.on').borderTopColor === rose ? 'statut actif : contour rose' : 'statut actif : ' + cs('.subtab.on').borderTopColor,
        cs('.btn.on').borderTopColor === rose ? 'bouton actif : contour rose' : 'bouton actif : ' + cs('.btn.on').borderTopColor
      ].join('|');
    })));
  await test('Éditorial : les autres styles gardent leurs contours de puces et de boutons', 'android|actuel|carnet', async () => {
    const r = [];
    for (const s of ['android', 'actuel', 'carnet']) await avecStyle(s, 'light', () => mesurerComposants(q => {
      if (!transparent(getComputedStyle(q('.chip')).borderTopColor) && !transparent(getComputedStyle(q('.btn:not(.on)')).borderTopColor)) r.push(s);
    }));
    return r.join('|');
  });
  await test('Éditorial : carte « Reprendre la lecture » sans contour ni bande rose ; les autres styles gardent la bande',
    'editorial/light 0px 0px|editorial/dark 0px 0px|android/light 4px|carnet/dark 4px', async () => {
    const r = [], d = document.createElement('div'); d.className = 'resume-lecture';
    const mesurer = () => { document.body.appendChild(d); const c = getComputedStyle(d), v = [c.borderTopWidth, c.borderLeftWidth]; d.remove(); return v; };
    for (const t of ['light', 'dark']) await avecStyle('editorial', t, () => r.push('editorial/' + t + ' ' + mesurer().join(' ')));
    for (const [s, t] of [['android', 'light'], ['carnet', 'dark']]) await avecStyle(s, t, () => r.push(s + '/' + t + ' ' + mesurer()[1]));
    return r.join('|');
  });
  await test('Éditorial : un bouton secondaire se distingue toujours du cadre gris qui le contient', 'light ok|dark ok', async () => {
    const r = [], cadres = [['panel encadre', 'btn'], ['rq-tax-explorer', 'chipb rq-tax-option'], ['entree', 'btn small'], ['editeur', 'btn']];
    for (const t of ['light', 'dark']) await avecStyle('editorial', t, () => {
      const fautes = cadres.filter(([c, b]) => {
        const d = document.createElement('div'); d.className = c; d.innerHTML = `<button type="button" class="${b}">x</button>`; document.body.appendChild(d);
        const meme = getComputedStyle(d.firstChild).backgroundColor === getComputedStyle(d).backgroundColor; d.remove(); return meme;
      }).map(([c]) => c);
      r.push(t + (fautes.length ? ' : ' + fautes.join(', ') : ' ok'));
    });
    return r.join('|');
  });
  await test('Éditorial : le livre garde ses propres boutons (éditeur de note : lien, sans fond)', 'light transparent|dark transparent', async () => {
    const r = [];
    for (const t of ['light', 'dark']) await avecStyle('editorial', t, () => {
      const d = document.createElement('div'); d.className = 'lv'; d.innerHTML = '<div class="editeur"><button type="button" class="btn">Annuler</button></div>'; document.body.appendChild(d);
      const fond = getComputedStyle(d.querySelector('.btn')).backgroundColor; d.remove();
      r.push(t + (transparent(fond) ? ' transparent' : ' ' + fond));
    });
    return r.join('|');
  });
  await test('Champs : contour lisible (≥ 3) en Éditorial, inchangé dans les autres styles', 'editorial/light ≥ 3|editorial/dark ≥ 3|android/light inchangé|carnet/dark inchangé', async () => {
    const r = [];
    const mesurer = () => { const i = document.createElement('input'), t = document.createElement('i'); t.style.color = 'var(--trait)'; document.body.append(i, t);
      const c = getComputedStyle(i), v = {bord: c.borderTopColor, fond: c.backgroundColor, trait: getComputedStyle(t).color}; i.remove(); t.remove(); return v; };
    for (const t of ['light', 'dark']) await avecStyle('editorial', t, () => { const v = mesurer(); r.push('editorial/' + t + (contraste(v.bord, v.fond) >= 3 ? ' ≥ 3' : ' ' + contraste(v.bord, v.fond).toFixed(2))); });
    for (const [s, t] of [['android', 'light'], ['carnet', 'dark']]) await avecStyle(s, t, () => { const v = mesurer(); r.push(s + '/' + t + (v.bord === v.trait ? ' inchangé' : ' modifié')); });
    return r.join('|');
  });
  await test('Passage Éditorial : Android passe une seule fois ; Actuel, Carnet, Éditorial et préférences vides restent',
    'true|editorial|false|false|actuel|false|carnet|false|android|false|editorial|false|1', () => {
    const a = {style: 'android'}, r1 = passageEditorial(a), s1 = a.style, r2 = passageEditorial(a);
    const b = {style: 'actuel'}, rb = passageEditorial(b), c = {style: 'carnet'}, rc = passageEditorial(c);
    const d = {style: 'android', styleEditorial: 1}, rd = passageEditorial(d);
    const e = {style: 'editorial'}, re = passageEditorial(e), f = {}, rf = passageEditorial(f);
    return [r1, s1, r2, rb, b.style, rc, c.style, rd, d.style, re, e.style, rf, f.styleEditorial].join('|');
  });
  await test('Passage Éditorial : enregistré, message affiché une fois, choix d\'Android respecté ensuite', 'editorial|editorial|1|message|android|pas de message', async () => {
    const p0 = JSON.stringify(prefs);
    try {
      prefs.style = 'android'; delete prefs.styleEditorial; $('#toast').textContent = '';
      appliquerPassageEditorial(); await pause(1700);
      const lu = JSON.parse(localStorage.getItem(CLE + '-prefs'));
      const r = [prefs.style, lu.style, lu.styleEditorial, $('#toast').textContent.includes(MSG_EDITORIAL) ? 'message' : 'pas de message'];
      $('#toast').textContent = ''; $('#toast').classList.remove('show');
      prefs.style = 'android'; savePrefs(); appliquerPassageEditorial(); await pause(1700);
      r.push(prefs.style, $('#toast').textContent.includes(MSG_EDITORIAL) ? 'message' : 'pas de message');
      return r.join('|');
    } finally { Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, JSON.parse(p0)); savePrefs(); applyTheme(); }
  });
  await test('Passages Éditorial et Jardin : le bon style dès le premier affichage (script de tête)', 'jardin/light|android/light|actuel/light|editorial/light|jardin/light', () => {
    const s = document.head.querySelector('script:not([src])'), r = document.documentElement, p0 = localStorage.getItem(CLE + '-prefs');
    const lance = p => { localStorage.setItem(CLE + '-prefs', JSON.stringify(p)); delete r.dataset.style; delete r.dataset.theme;
      const x = document.createElement('script'); x.textContent = s.textContent; document.body.appendChild(x); x.remove(); return r.dataset.style + '/' + r.dataset.theme; };
    // (lot 32 : Android sans repère → Jardin directement ; un retour à l'Éditorial choisi après le passage est respecté ; installation neuve → Jardin)
    try { return [lance({style: 'android', theme: 'light'}), lance({style: 'android', theme: 'light', styleEditorial: 1}), lance({style: 'actuel', theme: 'light'}),
      lance({style: 'editorial', theme: 'light', styleEditorial: 1, styleJardin: 1}), lance({theme: 'light'})].join('|'); }
    finally { if (p0 === null) localStorage.removeItem(CLE + '-prefs'); else localStorage.setItem(CLE + '-prefs', p0); applyTheme(); }
  });
  // (lot 32, D1 validée le 11/11/2026 : le Jardin de nuit devient le style par défaut ; passage unique depuis l'Éditorial)
  await test('Jardin par défaut : une installation neuve est en Jardin de nuit', 'jardin', () => PREFS_DEFAUT.style);
  await test('Passage Jardin : Éditorial passe une seule fois ; Android, Actuel, Carnet, Jardin, repère et préférences vides restent',
    'true|jardin|false|false|android|false|actuel|false|carnet|false|jardin|false|editorial|false|1', () => {
    const a = {style: 'editorial'}, r1 = passageJardin(a), s1 = a.style, r2 = passageJardin(a);
    const b = {style: 'android', styleEditorial: 1}, rb = passageJardin(b), c = {style: 'actuel'}, rc = passageJardin(c);
    const d = {style: 'carnet'}, rd = passageJardin(d), e = {style: 'jardin'}, re = passageJardin(e);
    const f = {style: 'editorial', styleJardin: 1}, rf = passageJardin(f), g = {}, rg = passageJardin(g);
    return [r1, s1, r2, rb, b.style, rc, c.style, rd, d.style, re, e.style, rf, f.style, rg, g.styleJardin].join('|');
  });
  await test('Passage Jardin : Android sans repère passe directement en Jardin, avec un seul message', 'jardin|1|1|1 message', async () => {
    const p0 = JSON.stringify(prefs), vus = [], t0 = window.toastLater;
    try {
      Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, {...PREFS_DEFAUT, style: 'android'});
      window.toastLater = m => vus.push(m);   // (on compte les messages au lieu d'attendre les toasts)
      appliquerPassageEditorial(!prefs.styleJardin); appliquerPassageJardin();
      const lu = JSON.parse(localStorage.getItem(CLE + '-prefs'));
      return [prefs.style, lu.styleEditorial, lu.styleJardin, vus.length + ' message' + (vus.length > 1 ? 's' : '')].join('|');
    } finally { window.toastLater = t0; Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, JSON.parse(p0)); savePrefs(); applyTheme(); }
  });
  await test('Passage Jardin : message affiché une fois, retour à l’Éditorial respecté ensuite', 'jardin|message|editorial|pas de message', async () => {
    const p0 = JSON.stringify(prefs);
    try {
      prefs.style = 'editorial'; prefs.styleEditorial = 1; delete prefs.styleJardin; $('#toast').textContent = '';
      appliquerPassageJardin(); await pause(1700);
      const r = [prefs.style, $('#toast').textContent.includes(MSG_JARDIN) ? 'message' : 'pas de message'];
      $('#toast').textContent = ''; $('#toast').classList.remove('show');
      prefs.style = 'editorial'; savePrefs(); appliquerPassageJardin(); await pause(1700);
      r.push(prefs.style, $('#toast').textContent.includes(MSG_JARDIN) ? 'message' : 'pas de message');
      return r.join('|');
    } finally { $('#toast').textContent = ''; $('#toast').classList.remove('show'); Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, JSON.parse(p0)); savePrefs(); applyTheme(); }
  });
  // (lot O3a du 30/10/2026 : la fiche verticale devient le carnet par défaut — décision d'Elias ; passage unique, comme l'Éditorial)
  await test('Carnet par défaut (O3a) : une installation neuve ouvre la fiche verticale', 'continue', () => typeof PREFS_DEFAUT === 'undefined' ? 'pas de valeurs par défaut nommées' : PREFS_DEFAUT.consultation);
  await test('Passage fiche : le carnet feuilletable passe une seule fois à la fiche ; la fiche, le repère et les préférences vides restent',
    'true|continue|false|false|continue|false|livre|false|1', () => {
    if (typeof passageFiche === 'undefined') return 'pas de passage';
    const a = {consultation: 'livre'}, r1 = passageFiche(a), s1 = a.consultation, r2 = passageFiche(a);
    const b = {consultation: 'continue'}, rb = passageFiche(b), d = {consultation: 'livre', consultationFiche: 1}, rd = passageFiche(d), f = {}, rf = passageFiche(f);
    return [r1, s1, r2, rb, b.consultation, rd, d.consultation, rf, f.consultationFiche].join('|');
  });
  await test('Passage fiche : enregistré, message affiché une fois, choix du carnet feuilletable respecté ensuite', 'continue|continue|1|message|livre|pas de message', async () => {
    if (typeof appliquerPassageFiche === 'undefined') return 'pas de passage';
    const p0 = JSON.stringify(prefs);
    try {
      prefs.consultation = 'livre'; delete prefs.consultationFiche; $('#toast').textContent = '';
      appliquerPassageFiche(); await pause(1700);
      const lu = JSON.parse(localStorage.getItem(CLE + '-prefs'));
      const r = [prefs.consultation, lu.consultation, lu.consultationFiche, $('#toast').textContent.includes(MSG_FICHE) ? 'message' : 'pas de message'];
      $('#toast').textContent = ''; $('#toast').classList.remove('show');
      prefs.consultation = 'livre'; savePrefs(); appliquerPassageFiche(); await pause(1700);
      r.push(prefs.consultation, $('#toast').textContent.includes(MSG_FICHE) ? 'message' : 'pas de message');
      return r.join('|');
    } finally { Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, JSON.parse(p0)); savePrefs(); }
  });
  await test('Fiche : le livre feuilletable s\'appelle « Feuilleter comme un livre » (fiche et Réglages)', 'Feuilleter comme un livre|réglage expliqué', async () => {
    const c0 = prefs.consultation, a0 = prefs.animation;
    try {
      prefs.consultation = 'continue'; prefs.animation = 'aucune'; books = [fiche('Libellé', {statut: 'en_cours'})]; ouvrirFiche(books[0].id);
      const b = $('#livre [data-fiche="ouvrir-carnet"]'), r = [b && (b.getAttribute('aria-label') || b.textContent).includes('Feuilleter comme un livre') ? 'Feuilleter comme un livre' : b ? b.textContent.trim() : '?']; await fermerFiche(); openSettings();   // (lot V5, U8 : « Feuilleter » écrit, nom complet lu)
      r.push(($('#st_consult').parentElement.textContent || '').includes('« Feuilleter »') ? 'réglage expliqué' : '?'); closeM(); await pause(250); return r.join('|');
    } finally { prefs.consultation = c0; prefs.animation = a0; savePrefs(); }
  });
  // (lot 1 de la refonte, 31/10/2026 : design system — icônes sans couleur d'émoji, couvertures générées lisibles en petit, Noto Serif, ＋)
  const enStyle = async (style, fn) => { const s0 = prefs.style; prefs.style = style; applyTheme(); try { return await fn(); } finally { prefs.style = s0; applyTheme(); } };
  await test('Lot 1 : icônes de la barre du bas sans couleur d’émoji, espace actif en rose (Éditorial) ; émojis gardés en Carnet', '0px|rose|neutre|émoji en Carnet', async () => {
    ui.tab = 'en_cours'; render();
    const r = await enStyle('editorial', () => {
      const a = $('#tabs .tab.on .ico'), b = $('#tabs .tab:not(.on) .ico'), rose = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const enRgb = c => { const x = document.createElement('i'); x.style.color = c; document.body.appendChild(x); const v = getComputedStyle(x).color; x.remove(); return v; };
      return [getComputedStyle(b).fontSize, getComputedStyle(a).backgroundColor === enRgb(rose) ? 'rose' : 'actif ' + getComputedStyle(a).backgroundColor, getComputedStyle(b).backgroundColor !== enRgb(rose) ? 'neutre' : 'rose aussi'];
    });
    r.push(await enStyle('carnet', () => parseFloat(getComputedStyle($('#tabs .tab .ico')).fontSize) > 0 ? 'émoji en Carnet' : 'émoji perdu en Carnet'));
    return r.join('|');
  });
  await test('Lot 1 : en-tête sans émoji coloré (icône dessinée, émoji gardé en Carnet)', 'icône dessinée|émoji en Carnet', async () => {
    const r = [await enStyle('editorial', () => { const i = $('header h1 .ico'); return i && getComputedStyle(i).fontSize === '0px' && !$('header h1').firstChild.nodeValue ? 'icône dessinée' : 'émoji : « ' + $('header h1').textContent.trim() + ' »'; })];
    r.push(await enStyle('carnet', () => { const i = $('header h1 .ico'); return i && parseFloat(getComputedStyle(i).fontSize) > 0 ? 'émoji en Carnet' : '?'; }));
    return r.join('|');
  });
  await test('Lot 1 : couverture générée en petit, aucun décor plein ne recouvre les initiales ; décor gardé en grand', 'aucun recouvrement|décor gardé en grand', () => {
    const boite = document.createElement('div'); boite.style.cssText = 'position:fixed;left:0;top:0;display:flex;gap:4px;align-items:flex-start;z-index:99'; document.body.appendChild(boite);
    try {
      const vus = {}, gros = [], recouvre = [];
      for (let k = 0; k < 400 && Object.keys(vus).length < 2; k++) {
        const b = {titre: 'Essai ' + k, auteur: 'Auteur ' + k}, g = couvGeneree(b);
        if (!['geometrique', 'illustree'].includes(g.famille) || vus[g.famille]) continue; vus[g.famille] = 1;
        for (const [l, liste] of [[62, recouvre], [110, gros]]) {
          const d = document.createElement('div'); d.innerHTML = coverHtml(b); const c = d.firstElementChild; c.style.width = l + 'px'; c.style.height = Math.round(l * 1.5) + 'px'; boite.appendChild(c);
          const ini = c.querySelector('.cg-ini').getBoundingClientRect(), decor = [...c.querySelectorAll('.cg-disque, .cg-bande, .cg-motif')].filter(x => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0);
          if (l === 62) decor.forEach(x => { const r = x.getBoundingClientRect(); if (ini.width && r.left < ini.right && r.right > ini.left && r.top < ini.bottom && r.bottom > ini.top) liste.push(g.famille + ' ' + x.getAttribute('class')); });
          else if (decor.length) liste.push(g.famille);
        }
      }
      return [recouvre.length ? 'recouvre : ' + recouvre.join(', ') : 'aucun recouvrement', gros.length === 2 ? 'décor gardé en grand' : 'décor en grand : ' + gros.join(',')].join('|');
    } finally { boite.remove(); }
  });
  await test('Lot 1 : police des titres — Noto Serif en premier (celle d’Android, pour un rendu fidèle partout)', 'Noto Serif', () => {
    const p = getComputedStyle(document.documentElement).getPropertyValue('--police-titres').trim();
    return /^"?Noto Serif"?\s*,/.test(p) ? 'Noto Serif' : p;
  });
  await test('Lot 1 : le ＋ ne cache jamais la fin de la liste (liste et grille)', 'liste visible|grille visible', async () => {
    const v0 = prefs.view, r = [];
    try {
      books = Array.from({length: 12}, (_, k) => fiche('Pile ' + k, {statut: 'a_lire', pagesTotal: 200}));
      for (const vue of ['liste', 'grille']) {
        ui.tab = 'a_lire'; prefs.view = vue; render(); scrollTo(0, document.documentElement.scrollHeight); await pause(60);
        const l = [...document.querySelectorAll('#list .card, #list .gcard')].pop(), f = $('.fab');
        const bas = Math.max(...[l, ...l.querySelectorAll('*')].map(x => x.getBoundingClientRect().bottom)), haut = f.getBoundingClientRect().top;
        r.push(bas <= haut + 1 ? vue + ' visible' : vue + ' cachée (bas ' + Math.round(bas) + ', ＋ ' + Math.round(haut) + ')');
      }
      return r.join('|');
    } finally { prefs.view = v0; scrollTo(0, 0); }
  });
  await test('M6 : aucun effet de survol hors des appareils à souris (pas de contour collant au toucher)', [], () => {
    const feuille = [...document.styleSheets].find(s => s.ownerNode === document.head.querySelector('style')), fautes = [];
    const parcourir = (regles, dansSurvol) => [...regles].forEach(r => {
      if (r instanceof CSSMediaRule) return parcourir(r.cssRules, dansSurvol || /hover\s*:\s*hover/.test(r.conditionText));
      if (r instanceof CSSStyleRule && r.selectorText.includes(':hover') && !dansSurvol) fautes.push(r.selectorText);
    });
    parcourir(feuille.cssRules, false); return fautes;
  });
  await test('M3 : bouton × d\'étiquette d\'au moins 40 px (zone de toucher de 48 px), et toujours efficace', '40+|40+|48|retirée', async () => {
    books = [fiche('Étiquetée', {etiquettes: ['Club']})]; openForm(books[0]); await pause(50);
    const b = $('#f_etiquettes [data-etiquette-retirer]'); b.closest('details') && (b.closest('details').open = true);
    const r = b.getBoundingClientRect(), apres = getComputedStyle(b, '::after');
    const res = [r.width >= 39.5 ? '40+' : Math.round(r.width) + ' px', r.height >= 39.5 ? '40+' : Math.round(r.height) + ' px',
      Math.round(r.height + 2 * Math.max(0, -parseFloat(apres.top) || 0)) >= 48 ? '48' : 'zone ' + apres.top];
    b.click(); await pause(50); res.push($('#f_etiquettes [data-etiquette-retirer]') ? 'encore là' : 'retirée');
    modalModifie = false; closeM(); await pause(250); return res.join('|');
  });
  /* ---------- 10 bis. Phase 1 : feuille de style ---------- */
  // Toutes les règles de la feuille principale (et celles des @media, sauf l'impression)
  const regles = () => { const out = []; const lire = (l, imp) => { for (const r of l) { if (r.cssRules && r.media) lire(r.cssRules, imp || /print/.test(r.media.mediaText)); else if (r.selectorText && !imp) out.push(r); } }; lire(document.styleSheets[0].cssRules, false); return out; };
  const estPalette = sel => sel.split(',').every(s => /^\s*(:root|\[data-style|\[data-theme)/.test(s));
  await test('CSS : aucune couleur écrite en dur hors des palettes', [], () =>
    regles().filter(r => !estPalette(r.selectorText) && !/^\.cam\b/.test(r.selectorText) && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b(?!-)/i.test(r.style.cssText)).map(r => r.selectorText).slice(0, 20));
  /* ---------- Lot 32 : le Jardin hérite des règles de composants de l’Éditorial ---------- */
  await test('Jardin : chaque règle de composant de l’Éditorial vaut aussi pour le Jardin', [], () =>
    regles().filter(r => /data-style="?editorial/.test(r.selectorText) && !/jardin/.test(r.selectorText)
      && !/^\[data-style="?editorial"?\]\[data-theme/.test(r.selectorText) && !/^:root/.test(r.selectorText))
      .map(r => r.selectorText).slice(0, 20));
  await test('CSS : tailles de texte toutes sur l\'échelle (6 tailles)', [], () =>
    // (exceptions : l'horloge, les badges, le texte des couvertures générées, proportionnel à la couverture, et les deux éléments
    // de titrage du livre : le grand chiffre de la page Progression et la lettrine du résumé)
    regles().filter(r => r.style.fontSize && !/^(var\(--t-(xs|s|m|l|xl|xxl)\)|min\(var\(--t-(xs|s|m|l|xl|xxl)\), ?[\d.]+vw\)|inherit|0|0px)$/.test(r.style.fontSize) && !/^\.clock$|\.badge \.be$|(^|\s)\.cg[-\s]|^\.lv-(grand|lettrine::first-letter)$/.test(r.selectorText))
      .map(r => r.selectorText + ' ' + r.style.fontSize).slice(0, 20));
  await test('CSS : l\'ancien thème superposé est retiré', [], () =>
    ['--bg', '--ink', '--card', '--muted', '--line', '--accent-soft', '--on-accent', '--field', '--radius', '--shadow', '--bar', '--red', '--star', '--green']
      .filter(v => document.styleSheets[0].ownerNode.textContent.includes(v + ':') || document.styleSheets[0].ownerNode.textContent.includes('var(' + v + ')')));

  /* ---------- 10 ter. Phase 1 : écrans (5) ---------- */
  const ECRANS = {
    'bibliothèque': async () => { closeM(); books = [fiche('Livre en cours', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 50, genre: 'Roman'}),
      ...[1, 2, 3, 4, 5].map(n => fiche('Lu ' + n, {statut: 'lu', note: n, genre: 'Essai', classements: [B('686', '320')]}))]; ui.tab = 'lu'; ui.filtres = true; render(); },
    'fiche': async () => { openForm(books[1]); await pause(50); },
    'carnet': async () => { modalModifie = false; closeM(); ouvrirFiche(books[1].id); await pause(50); },
    'découvrir': async () => { modalModifie = false; closeM(); if (ficheEtat.id) await fermerFiche(); ui.tab = 'decouvrir'; render(); },
    'stats': async () => { ui.tab = 'stats'; render(); },
    'réglages': async () => { openSettings(); await pause(50); }
  };
  const auditEcrans = async (mesure, combos) => {
    const fautes = [];
    for (const [s, t] of combos || [['android', 'light']]) await avecStyle(s, t, async () => {
      for (const [nom, prep] of Object.entries(ECRANS)) { await prep(); fautes.push(...mesure().map(f => nom + ' ' + s + '/' + t + ' : ' + f)); }
    });
    modalModifie = false; closeM(); if (ficheEtat.id) await fermerFiche(); await pause(250); ui.tab = 'en_cours'; ui.filtres = false; render();
    return [...new Set(fautes)].slice(0, 20);
  };
  const PERMIS = /^(width|height|grid-column(-start|-end)?)$/;
  await test('Écrans : plus de style en ligne (sauf largeurs, hauteurs, calendrier, couvertures de secours)', [], () =>
    auditEcrans(() => [...document.querySelectorAll('[style]')].flatMap(el => [...el.style].filter(p => !PERMIS.test(p) && !(/^background/.test(p) && el.classList.contains('ph')))
      .map(p => (el.id || el.className || el.tagName) + ' ' + p))));
  await test('Couvertures de secours : initiale lisible (≥ 4,5:1) pour 36 titres, dans les 8 combinaisons', [], async () => {
    const fautes = [];
    for (const [s, t] of COMBOS) await avecStyle(s, t, () => {
      const d = document.createElement('div'); d.innerHTML = Array.from({length: 36}, (_, k) => coverHtml({titre: 'Titre ' + k * 7})).join(''); document.body.appendChild(d);
      for (const ph of d.querySelectorAll('.ph')) { const st = getComputedStyle(ph), c = (st.backgroundColor.match(/[\d.]+/g) || []).map(Number), f = (st.color.match(/[\d.]+/g) || []).map(Number);
        const L = v => { const x = v.slice(0, 3).map(y => y / 255).map(y => y <= .03928 ? y / 12.92 : ((y + .055) / 1.055) ** 2.4); return .2126 * x[0] + .7152 * x[1] + .0722 * x[2]; };
        const r = (Math.max(L(c), L(f)) + .05) / (Math.min(L(c), L(f)) + .05); if (r < 4.5) fautes.push(s + '/' + t + ' ' + st.backgroundColor + ' ' + r.toFixed(2)); }
      d.remove();
    });
    return fautes.slice(0, 10);
  });

  /* ---------- 10 quater. Phase 1 : icônes ---------- */
  await test('Icônes : dessinées en Jardin, Éditorial, Android et Actuel, émojis en Carnet', 'jardin:dessin|editorial:dessin|android:dessin|actuel:dessin|carnet:émoji', async () => {
    const r = [];
    for (const s of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) await avecStyle(s, 'light', () => {
      const i = document.querySelector('#settingsBtn .ico'), st = getComputedStyle(i);
      r.push(s + ':' + (st.fontSize === '0px' && st.maskImage !== 'none' ? 'dessin' : st.fontSize !== '0px' && st.maskImage === 'none' ? 'émoji' : '?'));
    });
    return r.join('|');
  });
  await test('Icônes : chaque icône utilisée existe, et les émojis d\'interface sont enveloppés', 'aucune inconnue|plus de 40', async () => {
    const code = [...document.querySelectorAll('script:not([src])')].pop().textContent, src = code + document.body.innerHTML;
    const noms = [...new Set([...src.matchAll(/class="ico i-([a-z]+)"/g)].map(m => m[1]))].filter(n => !ICONES[n]);
    const n = (code.match(/class="ico i-/g) || []).length;
    return (noms.length ? 'inconnues : ' + noms.join(',') : 'aucune inconnue') + '|' + (n > 40 ? 'plus de 40' : n);
  });
  await test('Icônes : jamais dans un message éphémère ni une option de menu', 'toast propre|options propres', async () => {
    toast('Bonne lecture ! 📖'); const a = $('#toast').querySelector('.ico') ? 'toast avec icône' : 'toast propre';
    ui.tab = 'a_lire'; books = [fiche('X', {classements: [B('686', '320')]})]; render();
    const b = document.querySelector('#cat option .ico, #cat option span') ? 'options avec icône' : 'options propres';
    ui.tab = 'en_cours'; render(); return a + '|' + b;
  });
  // (barre du bas, 23/10 : l'icône d'un espace est AU-DESSUS de son nom, centrée sur lui ; ailleurs, sur la même ligne)
  await test('Icônes : alignées sur leur libellé (même ligne ; centrées au-dessus dans la barre du bas)', [], async () => {
    books = [fiche('Un roman', {genre: 'Roman'})]; ui.tab = 'a_lire'; render();
    const fautes = [];
    for (const s of ['android', 'carnet']) await avecStyle(s, 'light', () => {
      for (const el of ['.tab[data-space=decouvrir]', '#filtres summary']) {
        const box = document.querySelector(el), i = box.querySelector('.ico'), barre = el.startsWith('.tab'), t = document.createRange();
        t.selectNodeContents(barre ? box.querySelector('.ico + span') : box.lastChild.nodeType === 3 ? box.lastChild : box);
        const a = i.getBoundingClientRect(), b = [...t.getClientRects()].pop();
        const ecart = barre ? (a.left + a.right) / 2 - (b.left + b.right) / 2 : (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2;
        if (Math.abs(ecart) > 6 || (barre && a.bottom > b.top + 2)) fautes.push(s + ' ' + el + ' décalée de ' + Math.round(ecart) + ' px');
      }
    });
    ui.tab = 'en_cours'; render(); return fautes;
  });
  /* ---------- 10 quinquies. Phase 1 : états vides, erreurs, chargements ---------- */
  await test('États : chaque onglet vide montre un état avec une action (sauf Abandonnés)', 'en_cours:1+|a_lire:1+|lu:1+|abandon:0|citations:1+', async () => {
    books = [fiche('Seul', {statut: 'abandon'})]; const r = [];
    for (const t of ['en_cours', 'a_lire', 'lu', 'abandon', 'citations']) {
      if (t === 'abandon') books = [fiche('Seul', {statut: 'lu'})];
      ui.tab = t; render(); const e = $('#main .etat'); r.push(t + ':' + (!e ? 'aucun état' : e.querySelectorAll('.btn').length ? '1+' : '0'));
      books = [fiche('Seul', {statut: 'abandon'})];
    }
    ui.tab = 'en_cours'; render(); return r.join('|');
  });
  await test('États : bibliothèque vide → ajouter un livre ou restaurer une sauvegarde', 'ajouter|restaurer', () => {
    // (depuis la page de bienvenue, l'accueil vide est la section « .onboarding », plus un « .etat » : test mis à jour au lot 2)
    books = []; ui.tab = 'en_cours'; render();
    return ($('#main .onboarding [data-ajouter]') ? 'ajouter' : '?') + '|' + ($('#main .onboarding [data-export="restore"]') ? 'restaurer' : '?');
  });
  await test('États : l\'avertissement sous l\'accueil est centré comme l\'accueil', 'centré', () => {
    books = []; ui.tab = 'en_cours'; render();
    const a = $('#main .onboarding').getBoundingClientRect(), b = $('#main .onboarding + .onboarding-help').getBoundingClientRect();
    return Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 4 ? 'centré' : 'décalé de ' + Math.round((b.left + b.right) / 2 - (a.left + a.right) / 2) + ' px';
  });
  await test('États : recherche sans résultat → « Effacer les filtres » remet tout', 'effacer|1 livre', () => {
    books = [fiche('Dune', {statut: 'a_lire'})]; ui.tab = 'a_lire'; ui.q = 'zzzz'; render();
    const a = $('#list .etat [data-effacer]') ? 'effacer' : '?'; $('#list .etat [data-effacer]').click();
    const b = plural(document.querySelectorAll('#list .card').length, 'livre'); ui.tab = 'en_cours'; render(); return a + '|' + b;
  });
  await test('États : erreur de recherche en ligne → état d\'erreur avec « Réessayer »', 'erreur|réessayer', () => {
    Object.assign(rech, {etat: 'fini', erreur: 'reseau', lastPar: 'theme', lastCat: 'histoire', lastTexte: '', res: [], inconnus: []}); ui.tab = 'decouvrir'; render();
    const r = ($('#rq_res .etat.erreur') ? 'erreur' : '?') + '|' + ($('#rq_res .etat #rq_retry') ? 'réessayer' : '?');
    Object.assign(rech, {etat: '', erreur: ''}); ui.tab = 'en_cours'; render(); return r;
  });
  await test('Chargement : cartes fantômes pendant une recherche dans la fiche', '2 cartes fantômes', async () => {
    const vrai = Recherche.parTexte; let fin; Recherche.parTexte = () => new Promise(r => { fin = r; });
    openForm(null); await pause(50); $('#s_q').value = 'Dune'; doSearch(); await pause(20);
    const n = document.querySelectorAll('#s_res .squelette').length; fin([]); Recherche.parTexte = vrai; modalModifie = false; closeM(); await pause(250);
    return plural(n, 'carte') + ' fantôme' + (n > 1 ? 's' : '');
  });
  await test('Chargement : le texte d\'attente est échappé une seule fois (« & » reste « & »)', 'Politique & Société <b>|aucun appel échappé', () => {
    const d = document.createElement('div'); d.innerHTML = tirageHtml([], 'Politique & Société <b>');
    const code = [...document.querySelectorAll('script:not([src])')].pop().textContent;
    return d.querySelector('.etat-titre').textContent + '|' + (/tirageHtml\(items, `[^`]*esc\(/.test(code) ? 'appel déjà échappé' : 'aucun appel échappé');
  });
  await test('Bandeau : ton « danger » quand l\'enregistrement échoue', 'notice danger', () => {
    Store.erreur = true; paintNotice(); const r = $('#notice').className; Store.erreur = false; paintNotice(); return r;
  });
  /* ---------- 10 sexies. Phase 1 : accessibilité ---------- */
  await test('Accessibilité : navigation nommée et espace courant annoncé', 'Espaces de l’application|stats', () => {
    ui.tab = 'stats'; render(); const r = $('#tabs').getAttribute('aria-label') + '|' + ($('#tabs [aria-current="page"]') || {dataset: {}}).dataset.space;
    ui.tab = 'en_cours'; render(); return r;
  });
  await test('Accessibilité du Carnet : citation activable au clavier et sous-navigation de 48 px', 'BUTTON|48', () => {
    books = [fiche('Citation clavier', {citations: [{id: 'c-1', texte: 'À retrouver', page: '4'}]})]; ui.tab = 'citations'; render();
    const h = Math.round($('#main .carnet-nav .subtab').getBoundingClientRect().height);
    const r = $('#qlist .quote').tagName + '|' + h; ui.tab = 'en_cours'; render(); return r;
  });
  await test('Accessibilité : le focus entre dans la fenêtre puis revient au bouton qui l\'a ouverte', 'dans la fenêtre|revenu', async () => {
    $('#settingsBtn').focus(); $('#settingsBtn').click(); await pause(50);
    const a = $('#modal').contains(document.activeElement) ? 'dans la fenêtre' : 'ailleurs';
    closeM(); await pause(250); return a + '|' + (document.activeElement === $('#settingsBtn') ? 'revenu' : 'perdu');
  });
  await test('Accessibilité : la touche Tab reste dans la fenêtre ouverte', 'premier', async () => {
    openSettings(); await pause(50);
    const f = [...$('#modal').querySelectorAll('button,input,select,textarea,summary,[href]')].filter(x => !x.disabled && x.offsetParent);
    f[f.length - 1].focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}));
    const r = document.activeElement === f[0] ? 'premier' : 'sorti'; closeM(); await pause(250); return r;
  });
  await test('Accessibilité : focus rendu sans erreur même si son élément a disparu', 'pas d\'erreur', async () => {
    const b = document.createElement('button'); document.body.appendChild(b); b.focus(); openSettings(); await pause(50); b.remove();
    try { closeM(); await pause(250); return 'pas d\'erreur'; } catch (e) { return 'erreur ' + e.message; }
  });
  await test('Accessibilité : messages éphémères annoncés', 'status|polite', () => $('#toast').getAttribute('role') + '|' + $('#toast').getAttribute('aria-live'));
  await test('Fiche : titre manquant → erreur affichée sous le champ, effacée à la saisie', 'Il faut au moins un titre|true|effacée', async () => {
    openForm(null); await pause(50); $('#f_save').click(); await pause(50);
    const e = $('#f_titre_err'), a = (e ? e.textContent : '?') + '|' + $('#f_titre').getAttribute('aria-invalid');
    $('#f_titre').value = 'D'; $('#f_titre').dispatchEvent(new Event('input', {bubbles: true}));
    const b = $('#f_titre_err') ? 'restée' : 'effacée'; modalModifie = false; closeM(); await pause(250); return a + '|' + b;
  });
  /* ---------- 10 septies. Phase 1 : audit visuel (5 écrans × 8 combinaisons) ---------- */
  const rgba = c => { const m = (c.match(/[\d.]+/g) || []).map(Number); return m.length >= 3 ? [m[0], m[1], m[2], m.length > 3 ? m[3] : 1] : [0, 0, 0, 0]; };
  const lumi = c => { const v = c.slice(0, 3).map(x => x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const sur = (haut, bas) => [0, 1, 2].map(i => haut[i] * haut[3] + bas[i] * (1 - haut[3])).concat(1);
  // Fond réel : les fonds de tous les ancêtres, empilés depuis la page
  const fondReel = el => { const pile = []; for (let x = el; x; x = x.parentElement) pile.push(rgba(getComputedStyle(x).backgroundColor)); let f = [255, 255, 255, 1]; for (const c of pile.reverse()) if (c[3] > 0) f = sur(c, f); return f; };
  const EMOJIS_SEULS = /^[\p{Extended_Pictographic}️‍\s☰▦＋✕✓⋯★☆]+$/u;
  // Éléments qui portent du texte visible (hors icônes, émojis seuls, éléments décoratifs)
  const textesVisibles = () => [...document.querySelectorAll('body *')].filter(el =>
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() && !EMOJIS_SEULS.test(n.textContent.trim()))
    && el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) && !el.closest('.ico,.be,option,[aria-hidden="true"],#print,.cam,:disabled') && parseFloat(getComputedStyle(el).fontSize) > 0);
  await test('Audit : contrastes ≥ 4,5:1 (3:1 grand texte) sur 5 écrans × 8 combinaisons', [], () => auditEcrans(() => textesVisibles().map(el => {
    const st = getComputedStyle(el), fs = parseFloat(st.fontSize), fw = parseInt(st.fontWeight, 10);
    const fg = sur(rgba(st.color), fondReel(el)), bg = fondReel(el), r = (Math.max(lumi(fg), lumi(bg)) + .05) / (Math.min(lumi(fg), lumi(bg)) + .05);
    return r < (fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5) ? `« ${el.textContent.trim().slice(0, 24)} » (${el.className || el.tagName}) ${r.toFixed(2)}` : null;
  }).filter(Boolean), COMBOS));
  await test('Audit : aucun texte visible sous 13 px (5 écrans)', [], () => auditEcrans(() => textesVisibles().filter(el => parseFloat(getComputedStyle(el).fontSize) < 12.99)
    .map(el => `« ${el.textContent.trim().slice(0, 20)} » ${getComputedStyle(el).fontSize}`)));
  await test('Audit : zones tactiles (48 px, puces 40 px) sur 5 écrans', [], () => auditEcrans(() =>
    [...document.querySelectorAll('button, a.btn, select, input:not([type=checkbox]):not([type=hidden]):not([type=file]), summary, [role=tab]')]
      .filter(el => el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) && !el.closest('.cam'))
      .filter(el => el.getBoundingClientRect().height < (el.matches('.chipb, .btn.small, .catchip button, .classif-tags .chip button, .filtres-actifs .chip button') ? 39.5 : 47.5))
      .map(el => `${el.id || el.className || el.tagName} « ${el.textContent.trim().slice(0, 16)} » ${Math.round(el.getBoundingClientRect().height)} px`)));
  /* ---------- 10 octies. Phase 1 : relecture finale ---------- */
  await test('Accessibilité : Maj+Tab depuis le titre de la fenêtre reste dans la fenêtre', 'dernier', async () => {
    openSettings(); await pause(50);
    const f = [...$('#modal').querySelectorAll('button,input,select,textarea,summary,[href]')].filter(x => !x.disabled && x.offsetParent);
    $('#modal h2').focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true}));
    const r = document.activeElement === f[f.length - 1] ? 'dernier' : $('#modal').contains(document.activeElement) ? 'resté sur ' + document.activeElement.tagName : 'sorti';
    closeM(); await pause(250); return r;
  });
  await test('Fiche : « Chercher le résumé » garde son icône après la recherche', 1, async () => {
    const vrai = Recherche.resume; Recherche.resume = async () => ({});
    openForm(null); await pause(50); const b = $('#f_getres'); await fetchResume({titre: 'X'}, b);
    const n = b.querySelectorAll('.ico').length; Recherche.resume = vrai; modalModifie = false; closeM(); await pause(250); return n;
  });
  // (lot 34 : fenêtre classique du chrono, mesurée en Éditorial — en Jardin c'est la session calme)
  await test('Icônes : thème, « Chercher par » et chrono ont leur icône', 'thème 3/3|chercher par 3/3|chrono 1', () => avecStyle('editorial', 'light', async () => {
    openSettings(); await pause(50); const a = [...document.querySelectorAll('#st_theme button')], th = a.filter(x => x.textContent.trim() === 'Auto' || x.querySelector('.ico')).length + '/' + a.length;
    closeM(); await pause(250);
    ui.tab = 'decouvrir'; render(); const p = [...document.querySelectorAll('#rq_par button')], rp = p.filter(x => x.querySelector('.ico')).length + '/' + p.length;
    books = [fiche('Chrono', {statut: 'en_cours'})]; prefs.timer = {id: books[0].id, start: Date.now(), acc: 0, running: true}; openTimer();
    const c = document.querySelectorAll('#t_pause .ico').length;
    prefs.timer = null; $('#timerOv').classList.remove('show'); paintTimerPill(); ui.tab = 'en_cours'; render();
    return 'thème ' + th + '|chercher par ' + rp + '|chrono ' + c;
  }));
  // (lot 32 : le repli d'une préférence corrompue est maintenant le Jardin de nuit, style par défaut)
  await test('Style posé avant le premier affichage (script en tête), y compris préférence corrompue', 'carnet/dark|jardin/light|jardin', () => {
    const s = document.head.querySelector('script:not([src])'); if (!s) return 'pas de script en tête';
    // (le vrai script est rejoué dans la page avec des préférences d'essai, puis tout est remis en place)
    const r = document.documentElement, lance = p => {
      localStorage.setItem(CLE + '-prefs', JSON.stringify(p)); delete r.dataset.style; delete r.dataset.theme;
      const x = document.createElement('script'); x.textContent = s.textContent; document.body.appendChild(x); x.remove();
      return r.dataset.style + '/' + r.dataset.theme;
    };
    const res = lance({style: 'carnet', theme: 'dark'}) + '|' + lance({style: 'constructor', theme: 'light'});
    savePrefs(); const s0 = prefs.style; prefs.style = 'constructor'; applyTheme(); const c = r.dataset.style; prefs.style = s0; applyTheme();
    return res + '|' + c;
  });
  await test('Chargements : « Pas pour moi » utilise le composant état', 'composant état', () =>
    /nxspin">Je cherche un autre livre/.test([...document.querySelectorAll('script:not([src])')].pop().textContent) ? 'ancien chargement' : 'composant état');
  await test('Page de tests : plus d\'ancienne variable de couleur dans le panneau de résultats', [], async () => {
    const t = await (await fetch('tests-appli.js', {cache: 'no-store'})).text();
    return ['bg', 'ink', 'line'].filter(v => t.includes('var(--' + v + ')'));
  });
  await test('Fiche : citation tapée puis « Enregistrer » sans titre → gardée une seule fois', '1 dans la liste|champ vidé|1 citation enregistrée', async () => {
    books = []; openForm(null); await pause(50);
    // (couverture et résumé déjà là : l'enregistrement ne lance aucune recherche sur les vrais catalogues)
    Object.assign(form, {couverture: 'data:image/png;base64,iVBORw0KGgo=', resumeTente: true, classTente: true});
    $('#f_qt').value = 'Une phrase qui m\'a marqué'; $('#f_qp').value = '12';
    $('#f_save').click(); await pause(50);   // (refusé : il manque le titre)
    const a = document.querySelectorAll('#f_quotes .q').length + ' dans la liste', b = $('#f_qt').value ? 'champ encore rempli' : 'champ vidé';
    $('#f_titre').value = 'Livre à citation'; $('#f_save').click(); await pause(400);
    const x = books.find(z => z.titre === 'Livre à citation'), c = (x ? x.citations.length : 0) + ' citation' + (x && x.citations.length > 1 ? 's' : '') + ' enregistrée' + (x && x.citations.length > 1 ? 's' : '');
    modalModifie = false; closeM(); await pause(250); books = []; ui.tab = 'en_cours'; render(); return a + '|' + b + '|' + c;
  });
  await test('« Filtres et tri » garde son icône quand un filtre change', 1, async () => {
    books = [fiche('Un roman', {genre: 'Roman'})]; ui.tab = 'a_lire'; ui.genre = ''; render();
    $('#genre').value = 'Roman'; $('#genre').dispatchEvent(new Event('change', {bubbles: true}));
    const n = document.querySelectorAll('#filtres summary .ico').length; ui.genre = ''; ui.tab = 'en_cours'; render(); return n;
  });

  /* ---------- 11. Étape 1 : données v3, migration, sauvegarde vérifiable ---------- */
  await test('Genres principaux : correspondance exacte seulement (majuscules, accents, pluriel)', 'roman|roman|essai|memoires|bd||', () =>
    ['roman', 'Romans', ' ESSAIS ', 'Mémoires', 'Bande dessinée', 'Science-fiction', 'Roman policier'].map(Taxonomie.genreDepuisTexte).join('|'));
  await test('Genres principaux : 16 genres, identifiants uniques', '16|16', () => Taxonomie.GENRES.length + '|' + new Set(Taxonomie.GENRES.map(g => g.id)).size);
  await test('Taxonomie : dimensions distinctes, identifiants uniques et sous-genres rattachés à un genre', true, () => {
    const listes = [Taxonomie.GENRES, Taxonomie.SOUS_GENRES, Taxonomie.THEMES, Taxonomie.AMBIANCES];
    return listes.every(l => new Set(l.map(x => x.id)).size === l.length) && Taxonomie.SOUS_GENRES.every(x => Taxonomie.genre(x.genre))
      && Taxonomie.nom('genre', 'roman') === 'Roman' && Taxonomie.nom('themes', 'famille') === 'Famille';
  });
  await test('Classification dans Modifier : suggestion confirmable, thèmes et étiquettes modifiables', 'Roman|famille|À relire en hiver', () => {
    const b = norm({id: 'classif-test', titre: 'Classement', genre: 'roman'}); books = [b]; openForm(b);
    const suggestion = $('#f_classif [data-classif-action="confirmer"]'); if (!suggestion) { closeM(); return '?|?|?'; }
    suggestion.click();
    const famille = $('#f_classif input[value="famille"]'); if (famille) { famille.checked = true; famille.dispatchEvent(new Event('change', {bubbles: true})); }
    $('#f_etiquette').value = 'À relire en hiver'; $('#modal [data-etiquette-ajouter]').click();
    const r = [Taxonomie.nom('genre', form.classif.genre), (form.classif.themes || []).join(','), (form.etiquettes || []).join(',')].join('|');
    closeM(); return r;
  });
  await test('Bibliothèque : recherche et filtres trouvent un thème confirmé et une étiquette', '1 livre|1 livre', () => {
    books = [fiche('Roman famille', {statut: 'a_lire', classif: {themes: ['famille']}, etiquettes: ['Club']}), fiche('Autre', {statut: 'a_lire'})];
    ui.tab = 'a_lire'; Object.assign(ui, {q: 'famille', theme: '', etiquette: '', genre: '', genreConfirme: '', cat: '', own: '', sousGenre: '', ambiance: ''}); render();
    const recherche = document.querySelectorAll('#list .card, #list .gcard').length;
    ui.q = ''; render(); const filtre = $('#themeLivre');
    if (filtre) { filtre.value = 'famille'; filtre.dispatchEvent(new Event('change', {bubbles: true})); }
    const filtres = document.querySelectorAll('#list .card, #list .gcard').length;
    Object.assign(ui, {q: '', theme: '', etiquette: '', genre: '', genreConfirme: '', cat: '', own: '', sousGenre: '', ambiance: ''}); ui.tab = 'en_cours'; render();
    return recherche + ' livre|' + filtres + ' livre';
  });
  await test('Découvrir ma liste : un thème confirmé réduit les livres proposés', '1 livre|Famille', () => {
    books = [fiche('Famille', {statut: 'a_lire', classif: {themes: ['famille']}}), fiche('Autre', {statut: 'a_lire'})];
    Object.assign(pick, {mode: 'liste', len: '', genre: '', genreConfirme: '', cat: '', dispo: false, themeLivre: 'famille', sousGenre: '', ambiance: ''}); openNext();
    const n = nextCandidates().length, visible = $('#nx_themeLivre') && $('#nx_themeLivre').textContent.includes('Famille') ? 'Famille' : '?';
    closeM(); Object.assign(pick, {themeLivre: '', sousGenre: '', ambiance: ''}); return n + ' livre|' + visible;
  });
  await test('Stats : seuls les choix confirmés alimentent la répartition détaillée', 'Classement personnel confirmé|Famille', () => {
    books = [fiche('Confirmé', {statut: 'lu', dateFin: today(), classif: {themes: ['famille']}}), fiche('Non confirmé', {statut: 'lu', dateFin: today(), genre: 'roman'})];
    ui.year = new Date().getFullYear(); ui.tab = 'stats'; render(); const t = $('#main').textContent;
    const ok = t.includes('Classement personnel confirmé') && t.includes('Famille') && t.includes('Une suggestion de catalogue n’est pas comptée');
    ui.tab = 'en_cours'; render(); return ok ? 'Classement personnel confirmé|Famille' : '?|?';
  });
  // Copies représentatives des sauvegardes (livres fictifs). V1 : la forme la plus ancienne que l'appli sait encore lire
  // (version 1, nombres en texte, anciens noms de rayons, champs absents, deux citations identiques, un prêt).
  const SAUV_V1 = () => ({app: 'mes-lectures', version: 1, date: '2025-03-01T10:00:00.000Z', goal: '12', books: [
    {id: 'v1-a', titre: 'Ancien roman', auteur: 'Auteur Un', genre: 'roman', statut: 'lu', note: '4', serie: 'Saga', tome: '2', pagesTotal: '320', pageActuelle: '320',
      dateDebut: '2025-01-02', dateFin: '2025-02-03', epingle: 'true', catOui: ['philo', 'sf/dystopie'], catNon: ['bio'], avis: 'Bien aimé',
      citations: [{texte: 'Phrase un', page: '12'}, {texte: 'Phrase un', page: '12'}], journal: [{date: '2025-01-02', page: 0}, {date: '2025-01-20', page: '150'}],
      possession: 'prete', pretNom: 'Léa', pretRetour: '2025-03-01'},
    {id: 'v1-b', titre: 'Sans genre', statut: 'a_lire'}
  ]});
  // V2 : le format actuel, complet et déjà propre (classements, sujets, corrections manuelles, emprunt, relecture, chrono, couvertures…)
  const SAUV_V2 = () => ({app: 'mes-lectures', version: 2, date: '2026-10-01T08:00:00.000Z', goal: 20, books: [
    {id: 'v2-a', titre: 'Le fascisme', auteur: 'Pierre Milza', serie: '', genre: 'Essai', note: 4, avis: 'Clair et précis', resume: 'Une histoire du fascisme.',
      isbn: '9782213000000', editeur: 'Fayard', annee: '1997', pretNom: 'Médiathèque', couverture: 'data:image/png;base64,iVBORw0KGgo=', ajoute: '2026-01-05T09:00:00.000Z',
      dateDebut: '2026-01-05', dateFin: '2026-02-10', pretRetour: '2026-11-02', tome: '', pagesTotal: 480, pageActuelle: 480, statut: 'lu', epingle: false,
      aCompleter: false, format: 'papier', possession: 'emprunte',
      citations: [{texte: 'Le fascisme est un mouvement.', page: '33', date: '2026-01-20'}],
      journal: [{date: '2026-01-05', page: 0}, {date: '2026-01-25', page: 240}, {date: '2026-02-10', page: 480}],
      historique: [{debut: '2025-03-01', fin: '2025-04-01', note: 3}], sessions: [{date: '2026-01-25', min: 45, pages: 30}],
      coversAlt: ['https://covers.openlibrary.org/b/id/1-L.jpg'], sujets: ['Fascisme', 'Histoire politique'],
      classements: [{c: '686', l: '320.533'}, {c: '606', l: 'Fascisme', s: 'BnF'}], catOui: ['histoire'], catNon: ['shs/philo'], pagesSource: 'edition'},
    {id: 'v2-b', titre: 'À compléter', auteur: '', serie: 'Cycle', genre: 'Science-fiction', note: 0, avis: '', resume: '', isbn: '', editeur: '', annee: '',
      pretNom: '', couverture: '', ajoute: '2026-09-01T09:00:00.000Z', dateDebut: '2026-10-01', dateFin: '', pretRetour: '', tome: 3, pagesTotal: 300, pageActuelle: 120,
      statut: 'en_cours', epingle: false, aCompleter: true, format: 'audio', possession: 'a_moi', citations: [],
      journal: [{date: '2026-10-01', page: 0}, {date: '2026-10-05', page: 120}], historique: [], sessions: [], coversAlt: [], sujets: [], classements: [],
      catOui: [], catNon: [], pagesSource: 'manuel'}
  ]});
  // V3 : nouveau format, avec des valeurs à nettoyer et des champs inconnus (venus d'une version plus récente)
  const SAUV_V3 = () => ({app: 'mes-lectures', version: 3, schema: 3, date: '2026-10-22T08:00:00.000Z', goal: 5, resume: {livres: 1, citations: 1, notes: 2, journal: 1}, books: [
    {id: 'v3-a', titre: 'Carnet', auteur: 'Auteur Trois', genre: 'Roman', statut: 'en_cours', pagesTotal: 200, pageActuelle: 50,
      classif: {genre: 'roman', sousGenres: ['roman/historique'], themes: ['famille', 'famille'], ambiances: ['intense'], refus: ['genre:essai'], futurClassif: 1},
      etiquettes: ['  Été 2026 ', 'été 2026', '', 'Club'],
      notes: [{id: 'n-1', date: '2026-10-20', modif: '2026-10-21', texte: ' Première note ', page: '12'}, {id: 'n-2', date: '2026-10-21', texte: 'Deuxième'}, {id: 'n-3', texte: '   '}],
      citations: [{id: 'c-fixe', texte: 'Une phrase', page: '3', date: '2026-10-20', commentaire: 'Belle', futurCitation: 'gardé'}],
      journal: [{date: '2026-10-20', page: 50}], futur: {x: 1}}
  ]});
  const egalJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  await test('Migration V1 : chaque valeur d\'origine retrouvée sous sa forme normale', [], () => {
    const [a, b] = SAUV_V1().books.map(norm), f = [];
    const attendu = {id: 'v1-a', titre: 'Ancien roman', auteur: 'Auteur Un', genre: 'roman', statut: 'lu', note: 4, serie: 'Saga', tome: 2, pagesTotal: 320, pageActuelle: 320,
      dateDebut: '2025-01-02', dateFin: '2025-02-03', epingle: true, avis: 'Bien aimé', possession: 'prete', pretNom: 'Léa', pretRetour: '2025-03-01'};
    for (const [k, v] of Object.entries(attendu)) if (!egalJSON(a[k], v)) f.push(k + ' : ' + JSON.stringify(a[k]));
    if (!egalJSON(a.catOui, ['shs/philo', 'imaginaire/dystopie']) || !egalJSON(a.catNon, ['litterature/bio'])) f.push('corrections de rayons');
    if (!egalJSON(a.journal, [{date: '2025-01-02', page: 0}, {date: '2025-01-20', page: 150}])) f.push('journal');
    if (a.citations.length !== 2 || a.citations.some(q => q.texte !== 'Phrase un' || q.page !== '12')) f.push('citations');
    if (b.id !== 'v1-b' || b.titre !== 'Sans genre' || b.statut !== 'a_lire') f.push('livre 2');
    return f;
  });
  await test('Migration V2 : chaque champ d\'origine strictement identique (citations : id et commentaire ajoutés seulement)', [], () => {
    const f = [];
    for (const o of SAUV_V2().books) {
      const n = norm(o);
      for (const k of Object.keys(o)) {
        const v = k === 'citations' ? n.citations.map(q => { const {id, commentaire, ...reste} = q; return reste; }) : n[k];
        if (!egalJSON(v, o[k])) f.push(o.id + '.' + k + ' : ' + JSON.stringify(n[k]));
      }
    }
    return f;
  });
  await test('Migration : nouveaux champs présents et vides par défaut (rien d\'inventé)', '{"genre":"","sousGenres":[],"themes":[],"ambiances":[],"refus":[]}|[]|[]', () => {
    const b = norm(SAUV_V2().books[0]); return JSON.stringify(b.classif) + '|' + JSON.stringify(b.etiquettes) + '|' + JSON.stringify(b.notes);
  });
  await test('Migration répétée : même résultat (V1, V2, V3)', 'V1 ok|V2 ok|V3 ok', () =>
    [['V1', SAUV_V1], ['V2', SAUV_V2], ['V3', SAUV_V3]].map(([n, s]) => n + (s().books.every(o => { const a = norm(o); return egalJSON(norm(a), a); }) ? ' ok' : ' DIFFÉRENT')).join('|'));
  await test('Citations : identifiants présents, uniques dans un livre, identiques d\'une migration à l\'autre', '2 uniques|stables|gardé c-fixe', () => {
    const a = norm(SAUV_V1().books[0]), b = norm(SAUV_V1().books[0]), ids = a.citations.map(q => q.id);
    return (ids.every(Boolean) && new Set(ids).size === 2 ? '2 uniques' : JSON.stringify(ids)) + '|' + (egalJSON(ids, b.citations.map(q => q.id)) ? 'stables' : 'instables') + '|gardé ' + norm(SAUV_V3().books[0]).citations[0].id;
  });
  // (V2 est déjà propre : on compare la fiche telle quelle et migrée ; V1 porte d'anciens noms de rayons que la remise en ordre
  // convertissait déjà avant le format v3 : on compare donc aux rayons que l'appli affichait pour elle)
  await test('Rayons calculés identiques avant et après la migration (corrections manuelles comprises)', 'v2 identiques|imaginaire,shs', () =>
    (SAUV_V2().books.every(o => egalJSON(cats(o), cats(norm(o)))) ? 'v2 identiques' : 'v2 DIFFÉRENTS') + '|' + cats(norm(SAUV_V1().books[0])).join(','));
  await test('Ancien genre : conservé ; seul un genre exact est proposé ; jamais de sous-genre ; rien d\'enregistré', 'roman,roman,essai,|Science-fiction|0|',
    () => {
      const l = [{genre: 'roman'}, {genre: 'Romans'}, {genre: 'Essai'}, {genre: 'Science-fiction'}].map(x => norm({...x, titre: 'G'}));
      return l.map(suggestionGenre).join(',') + '|' + l[3].genre + '|' + l.reduce((n, b) => n + b.classif.sousGenres.length, 0) + '|' + l.map(b => b.classif.genre).join('');
    });
  await test('Suggestion de genre : aucune si un genre est confirmé ou si la proposition a été refusée', '||roman', () => [
    norm({titre: 'A', genre: 'roman', classif: {genre: 'essai'}}), norm({titre: 'B', genre: 'roman', classif: {refus: ['genre:roman']}}), norm({titre: 'C', genre: 'roman'})
  ].map(suggestionGenre).join('|'));
  await test('V3 : valeurs nettoyées (doublons, espaces, notes vides) et champs inconnus gardés', 'famille|Été 2026,Club|n-1:Première note,n-2:Deuxième|futur|gardé|1', () => {
    const b = norm(SAUV_V3().books[0]);
    return b.classif.themes.join(',') + '|' + b.etiquettes.join(',') + '|' + b.notes.map(n => n.id + ':' + n.texte).join(',') + '|' + (b.futur && b.futur.x === 1 ? 'futur' : '?') + '|' + b.citations[0].futurCitation + '|' + b.classif.futurClassif;
  });
  await test('Fiche abîmée : classification, notes et citations invalides n\'empêchent rien', 'Abîmé|{"genre":"","sousGenres":[],"themes":[],"ambiances":[],"refus":[]}|0|1', () => {
    const b = norm({id: 'x', titre: 'Abîmé', classif: ['pas', 'un', 'objet'], notes: 'texte au lieu d\'une liste', etiquettes: 42, citations: [{texte: ''}, 'n\'importe quoi', {texte: 'Vraie'}]});
    return b.titre + '|' + JSON.stringify(b.classif) + '|' + b.notes.length + '|' + b.citations.length;
  });
  await test('Enregistrement : les données portent « schema: 3 »', 3, async () => { books = [fiche('Schéma')]; await Store.persist(); return (await Store.get('data')).schema; });
  await test('Copie avant migration : faite une seule fois, intacte, jamais écrasée ; rien pour des données déjà v3 ou vides', 'copiée|intacte|déjà|non écrasée|rien|rien|invitation', async () => {
    await Store.set('avant-migration-v3', null); delete prefs.avantMigration; delete prefs.inviterSauvegarde;
    const v2 = SAUV_V2(), r = [await preparerMigration(v2)];
    const copie = await Store.get('avant-migration-v3'); r.push(egalJSON(copie.books, SAUV_V2().books) ? 'intacte' : 'modifiée');
    r.push(await preparerMigration(SAUV_V1())); r.push(egalJSON((await Store.get('avant-migration-v3')).books, SAUV_V2().books) ? 'non écrasée' : 'écrasée');
    r.push(await preparerMigration({...SAUV_V3()})); r.push(await preparerMigration({books: [], goal: 0}));
    r.push(prefs.inviterSauvegarde ? 'invitation' : 'pas d\'invitation');
    return r.join('|');
  });
  await test('Copie avant migration impossible (mémoire pleine) → invitation à sauvegarder, la mise à jour continue', 'échec|invitation', async () => {
    await Store.set('avant-migration-v3', null); delete prefs.inviterSauvegarde;
    const vrai = Store.set; Store.set = () => Promise.reject(new Error('mémoire pleine'));
    try { return (await preparerMigration(SAUV_V2())) + '|' + (prefs.inviterSauvegarde ? 'invitation' : '?'); } finally { Store.set = vrai; }
  });
  await test('« Revenir à ma bibliothèque d\'avant la mise à jour » : bouton visible, livres remis, annulable', 'bouton|v2-a,v2-b|annulable', async () => {
    await Store.set('avant-migration-v3', null); delete prefs.avantMigration;
    await preparerMigration(SAUV_V2()); books = [fiche('Après la mise à jour')]; await Store.persist();
    openSettings(); const bouton = $('#modal [data-undomigration]') ? 'bouton' : 'pas de bouton'; closeM(); await pause(250);
    reponseConfirm = true; await revenirAvantMigration();
    const r = bouton + '|' + books.map(b => b.id).join(',') + '|' + ((await Store.get('avant-retour-migration')).books.some(b => b.titre === 'Après la mise à jour') ? 'annulable' : '?');
    await Store.set('avant-migration-v3', null); await Store.set('avant-retour-migration', null); delete prefs.avantMigration; delete prefs.migrationRemise; delete prefs.inviterSauvegarde; savePrefs();
    return r;
  });
  await test('Restauration d\'une copie V1 : résumé affiché, livres remis en ordre avec identifiants de citations', '2 livres, 2 citations et 0 note|v1-a,v1-b|2 id', async () => {
    books = [fiche('Avant V1')]; await Store.persist();
    await restaurer(SAUV_V1()); const vu = ($('#modal').textContent.match(/\d+ livres?, \d+ citations? et \d+ notes?/) || ['?'])[0];
    $('#r_ok').click(); await pause(400);
    return vu + '|' + books.map(b => b.id).join(',') + '|' + books[0].citations.filter(q => q.id).length + ' id';
  });
  await test('Restauration : un fichier dont le résumé ne correspond pas est signalé avant de remplacer', 'signalé', async () => {
    const s = SAUV_V3(); s.resume = {livres: 4, citations: 1, notes: 2, journal: 1};
    await restaurer(s); const r = $('#modal').textContent.includes('semble incomplet') ? 'signalé' : 'non signalé'; closeM(); await pause(250); return r;
  });
  await test('Export v3 : version, schéma et résumé ; aller-retour export → restauration sans aucune perte', '3|3|{"livres":2,"citations":2,"notes":2,"journal":4}|identique', async () => {
    books = [...SAUV_V2().books.slice(0, 1), ...SAUV_V3().books].map(norm); await Store.persist();
    const avant = JSON.stringify(books); let texte = ''; const dl = window.download; window.download = (n, c) => { texte = c; };
    try { doExport('backup'); } finally { window.download = dl; }
    const d = JSON.parse(texte);
    await restaurer(texte); $('#r_ok').click(); await pause(400);
    return d.version + '|' + d.schema + '|' + JSON.stringify(d.resume) + '|' + (JSON.stringify(books) === avant ? 'identique' : 'DIFFÉRENT');
  });
  await test('Vérification d\'une sauvegarde : complète → oui ; citation retirée → non ; texte illisible → non', 'oui|non|non', () => {
    const l = SAUV_V3().books.map(norm), bon = JSON.stringify({app: 'mes-lectures', version: 3, schema: 3, goal: 0, resume: resumeDe(l), books: l});
    const abime = JSON.parse(bon); abime.books[0].citations = [];
    return [bon, JSON.stringify(abime), '{"app": "mes-lectures", "books": ['].map(t => verifierSauvegarde(t) ? 'oui' : 'non').join('|');
  });
  await test('Restauration : une sauvegarde d\'une version plus récente que 3 est signalée', 'signalé', async () => {
    await restaurer({...SAUV_V3(), version: 4}); const r = $('#modal').textContent.includes('version plus récente') ? 'signalé' : 'non signalé'; closeM(); await pause(250); return r;
  });
  // (relecture finale de l'étape 1)
  await test('Retour d\'avant la mise à jour : un second appui ne perd rien, la copie de restauration reste intacte, le retour s\'annule', 'déjà remise|v2-a,v2-b|restauration intacte|bouton annuler|L', async () => {
    await Store.set('avant-migration-v3', null); delete prefs.avantMigration; delete prefs.migrationRemise;
    await Store.set('avant-restauration', {books: [fiche('Copie R')], goal: 0, date: new Date().toISOString()});
    await preparerMigration(SAUV_V2()); books = [fiche('L')]; await Store.persist();
    reponseConfirm = true; await revenirAvantMigration(); const second = await revenirAvantMigration();
    const ids = books.map(b => b.id).join(',');
    const rest = (await Store.get('avant-restauration')).books.map(b => b.titre).join(',') === 'Copie R' ? 'restauration intacte' : 'restauration écrasée';
    openSettings(); const btn = $('#modal [data-undoretour]') && !$('#modal [data-undomigration]') ? 'bouton annuler' : 'boutons ?'; closeM(); await pause(250);
    await annulerRetourMigration();
    const r = [second, ids, rest, btn, books.map(b => b.titre).join(',')].join('|');
    await Store.set('avant-migration-v3', null); await Store.set('avant-retour-migration', null); delete prefs.avantMigration; delete prefs.migrationRemise; savePrefs();
    return r;
  });
  await test('Copie de sécurité impossible : bandeau qui reste jusqu\'à la prochaine sauvegarde', 'bandeau|disparu', async () => {
    await Store.set('avant-migration-v3', null); delete prefs.copieMigrationEchec;
    const vrai = Store.set; Store.set = () => Promise.reject(new Error('mémoire pleine'));
    try { await preparerMigration(SAUV_V2()); } finally { Store.set = vrai; }
    books = [fiche('B')]; paintNotice(); const a = !$('#notice').hidden && $('#notice').textContent.includes('copie de sécurité') ? 'bandeau' : 'pas de bandeau';
    const dl = window.download; window.download = () => {}; try { doExport('backup'); } finally { window.download = dl; }
    paintNotice(); const b = !$('#notice').hidden && $('#notice').textContent.includes('copie de sécurité') ? 'encore là' : 'disparu';
    delete prefs.copieMigrationEchec; delete prefs.inviterSauvegarde; savePrefs(); return a + '|' + b;
  });
  await test('Étiquettes : coupe à 40 caractères stable (pas d\'espace finale, pas d\'émoji coupé)', 'stable|39|📚', () => {
    const a = norm({titre: 'E', etiquettes: ['a'.repeat(39) + ' bc', 'x'.repeat(39) + '📚📚']}), b = norm(a);
    return (egalJSON(a.etiquettes, b.etiquettes) ? 'stable' : 'instable') + '|' + a.etiquettes[0].length + '|' + Array.from(a.etiquettes[1]).pop();
  });
  await test('Genres principaux : pluriels en « s » reconnus (Théâtres, Récits & témoignages, Contes)', 'theatre|recit|conte', () =>
    ['Théâtres', 'Récits & témoignages', 'Contes'].map(Taxonomie.genreDepuisTexte).join('|'));
  await test('Restauration : pas d\'avertissement pour un fichier complet ni pour une ancienne sauvegarde sans résumé', 'rien|rien', async () => {
    const l = SAUV_V3().books.map(norm), r = [];
    for (const s of [{app: 'mes-lectures', version: 3, schema: 3, goal: 0, resume: resumeDe(l), books: l}, SAUV_V2()]) {
      await restaurer(s); r.push($('#modal').textContent.includes('semble incomplet') ? 'averti' : 'rien'); closeM(); await pause(250);
    }
    return r.join('|');
  });
  await vider(); try { await Store.set('avant-restauration', null); await Store.set('avant-migration-v3', null); await Store.set('avant-retour-migration', null); } catch (e) {}
  delete prefs.avantRestauration; delete prefs.avantMigration; delete prefs.inviterSauvegarde; savePrefs();
  // (fin de la section 11)

  /* ---------- 12. Étape 2 : carnet du livre ---------- */
  await test('Historique : événements enregistrés seulement, plus récents d\'abord, ordre défini le même jour', JSON.stringify([
    '2026-01-10 Fini', '2026-01-10 p. 300 (+180) sur 300', '2026-01-05 Séance de chrono : 30 min · 40 p.', '2026-01-05 Séance de chrono : 20 min',
    '2026-01-05 p. 120 (+120) sur 300', '2026-01-02 Commencé', '2026-01-01 Ajouté à ta bibliothèque', '2025-06-20 Lecture précédente terminée · note 4/5',
    '2025-01-01 Lecture précédente commencée']), () => {
    const b = norm({id: 'h', titre: 'H', statut: 'lu', pagesTotal: 300, ajoute: '2026-01-01T10:00:00.000Z', dateDebut: '2026-01-02', dateFin: '2026-01-10',
      journal: [{date: '2026-01-02', page: 0}, {date: '2026-01-05', page: 120}, {date: '2026-01-10', page: 300}],
      sessions: [{date: '2026-01-05', min: 30, pages: 40}, {date: '2026-01-05', min: 20}],
      historique: [{debut: '2025-06-01', fin: '2025-06-20', note: 4}, {debut: '2025-01-01', fin: '', note: 0}]});
    return JSON.stringify(evenementsLivre(b).map(e => e.date + ' ' + e.texte));
  });
  await test('Historique : rien d\'inventé (pas de reprise, pas d\'événement sans date, abandon = « Arrêté »)', 'Arrêté|pas de reprise|2', () => {
    const a = norm({id: 'r', titre: 'R', statut: 'abandon', dateDebut: '2026-02-01', dateFin: '2026-02-09', historique: [{debut: '', fin: '', note: 0}]});
    const b = norm({id: 'q', titre: 'Q', statut: 'en_cours', dateDebut: '2026-03-01', journal: [{date: '2026-03-01', page: 0}, {date: '2026-03-04', page: 50}]});
    const ev = evenementsLivre(b);
    return evenementsLivre(a)[0].texte + '|' + (ev.some(e => /repri/i.test(e.texte)) ? 'reprise inventée' : 'pas de reprise') + '|' + ev.length;
  });
  const fermerTout = async () => { modalModifie = false; closeM(); ficheEtat.edition = null; if (ficheEtat.id) await fermerFiche(); await pause(250); };
  const COUV = 'data:image/png;base64,iVBORw0KGgo=';
  await test('Carnet : toucher une carte (liste puis grille) ouvre la fiche, pas le formulaire ; boutons rapides inchangés', 'fiche|fiche|pas de formulaire|où j\'en suis', async () => {
    books = [fiche('Carte', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10})]; ui.tab = 'en_cours'; prefs.view = 'liste'; render();
    const r = [];
    $('#list .card .t').click(); await pause(50); r.push(ficheEtat.id === 't-Carte' && $('#livreOv').classList.contains('show') ? 'fiche' : '?'); await fermerTout();
    prefs.view = 'grille'; render(); $('#list .gcard').click(); await pause(50); r.push(ficheEtat.id === 't-Carte' ? 'fiche' : '?');
    r.push($('#ov').classList.contains('show') ? 'formulaire ouvert' : 'pas de formulaire'); await fermerTout();
    prefs.view = 'liste'; render(); $('#list .card [data-act="pages"]').click(); await pause(50);
    r.push(!$('#livreOv').classList.contains('show') && $('#modal h2').textContent.includes('Où en es-tu') ? 'où j\'en suis' : '?'); await fermerTout();
    return r.join('|');
  });
  await test('Carnet : une citation, un prêt « Voir » et une ligne de rayon ouvrent la fiche', 'citations|prêt|rayon sans fenêtre', async () => {
    books = [fiche('Cité', {statut: 'lu', citations: [{id: 'c-1', texte: 'Phrase', page: '3', date: today()}]}), fiche('Prêté', {statut: 'en_cours', possession: 'emprunte', pretRetour: today()})];
    ui.tab = 'citations'; render(); $('#qlist .quote').click(); await pause(80);
    const o = $('#livreOv'), s = $('#fs_citations');
    const a = ficheEtat.id === 't-Cité' && s && (s.getBoundingClientRect().top < 160 || o.scrollTop + o.clientHeight >= o.scrollHeight - 2) ? 'citations' : '?'; await fermerTout();
    ui.tab = 'en_cours'; render(); paintNotice(); $('#notice [data-open]').click(); await pause(50); const b = ficheEtat.id === 't-Prêté' ? 'prêt' : '?'; await fermerTout();
    $('#modal').innerHTML = '<h2>Rayon</h2><button type="button" class="catline" data-open="t-Cité">x</button>'; showM(); $('#modal [data-open]').click(); await pause(50);
    const c = ficheEtat.id === 't-Cité' && !$('#ov').classList.contains('show') ? 'rayon sans fenêtre' : '?'; await fermerTout();
    return [a, b, c].join('|');
  });
  await test('Carnet : « Modifier » ouvre le formulaire par-dessus ; enregistré → fiche à jour ; annulé → fiche intacte', 'formulaire|Nouveau titre|fiche intacte', async () => {
    books = [fiche('Avant', {statut: 'a_lire', couverture: COUV, resumeTente: true, classTente: true})]; await Store.persist(); ouvrirFiche('t-Avant'); await pause(50);
    $('#livreOv [data-fiche="modifier-livre"]').click(); await pause(50);
    const a = $('#ov').classList.contains('show') && $('#livreOv').classList.contains('show') ? 'formulaire' : '?';
    $('#f_titre').value = 'Nouveau titre'; $('#f_save').click(); await pause(300);
    const b = $('#livreTitre').textContent;
    $('#livreOv [data-fiche="modifier-livre"]').click(); await pause(50); $('#f_titre').value = 'Pas gardé'; modalModifie = false; $('#modal [data-close]').click(); await pause(250);
    const c = $('#livreTitre').textContent === 'Nouveau titre' && $('#livreOv').classList.contains('show') ? 'fiche intacte' : '?';
    await fermerTout(); return [a, b, c].join('|');
  });
  await test('Carnet : « Où j\'en suis » depuis la fiche met la progression à jour', 'p. 60 sur 100', async () => {
    books = [fiche('Page', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10, couverture: COUV})]; ouvrirFiche('t-Page');
    $('#fs_presentation [data-fiche="pages"]').click(); await pause(50); $('#p_val').value = '60'; $('#p_ok').click(); await pause(200);
    const r = ($('#fs_progression').textContent.match(/p\. \d+ sur \d+/) || ['?'])[0]; await fermerTout(); return r;
  });
  await test('Carnet : retour couche par couche (question → formulaire → fiche → bibliothèque)', 'question|formulaire|fiche|bibliothèque', async () => {
    books = [fiche('Couches', {couverture: COUV})]; ouvrirFiche('t-Couches'); $('#livreOv [data-fiche="modifier-livre"]').click(); await pause(50);
    const r = [];
    $('#askOv').classList.add('show'); r.push(fenetreOuverte() === '#askOv' ? 'question' : '?'); $('#askOv').classList.remove('show');
    r.push(fenetreOuverte() === '#ov' ? 'formulaire' : '?'); modalModifie = false; fermerDessus(); await pause(250);
    r.push(fenetreOuverte() === '#livreOv' ? 'fiche' : '?'); fermerDessus(); await pause(250);
    r.push(!fenetreOuverte() ? 'bibliothèque' : '?'); await fermerTout();
    return r.join('|');
  });
  await test('Carnet : focus sur le titre, Tab reste dans la fiche, retour sur la carte d\'origine (même après un nouvel affichage)', 'titre|dans la fiche|carte|liste', async () => {
    books = [fiche('Focus A', {statut: 'a_lire'}), fiche('Focus B', {statut: 'a_lire'})]; ui.tab = 'a_lire'; prefs.view = 'liste'; render();
    const carte = $('#list .card[data-id="t-Focus B"]'); carte.focus(); carte.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await pause(50);
    const r = [document.activeElement === $('#livreTitre') ? 'titre' : '?'];
    const f = [...$('#livreOv').querySelectorAll('button,input,select,textarea,summary,[href]')].filter(x => !x.disabled && x.offsetParent);
    f[f.length - 1].focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}));
    r.push(document.activeElement === f[0] ? 'dans la fiche' : 'sorti');
    render(); await fermerFiche(); r.push(document.activeElement && document.activeElement.dataset.id === 't-Focus B' ? 'carte' : '?');
    ouvrirFiche('t-Focus A'); books = books.filter(b => b.id !== 't-Focus A'); render(); await fermerFiche();
    r.push($('#list').contains(document.activeElement) ? 'liste' : '?');
    ui.tab = 'en_cours'; render(); return r.join('|');
  });
  await test('Carnet : fiche complète (classification en lecture seule, suggestion marquée, avis, infos, historique)', 'Roman · à confirmer|Mon avis|Fayard|Commencé|aucun bouton de classification', async () => {
    books = [fiche('Complet', {statut: 'en_cours', genre: 'roman', avis: 'Très bien', editeur: 'Fayard', dateDebut: '2026-01-02', pagesTotal: 200, pageActuelle: 20,
      journal: [{date: '2026-01-02', page: 0}, {date: '2026-01-04', page: 20}], classements: [{c: '686', l: '843'}]})];
    ouvrirFiche('t-Complet'); const t = $('#livre').textContent;
    const r = [($('#fs_infos').textContent.match(/Roman · à confirmer/) || ['?'])[0], t.includes('Mon avis') ? 'Mon avis' : '?', t.includes('Fayard') ? 'Fayard' : '?',
      $('#fs_historique').textContent.includes('Commencé') ? 'Commencé' : '?', $('#livre [data-fiche*="classif"]') ? 'bouton de classification !' : 'aucun bouton de classification'];
    await fermerTout(); return r.join('|');
  });
  await test('Carnet : livre presque vide (titre seul) — fiche sans erreur, sections vides réduites', 'Seul|pas de progression|aucune note|aucune citation|aucun événement|infos minimales', async () => {
    books = [norm({id: 'vide', titre: 'Seul', statut: 'a_lire'})]; ouvrirFiche('vide');
    const t = s => ($(s) || {textContent: ''}).textContent;
    const r = [t('#livreTitre'), t('#fs_progression').includes('Pas encore de progression') ? 'pas de progression' : '?', t('#fs_notes').includes('Aucune note') ? 'aucune note' : '?',
      t('#fs_citations').includes('Aucune citation') ? 'aucune citation' : '?', t('#fs_historique').includes('Aucun événement enregistré') ? 'aucun événement' : '?',
      $('#fs_infos').querySelectorAll('dt').length === 2 ? 'infos minimales' : 'infos : ' + $('#fs_infos').querySelectorAll('dt').length];
    await fermerTout(); return r.join('|');
  });
  await test('Carnet : identifiant inconnu → pas de fiche, message', 'refusé|pas ouverte|message', async () => {
    books = []; const ok = ouvrirFiche('inconnu');
    return [ok ? 'ouverte ?' : 'refusé', $('#livreOv').classList.contains('show') ? 'ouverte' : 'pas ouverte', $('#toast').textContent.includes('plus dans ta bibliothèque') ? 'message' : '?'].join('|');
  });
  await test('Carnet : historique long → 20 événements puis « Tout afficher »', '20|Tout afficher (31)|31', async () => {
    const j = Array.from({length: 30}, (_, k) => ({date: '2026-04-' + String(k + 1).padStart(2, '0'), page: (k + 1) * 10}));
    books = [fiche('Long', {statut: 'en_cours', dateDebut: '2026-03-31', journal: j})]; ouvrirFiche('t-Long');
    const n = () => $('#fs_historique').querySelectorAll('.histo .d').length, a = n(), b = $('#fs_historique [data-fiche="histo"]').textContent.trim();
    $('#fs_historique [data-fiche="histo"]').click(); const c = n(); await fermerTout(); return [a, b, c].join('|');
  });
  const ficheNote = extra => fiche('Carnet', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 40, couverture: COUV, resumeTente: true, classTente: true, ...extra});
  const taper = (sel, v) => { const x = $(sel); x.value = v; x.dispatchEvent(new Event('input', {bubbles: true})); };
  await test('Notes : ajout (identifiant immédiat), modification (même identifiant, date de modification), retrouvées après relecture', `1|même id|Texte modifié|${today()}|relu`, async () => {
    books = [ficheNote()]; await Store.persist(); ouvrirFiche('t-Carnet');
    $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', 'Ma première note'); taper('#fe_page', '12'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(200);
    const n = books[0].notes, id = n[0] && n[0].id;
    $(`#fs_notes [data-fiche="modifier"][data-id="${id}"]`).click(); taper('#fe_texte', 'Texte modifié'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(200);
    const m = books[0].notes[0], d = await Store.get('data');
    const r = [n.length, m.id === id && /^n-/.test(id) ? 'même id' : '?', m.texte, m.modif, d.books[0].notes[0].texte === 'Texte modifié' && d.books[0].notes[0].id === id ? 'relu' : '?'];
    await fermerTout(); return r.join('|');
  });
  await test('Citations : ajout avec page et commentaire, modification sans changer l\'identifiant, retrouvées après relecture', 'Belle phrase|12|Mon avis dessus|même id|relu', async () => {
    books = [ficheNote()]; await Store.persist(); ouvrirFiche('t-Carnet');
    $('#fs_citations [data-fiche="ajouter"]').click(); taper('#fe_texte', 'Une phrase'); taper('#fe_page', '12'); taper('#fe_com', 'Mon avis dessus'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(200);
    const id = books[0].citations[0].id;
    $(`#fs_citations [data-fiche="modifier"][data-id="${id}"]`).click(); taper('#fe_texte', 'Belle phrase'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(200);
    const q = books[0].citations[0], d = (await Store.get('data')).books[0].citations[0];
    const r = [q.texte, q.page, q.commentaire, q.id === id && /^c-/.test(id) ? 'même id' : '?', d.id === id && d.texte === 'Belle phrase' ? 'relu' : '?'];
    await fermerTout(); return r.join('|');
  });
  await test('Notes et citations : supprimer demande confirmation (« Garder » ne retire rien), par identifiant', '1|0|reste c-b', async () => {
    books = [ficheNote({notes: [{id: 'n-x', texte: 'N', date: today()}], citations: [{id: 'c-a', texte: 'Pareil', date: today()}, {id: 'c-b', texte: 'Pareil', date: today()}]})]; ouvrirFiche('t-Carnet');
    // (O3d : « Supprimer » est dans la modification)
    $('#fs_notes [data-fiche="modifier"][data-id="n-x"]').click(); await pause(30);
    reponseConfirm = false; $('#fs_notes [data-fiche="retirer"][data-id="n-x"]').click(); await pause(100); const a = books[0].notes.length;
    reponseConfirm = true; $('#fs_notes [data-fiche="retirer"][data-id="n-x"]').click(); await pause(150); const b = books[0].notes.length;
    $('#fs_citations [data-fiche="modifier"][data-id="c-a"]').click(); await pause(30); $('#fs_citations [data-fiche="retirer"][data-id="c-a"]').click(); await pause(150);
    const r = [a, b, 'reste ' + books[0].citations.map(q => q.id).join(',')]; await fermerTout(); return r.join('|');
  });
  await test('Citations identiques : modifier l\'une ne touche jamais l\'autre', 'c-a:Pareil|c-b:Changée', async () => {
    books = [ficheNote({citations: [{id: 'c-a', texte: 'Pareil', date: today()}, {id: 'c-b', texte: 'Pareil', date: today()}]})]; ouvrirFiche('t-Carnet');
    $('#fs_citations [data-fiche="modifier"][data-id="c-b"]').click(); taper('#fe_texte', 'Changée'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(150);
    const r = books[0].citations.map(q => q.id + ':' + q.texte).sort().join('|'); await fermerTout(); return r;
  });
  // (lot O3 du 30/10/2026 : le carnet vertical — page de garde, signets, progression sur place, notes et citations, historique, statistiques)
  const enFiche = async (b, fn) => {
    const c0 = prefs.consultation, a0 = prefs.animation;
    prefs.consultation = 'continue'; prefs.animation = 'aucune';
    try { books = Array.isArray(b) ? b : [b]; ouvrirFiche(books[0].id); await pause(30); return await fn(); }
    finally { modalModifie = false; closeM(); ficheEtat.edition = null; if (ficheEtat.id) await fermerFiche(); await pause(60); prefs.consultation = c0; prefs.animation = a0; savePrefs(); }
  };
  const ficheRiche = extra => fiche('Riche', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 160, dateDebut: addDays(-9), couverture: COUV, resumeTente: true, classTente: true,
    resume: 'Un résumé. '.repeat(30), avis: 'Un avis.', editeur: 'Fayard',
    journal: [{date: addDays(-9), page: 0}, {date: addDays(-5), page: 80}, {date: addDays(-1), page: 160}],
    notes: Array.from({length: 6}, (_, k) => ({id: 'n-' + k, texte: 'Une note assez longue pour prendre de la place. '.repeat(4), date: addDays(-k - 1), page: String(20 + k)})),
    citations: Array.from({length: 6}, (_, k) => ({id: 'c-' + k, texte: 'Une phrase à retenir, assez longue elle aussi. '.repeat(3), date: addDays(-k - 1), page: String(30 + k)})), ...extra});
  const basTete = () => $('#livre .livre-tete').getBoundingClientRect().bottom;
  const allerA = s => { const ov = $('#livreOv'); ov.scrollTop += $('#fs_' + s).getBoundingClientRect().top - basTete(); };
  const signetActif = () => { const a = $('#livre .livre-signets [aria-current="true"]'); return a ? a.dataset.section : '?'; };
  await test('Carnet vertical (O3b) : 7 signets, chacun mène à sa section et s’allume', 'presentation,progression,notes,citations,historique,stats,infos|7 sections|chacun atteint', () => enFiche(ficheRiche(), async () => {
    const sig = [...document.querySelectorAll('#livre .livre-signets [data-fiche="aller"]')], ks = sig.map(x => x.dataset.section), ov = $('#livreOv'), rates = [];
    const sections = ks.filter(k => $('#fs_' + k)).length + ' sections';
    for (const x of sig) {
      x.click(); await pause(60);
      const r = $('#fs_' + x.dataset.section).getBoundingClientRect(), bas = basTete(), finDefile = ov.scrollTop + ov.clientHeight >= ov.scrollHeight - 2;
      const atteint = (Math.abs(r.top - bas) <= 12 || (x.dataset.section === 'presentation' && ov.scrollTop === 0) || (finDefile && r.top < innerHeight - 40)) && x.getAttribute('aria-current') === 'true';
      if (!atteint) rates.push(x.dataset.section + ' (haut ' + Math.round(r.top) + ', barre ' + Math.round(bas) + ', ' + x.getAttribute('aria-current') + ')');
    }
    return [ks.join(','), sections, rates.length ? 'raté : ' + rates.join(' ; ') : 'chacun atteint'].join('|');
  }));
  await test('Carnet vertical : le signet allumé suit le défilement', 'citations|notes|presentation', () => enFiche(ficheRiche(), async () => {
    const r = []; allerA('citations'); await pause(80); r.push(signetActif());
    allerA('notes'); await pause(80); r.push(signetActif());
    $('#livreOv').scrollTop = 0; await pause(80); r.push(signetActif()); return r.join('|');
  }));
  await test('Carnet vertical : le titre réduit apparaît dans la barre quand le grand titre sort de l’écran', 'caché|Riche', () => enFiche(ficheRiche(), async () => {
    const mini = () => $('#livre .livre-tete .livre-mini'), vu = () => mini() && getComputedStyle(mini()).display !== 'none' && mini().getBoundingClientRect().width > 0;
    const a = vu() ? 'visible trop tôt' : 'caché'; allerA('notes'); await pause(80);
    return a + '|' + (vu() ? mini().textContent.trim() : 'toujours caché (' + $('#livre .livre-tete').className + ', ' + (mini() ? getComputedStyle(mini()).display + ' ' + mini().getBoundingClientRect().width : 'absent') + ', titre ' + Math.round($('#livreTitre').getBoundingClientRect().bottom) + ', défile ' + $('#livreOv').scrollTop + '/' + $('#livreOv').scrollHeight + '/' + $('#livreOv').clientHeight + ', notes ' + Math.round($('#fs_notes').getBoundingClientRect().top) + ', n ' + document.querySelectorAll('#livreTitre').length + ' ' + $('#livreTitre').closest('[id]').id + ' pos ' + getComputedStyle($('#livreTitre')).position + ')');
  }));
  await test('Carnet vertical : rouvrir le même livre retrouve sa position (en mémoire seulement) ; un autre livre s’ouvre en haut', 'retrouvée|0|rien d’enregistré', async () => {
    const instantane = () => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
    return enFiche([ficheRiche(), fiche('Autre', {statut: 'a_lire'})], async () => {
      const ov = $('#livreOv'), avant = instantane(); ov.scrollTop = 600; await pause(30); const pos = ov.scrollTop;
      await fermerFiche(); await pause(60); ouvrirFiche('t-Riche'); await pause(30);
      const r = [Math.abs(ov.scrollTop - pos) <= 2 ? 'retrouvée' : 'perdue : ' + ov.scrollTop + ' au lieu de ' + pos];
      await fermerFiche(); await pause(60); ouvrirFiche('t-Autre'); await pause(30); r.push(ov.scrollTop);
      r.push(instantane() === avant ? 'rien d’enregistré' : 'enregistré !'); return r.join('|');
    });
  });
  await test('Carnet vertical : page de garde centrée (auteur en petites capitales, titre, ＋ Note, ＋ Citation)', 'centrée|AUTEUR|titre|note|citation', () => enFiche(ficheRiche(), async () => {
    const g = $('#fs_presentation'), a = g && g.querySelector('.livre-auteur');
    if (!g) return 'pas de page de garde';
    return [getComputedStyle(g).textAlign === 'center' ? 'centrée' : '?', a && getComputedStyle(a).textTransform === 'uppercase' ? 'AUTEUR' : '?', g.contains($('#livreTitre')) ? 'titre' : '?',
      g.querySelector('[data-fiche="ajouter"][data-type="note"]') ? 'note' : '?', g.querySelector('[data-fiche="ajouter"][data-type="citation"]') ? 'citation' : '?'].join('|');
  }));
  await test('Carnet vertical : rien ne déborde de l’écran, signets et boutons de la page de garde ≥ 44 px', 'sans débordement|cibles', () => enFiche(ficheRiche({titre: 'Anticonstitutionnellementdeboutsansespacepourvoir'}), async () => {
    const ov = $('#livreOv'), trop = [...document.querySelectorAll('#livre *')].filter(x => x.getBoundingClientRect().right > innerWidth + 1 && !x.closest('.livre-signets'));
    const petits = [...document.querySelectorAll('#livre .livre-signets button, #fs_presentation button')].filter(x => x.getBoundingClientRect().height < 44);
    return [ov.scrollWidth <= ov.clientWidth + 1 && !trop.length ? 'sans débordement' : 'déborde : ' + trop.slice(0, 3).map(x => x.className || x.tagName).join(','),
      petits.length ? 'petits : ' + petits.map(x => x.textContent.trim()).join(',') : 'cibles'].join('|');
  }));
  for (const theme of ['light', 'dark']) {
    await test(`Carnet vertical : textes lisibles en mode ${theme === 'dark' ? 'sombre' : 'clair'} (contraste ≥ 4,5)`, 'lisible', () => enFiche(ficheRiche(), async () => {
      const t0 = document.documentElement.dataset.theme; document.documentElement.dataset.theme = theme;
      try {
        const fond = getComputedStyle($('#livreOv')).backgroundColor, faibles = [];
        for (const s of ['.livre-signets button', '.livre-signets [aria-current="true"]', '.livre-auteur', '#fs_presentation .meta', '.histo .d', '.histo-mois', '.entree .meta', '.stat span', '.stat b']) {
          const x = $('#livre ' + s); if (!x) { faibles.push(s + ' absent'); continue; }
          const r = contraste(getComputedStyle(x).color, fond); if (r < 4.5) faibles.push(s + ' ' + r.toFixed(2));
        }
        return faibles.length ? faibles.join(', ') : 'lisible';
      } finally { document.documentElement.dataset.theme = t0; }
    }));
  }
  await test('Progression sur place (O3c) : curseur et champ, même journal que « Où j’en suis », événement dans l’historique', '70|60|journal|p. 60 sur 100|historique', () => enFiche(fiche('Place', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10, dateDebut: addDays(-3), journal: [{date: addDays(-3), page: 10}]}), async () => {
    const c = $('#fs_progression #fp_curseur'); if (!c) return 'pas de curseur';
    c.value = '70'; c.dispatchEvent(new Event('input', {bubbles: true})); const r = [$('#fp_page').value];
    taper('#fp_page', '60'); $('#fp_ok').click(); await pause(200);
    const j = books[0].journal; r.push(books[0].pageActuelle, j.length === 2 && j[1].date === today() && j[1].page === 60 ? 'journal' : JSON.stringify(j));
    r.push(($('#fs_progression').textContent.match(/p\. \d+ sur \d+/) || ['?'])[0], $('#fs_historique').textContent.includes('p. 60 (+50) sur 100') ? 'historique' : '?');
    return r.join('|');
  }));
  await test('Progression sur place : bornes (page vide refusée, au-delà de la fin → fiche « J’ai fini »)', 'erreur|10|100|fin', () => enFiche(fiche('Bornes', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10}), async () => {
    if (!$('#fp_page')) return 'pas de champ';
    taper('#fp_page', ''); $('#fp_ok').click(); await pause(80); const r = [$('#fp_page_err') ? 'erreur' : '?', books[0].pageActuelle];
    taper('#fp_page', '150'); $('#fp_ok').click(); await pause(200); r.push(books[0].pageActuelle, $('#ov').classList.contains('show') && $('#f_titre') ? 'fin' : '?');
    return r.join('|');
  }));
  await test('Notes (O3d) : « Supprimer » n’apparaît qu’en modifiant (toujours avec question)', 'pas de Supprimer|Supprimer en modifiant|question', () => enFiche(ficheNote({notes: [{id: 'n-x', texte: 'N', date: today()}]}), async () => {
    const r = [$('#fs_notes [data-fiche="retirer"]') ? 'Supprimer visible' : 'pas de Supprimer'];
    $('#fs_notes [data-fiche="modifier"][data-id="n-x"]').click(); await pause(30);
    r.push($('#fe [data-fiche="retirer"][data-id="n-x"]') ? 'Supprimer en modifiant' : '?');
    const q0 = confirmDemande; reponseConfirm = false; $('#fe [data-fiche="retirer"]').click(); await pause(80);
    r.push(confirmDemande > q0 && books[0].notes.length === 1 ? 'question' : '?'); reponseConfirm = true; return r.join('|');
  }));
  await test('Notes et citations (O3d) : note à marge, date en petites capitales, citation en italique ornée, longue citation entière', 'marge|petites capitales|italique|orné|entière', () => {
    const long = 'Une très longue citation. '.repeat(120).trim();
    return enFiche(ficheNote({notes: [{id: 'n-x', texte: 'N', date: today(), page: '3'}], citations: [{id: 'c-l', texte: long, date: today()}]}), async () => {
      const n = $('#fs_notes .entree.note'), m = n && n.querySelector('.meta'), c = $('#fs_citations .entree.citation'), p = c && c.querySelector('p');
      if (!n || !c) return 'entrées absentes';
      return [parseFloat(getComputedStyle(n).borderLeftWidth) >= 2 || getComputedStyle(n, '::before').content !== 'none' ? 'marge' : '?', m && getComputedStyle(m).textTransform === 'uppercase' ? 'petites capitales' : '?',
        getComputedStyle(p).fontStyle === 'italic' ? 'italique' : '?', getComputedStyle(c, '::before').content.includes('«') ? 'orné' : '?',
        p.textContent === long && p.scrollHeight <= p.clientHeight + 1 ? 'entière' : '?'].join('|');
    });
  });
  await test('Historique (O3e) : groupé par mois, du plus récent au plus ancien', 'avril 2026|mars 2026|4', () => enFiche(fiche('Mois', {statut: 'en_cours', pagesTotal: 100, dateDebut: '2026-03-30', ajoute: '2026-03-28',
    journal: [{date: '2026-03-30', page: 0}, {date: '2026-04-02', page: 20}, {date: '2026-04-09', page: 40}]}), async () => {
    const m = [...document.querySelectorAll('#fs_historique .histo-mois')].map(x => x.textContent.trim());
    return [...m, document.querySelectorAll('#fs_historique .histo .d').length].join('|');
  }));
  await test('Statistiques (O3e) : calculées depuis les données, estimation signalée', '53 %|10 jours|20 p./jour|≈ 7 jours|1 h 15|2 lectures|3|estimation signalée', () => enFiche(fiche('Stats', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 160, dateDebut: addDays(-9),
    journal: [{date: addDays(-9), page: 0}, {date: addDays(-5), page: 80}, {date: addDays(-1), page: 160}], sessions: [{date: addDays(-2), min: 45}, {date: addDays(-1), min: 30}],
    historique: [{debut: '2024-01-01', fin: '2024-02-01', note: 4}], notes: [{id: 'n-1', texte: 'a', date: today()}], citations: [{id: 'c-1', texte: 'b', date: today()}, {id: 'c-2', texte: 'c', date: today()}]}), async () => {
    const t = [...document.querySelectorAll('#fs_stats .stat')], v = t.map(x => x.querySelector('b').textContent.trim()), fin = t.find(x => x.querySelector('b').textContent.startsWith('≈'));
    return [...v, fin && /estimation/.test(fin.textContent) ? 'estimation signalée' : 'estimation non signalée'].join('|');
  }));
  await test('Statistiques : aucune ligne sans donnée (livre vide : une phrase ; une seule page notée : pas de rythme)', '0|phrase|53 %|pas de rythme', async () => {
    const r = await enFiche(norm({id: 'vide', titre: 'Vide', statut: 'a_lire'}), async () => [document.querySelectorAll('#fs_stats .stat').length, $('#fs_stats') && $('#fs_stats').textContent.includes('apparaîtront') ? 'phrase' : '?']);
    const s = await enFiche(fiche('Un', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 160, journal: [{date: today(), page: 160}]}), async () => {
      const v = [...document.querySelectorAll('#fs_stats .stat b')].map(x => x.textContent.trim()); return [v[0], v.some(x => /p\.\/jour|≈/.test(x)) ? 'rythme inventé : ' + v.join(',') : 'pas de rythme'];
    });
    return [...r, ...s].join('|');
  });
  // (lot O4 du 31/10/2026 : « Modifier » en bouton rond dans la barre de la fiche — accord d'Elias — pour laisser la place au petit titre)
  await test('Fiche (O4) : « Modifier » en bouton rond nommé ; le petit titre a la place de se lire', 'Modifier ce livre|rond|titre lisible', () => enFiche(ficheRiche(), async () => {
    const m = $('#livre .livre-tete [data-fiche="modifier-livre"]'), r = m.getBoundingClientRect();
    const texte = [...m.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('ico'))).map(n => n.textContent).join('').trim();
    const out = [m.getAttribute('aria-label') || texte, !texte && r.width >= 44 && r.width <= 56 ? 'rond' : 'largeur ' + Math.round(r.width) + ', texte « ' + texte + ' »'];
    allerA('notes'); await pause(80); const w = $('#livre .livre-mini').getBoundingClientRect().width;
    out.push(w >= 100 ? 'titre lisible' : 'titre ' + Math.round(w) + ' px'); return out.join('|');
  }));
  await test('Note vide : erreur sous le champ, rien d\'enregistré', 'erreur|0', async () => {
    books = [ficheNote()]; ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', '   '); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(50);
    const r = ($('#fe_texte_err') ? 'erreur' : '?') + '|' + (books[0].notes || []).length; await fermerTout(); return r;
  });
  await test('Quitter la fiche avec une note en cours : question ; « Continuer » garde le texte', 'pas fermée|Brouillon|fermée', async () => {
    books = [ficheNote()]; ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', 'Brouillon');
    reponseConfirm = false; const a = await fermerFiche(); await pause(50);
    const r = [a ? 'fermée ?' : 'pas fermée', $('#fe_texte') ? $('#fe_texte').value : '?'];
    reponseConfirm = true; r.push((await fermerFiche()) ? 'fermée' : '?'); return r.join('|');
  });
  await test('Édition en cours gardée quand la fiche se repeint (autre fenêtre), avec le focus', 'En cours d\'écriture|focus', async () => {
    books = [ficheNote()]; ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', 'En cours d\'écriture'); $('#fe_texte').focus();
    books = [{...books[0], avis: 'changé ailleurs'}]; peindreFiche();
    const r = $('#fe_texte').value + '|' + (document.activeElement === $('#fe_texte') ? 'focus' : 'focus perdu'); ficheEtat.edition = null; await fermerTout(); return r;
  });
  await test('Entrée supprimée ailleurs pendant la modification : texte gardé', 'n-x:Gardé', async () => {
    books = [ficheNote({notes: [{id: 'n-x', texte: 'Avant', date: today()}]})]; ouvrirFiche('t-Carnet');
    $('#fs_notes [data-fiche="modifier"][data-id="n-x"]').click(); taper('#fe_texte', 'Gardé');
    books = [{...books[0], notes: []}]; $('#livreOv [data-fiche="enregistrer"]').click(); await pause(150);
    const r = books[0].notes.map(n => n.id + ':' + n.texte).join(','); await fermerTout(); return r;
  });
  await test('Formulaire : retirer une citation par identifiant ; citation tapée et « Nouvelle citation » ont un identifiant', 'c-a|id|id', async () => {
    books = [ficheNote({citations: [{id: 'c-a', texte: 'Pareil', date: today()}, {id: 'c-b', texte: 'Pareil', date: today()}]})];
    openForm(books[0]); await pause(50); $('#f_quotes [data-qdel="c-b"]').click(); const a = form.citations.map(q => q.id).join(',');
    $('#f_qt').value = 'Tapée sans ajouter'; $('#f_save').click(); await pause(300);
    const b = books[0].citations.find(q => q.texte === 'Tapée sans ajouter'); modalModifie = false; closeM(); await pause(250);
    openQuote(books[0]); $('#c_txt').value = 'Par la boîte'; $('#c_ok').click(); await pause(200);
    const c = books[0].citations.find(q => q.texte === 'Par la boîte');
    return [a, b && /^c-/.test(b.id) ? 'id' : '?', c && /^c-/.test(c.id) ? 'id' : '?'].join('|');
  });
  const livreSuppr = (n, c) => fiche('Suppr', {couverture: COUV, notes: Array.from({length: n}, (_, i) => ({id: 'n-' + i, texte: 'N' + i, date: today()})),
    citations: Array.from({length: c}, (_, i) => ({id: 'c-' + i, texte: 'C' + i, date: today()}))});
  await test('Suppression : la question compte exactement les notes et citations (0, 1, plusieurs)', JSON.stringify(['Supprimer « Suppr » ?',
    'Supprimer « Suppr » ? Sa note sera supprimée aussi.', 'Supprimer « Suppr » ? Sa citation sera supprimée aussi.',
    'Supprimer « Suppr » ? Ses 2 notes et 1 citation seront supprimées aussi.']), async () => {
    const r = []; reponseConfirm = false;
    for (const [n, c] of [[0, 0], [1, 0], [0, 1], [2, 1]]) { books = [livreSuppr(n, c)]; await supprimerLivre('t-Suppr'); r.push($('#askTxt').textContent); }
    reponseConfirm = true; return JSON.stringify(r);
  });
  await test('Suppression depuis la fiche et le formulaire : « Garder » ne fait rien ; « Supprimer » retire et ferme ; « Annuler » remet tout', 'gardé|supprimé, fiche fermée|remis avec 2 notes|formulaire : supprimé', async () => {
    books = [livreSuppr(2, 1)]; ouvrirFiche('t-Suppr'); reponseConfirm = false; $('#livreOv [data-fiche="supprimer-livre"]').click(); await pause(100);
    const r = [books.length === 1 && $('#livreOv').classList.contains('show') ? 'gardé' : '?'];
    reponseConfirm = true; $('#livreOv [data-fiche="supprimer-livre"]').click(); await pause(150);
    r.push(!books.length && !$('#livreOv').classList.contains('show') ? 'supprimé, fiche fermée' : '?');
    $('#toastBtn').click(); await pause(80); r.push(books.length === 1 && books[0].notes.length === 2 ? 'remis avec 2 notes' : '?');
    openForm(books[0]); await pause(50); $('#f_del').click(); await pause(150); r.push(!books.length && !$('#ov').classList.contains('show') ? 'formulaire : supprimé' : '?');
    return r.join('|');
  });
  const FUS = (mes, autre, base) => { Store.conflits = []; return Store.fusion(mes, autre, new Map(base.map(b => [b.id, b])), true); };
  await test('Fusion : champ changé d\'un seul côté repris ; changé des deux côtés → ma valeur, conflit signalé', 'ici|5|Moi|avis', () => {
    const o = fiche('F', {avis: 'base', note: 2, auteur: 'A'}), [r] = FUS([{...o, avis: 'ici', auteur: 'Moi'}], [{...o, avis: 'ailleurs', note: 5}], [o]);
    return [r.avis, r.note, r.auteur, Store.conflits.map(c => (c.champs || []).join(',')).join(';')].join('|');
  });
  await test('Fusion des notes par identifiant (modifiée, supprimée, ajoutée, modifiée des deux côtés)', 'a-moi,b-eux,d-eux*,d-moi,n5,n6|1', () => {
    const n = (id, t) => ({id, texte: t, date: '2026-01-01', modif: '', page: ''});
    const o = fiche('N', {notes: [n('n1', 'a'), n('n2', 'b'), n('n3', 'c'), n('n4', 'd')]});
    const moi = {...o, notes: [n('n1', 'a-moi'), n('n3', 'c'), n('n4', 'd-moi'), n('n5', 'n5')]};
    const eux = {...o, notes: [n('n1', 'a'), n('n2', 'b-eux'), n('n4', 'd-eux'), n('n6', 'n6')]};
    const [r] = FUS([moi], [eux], [o]);
    return r.notes.map(x => x.texte + (x.conflit ? '*' : '')).sort().join(',') + '|' + r.notes.filter(x => x.conflit).length;
  });
  await test('Conflit de note : une seule copie, même après une deuxième fusion (passe de « persist »)', 1, () => {
    const n = (id, t) => ({id, texte: t, date: '2026-01-01', modif: '', page: ''});
    const o = fiche('D', {notes: [n('n1', 'base')]}), moi = {...o, notes: [n('n1', 'moi')]};
    const [r1] = FUS([moi], [{...o, notes: [n('n1', 'eux')]}], [o]);
    // (seconde passe de « persist » : le livre a encore changé ici pendant l'écriture)
    const pendant = {...moi, avis: 'changé pendant écriture'}, [r2] = Store.fusion([pendant], [r1], new Map([[moi.id, moi]]));
    return r2.notes.filter(x => x.conflit).length;
  });
  await test('Fusion : livre supprimé ici mais modifié ailleurs → gardé et signalé ; supprimé ailleurs, intact ici → supprimé ; supprimé ailleurs, modifié ici → gardé', 't-G|garde|vide|t-M|remis', () => {
    const g = fiche('G'), a = FUS([], [{...g, avis: 'ailleurs'}], [g]).map(b => b.id).join(','), c1 = Store.conflits[0] && Store.conflits[0].garde ? 'garde' : '?';
    const s = fiche('S'), b = FUS([s], [], [s]).length ? 'gardé ?' : 'vide';
    const m = fiche('M'), c = FUS([{...m, avis: 'ici'}], [], [m]).map(x => x.id).join(','), c2 = Store.conflits[0] && Store.conflits[0].remis ? 'remis' : '?';
    return [a, c1, b, c, c2].join('|');
  });
  await test('Fusion : journal le même jour des deux côtés → la plus grande page ; corrigé d\'un seul côté → la correction ; séances réunies sans doublon', '150|80|3', () => {
    const o = fiche('J', {journal: [{date: '2026-01-01', page: 100}], sessions: [{date: '2026-01-01', min: 10}]});
    const [r1] = FUS([{...o, journal: [{date: '2026-01-01', page: 120}], sessions: [...o.sessions, {date: '2026-01-02', min: 5}]}],
      [{...o, journal: [{date: '2026-01-01', page: 150}], sessions: [...o.sessions, {date: '2026-01-03', min: 7}]}], [o]);
    const [r2] = FUS([{...o, journal: [{date: '2026-01-01', page: 80}], avis: 'x'}], [{...o, note: 3}], [o]);
    return [r1.journal[0].page, r2.journal[0].page, r1.sessions.length].join('|');
  });
  await test('Deux fenêtres (relecture réelle) : notes ajoutées des deux côtés gardées ; conflit de champ annoncé', 'ailleurs,ici|ici|annoncé', async () => {
    const n = (id, t) => ({id, texte: t, date: today(), modif: '', page: ''});
    books = [fiche('R', {couverture: COUV})]; await Store.persist(); const o = books[0];
    await autreFenetre([{...o, avis: 'ailleurs', notes: [n('n-eux', 'ailleurs')]}], 6000);
    books = [{...o, avis: 'ici', notes: [n('n-moi', 'ici')]}]; await Store.relire(); await pause(50);
    return [books[0].notes.map(x => x.texte).join(','), books[0].avis, $('#toast').textContent.includes('tes changements ont été gardés pour : avis') ? 'annoncé' : '?'].join('|');
  });
  await test('Fiche ouverte : livre supprimé dans une autre fenêtre → bandeau, modifications bloquées, « Le remettre » le remet', 'bandeau|bloqué|remis', async () => {
    books = [fiche('Carnet', {couverture: COUV})]; await Store.persist(); ouvrirFiche('t-Carnet');
    await autreFenetre([], 7000); await Store.relire(); await pause(50);
    const r = [$('#livreOv').textContent.includes('supprimé dans une autre fenêtre') ? 'bandeau' : '?', $('#livreOv [data-fiche="ajouter"]') ? 'modifiable' : 'bloqué'];
    $('#livreOv [data-fiche="remettre"]').click(); await pause(200);
    r.push(books.some(b => b.id === 't-Carnet') && $('#livreTitre').textContent === 'Carnet' ? 'remis' : '?');
    await fermerTout(); return r.join('|');
  });
  await test('Carnet : rien ne dépasse en largeur (fiche complète, éditeur ouvert)', 'ok', async () => {
    books = [ficheNote({titre: 'Un titre très long qui ne doit jamais faire déborder la fiche du carnet', auteur: 'Autrice au nom très long également',
      notes: [{id: 'n-1', texte: 'x'.repeat(300), date: today()}], citations: [{id: 'c-1', texte: 'Une citation assez longue pour aller à la ligne plusieurs fois', page: '12', commentaire: 'Commentaire', date: today()}]})];
    ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); await pause(50);
    const o = $('#livreOv'), r = o.scrollWidth <= o.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 ? 'ok' : 'déborde : ' + o.scrollWidth + ' > ' + o.clientWidth;
    ficheEtat.edition = null; await fermerTout(); return r;
  });
  await test('Carnet : le titre qui reçoit le focus à l\'ouverture n\'affiche pas de cadre (ce n\'est pas une commande)', 'none', async () => {
    books = [ficheNote()]; ouvrirFiche('t-Carnet'); const r = document.activeElement === $('#livreTitre') ? getComputedStyle($('#livreTitre')).outlineStyle : 'pas de focus';
    await fermerTout(); return r;
  });
  // (relecture finale de l'étape 2)
  await test('Note modifiée ici puis supprimée ailleurs (relecture réelle) : l\'éditeur reste, « Enregistrer » la remet', 'éditeur visible|message|n-x:Avant, puis ma suite', async () => {
    books = [ficheNote({notes: [{id: 'n-x', texte: 'Avant', date: today()}]})]; await Store.persist(); const o = books[0]; ouvrirFiche('t-Carnet');
    $('#fs_notes [data-fiche="modifier"][data-id="n-x"]').click(); taper('#fe_texte', 'Avant, puis ma suite'); document.activeElement.blur();
    await autreFenetre([{...o, notes: []}], 8000); await Store.relire(); await pause(50);
    const r = [$('#fe_texte') && $('#livreOv [data-fiche="enregistrer"]') ? 'éditeur visible' : 'éditeur perdu', $('#fs_notes').textContent.includes('supprimée dans une autre fenêtre') ? 'message' : '?'];
    if ($('#livreOv [data-fiche="enregistrer"]')) { $('#livreOv [data-fiche="enregistrer"]').click(); await pause(150); }
    r.push(books[0].notes.map(n => n.id + ':' + n.texte).join(',')); ficheEtat.edition = null; await fermerTout(); return r.join('|');
  });
  await test('Écriture en cours : un nouvel affichage ne déplace pas le curseur', 'focus|curseur à la fin', async () => {
    books = [ficheNote()]; ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', 'Un texte en cours de frappe');
    const t = $('#fe_texte'), n = t.value.length; t.focus(); t.setSelectionRange(n, n);
    books = [{...books[0], avis: 'changé ailleurs'}]; render();
    const p = $('#fe_texte').selectionStart;
    const r = (document.activeElement === $('#fe_texte') ? 'focus' : 'perdu') + '|' + (p === n ? 'curseur à la fin' : 'curseur en ' + p); ficheEtat.edition = null; await fermerTout(); return r;
  });
  await test('Glisser le doigt dans la fiche ne change pas l\'onglet de la bibliothèque', 'en_cours|fiche ouverte', async () => {
    books = [ficheNote()]; ui.tab = 'en_cours'; render(); ouvrirFiche('t-Carnet');
    const cible = $('#fs_historique'), touche = x => new Touch({identifier: 1, target: cible, clientX: x, clientY: 300});
    cible.dispatchEvent(new TouchEvent('touchstart', {touches: [touche(300)], changedTouches: [touche(300)], bubbles: true}));
    cible.dispatchEvent(new TouchEvent('touchend', {touches: [], changedTouches: [touche(150)], bubbles: true}));
    const r = ui.tab + '|' + ($('#livreOv').classList.contains('show') ? 'fiche ouverte' : 'fiche fermée'); await fermerTout(); ui.tab = 'en_cours'; render(); return r;
  });
  await test('Fusion : version de départ non remise en ordre → ni faux conflit, ni suppression refusée', 'vide|0|true|ailleurs|0', () => {
    const brut = {id: 't-Z', titre: 'Z', statut: 'a_lire'}, a = FUS([], [norm(brut)], [brut]);
    const r = [a.length ? 'gardé à tort' : 'vide', Store.conflits.length];
    const [b] = FUS([{...brut, epingle: true}], [{...norm(brut), avis: 'ailleurs'}], [brut]);
    return [...r, b.epingle, b.avis, Store.conflits.length].join('|');
  });
  await test('Fusion : page corrigée ici un jour, autre jour ajouté ailleurs → la correction reste', '2026-10-20:80,2026-10-21:100', () => {
    const o = fiche('K', {journal: [{date: '2026-10-20', page: 100}]});
    const [r] = FUS([{...o, journal: [{date: '2026-10-20', page: 80}]}], [{...o, journal: [{date: '2026-10-20', page: 100}, {date: '2026-10-21', page: 100}]}], [o]);
    return r.journal.map(e => e.date + ':' + e.page).join(',');
  });
  await test('Conflits annoncés en mots simples (champs techniques nommés ou tus)', 'gardés pour : couvertures, avis|rien', () => {
    Store.conflits = [{id: 'x', titre: 'T', champs: ['coversAlt', 'classTente', 'avis']}]; signalerConflits();
    const a = (($('#toast').firstChild || {}).textContent || '?').replace(/^.*?(gardés pour : )/, '$1').trim();
    $('#toast').textContent = ''; Store.conflits = [{id: 'x', titre: 'T', champs: ['classTente', 'resumeTente']}]; signalerConflits();
    return a + '|' + ($('#toast').textContent ? 'annoncé' : 'rien');
  });
  await test('« Voir » pendant une note en cours : le texte n\'est pas effacé sans question', 'refusé|Brouillon gardé', async () => {
    books = [ficheNote(), fiche('Autre', {couverture: COUV})]; ouvrirFiche('t-Carnet'); $('#fs_notes [data-fiche="ajouter"]').click(); taper('#fe_texte', 'Brouillon gardé');
    const ok = ouvrirFiche('t-Autre');
    const r = (ok ? 'ouvert' : 'refusé') + '|' + (ficheEtat.edition ? ficheEtat.edition.texte : '?'); ficheEtat.edition = null; await fermerTout(); return r;
  });
  // (fin de la section 12)

  /* ---------- 13. Étape 3 : ouverture immersive ---------- */
  await test('Fluidité : règle de repli automatique (16 ms fluide, 50 ms saccadé, trop peu d\'images, page visible : saccadé, deux saccades → Simple, fluide → compteur à zéro)', 'true|false|false|simple|complete|0', () => {
    const p0 = prefs.animation, r0 = Ouverture.reduit; prefs.animation = 'complete'; delete prefs.anim3dLent; prefs.anim3dSaccades = 0; Ouverture.reduit = () => false;
    const r = [jugerFluidite(Array(10).fill(16)), jugerFluidite(Array(10).fill(50)), jugerFluidite([16, 16])];
    noterFluidite(false); noterFluidite(false); r.push(modeAnimation());
    prefs.anim3dLent = false; prefs.anim3dSaccades = 1; noterFluidite(true); r.push(modeAnimation(), prefs.anim3dSaccades);
    prefs.animation = p0; Ouverture.reduit = r0; delete prefs.anim3dLent; delete prefs.anim3dSaccades; savePrefs();
    return r.map(String).join('|');
  });
  await test('Réglages : « Animations » (3 choix, Complète par défaut, mémorisé ; repli signalé, effacé par « Complète »)', 'Complète,Simple,Aucune|Complète|aucune|signalé|effacé', async () => {
    const p0 = prefs.animation; delete prefs.animation; openSettings();
    const r = [[...document.querySelectorAll('#st_anim button')].map(b => b.textContent.trim()).join(','), ($('#st_anim .on') || {textContent: '?'}).textContent.trim()];
    $('#st_anim [data-an="aucune"]').click(); r.push(JSON.parse(localStorage.getItem(CLE + '-prefs')).animation); closeM(); await pause(250);
    prefs.animation = 'complete'; prefs.anim3dLent = true; openSettings(); r.push($('#modal').textContent.includes('saccadait') ? 'signalé' : '?');
    $('#st_anim [data-an="complete"]').click(); r.push(prefs.anim3dLent ? '?' : 'effacé'); closeM(); await pause(250);
    prefs.animation = p0; delete prefs.anim3dLent; delete prefs.anim3dSaccades; savePrefs(); return r.join('|');
  });
  const attendre = async (cond, max) => { const t = performance.now(); while (!cond() && performance.now() - t < max) await pause(15); return Math.round(performance.now() - t); };
  const effets = () => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && (a.effect.target.closest('#ouverture, #ouvertureFond') || a.effect.target.id === 'livreOv'));
  const formes = () => effets().map(a => JSON.stringify(a.effect.getKeyframes().map(k => k.transform || '')));
  const avecAnim = async (mode, fn, reduit) => {
    const m0 = prefs.animation, r0 = Ouverture.reduit; prefs.animation = mode; Ouverture.reduit = () => !!reduit;
    try { return await fn(); }
    finally { interrompreAnimation(); prefs.animation = m0; Ouverture.reduit = r0; delete prefs.anim3dLent; delete prefs.anim3dSaccades; savePrefs(); ficheEtat.edition = null; if (ficheEtat.id) await fermerFiche(); interrompreAnimation(); await pause(50); }
  };
  const carteAnim = () => { books = [fiche('Anim', {statut: 'en_cours', couverture: COUV, pagesTotal: 100, pageActuelle: 10})]; ui.tab = 'en_cours'; prefs.view = 'liste'; render(); return $('#list .card[data-id="t-Anim"]'); };
  await test('Ouverture complète : fiche ouverte tout de suite, départ de la carte, pivot 3D, puis plus rien à l\'écran', 'fiche|calque|depuis la carte|pivot 3D|fini|visible|durée ok', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click();
    const r = [ficheEtat.id === 't-Anim' && $('#livreOv').classList.contains('show') ? 'fiche' : '?', $('#ouverture') && $('#ouverture').getAttribute('aria-hidden') === 'true' ? 'calque' : '?'];
    const vus = new Set(formes()); r.push([...vus].some(k => k.includes('translate')) ? 'depuis la carte' : '?');
    const duree = await attendre(() => { formes().forEach(k => vus.add(k)); return !$('#ouverture'); }, 2000);
    r.push([...vus].some(k => k.includes('rotateY')) ? 'pivot 3D' : '?', !$('#ouverture') ? 'fini' : '?',
      !$('#livreOv').classList.contains('masque') && getComputedStyle($('#livreOv')).opacity === '1' ? 'visible' : '?', duree >= 450 && duree <= 850 ? 'durée ok' : 'durée ' + duree);
    return r.join('|');
  }));
  await test('Ouverture simple : repli à plat, jamais de 3D', 'repli à plat|pas de 3D', () => avecAnim('simple', async () => {
    carteAnim().querySelector('.t').click(); const vus = new Set();
    await attendre(() => { formes().forEach(k => vus.add(k)); return !$('#ouverture'); }, 2000);
    return ([...vus].some(k => k.includes('scaleX(0)')) ? 'repli à plat' : '?') + '|' + ([...vus].some(k => k.includes('rotateY')) ? '3D !' : 'pas de 3D');
  }));
  await test('Ouverture « Aucune » : pas de calque, fiche directement', 'pas de calque|fiche', () => avecAnim('aucune', async () => {
    carteAnim().querySelector('.t').click();
    return ($('#ouverture') ? 'calque !' : 'pas de calque') + '|' + ($('#livreOv').classList.contains('show') && !effets().length ? 'fiche' : '?');
  }));
  await test('Réduction des animations du téléphone : un simple fondu, aucun calque, même en Complète', 'fondu|pas de calque|court', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const f = effets();
    const r = [f.length === 1 && f[0].effect.target.id === 'livreOv' && +f[0].effect.getKeyframes()[0].opacity === 0 ? 'fondu' : '?', $('#ouverture') ? 'calque !' : 'pas de calque'];
    r.push((await attendre(() => !effets().length, 1000)) <= 300 ? 'court' : 'long'); return r.join('|');
  }, true));
  await test('Double toucher : une seule fiche, un seul calque', 't-Anim|1', () => avecAnim('complete', async () => {
    const c = carteAnim(); c.querySelector('.t').click(); c.querySelector('.t').click();
    return ficheEtat.id + '|' + document.querySelectorAll('#ouverture').length;
  }));
  await test('Redimensionnement pendant l\'animation : fin immédiate, fiche visible', 'arrêtée|fiche visible', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await pause(100); window.dispatchEvent(new Event('resize'));
    return ($('#ouverture') ? 'continue' : 'arrêtée') + '|' + (!$('#livreOv').classList.contains('masque') && !effets().length ? 'fiche visible' : '?');
  }));
  await test('Toucher pendant l\'animation : fin immédiate, fiche visible', 'arrêtée|fiche visible', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await pause(100); document.body.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    return ($('#ouverture') ? 'continue' : 'arrêtée') + '|' + (!$('#livreOv').classList.contains('masque') && !effets().length ? 'fiche visible' : '?');
  }));
  await test('Ouverture sans carte de départ (depuis une citation) : apparition au centre', 'apparition au centre|fini', () => avecAnim('complete', async () => {
    books = [fiche('Cit', {statut: 'lu', couverture: COUV, citations: [{id: 'c-1', texte: 'P', date: today()}]})]; ui.tab = 'citations'; render();
    $('#qlist .quote').click(); const l = effets().find(a => a.effect.target.classList.contains('ouv-livre'));
    const r = [l && +l.effect.getKeyframes()[0].opacity === 0 ? 'apparition au centre' : '?'];
    await attendre(() => !$('#ouverture'), 2000); r.push($('#ouverture') ? '?' : 'fini'); ui.tab = 'en_cours'; render(); return r.join('|');
  }));
  await test('Copie de couverture fidèle (sans image : couverture générée, initiales et couleur)', 'SI|couleur', () => avecAnim('complete', async () => {
    books = [norm({id: 'sans', titre: 'Sans image', statut: 'en_cours'})]; ui.tab = 'en_cours'; render(); $('#list .card .t').click();
    const c = $('#ouverture .ouv-couv .ouv-face'), r = [c && c.querySelector('.cg-ini') ? c.querySelector('.cg-ini').textContent.trim() : '?', c && getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'couleur' : '?']; return r.join('|');
  }));
  await test('Une ouverture complète enregistre une mesure de fluidité', 'mesurée', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(() => !$('#ouverture'), 2000); await pause(30);
    return typeof prefs.anim3dSaccades === 'number' ? 'mesurée' : 'pas de mesure';
  }));
  await test('Retour pendant l\'ouverture : fiche fermée tout de suite, plus de calque, pas d\'animation de fermeture', 'fermée|plus de calque|pas de fermeture animée', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await pause(100); fermerDessus();
    const r = [!$('#livreOv').classList.contains('show') && !fenetreOuverte() ? 'fermée' : '?', $('#ouverture') ? '?' : 'plus de calque'];
    await pause(60); r.push($('#ouverture') ? 'fermeture animée !' : 'pas de fermeture animée'); return r.join('|');
  }));
  await test('Fermeture vers la carte (déplacement) et vers une carte absente (effacement au centre)', 'vers la carte|fini|effacée au centre|fini', () => avecAnim('complete', async () => {
    const r = [], dernier = () => { const l = effets().filter(a => a.effect.target.classList.contains('ouv-livre')); return l.length ? l[l.length - 1].effect.getKeyframes() : null; };
    carteAnim().querySelector('.t').click(); await attendre(() => !$('#ouverture'), 2000);
    fermerFiche(); let k = null; await attendre(() => { const d = dernier(); if (d) k = d; return !$('#ouverture'); }, 2000);
    r.push(k && String(k[k.length - 1].transform).includes('translate') && +(k[k.length - 1].opacity ?? 1) !== 0 ? 'vers la carte' : '?', $('#ouverture') ? '?' : 'fini');
    carteAnim(); ouvrirFiche('t-Anim'); await attendre(() => !$('#ouverture'), 2000); ui.tab = 'lu'; render();
    fermerFiche(); k = null; await attendre(() => { const d = dernier(); if (d) k = d; return !$('#ouverture'); }, 2000);
    r.push(k && +k[k.length - 1].opacity === 0 ? 'effacée au centre' : '?', $('#ouverture') ? '?' : 'fini');
    ui.tab = 'en_cours'; render(); return r.join('|');
  }));
  // (lot O1 du 29/10/2026 : le livre devient un objet — épaisseur, ombres, double page centrée ; prototype docs/essais/ouverture-livre)
  // Fige toutes les animations du calque à leur début ou à leur fin (l'étape en cours ne s'achève pas : la suivante ne démarre pas)
  const figer = fin => effets().forEach(a => { a.pause(); a.currentTime = fin ? a.effect.getComputedTiming().endTime : 0; });
  const animDe = (cls, cond) => effets().find(a => a.effect.target.classList.contains(cls) && (!cond || cond(JSON.stringify(a.effect.getKeyframes()))));
  await test('Ouverture complète : la double page s\'ouvre au centre de l\'écran (reliure au milieu, couverture ouverte dans l\'écran)', 'reliure au centre|couverture dans l\'écran', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(() => animDe('ouv-couv'), 1500); figer(true); await pause(30);
    const l = $('#ouverture .ouv-livre').getBoundingClientRect(), c = $('#ouverture .ouv-couv').getBoundingClientRect();
    return [Math.abs(l.left - innerWidth / 2) < 2 ? 'reliure au centre' : 'reliure à ' + Math.round(l.left) + ' / ' + innerWidth, c.left >= -1 ? 'couverture dans l\'écran' : 'couverture à ' + Math.round(c.left)].join('|');
  }));
  await test('Ouverture complète : le livre a une épaisseur (tranche des feuilles), une ombre qui grandit, et pivote un peu dans la main', 'tranche|ombre qui grandit|pivote dans la main', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const o = animDe('ouv-ombre'), k = o ? o.effect.getKeyframes() : [];
    return [$('#ouverture .ouv-livre .ouv-tranche3d') ? 'tranche' : '?', k.length && +k[0].opacity === 0 && +k[k.length - 1].opacity === 1 ? 'ombre qui grandit' : '?',
      animDe('ouv-objet', t => t.includes('rotateY(-14deg)')) ? 'pivote dans la main' : '?'].join('|');
  }));
  await test('Ouverture complète : ombres pendant la rotation (face qui s\'assombrit, garde qui s\'éclaire, ombre sur la page) et bibliothèque assombrie', 'face|garde|page|fond', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const vus = new Set();
    await attendre(() => { effets().forEach(a => { const t = a.effect.target, c = t.parentElement ? t.parentElement.classList : null;
      if (t.classList.contains('ouv-voile') && c.contains('ouv-face')) vus.add('face'); if (t.classList.contains('ouv-voile') && c.contains('ouv-revers')) vus.add('garde');
      if (t.classList.contains('ouv-ombre-page')) vus.add('page'); if (t.classList.contains('ouv-fond')) vus.add('fond'); }); return !$('#ouverture'); }, 2000);
    return ['face', 'garde', 'page', 'fond'].map(k => vus.has(k) ? k : '?').join('|');
  }));
  await test('Ouverture complète : la 3D n\'est jamais aplatie (éléments en relief sans opacité, sans « will-change: opacity », sans débordement caché)', '2 éléments en relief|intacts', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(() => animDe('ouv-couv'), 1500);
    const relief = [...document.querySelectorAll('#ouverture *')].filter(e => getComputedStyle(e).transformStyle === 'preserve-3d');
    const fautes = relief.filter(e => { const s = getComputedStyle(e); return s.opacity !== '1' || s.willChange.includes('opacity') || s.overflow !== 'visible' || e.getAnimations().some(a => a.effect.getKeyframes().some(k => 'opacity' in k)); });
    return relief.length + ' éléments en relief|' + (fautes.length ? 'aplatis : ' + fautes.map(e => e.className).join(',') : 'intacts');
  }));
  await test('Durées : ouverture 630 ms (170 + 300 + 160), fermeture 500 ms (140 + 210 + 150)', '630|500', () => [DUREES.prendre + DUREES.ouvrir + DUREES.page, DUREES.reduire + DUREES.fermer + DUREES.rentrer].join('|'));
  await test('Fermeture complète : la double page se referme en revenant au centre, puis le livre rentre dans sa carte', 'double page centrée|refermé au centre|vers la carte', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(() => !$('#ouverture'), 2000);
    fermerFiche(); await attendre(() => animDe('ouv-couv'), 1500); const r = [], centre = () => { const l = $('#ouverture .ouv-livre').getBoundingClientRect(); return [l.left, l.left + l.width / 2]; };
    figer(false); await pause(30); r.push(Math.abs(centre()[0] - innerWidth / 2) < 2 ? 'double page centrée' : 'reliure à ' + Math.round(centre()[0]));
    figer(true); await pause(30); r.push(Math.abs(centre()[1] - innerWidth / 2) < 2 ? 'refermé au centre' : 'milieu à ' + Math.round(centre()[1]));
    effets().forEach(a => a.play()); let k = null;
    await attendre(() => { const l = effets().filter(a => a.effect.target.classList.contains('ouv-livre')); if (l.length) k = l[l.length - 1].effect.getKeyframes(); return !$('#ouverture'); }, 2000);
    r.push(k && String(k[k.length - 1].transform).includes('translate') && +(k[k.length - 1].opacity ?? 1) === 1 ? 'vers la carte' : '?'); return r.join('|');
  }));
  // (relecture : le vrai geste au doigt, c'est « appui » puis « clic » au relâchement, sur la fiche encore invisible)
  const appui = el => el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
  // (lot O2 du 30/10/2026 : la page intérieure EST la fiche — mise à l'échelle avec compensation, sans fondu ; prototype docs/essais/ouverture-livre)
  // Animations de la fiche elle-même (compensation de l'échelle sur #livre, barre du haut) : figées avec le reste
  const effetsFiche = () => document.getAnimations().filter(a => a.effect && a.effect.target && (a.effect.target.id === 'livre' || (a.effect.target.classList && a.effect.target.classList.contains('livre-tete'))));
  const figerA = (t, liste) => liste.forEach(a => { a.pause(); a.currentTime = t === 'fin' ? a.effect.getComputedTiming().endTime : t === 'milieu' ? a.effect.getComputedTiming().endTime / 2 : 0; });
  const agrandissement = () => effetsFiche().some(a => a.effect.target.id === 'livre' && a.effect.getKeyframes().length > 2);
  // (échelle réelle du texte de la fiche : celle de la fenêtre multipliée par la compensation — jamais étirée)
  const echelleTexte = () => new DOMMatrix(getComputedStyle($('#livreOv')).transform).multiply(new DOMMatrix(getComputedStyle($('#livre')).transform));
  const longue = () => { books = [fiche('Longue', {statut: 'en_cours', couverture: COUV, pagesTotal: 300, pageActuelle: 30,
    notes: Array.from({length: 24}, (x, i) => ({id: 'n-' + i, texte: 'Une note assez longue pour remplir la fiche, numéro ' + i + '. '.repeat(3), date: today()}))})];
    ui.tab = 'en_cours'; prefs.view = 'liste'; render(); return $('#list .card[data-id="t-Longue"]'); };
  await test('Ouverture complète : la vraie fiche est sur la page de droite dès que la couverture s\'ouvre (ni page vide, ni fondu)', 'fiche sur la page|pas de page vide|pas de fondu', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const fondus = new Set();
    await attendre(() => animDe('ouv-couv'), 1500); figer(true); figerA('fin', effetsFiche()); await pause(30);
    const o = $('#livreOv').getBoundingClientRect(), l = $('#ouverture .ouv-livre').getBoundingClientRect();
    const r = [getComputedStyle($('#livreOv')).visibility === 'visible' && Math.abs(o.left - l.left) < 2 && Math.abs(o.width - l.width) < 2 && Math.abs(o.top - l.top) < 2 && Math.abs(o.height - l.height) < 2 ? 'fiche sur la page' : 'fiche à ' + [o.left, o.top, o.width, o.height].map(Math.round) + ' / page à ' + [l.left, l.top, l.width, l.height].map(Math.round),
      $('#ouverture .ouv-page') ? 'page vide !' : 'pas de page vide'];
    effets().forEach(a => a.play()); effetsFiche().forEach(a => a.play());
    await attendre(() => { effets().filter(a => a.effect.target.id === 'livreOv').forEach(a => { if (a.effect.getKeyframes().some(k => 'opacity' in k)) fondus.add(1); }); return !$('#ouverture'); }, 2000);
    r.push(fondus.size ? 'fondu !' : 'pas de fondu'); return r.join('|');
  }));
  await test('Ouverture complète : le texte de la fiche n\'est jamais étiré (sur la page, puis pendant l\'agrandissement)', 'droit sur la page|droit en grandissant', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const r = [], droit = () => { const m = echelleTexte(); return Math.abs(m.a - m.d) / m.a < .03 && m.a < .95; };
    await attendre(() => animDe('ouv-couv'), 1500); figer(true); figerA('fin', effetsFiche()); await pause(30);
    r.push(droit() ? 'droit sur la page' : 'étiré : ' + echelleTexte().a.toFixed(2) + ' × ' + echelleTexte().d.toFixed(2));
    effets().forEach(a => a.play()); effetsFiche().forEach(a => a.play()); await attendre(agrandissement, 1500);
    figerA('milieu', [...effets(), ...effetsFiche()]); await pause(30);
    r.push(droit() ? 'droit en grandissant' : 'étiré : ' + echelleTexte().a.toFixed(2) + ' × ' + echelleTexte().d.toFixed(2)); return r.join('|');
  }));
  await test('Ouverture complète : la barre du haut de la fiche apparaît en dernier', 'barre en dernier', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(agrandissement, 1500);
    const a = effetsFiche().find(x => x.effect.target.classList.contains('livre-tete')), k = a ? a.effect.getKeyframes() : [];
    return k.length && +k[0].opacity === 0 && +k[k.length - 1].opacity === 1 && k.some(x => x.offset >= .4 && +x.opacity === 0) ? 'barre en dernier' : '?';
  }));
  await test('Bibliothèque assombrie SOUS la fiche : la page reste claire pendant l\'ouverture', 'fond sous la page', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const f = document.querySelector('.ouv-fond');
    return f && !f.closest('#ouverture') && +getComputedStyle(f.closest('#ouvertureFond') || f).zIndex < +getComputedStyle($('#livreOv')).zIndex ? 'fond sous la page' : '?';
  }));
  await test('Livre feuilletable : sa page de garde est sur la page de droite pendant l\'ouverture', 'livre sur la page', async () => {
    const c0 = prefs.consultation; prefs.consultation = 'livre';
    try { return await avecAnim('complete', async () => {
      carteAnim().querySelector('.t').click(); await attendre(() => animDe('ouv-couv'), 1500); figer(true); figerA('fin', effetsFiche()); await pause(30);
      const o = $('#livreOv').getBoundingClientRect(), l = $('#ouverture .ouv-livre').getBoundingClientRect();
      return $('#livreOv').classList.contains('mode-livre') && getComputedStyle($('#livreOv')).visibility === 'visible' && Math.abs(o.left - l.left) < 2 && Math.abs(o.width - l.width) < 2 ? 'livre sur la page' : '?';
    }); } finally { prefs.consultation = c0; }
  });
  await test('Fermeture depuis une fiche défilée : la fiche redevient la page de droite là où on lisait, puis disparaît', 'fermée|fiche visible|défilement gardé|origine au défilement|droit|rangée', () => avecAnim('complete', async () => {
    longue().querySelector('.t').click(); await attendre(() => !$('#ouverture'), 2000);
    $('#livreOv').scrollTop = 400; const s = $('#livreOv').scrollTop; fermerFiche(); await attendre(() => animDe('ouv-couv'), 1500);
    const ov = $('#livreOv'), r = [ficheEtat.id === '' && !ov.classList.contains('show') ? 'fermée' : '?', getComputedStyle(ov).display !== 'none' && ov.inert ? 'fiche visible' : '?'];
    r.push(s > 300 && ov.scrollTop === s ? 'défilement gardé' : 'défilement ' + ov.scrollTop + ' / ' + s, getComputedStyle($('#livre')).transformOrigin.endsWith(' ' + s + 'px') ? 'origine au défilement' : 'origine ' + getComputedStyle($('#livre')).transformOrigin);
    figer(false); figerA('debut', effetsFiche()); await pause(30); const m = echelleTexte(); r.push(Math.abs(m.a - m.d) / m.a < .03 ? 'droit' : 'étiré');
    effets().forEach(a => a.play()); effetsFiche().forEach(a => a.play()); await attendre(() => !$('#ouverture'), 2000);
    r.push(getComputedStyle(ov).display === 'none' && !ov.inert && getComputedStyle(ov).transform === 'none' ? 'rangée' : '?'); return r.join('|');
  }));
  await test('Interruption à chaque étape de l\'ouverture : la fiche est aussitôt entière, à plat, sans fond sombre', 'prise|ouverture|agrandissement', () => avecAnim('complete', async () => {
    const r = [], net = () => !$('#ouverture') && !$('#ouvertureFond') && getComputedStyle($('#livreOv')).transform === 'none' && getComputedStyle($('#livre')).transform === 'none' && getComputedStyle($('#livreOv')).visibility === 'visible' && !effetsFiche().length;
    for (const [nom, attente] of [['prise', () => true], ['ouverture', () => animDe('ouv-couv')], ['agrandissement', agrandissement]]) {
      carteAnim().querySelector('.t').click(); await attendre(attente, 1500); appui($('#livreOv')); await pause(20);
      r.push(net() ? nom : nom + ' ?'); ficheEtat.edition = null; await fermerFiche(); interrompreAnimation(); await pause(30);
    }
    return r.join('|');
  }));
  await test('Fermeture avec moins d\'animations : la fiche s\'efface (un seul fondu), puis plus rien', 'fondu de la fiche|plus rien', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); const du = await attendre(() => !effets().length, 1000);
    const diag = ' · attente ' + du + ' · geste ' + Ouverture.gesteCoupe + ' · coupée il y a ' + Math.round(performance.now() - Ouverture.coupeeA) + ' · anims ' + Ouverture.animations.length + ' · show ' + $('#livreOv').classList.contains('show');
    fermerFiche(); const f = effets();
    const r = [f.length === 1 && f[0].effect.target.id === 'livreOv' && +f[0].effect.getKeyframes()[0].opacity === 1 && getComputedStyle($('#livreOv')).display !== 'none' ? 'fondu de la fiche'
      : 'effets ' + f.map(a => (a.effect.target.id || a.effect.target.className) + ' ' + JSON.stringify(a.effect.getKeyframes().map(k => k.opacity))).join(', ') + ' · ' + getComputedStyle($('#livreOv')).display + ' · fiche ' + ficheEtat.id + diag];
    await attendre(() => !effets().length, 1000); r.push(getComputedStyle($('#livreOv')).display === 'none' && !$('#ouverture') ? 'plus rien' : '?'); return r.join('|');
  }, true));
  await test('Toucher pour passer l\'ouverture : le clic du même geste ne déclenche pas un bouton invisible', 'a_lire|en_cours', () => avecAnim('complete', async () => {
    books = [fiche('Geste', {statut: 'a_lire', couverture: COUV})]; ui.tab = 'a_lire'; prefs.view = 'liste'; render();
    $('#list .card .t').click(); await pause(100);
    const b = $('#livre [data-fiche="start"]'); appui(b); await pause(120); b.click(); const r = [books[0].statut];
    const b2 = $('#livre [data-fiche="start"]'); if (b2) { appui(b2); b2.click(); } r.push(books[0].statut);
    ui.tab = 'en_cours'; return r.join('|');
  }));
  await test('« ← » touché pendant l\'ouverture (relâché 150 ms après l\'appui) : fermée sans animation de fermeture', 'fermée|pas de fermeture animée', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await pause(100);
    const b = $('#livre [data-fiche="fermer"]'); appui(b); await pause(150); b.click(); await pause(60);
    return (!$('#livreOv').classList.contains('show') ? 'fermée' : '?') + '|' + ($('#ouverture') ? 'fermeture animée !' : 'pas de fermeture animée');
  }));
  await test('Toucher une carte pendant la fermeture animée : le livre s\'ouvre (le clic n\'est pas avalé)', 'ouverte', () => avecAnim('complete', async () => {
    const c = carteAnim(); c.querySelector('.t').click(); await attendre(() => !$('#ouverture'), 2000);
    fermerFiche(); await pause(60); const t = $('#list .card[data-id="t-Anim"] .t'); appui(t); t.click();
    return ficheEtat.id === 't-Anim' && $('#livreOv').classList.contains('show') ? 'ouverte' : 'pas ouverte';
  }));
  await test('Mesure de fluidité sans changement : les préférences ne sont pas réécrites (pas d\'écrasement d\'une autre fenêtre)', 'intactes|écrites', () => {
    const p0 = localStorage.getItem(CLE + '-prefs'); prefs.anim3dSaccades = 0; delete prefs.anim3dLent;
    localStorage.setItem(CLE + '-prefs', '{"marque":1}'); noterFluidite(true);
    const r = [localStorage.getItem(CLE + '-prefs') === '{"marque":1}' ? 'intactes' : 'réécrites'];
    noterFluidite(false); r.push(localStorage.getItem(CLE + '-prefs').includes('anim3dSaccades') ? 'écrites' : '?');
    delete prefs.anim3dSaccades; if (p0 === null) localStorage.removeItem(CLE + '-prefs'); else localStorage.setItem(CLE + '-prefs', p0); savePrefs();
    return r.join('|');
  });
  // (fin de la section 13)

  /* ---------- 14. Étape 3 (suite) : le livre feuilletable ---------- */
  await test('Couverture générée : stable pour un même livre, famille et fond tirés de l\'empreinte, jamais enregistrée', 'stable|5 familles|varié|jamais enregistrée', () => {
    const b = norm({id: 'g1', titre: 'Le Rouge et le Noir', auteur: 'Stendhal'}), a = couvGeneree(b), c = couvGeneree({...b});
    const fams = new Set(), fonds = new Set();
    for (let k = 0; k < 60; k++) { const g = couvGeneree({titre: 'Livre ' + k, auteur: 'Auteur ' + (k % 7)}); fams.add(g.famille); fonds.add(g.fond); }
    const avant = JSON.stringify(b); coverHtml(b); coverHtml(b, 'big');
    return [a.html === c.html && a.classes === c.classes ? 'stable' : '?', fams.size === 5 ? '5 familles' : fams.size + ' familles', fonds.size >= 6 ? 'varié' : fonds.size + ' fonds',
      JSON.stringify(b) === avant && b.couverture === '' ? 'jamais enregistrée' : '?'].join('|');
  });
  await test('Couverture générée : genre seulement s\'il est confirmé (jamais une suggestion), titre et auteur échappés', 'pas de genre|Roman|échappé', () => {
    const sugg = couvGeneree(norm({titre: 'A', auteur: 'B', genre: 'roman'})), conf = couvGeneree(norm({titre: 'A', auteur: 'B', classif: {genre: 'roman'}}));
    const x = couvGeneree({titre: '<b>x</b>', auteur: '"y"'});
    return [sugg.html.includes('cg-genre') ? 'suggestion affichée !' : 'pas de genre', (conf.html.match(/class="cg-genre">([^<]*)</) || [])[1] || '?', x.html.includes('<b>') ? 'non échappé !' : 'échappé'].join('|');
  });
  await test('Initiales : deux premiers mots porteurs (articles ignorés), sinon la première lettre', 'RN|P|É|?', () =>
    [initiales('Le Rouge et le Noir'), initiales('Le petit'), initiales('Été'), initiales('')].join('|'));
  await test('Couvertures générées lisibles (≥ 4,5) : 5 familles × 8 fonds, en clair et en sombre', [], async () => {
    const fautes = [];
    for (const [s, t] of [['android', 'light'], ['android', 'dark']]) await avecStyle(s, t, () => {
      const d = document.createElement('div'); d.style.width = '130px';
      d.innerHTML = FAMILLES_COUV.flatMap(f => FONDS_COUV.map(fd => { const g = couvGeneree({titre: 'Titre d\'essai', auteur: 'Auteur', classif: {genre: 'roman'}});
        return `<div class="gcard"><div class="ph cg cg-${f} cg-f-${fd}">${g.html}</div></div>`; })).join('');
      document.body.appendChild(d);
      for (const ph of d.querySelectorAll('.ph')) for (const el of ph.querySelectorAll('.cg-titre,.cg-auteur,.cg-genre')) {
        if (!el.checkVisibility()) { fautes.push(t + ' ' + ph.className + ' ' + el.className + ' caché'); continue; }
        const r = contraste(getComputedStyle(el).color, getComputedStyle(ph).backgroundColor); if (r < 4.5) fautes.push(t + ' ' + ph.className + ' ' + el.className + ' ' + r.toFixed(2));
      }
      d.remove();
    });
    return fautes.slice(0, 10);
  });
  await test('Couverture générée : titre en grand format, initiales seules en vignette de liste', 'titre|initiales', () => {
    books = [fiche('Vignette', {statut: 'en_cours'})]; ui.tab = 'en_cours'; prefs.view = 'liste'; render();
    const petite = $('#list .card .ph'), d = document.createElement('div'); d.className = 'gcard'; d.innerHTML = coverHtml(books[0], ''); d.style.width = '160px'; document.body.appendChild(d);
    const grande = d.querySelector('.ph'), r = [grande.querySelector('.cg-titre').checkVisibility() ? 'titre' : '?', petite.querySelector('.cg-ini').checkVisibility() && !petite.querySelector('.cg-titre').checkVisibility() ? 'initiales' : '?'];
    d.remove(); return r.join('|');
  });
  await test('Couverture réelle : l\'image par-dessus la couverture générée ; image cassée → la couverture générée reste', 'image|générée', async () => {
    books = [fiche('Cassée', {statut: 'en_cours', couverture: 'https://exemple.invalid/x.jpg'})]; ui.tab = 'en_cours'; render();
    const r = [$('#list .card .ph img') ? 'image' : '?'];
    window.coverNext($('#list .card .ph img')); r.push(!$('#list .card .ph img') && $('#list .card .ph .cg-ini') ? 'générée' : '?'); return r.join('|');
  });
  await test('Page Couverture : couverture réelle visible avant les pages, chargée immédiatement, sans titre imprimé dessus', 'image|chargement immédiat|sans titre visible', () => {
    const b = fiche('Ma couverture', {couverture: 'https://exemple.invalid/couverture.jpg'});
    const html = pageHtml({section: 'couverture', blocs: [{id: 'couverture', html: coverHtml(b, 'lv-couverture-art')}], suite: false, n: 0}, 4, b);
    return [html.includes('https://exemple.invalid/couverture.jpg') && html.includes('lv-couverture-art') ? 'image' : '?',
      html.includes('loading="eager"') ? 'chargement immédiat' : '?', !html.includes('<h3 class="lv-h"') && html.includes('id="livreTitre"') ? 'sans titre visible' : '?'].join('|');
  });
  const sectionsDe = plan => plan.map(s => s.id).join(',');
  await test('Plan du livre : couverture avant les pages, pas de page vide (Notes et Citations gardent leur invitation)', 'couverture,garde,sommaire,progression,notes,citations,infos,colophon|vide-note|vide-citation', () => {
    const p = planLivre(fiche('Vide', {statut: 'a_lire'}));
    return sectionsDe(p) + '|' + p.find(s => s.id === 'notes').blocs[0].id + '|' + p.find(s => s.id === 'citations').blocs[0].id;
  });
  await test('Plan du livre : couverture et toutes les sections dans l\'ordre ; notes récentes d\'abord, citations par page', 'couverture,garde,resume,sommaire,progression,avis,notes,citations,historique,infos,colophon|ajout-note,n-2,n-1|ajout-citation,c-b,c-a', () => {
    const b = fiche('Plein', {statut: 'en_cours', resume: 'Premier.\n\nSecond.', avis: 'Beau', pagesTotal: 300, pageActuelle: 40, dateDebut: '2026-09-01',
      journal: [{date: '2026-09-01', page: 0}, {date: '2026-09-10', page: 40}], notes: [{id: 'n-1', date: '2026-09-02', texte: 'a'}, {id: 'n-2', date: '2026-09-09', texte: 'b'}],
      citations: [{id: 'c-a', texte: 'x', page: '90', date: '2026-09-03'}, {id: 'c-b', texte: 'y', page: '12', date: '2026-09-04'}]});
    const p = planLivre(b), ids = s => p.find(x => x.id === s).blocs.map(x => x.id).join(',');
    return [sectionsDe(p), ids('notes'), ids('citations')].join('|');
  });
  await test('Plan du livre : rien d\'inventé (historique seulement s\'il y a plus que l\'ajout ; genre seulement confirmé)', 'pas d\'historique|historique|pas de suggestion', () => {
    const r = [planLivre(fiche('H1', {ajoute: '2026-09-01'})).some(s => s.id === 'historique') ? '?' : 'pas d\'historique'];
    r.push(planLivre(fiche('H2', {ajoute: '2026-09-01', statut: 'en_cours', dateDebut: '2026-09-02'})).some(s => s.id === 'historique') ? 'historique' : '?');
    r.push(planLivre(fiche('H3', {genre: 'roman'})).find(s => s.id === 'garde').blocs[0].html.includes('Roman') ? 'suggestion affichée !' : 'pas de suggestion');
    return r.join('|');
  });
  await test('Pagination : chaque section commence une page ; les blocs remplissent la page ; numéros continus', 'garde:garde|notes:a,b|notes:c|citations:d|0,1,2,3', () => {
    const plan = [{id: 'garde', blocs: [{id: 'garde'}]}, {id: 'notes', blocs: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}, {id: 'citations', blocs: [{id: 'd'}]}];
    const pages = paginer(plan, 100, bl => ({garde: 50, a: 40, b: 40, c: 40, d: 10})[bl.id]);
    return [...pages.map(p => p.section + ':' + p.blocs.map(b => b.id).join(',')), pages.map(p => p.n).join(',')].join('|');
  });
  await test('Pagination : un bloc plus haut qu\'une page a sa page à lui, qui défile ; rien n\'est coupé', 'notes:a|notes:long*|notes:b', () =>
    paginer([{id: 'notes', blocs: [{id: 'a'}, {id: 'long'}, {id: 'b'}]}], 100, bl => ({a: 30, long: 250, b: 30})[bl.id])
      .map(p => p.section + ':' + p.blocs.map(b => b.id).join(',') + (p.defile ? '*' : '')).join('|'));
  await test('Position stable : on retrouve la page d\'un bloc ; bloc disparu → début de sa section ; section disparue → -1', '2|1|-1', () => {
    const pages = paginer([{id: 'garde', blocs: [{id: 'garde'}]}, {id: 'notes', blocs: [{id: 'a'}, {id: 'b'}]}], 100, () => 60);
    return [pageDe(pages, {section: 'notes', bloc: 'b'}), pageDe(pages, {section: 'notes', bloc: 'zz'}), pageDe(pages, {section: 'avis', bloc: 'avis'})].join('|');
  });
  await test('Sommaire : chaque section y figure avec son numéro de page, après la couverture', 'Résumé 3|Progression 5|Mes notes 6|Infos 7', () => {
    const plan = [{id: 'couverture', blocs: [{id: 'couverture'}]}, {id: 'garde', blocs: [{id: 'garde'}]}, {id: 'resume', blocs: [{id: 'r'}]}, {id: 'sommaire', blocs: [{id: 'sommaire', html: ''}]}, {id: 'progression', blocs: [{id: 'p'}]},
      {id: 'notes', blocs: [{id: 'vide-note'}]}, {id: 'infos', blocs: [{id: 'infos'}]}, {id: 'colophon', blocs: [{id: 'colophon'}]}];
    const pages = paginer(plan, 100, () => 10); remplirSommaire(pages, fiche('S'));
    const d = document.createElement('div'); d.innerHTML = pages[3].blocs[0].html;
    return [...d.querySelectorAll('button')].filter(x => +x.dataset.page > 0).map(x => x.firstChild.textContent + ' ' + x.lastChild.textContent).join('|');
  });
  const avecLivre = async (fn, mode) => {
    const c0 = prefs.consultation, m0 = prefs.animation, r0 = Ouverture.reduit;
    prefs.consultation = 'livre'; prefs.animation = mode || 'aucune'; Ouverture.reduit = () => false;
    try { return await fn(); }
    finally {
      if (window.finirFeuille) finirFeuille(); interrompreAnimation(); ficheEtat.edition = null; if (ficheEtat.id) await fermerFiche(); interrompreAnimation();
      prefs.consultation = c0; prefs.animation = m0; Ouverture.reduit = r0; Feuille.forcerDouble = null;
      ['anim3dLent', 'anim3dSaccades', 'anim2dLent', 'anim2dSaccades'].forEach(k => delete prefs[k]); savePrefs(); await pause(30);
    }
  };
  // (le livre ouvert, sans attendre l'animation d'ouverture : les tests de tour de page partent d'un livre immobile)
  const ouvrirLivre = b => { books = [b]; ui.tab = b.statut; prefs.view = 'liste'; render(); ouvrirFiche(b.id); interrompreAnimation(); return Feuille; };
  // (les tests de feuilletage comptent les pages depuis la première, la couverture)
  const ouvrirAuDebut = b => { ouvrirLivre(b); montrerPage(0); return Feuille; };
  const LIVRE_PLEIN = () => fiche('Plein', {statut: 'en_cours', resume: 'Premier paragraphe.\n\nSecond.', avis: 'Beau livre', pagesTotal: 300, pageActuelle: 40, dateDebut: '2026-09-01',
    journal: [{date: '2026-09-01', page: 0}, {date: '2026-09-10', page: 40}], notes: [{id: 'n-1', date: '2026-09-02', texte: 'Première note'}],
    citations: [{id: 'c-1', texte: 'Une phrase', page: '12', date: '2026-09-03', commentaire: 'relue'}]});
  await test('Réglages : ouverture d’un livre (Fiche par défaut, Carnet), mémorisée', 'Fiche de lecture,Carnet feuilletable|Fiche de lecture|continue', async () => {
    const c0 = prefs.consultation; delete prefs.consultation; openSettings();
    const r = [[...document.querySelectorAll('#st_consult button')].map(b => b.textContent.trim()).join(','), ($('#st_consult .on') || {textContent: '?'}).textContent.trim()];
    $('#st_consult [data-co="continue"]').click(); r.push(JSON.parse(localStorage.getItem(CLE + '-prefs')).consultation); closeM(); await pause(250);
    prefs.consultation = c0; savePrefs(); return r.join('|');
  });
  await test('Fiche : le carnet s’ouvre volontairement et revient à la fiche', 'fiche|carnet|fiche', async () => {
    const c0 = prefs.consultation, a0 = prefs.animation;
    try {
      delete prefs.consultation; prefs.animation = 'aucune'; books = [LIVRE_PLEIN()]; ouvrirFiche(books[0].id);
      const r = [$('#fs_progression') ? 'fiche' : '?']; $('#livre [data-fiche="ouvrir-carnet"]').click(); r.push($('#lv') ? 'carnet' : '?');
      $('#livre [data-fiche="revenir-fiche"]').click(); r.push($('#fs_progression') ? 'fiche' : '?'); return r.join('|');
    } finally { if (ficheEtat.id) await fermerFiche(); prefs.consultation = c0; prefs.animation = a0; savePrefs(); }
  });
  // (l'animation d'ouverture montre déjà la couverture : le livre s'ouvre sur la page de garde ; la couverture est la page 1, une page en arrière)
  await test('Livre : s\'ouvre sur la page de garde (page 2), la couverture est juste avant (page 1, visible), papier du livre', 'garde|Page 2 sur|couverture|Plein|visible|papier', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); const r = [Feuille.pages[Feuille.page].section, $('#lvNum').textContent.replace(/\d+$/, '').trim()];
    tournerPage(-1); const pg = $('#lvPages .lv-page'), sonde = document.createElement('div'); sonde.className = 'lv-sonde-test'; document.body.appendChild(sonde);
    sonde.style.background = 'var(--livre-papier)'; const papier = getComputedStyle(sonde).backgroundColor; sonde.remove();
    const art = $('.lv-couverture-art'), rect = art.getBoundingClientRect();
    r.push(pg.dataset.section, $('.lv-couverture-art .cg-titre').textContent.trim(), art.checkVisibility() && rect.width > 80 && rect.height > 100 ? 'visible' : `taille ${Math.round(rect.width)}×${Math.round(rect.height)}`, getComputedStyle(pg).backgroundColor === papier ? 'papier' : getComputedStyle(pg).backgroundColor);
    return r.join('|');
  }));
  await test('Livre : vue continue toujours disponible (même fiche qu\'avant, sections #fs_)', 'continue|fs_progression', () => avecLivre(async () => {
    prefs.consultation = 'continue'; ouvrirLivre(LIVRE_PLEIN());
    return ($('#lv') ? 'livre !' : 'continue') + '|' + ($('#fs_progression') ? 'fs_progression' : '?');
  }));
  // (lot 0 du 29/10/2026 : avec « Fiche », « Sommaire » et « Modifier », la barre du livre sortait de l'écran ; « Modifier » devient
  // un bouton rond nommé pour les lecteurs d'écran ; avec un texte agrandi, la barre défile de côté au lieu de couper un bouton)
  await test('Livre : la barre du haut tient dans l’écran, « Modifier » en bouton rond nommé (texte normal, puis agrandi de 30 %)', 'tient|Modifier ce livre|form|accessible', () => avecLivre(async () => {
    const tete = () => $('#livre .livre-tete'), boutons = () => [...tete().querySelectorAll('button')];
    try {
      ouvrirLivre(LIVRE_PLEIN()); const r = [];
      r.push(boutons().every(b => b.getBoundingClientRect().right <= innerWidth + 1 && b.getBoundingClientRect().width >= 44) && tete().scrollWidth <= tete().clientWidth + 1
        ? 'tient' : 'déborde : ' + boutons().map(b => Math.round(b.getBoundingClientRect().right)).join(',') + ' / ' + innerWidth);
      const m = $('#livre [data-fiche="modifier-livre"]'); r.push(m ? m.getAttribute('aria-label') || m.textContent.trim() : '?');
      m.click(); await pause(50); r.push($('#ov').classList.contains('show') ? 'form' : '?'); modalModifie = false; closeM(); await pause(250);
      document.documentElement.style.fontSize = '130%'; peindreFiche(); await pause(30);
      const t = tete(), defile = getComputedStyle(t).overflowX === 'auto' || getComputedStyle(t).overflowX === 'scroll';
      r.push(t.getBoundingClientRect().right <= innerWidth + 1 && (t.scrollWidth <= t.clientWidth + 1 || defile) ? 'accessible' : 'coupé : ' + t.scrollWidth + ' > ' + t.clientWidth);
      return r.join('|');
    } finally { document.documentElement.style.fontSize = ''; }
  }));
  await test('Livre : les actions existantes marchent depuis les pages (Où j\'en suis, ＋ Note, Modifier, Supprimer…)', 'pages|note|form|question', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); const r = [];
    const aller = s => montrerPage(debutsSections(Feuille.pages)[s]);
    aller('progression'); $('#lvPages [data-fiche="pages"]').click(); await pause(50); r.push($('#ov').classList.contains('show') ? 'pages' : '?'); closeM(); await pause(250);
    aller('notes'); $('#lvPages [data-fiche="ajouter"][data-type="note"]').click(); r.push($('#lvPages #fe_texte') ? 'note' : '?'); ficheEtat.edition = null; peindreFiche();
    $('#livre [data-fiche="modifier-livre"]').click(); await pause(50); r.push($('#ov').classList.contains('show') ? 'form' : '?'); modalModifie = false; closeM(); await pause(250);
    aller('colophon'); reponseConfirm = false; const q0 = confirmDemande; $('#lvPages [data-fiche="supprimer-livre"]').click(); await pause(80); reponseConfirm = true;
    r.push(confirmDemande > q0 && books.length === 1 ? 'question' : '?'); return r.join('|');
  }));
  await test('Livre : une note très longue a sa propre page, qui défile, sans rien couper', 'défile|entière', () => avecLivre(async () => {
    const long = 'mot '.repeat(1250).trim();
    ouvrirLivre(fiche('Long', {statut: 'en_cours', notes: [{id: 'n-l', date: '2026-09-02', texte: long}]}));
    const n = pageDe(Feuille.pages, {section: 'notes', bloc: 'n-l'}); montrerPage(n);
    return [Feuille.pages[n].defile && $('#lvPages .lv-page').classList.contains('defile') ? 'défile' : '?', $('#lvPages .entree p').textContent === long ? 'entière' : '?'].join('|');
  }));
  await test('Livre : aucun identifiant en double, pages non affichées absentes de la page', '0|1', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); const ids = [...document.querySelectorAll('[id]')].map(x => x.id);
    return (ids.length - new Set(ids).size) + '|' + document.querySelectorAll('#lvPages .lv-page').length;
  }));
  await test('Feuilleter : ›, ‹, signets, sommaire et page précise ; rien au-delà des bords', '2|1|notes|citations|0|0|dernière', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); const r = [], sec = () => Feuille.pages[Feuille.page].section;
    $('#livre [data-fiche="page-suiv"]').click(); $('#livre [data-fiche="page-suiv"]').click(); r.push(Feuille.page);
    $('#livre [data-fiche="page-prec"]').click(); r.push(Feuille.page);
    $('#lv [data-fiche="signet"][data-section="notes"]').click(); r.push(sec());
    $('#livre [data-fiche="sommaire"]').click(); $(`#lvPages [data-fiche="aller-page"][data-page="${debutsSections(Feuille.pages).citations}"]`).click(); r.push(sec());
    tournerPage(0, 0); r.push(Feuille.page); r.push(tournerPage(-1) ? '?' : Feuille.page);
    tournerPage(0, Feuille.pages.length - 1); r.push(tournerPage(1) ? '?' : (Feuille.page === Feuille.pages.length - 1 ? 'dernière' : '?'));
    return r.join('|');
  }));
  await test('Feuilleter au clavier : flèches, Page suivante/précédente, Début/Fin ; pas dans un champ', '1|0|fin|0|resté', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); const k = (key, cible) => (cible || $('#lv')).dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true})); const r = [];
    k('ArrowRight'); r.push(Feuille.page); k('PageUp'); r.push(Feuille.page); k('End'); r.push(Feuille.page === Feuille.pages.length - 1 ? 'fin' : '?'); k('Home'); r.push(Feuille.page);
    montrerPage(debutsSections(Feuille.pages).notes); $('#lvPages [data-fiche="ajouter"]').click(); const p = Feuille.page; k('ArrowRight', $('#fe_texte')); r.push(Feuille.page === p ? 'resté' : '?');
    return r.join('|');
  }));
  await test('Changement de page : focus sur le titre de la page, annonce « Page x sur y, section », signet actif', 'Mes notes|annoncé|signet', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); allerSection('notes');
    return [document.activeElement.textContent, /^Page \d+ sur \d+, Mes notes$/.test($('#lvAnnonce').textContent) ? 'annoncé' : $('#lvAnnonce').textContent,
      $('#lv .lv-signets .on').dataset.section === 'notes' ? 'signet' : '?'].join('|');
  }));
  await test('Repeinte venue d\'ailleurs (nouvelle citation) : on reste sur la même note', 'n-1|n-1', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); montrerPage(pageDe(Feuille.pages, {section: 'notes', bloc: 'n-1'}));
    const bloc = () => Feuille.pages[Feuille.page].blocs.map(x => x.id).find(x => x === 'n-1') || '?', r = [bloc()];
    books = [norm({...books[0], citations: [...books[0].citations, {id: 'c-2', texte: 'Autre', page: '1', date: '2026-09-05'}]})]; render(); r.push(bloc());
    return r.join('|');
  }));
  await test('Retour Android dans le livre : referme le livre (une seule étape), position oubliée à la prochaine ouverture', 'fermé|garde', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); allerSection('citations'); fermerDessus(); await pause(30);
    const r = [!$('#livreOv').classList.contains('show') ? 'fermé' : '?']; ouvrirFiche(books[0].id); r.push(Feuille.pages[Feuille.page].section); return r.join('|');
  }));
  const effetsTour = () => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.lv-feuille,.lv-ombre,.lv-dessus'));
  await test('Tour de page complet : la vraie page d\'arrivée tout de suite, une feuille inerte qui pivote, puis plus rien', 'arrivée|inerte|pivot 3D|fini|durée ok', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); const t0 = performance.now(); tournerPage(1);
    const f = $('#lv .lv-feuille'), r = [Feuille.page === 1 && $('#lvPages .lv-page').dataset.n === '1' ? 'arrivée' : '?', f && f.inert && f.getAttribute('aria-hidden') === 'true' && !f.querySelector('[id]') ? 'inerte' : '?'];
    r.push(effetsTour().some(a => JSON.stringify(a.effect.getKeyframes()).includes('rotateY')) ? 'pivot 3D' : '?');
    while ($('#lv .lv-feuille') && performance.now() - t0 < 2000) await pause(15);
    const d = performance.now() - t0; r.push($('#lv .lv-feuille,#lv .lv-ombre,#lv .lv-dessus') ? '?' : 'fini', d >= 350 && d <= 700 ? 'durée ok' : 'durée ' + Math.round(d)); return r.join('|');
  }, 'complete'));
  await test('Tour en Simple : glissement sans 3D ; en Aucune : changement immédiat sans calque', 'glisse|pas de 3D|immédiat', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); tournerPage(1); const k = effetsTour().map(a => JSON.stringify(a.effect.getKeyframes())).join();
    const r = [k.includes('translateX') ? 'glisse' : '?', k.includes('rotateY') ? '3D !' : 'pas de 3D']; finirFeuille();
    prefs.animation = 'aucune'; tournerPage(1); r.push(!$('#lv .lv-feuille') && Feuille.page === 2 ? 'immédiat' : '?'); return r.join('|');
  }, 'simple'));
  await test('Toucher pendant un tour : le tour se termine, et le bouton touché sur la nouvelle page n\'est pas déclenché', 'fini|pas déclenché', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); montrerPage(debutsSections(Feuille.pages).progression - 1); tournerPage(1); await pause(60);
    const b = $('#lvPages [data-fiche="pages"]'); b.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); b.click(); await pause(30);
    const r = [$('#lv .lv-feuille') ? '?' : 'fini', $('#ov').classList.contains('show') ? 'déclenché !' : 'pas déclenché']; closeM(); return r.join('|');
  }, 'complete'));
  await test('Tourner au doigt : la feuille suit le doigt ; relâchée tôt elle revient, au-delà de 35 % la page tourne', 'suit|revenue|tournée', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); const lv = $('#lv'), r0 = lv.getBoundingClientRect(), y = r0.top + r0.height / 2, x0 = r0.right - 20;
    const ev = (type, x) => (type === 'pointerdown' ? lv.querySelector('.lv-contenu') || lv : document).dispatchEvent(new PointerEvent(type, {bubbles: true, clientX: x, clientY: y, pointerId: 1}));
    ev('pointerdown', x0); ev('pointermove', x0 - 30); ev('pointermove', x0 - 60);
    const a = effetsTour().find(z => JSON.stringify(z.effect.getKeyframes()).includes('rotateY')), r = [a && a.playState === 'paused' && a.currentTime > 0 ? 'suit' : '?'];
    await pause(200); ev('pointerup', x0 - 60); while ($('#lv .lv-feuille')) await pause(15); r.push(Feuille.page === 0 ? 'revenue' : '?');
    ev('pointerdown', x0); ev('pointermove', x0 - 30); ev('pointermove', x0 - r0.width * .6); await pause(200); ev('pointerup', x0 - r0.width * .6);
    while ($('#lv .lv-feuille')) await pause(15); r.push(Feuille.page === 1 ? 'tournée' : '?'); return r.join('|');
  }, 'complete'));
  await test('Toucher le bord : bord droit → page suivante, bord gauche → précédente, milieu → rien', '1|0|0', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); const lv = $('#lv'), r0 = lv.getBoundingClientRect(), y = r0.top + r0.height / 2, cible = () => lv.querySelector('.lv-num') || lv;
    const tape = x => { cible().dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: x, clientY: y})); document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: x, clientY: y})); };
    const r = []; tape(r0.right - 5); r.push(Feuille.page); tape(r0.left + 5); r.push(Feuille.page); tape(r0.left + r0.width / 2); r.push(Feuille.page); return r.join('|');
  }));
  await test('Écriture en cours : on ne tourne pas (message), rien n\'est perdu', 'resté|gardé', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); allerSection('notes'); $('#lvPages [data-fiche="ajouter"]').click();
    const t = $('#fe_texte'); t.value = 'Brouillon'; t.dispatchEvent(new Event('input', {bubbles: true})); const p = Feuille.page;
    tournerPage(1); return (Feuille.page === p ? 'resté' : '?') + '|' + (ficheEtat.edition && ficheEtat.edition.texte === 'Brouillon' ? 'gardé' : '?');
  }));
  await test('Tours rapides : jamais deux feuilles à la fois', '1|3', () => avecLivre(async () => {
    ouvrirAuDebut(LIVRE_PLEIN()); let max = 0; tournerPage(1); max = Math.max(max, document.querySelectorAll('#lv .lv-feuille').length);
    tournerPage(1); max = Math.max(max, document.querySelectorAll('#lv .lv-feuille').length); tournerPage(1); max = Math.max(max, document.querySelectorAll('#lv .lv-feuille').length);
    return max + '|' + Feuille.page;
  }, 'complete'));
  await test('Ouverture vers le livre : la couverture pivote et laisse voir une garde colorée, puis la page de garde', 'revers|pivot|garde', () => avecLivre(async () => {
    books = [fiche('Garde', {statut: 'en_cours'})]; ui.tab = 'en_cours'; prefs.view = 'liste'; render(); $('#list .card .t').click();
    const r = [$('#ouverture .ouv-couv .ouv-revers') ? 'revers' : '?'], t0 = performance.now(); let pivot = false;
    while ($('#ouverture') && performance.now() - t0 < 2000) {
      pivot = pivot || document.getAnimations().some(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('ouv-couv') && JSON.stringify(a.effect.getKeyframes()).includes('rotateY'));
      await pause(15);
    }
    r.push(pivot ? 'pivot' : '?');
    r.push(Feuille.pages[Feuille.page].section); return r.join('|');
  }, 'complete'));
  await test('« Voir » alors qu\'un autre livre est ouvert : on change de livre sans animation', 'B|pas d\'animation', () => avecLivre(async () => {
    books = [fiche('A', {statut: 'en_cours'}), fiche('B', {statut: 'en_cours'})]; ui.tab = 'en_cours'; render(); ouvrirFiche('t-A'); interrompreAnimation();
    ouvrirFiche('t-B'); return $('#livreTitre').textContent + '|' + ($('#ouverture') ? 'animation !' : 'pas d\'animation');
  }, 'complete'));
  await test('Repli en deux crans : 3D saccadée deux fois → Simple ; Simple saccadée deux fois → fondu ; « Simple » choisi de nouveau → réessai', 'simple|fondu|simple', () => {
    const p0 = prefs.animation, r0 = Ouverture.reduit; prefs.animation = 'complete'; Ouverture.reduit = () => false; ['anim3dLent', 'anim3dSaccades', 'anim2dLent', 'anim2dSaccades'].forEach(k => delete prefs[k]);
    noterFluidite(false); noterFluidite(false); const r = [modeAnimation()]; noterFluidite(false, '2d'); noterFluidite(false, '2d'); r.push(modeAnimation());
    openSettings(); $('#st_anim [data-an="simple"]').click(); r.push(modeAnimation()); closeM();
    prefs.animation = p0; Ouverture.reduit = r0; ['anim3dLent', 'anim3dSaccades', 'anim2dLent', 'anim2dSaccades'].forEach(k => delete prefs[k]); savePrefs();
    return r.join('|');
  });
  await test('Réglages : la dernière ouverture est mesurée et affichée (durée, images/s), rien n\'est enregistré pour ça', 'affichée|pas enregistrée', () => avecLivre(async () => {
    books = [fiche('Mesure', {statut: 'en_cours'})]; ui.tab = 'en_cours'; render(); $('#list .card .t').click();
    const t0 = performance.now(); while ($('#ouverture') && performance.now() - t0 < 2000) await pause(15); await pause(30);
    await fermerFiche(); interrompreAnimation(); openSettings(); const txt = $('#st_anim_note') ? $('#st_anim_note').textContent : ''; closeM(); await pause(250);
    return (/Dernière ouverture : \d+,\d+ s · \d+ images\/s/.test(txt) ? 'affichée' : txt) + '|' + (localStorage.getItem(CLE + '-prefs').includes('derniere') ? 'enregistrée !' : 'pas enregistrée');
  }, 'complete'));
  // (lot O4 du 31/10/2026 : la fermeture est mesurée comme l'ouverture, avec l'image la plus longue — critère à juger sur le téléphone)
  await test('Réglages (O4) : dernière ouverture et dernière fermeture mesurées, avec l’image la plus longue ; rien d’enregistré', 'ouverture|fermeture|image la plus longue|pas enregistrée', async () => {
    const p0 = prefs.consultation, a0 = prefs.animation, r0 = Ouverture.reduit, cles = ['anim3dLent', 'anim3dSaccades', 'anim2dLent', 'anim2dSaccades'];
    prefs.consultation = 'continue'; prefs.animation = 'complete'; Ouverture.reduit = () => false; cles.forEach(k => delete prefs[k]);
    const fin = async () => { const t0 = performance.now(); while ($('#ouverture') && performance.now() - t0 < 3000) await pause(15); await pause(30); };
    try {
      books = [fiche('Mesure fermeture', {statut: 'en_cours'})]; ui.tab = 'en_cours'; render(); $('#list .card .t').click();
      await fin(); await pause(150); fermerFiche(); await pause(20); await fin();
      openSettings(); const txt = $('#st_anim_note') ? $('#st_anim_note').textContent : ''; closeM(); await pause(250);
      return [/Dernière ouverture : \d+,\d+ s · \d+ images\/s/.test(txt) ? 'ouverture' : 'ouverture ? ' + txt, /Dernière fermeture : \d+,\d+ s · \d+ images\/s/.test(txt) ? 'fermeture' : 'fermeture ? ' + txt,
        /image la plus longue \d+ ms/.test(txt) ? 'image la plus longue' : '?', localStorage.getItem(CLE + '-prefs').includes('derniere') ? 'enregistrée !' : 'pas enregistrée'].join('|');
    } finally { if (ficheEtat.id) await fermerFiche(); interrompreAnimation(); prefs.consultation = p0; prefs.animation = a0; Ouverture.reduit = r0; cles.forEach(k => delete prefs[k]); savePrefs(); }
  });
  await test('Ruban : la page où l\'on referme le livre est marquée ; à la réouverture, « Reprendre au marque-page (Citations) » y mène', 'garde|Reprendre au marque-page (Citations)|citations|ruban', () => avecLivre(async () => {
    localStorage.removeItem(CLE + '-marques'); ouvrirLivre(LIVRE_PLEIN()); allerSection('citations'); await fermerFiche();
    ouvrirFiche(books[0].id); const r = [Feuille.pages[Feuille.page].section, ($('#lvPages [data-fiche="marque"]') || {textContent: '?'}).textContent];
    $('#lvPages [data-fiche="marque"]').click(); r.push(Feuille.pages[Feuille.page].section, $('#lv .lv-ruban') ? 'ruban' : '?');
    localStorage.removeItem(CLE + '-marques'); return r.join('|');
  }));
  await test('Ruban : ce n\'est pas la progression, il n\'est ni dans le livre ni dans la sauvegarde ; 200 livres au plus', 'livre intact|hors sauvegarde|200', () => avecLivre(async () => {
    localStorage.removeItem(CLE + '-marques'); const b = LIVRE_PLEIN(), avant = JSON.stringify(norm(b)); ouvrirLivre(b); allerSection('notes'); await fermerFiche();
    const r = [JSON.stringify(norm(books[0])) === avant && books[0].pageActuelle === 40 ? 'livre intact' : '?', JSON.stringify({goal, resume: resumeDe(books), books}).includes('marque') ? 'dans la sauvegarde !' : 'hors sauvegarde'];
    for (let k = 0; k < 230; k++) Marques.noter('x' + k, {section: 'notes', bloc: 'a'}); r.push(Object.keys(Marques.lire()).length);
    localStorage.removeItem(CLE + '-marques'); return r.join('|');
  }));
  await test('Double-page : deux pages côte à côte (paire à gauche), on avance de deux, numéros cohérents', '2|0,1|2,3|Page 3 sur', () => avecLivre(async () => {
    Feuille.forcerDouble = true; ouvrirLivre(LIVRE_PLEIN()); const vues = () => [...document.querySelectorAll('#lvPages .lv-page')].map(p => p.dataset.n).join(',');
    const r = [document.querySelectorAll('#lvPages .lv-page').length, vues()]; tournerPage(1); r.push(vues(), $('#lvNum').textContent.replace(/\d+$/, '').trim()); return r.join('|');
  }));
  await test('Changement de taille : nouvelle mise en page, même section et même bloc', 'citations|c-1', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); allerSection('citations'); Feuille.forcerDouble = true; window.dispatchEvent(new Event('resize')); await pause(250);
    const p = Feuille.pages[Feuille.page], q = Feuille.pages[Feuille.page + 1] || {blocs: []};
    return (p.section === 'citations' || q.section === 'citations' ? 'citations' : p.section) + '|' + ([...p.blocs, ...q.blocs].some(x => x.id === 'c-1') ? 'c-1' : '?');
  }));
  await test('Feuilleter n\'écrit rien : ouverture, tours, glissement annulé et fermeture (Complète, Simple, Aucune)', 'intact|intact|intact', async () => {
    const r = [];
    for (const mode of ['complete', 'simple', 'aucune']) r.push(await avecLivre(async () => {
      books = [LIVRE_PLEIN()]; await Store.persist(); const avant = JSON.stringify(books), lu = JSON.stringify(await Store.get('data'));
      ui.tab = 'en_cours'; render(); ouvrirFiche(books[0].id); await pause(700); tournerPage(1); await pause(500); tournerPage(1); await pause(500);
      const lv = $('#lv'), contenu = $('#lvPages .lv-contenu'), cadre = lv.getBoundingClientRect(), y = cadre.top + cadre.height / 2, x = cadre.right - 20;
      contenu.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, clientX: x, clientY: y}));
      document.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, clientX: x - 40, clientY: y}));
      document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, clientX: x - 40, clientY: y})); await pause(500);
      await fermerFiche(); await pause(700);
      return JSON.stringify(books) === avant && JSON.stringify(await Store.get('data')) === lu ? 'intact' : 'modifié';
    }, mode));
    return r.join('|');
  });
  await test('Retour à la bibliothèque : défilement, filtres, tri et recherche gardés (liste, grille, résultats de recherche)', 'liste|grille|recherche', async () => {
    const r = [], tous = Array.from({length: 30}, (_, k) => fiche('Livre ' + String(k).padStart(2, '0'), {statut: 'a_lire'}));
    for (const [vue, q] of [['liste', ''], ['grille', ''], ['liste', 'Livre 1']]) r.push(await avecLivre(async () => {
      books = tous.map(b => norm({...b})); ui.tab = 'a_lire'; ui.sort = 'titre'; ui.q = q; prefs.view = vue; render(); window.scrollTo(0, 300); await pause(30);
      const y0 = scrollY, carte = [...document.querySelectorAll('#list .card, #list .gcard')].find(c => { const b = c.getBoundingClientRect(); return b.top > 60 && b.bottom < innerHeight; });
      carte.querySelector('.t').click(); await pause(30); await fermerFiche(); await pause(30);
      const ok = Math.abs(scrollY - y0) <= 2 && ui.sort === 'titre' && $('#q').value === q && document.activeElement === document.querySelector(`#list [data-id="${carte.dataset.id}"]`);
      ui.q = ''; ui.sort = 'recent'; return ok ? (q ? 'recherche' : vue) : '?' + vue + ' ' + Math.round(scrollY) + '/' + Math.round(y0);
    }));
    prefs.view = 'liste'; window.scrollTo(0, 0); return r.join('|');
  });
  await test('Livre lisible dans les 8 combinaisons (texte, titres, liens, numéros ≥ 4,5) et zones tactiles ≥ 48 px', [], async () => {
    const fautes = [];
    for (const [s, t] of COMBOS) await avecStyle(s, t, () => avecLivre(async () => {
      ouvrirLivre(LIVRE_PLEIN()); const fond = getComputedStyle($('#lvPages .lv-page')).backgroundColor;
      for (const sec of ['garde', 'progression', 'notes', 'citations', 'infos']) {
        montrerPage(debutsSections(Feuille.pages)[sec]);
        for (const el of document.querySelectorAll('#lvPages .lv-page *')) {
          if (![...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim()) || !el.checkVisibility() || el.closest('[aria-hidden="true"]')) continue;
          const c = contraste(getComputedStyle(el).color, fond); if (c < 4.5) fautes.push(s + '/' + t + ' ' + sec + ' ' + (el.className || el.tagName) + ' ' + c.toFixed(2));
        }
      }
      for (const b of document.querySelectorAll('#livre .lv-pied button, #lv .lv-signets button, #lvPages .lv-lien')) { const r = b.getBoundingClientRect(); if (r.width < 48 && !b.classList.contains('lv-lien') || r.height < 48) fautes.push(s + '/' + t + ' cible ' + (b.dataset.fiche || b.className) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); }
    }));
    return [...new Set(fautes)].slice(0, 12);
  });
  await test('Page Couverture : la couverture tient dans sa page (rien de coupé), proportions 2:3 ; le sommaire y renvoie', 'dans la page|2:3|Couverture 1', () => avecLivre(async () => {
    ouvrirLivre(LIVRE_PLEIN()); montrerPage(debutsSections(Feuille.pages).couverture);
    const p = $('#lvPages .lv-page').getBoundingClientRect(), c = $('#lvPages .lv-couverture-art').getBoundingClientRect();
    const r = [c.left >= p.left - 1 && c.right <= p.right + 1 && c.top >= p.top - 1 && c.bottom <= p.bottom + 1 ? 'dans la page' : `déborde ${Math.round(c.left - p.left)}/${Math.round(p.right - c.right)}`,
      Math.abs(c.width / c.height - 2 / 3) < .02 ? '2:3' : (c.width / c.height).toFixed(2)];
    const d = document.createElement('div'); d.innerHTML = Feuille.pages[debutsSections(Feuille.pages).sommaire].blocs[0].html;
    const b = d.querySelector('button[data-page="0"]'); r.push(b ? b.firstChild.textContent + ' ' + b.lastChild.textContent : '?'); return r.join('|');
  }));
  // (fin de la section 14)

  /* ---------- 15. Corrections du 23/10 : barre de navigation en bas ---------- */
  await test('Navigation : barre en bas de l\'écran, 4 espaces (icône et nom), rien ne déborde, contenu et bouton ＋ dégagés', 'en bas|4 icônes|sans débordement|contenu dégagé|＋ au-dessus', () => {
    books = [fiche('Nav', {statut: 'a_lire'})]; ui.tab = 'a_lire'; render();
    const bar = $('#tabs'), r = bar.getBoundingClientRect(), tabs = [...bar.querySelectorAll('[data-space]')], fab = $('#fab').getBoundingClientRect();
    return [Math.abs(r.bottom - innerHeight) <= 1 && getComputedStyle(bar).position === 'fixed' ? 'en bas' : 'bas ' + Math.round(r.bottom) + '/' + innerHeight,
      tabs.length === 4 && tabs.every(t => t.querySelector('.ico') && t.textContent.trim()) ? '4 icônes' : '?',
      bar.scrollWidth <= bar.clientWidth + 1 && tabs.every(t => t.scrollWidth <= t.clientWidth + 1 && t.getBoundingClientRect().right <= innerWidth + 1) ? 'sans débordement' : 'déborde',
      parseFloat(getComputedStyle(document.body).paddingBottom) >= r.height ? 'contenu dégagé' : 'contenu caché',
      fab.bottom <= r.top + 1 ? '＋ au-dessus' : '＋ caché'].join('|');
  });
  await test('Statuts de la bibliothèque : les 4 tiennent dans la largeur (sur deux lignes si l\'écran est étroit)', 'tiennent', () => {
    books = [fiche('Nav', {statut: 'a_lire'})]; ui.tab = 'a_lire'; render();
    const nav = $('#main .library-nav'), bs = [...nav.querySelectorAll('[data-tab]')];
    return bs.length === 4 && bs.every(b => b.getBoundingClientRect().right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1) && nav.scrollWidth <= nav.clientWidth + 1 ? 'tiennent' : bs.map(b => Math.round(b.getBoundingClientRect().right)).join(',');
  });
  await test('Grille : le compte des livres occupe toute la largeur, au-dessus des couvertures (pas dans une case)', 'toute la largeur', () => {
    books = Array.from({length: 4}, (_, k) => fiche('G' + k, {statut: 'a_lire'})); ui.tab = 'a_lire'; ui.q = 'G'; prefs.view = 'grille'; render();
    const c = $('#list .resultat-compte'), l = $('#list').getBoundingClientRect(), r = c ? c.getBoundingClientRect() : null, g = $('#list .gcard').getBoundingClientRect();
    prefs.view = 'liste'; ui.q = ''; const ok = r && Math.abs(r.width - l.width) <= 2 && r.bottom <= g.top + 1; render(); return ok ? 'toute la largeur' : r ? Math.round(r.width) + '/' + Math.round(l.width) : 'absent';
  });
  await test('Ruban : rouvrir puis refermer sans tourner de page garde le marque-page (Citations)', 'citations|citations|pas de ruban sur la garde', () => avecLivre(async () => {
    localStorage.removeItem(CLE + '-marques'); ouvrirLivre(LIVRE_PLEIN()); allerSection('citations'); await fermerFiche();
    const r = [(Marques.de(books[0].id) || {}).section]; ouvrirFiche(books[0].id); interrompreAnimation(); await fermerFiche();
    r.push((Marques.de(books[0].id) || {}).section); ouvrirFiche(books[0].id); interrompreAnimation(); montrerPage(debutsSections(Feuille.pages).garde);
    r.push($('#lv .lv-ruban') ? 'ruban sur la garde !' : 'pas de ruban sur la garde'); localStorage.removeItem(CLE + '-marques'); return r.join('|');
  }));
  await test('Carnet → livre : toucher une citation ouvre le livre à la page Citations (mode Feuilleter)', 'citations', () => avecLivre(async () => {
    books = [LIVRE_PLEIN()]; ui.tab = 'citations'; render(); ouvrirFiche(books[0].id, 'citations'); interrompreAnimation();
    return Feuille.pages[Feuille.page].section;
  }));
  await test('Filtres de classement : un livre sans classement (ajouté depuis Découvrir ou le scan) ne fait pas planter la liste', 'liste affichée|1', () => {
    const brut = {...blankBook('a_lire'), id: 't-brut', titre: 'Sans classement'}; delete brut.classif;
    books = [brut, fiche('Classé', {classif: {themes: ['deuil']}})]; ui.tab = 'a_lire'; ui.theme = 'deuil';
    try { render(); return ($('#list') ? 'liste affichée' : '?') + '|' + document.querySelectorAll('#list .card, #list .gcard').length; }
    catch (e) { return 'plantage : ' + e.message; } finally { ui.theme = ''; render(); }
  });
  await test('Étiquettes : visibles dès l\'ouverture de « Modifier » ; une étiquette tapée sans « Ajouter » est gardée à l\'enregistrement', 'VAE visible|VAE,À relire', async () => {
    books = [fiche('Etq', {statut: 'a_lire', etiquettes: ['VAE']})]; ui.tab = 'a_lire'; render(); openForm(books[0]); await pause(30);
    const r = [($('#f_etiquettes') || {textContent: ''}).textContent.includes('VAE') ? 'VAE visible' : '?'];
    $('#f_etiquette').value = 'À relire'; collect(); r.push((form.etiquettes || []).join(','));
    modalModifie = false; closeM(); await pause(250); return r.join('|');
  });
  await test('Classement : un sous-genre d\'un autre genre reste visible avec son nom et peut être décoché', 'Policier coché|décoché', async () => {
    books = [fiche('Sg', {statut: 'a_lire', classif: {genre: 'essai', sousGenres: ['roman/policier']}})]; ui.tab = 'a_lire'; render(); openForm(books[0]); await pause(30);
    const c = $('#f_classif input[data-classif-dimension="sousGenres"][value="roman/policier"]');
    const r = [c && c.checked && c.closest('label').textContent.includes('Policier') ? 'Policier coché' : '?'];
    if (c) { c.click(); c.dispatchEvent(new Event('change', {bubbles: true})); }
    r.push(!(form.classif.sousGenres || []).includes('roman/policier') ? 'décoché' : '?');
    modalModifie = false; closeM(); await pause(250); return r.join('|');
  });
  await test('Deux fenêtres : le classement et les étiquettes se fusionnent valeur par valeur (rien d\'écrasé d\'un bloc)', 'deuil|sombre|famille|VAE,Hiver|aucun conflit', () => {
    const base = norm({id: 'f1', titre: 'F', classif: {themes: ['amour']}, etiquettes: ['VAE']});
    const mien = norm({...base, classif: {...base.classif, themes: ['deuil']}});                                    // (ici : Amour retiré, Deuil ajouté)
    const autre = norm({...base, classif: {...base.classif, themes: ['amour', 'famille'], ambiances: ['sombre']}, etiquettes: ['VAE', 'Hiver']});   // (ailleurs)
    const conflits = [], r = fusionLivre(mien, autre, base, conflits);
    return [r.classif.themes.includes('deuil') && !r.classif.themes.includes('amour') ? 'deuil' : r.classif.themes.join(','), r.classif.ambiances.join(','),
      r.classif.themes.includes('famille') ? 'famille' : '?', r.etiquettes.join(','), conflits.length ? 'conflit : ' + JSON.stringify(conflits) : 'aucun conflit'].join('|');
  });
  // (fin de la section 15)

  /* ---------- 16. Phase 2 : Bibliothèque (docs/premium/02-bibliotheque.md) ---------- */
  const enCours = (titre, extra) => fiche(titre, {statut: 'en_cours', pagesTotal: 256, pageActuelle: 112, dateDebut: today(), ...extra});
  await test('Statuts : une seule ligne (texte normal), 48 px de haut au moins, sans débordement', '1 ligne|48+|sans débordement', () => {
    books = [fiche('Nav', {statut: 'a_lire'})]; ui.tab = 'a_lire'; render();
    const nav = $('#main .library-nav'), bs = [...nav.querySelectorAll('[data-tab]')], n = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size;
    return [n + (n > 1 ? ' lignes' : ' ligne'), bs.every(b => b.getBoundingClientRect().height >= 47.5) ? '48+' : 'trop bas',
      bs.every(b => b.scrollWidth <= b.clientWidth + 1) && nav.scrollWidth <= nav.clientWidth + 1 ? 'sans débordement' : 'déborde'].join('|');
  });
  // (garde-fou : passe déjà avant le code ; il doit rester vert)
  await test('Statuts : texte agrandi de 30 %, rien n\'est coupé', 'rien de coupé', () => {
    books = [fiche('Nav', {statut: 'a_lire'})]; ui.tab = 'a_lire'; document.documentElement.style.fontSize = '130%';
    try { render(); const nav = $('#main .library-nav'), bs = [...nav.querySelectorAll('[data-tab]')];
      return bs.every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= innerWidth + 1) && nav.scrollWidth <= nav.clientWidth + 1 ? 'rien de coupé' : 'coupé';
    } finally { document.documentElement.style.fontSize = ''; render(); }
  });
  await test('Éditorial : compteur des statuts en texte doux, sans pastille ; sur le statut actif, couleur du statut', 'sans pastille|texte doux|actif : couleur du statut', () =>
    avecStyle('editorial', 'light', () => {
      books = [fiche('Nav', {statut: 'a_lire'})]; ui.tab = 'a_lire'; render();
      const n = $('#main .library-nav .subtab:not(.on) .n'), on = $('#main .library-nav .subtab.on'), sonde = document.createElement('i');
      sonde.style.color = 'var(--texte-doux)'; document.body.appendChild(sonde); const doux = getComputedStyle(sonde).color; sonde.remove();
      return [transparent(getComputedStyle(n).backgroundColor) ? 'sans pastille' : 'pastille', getComputedStyle(n).color === doux ? 'texte doux' : getComputedStyle(n).color,
        getComputedStyle(on.querySelector('.n')).color === getComputedStyle(on).color ? 'actif : couleur du statut' : 'actif : ' + getComputedStyle(on.querySelector('.n')).color].join('|');
    }));
  // (la grande carte est masquée pendant les tests, pour que les anciens tests comptent tous les livres ; on l'allume ici)
  const avecReprise = async fn => { REPRISE = true; try { return await fn(); } finally { REPRISE = false; render(); } };
  // (lot 33 : en Jardin, la grande carte allumée fait de l'onglet En cours l'accueil « Ce soir » ; les tests de la liste
  // classique — rangée des épinglés, liste sous la carte — la mesurent dans l'Éditorial, où elle n'a pas changé)
  const avecRepriseClassique = fn => avecStyle('editorial', 'light', () => avecReprise(fn));
  // (lot 32 : la tête du Jardin porte une ligne d'en-tête en plus — on mesure dans l'Éditorial et dans le Jardin)
  const editorialEtJardin = async fn => { const r = []; for (const st of ['editorial', 'jardin']) r.push(st + ':' + await avecStyle(st, 'light', fn)); return r.join('|'); };
  const ligneDeBoutons = acts => { const bs = [...acts.querySelectorAll('button')], n = new Set(bs.map(b => Math.round(b.getBoundingClientRect().top))).size;
    return (n > 1 ? n + ' lignes' : '1 ligne') + '|' + (acts.scrollWidth <= acts.clientWidth + 1 && bs.every(b => b.scrollWidth <= b.clientWidth + 1) ? 'sans débordement' : 'déborde'); };
  // (lot 34, D19 : en Jardin, « Reprendre » ouvre la session calme — son nom commence toujours par le mot visible)
  await test('Grande carte : 3 actions sur une ligne, sans débordement ; « Reprendre » nommé en entier', '1 ligne|sans débordement|Reprendre ma lecture : session calme', () => avecReprise(() => {
    books = [enCours('Les Années', {auteur: 'Annie Ernaux'}), enCours('Autre', {dateDebut: addDays(-9)})]; ui.tab = 'en_cours'; render();
    const acts = $('#resumeLecture .acts'), b = acts.querySelector('.btn.pri');
    return ligneDeBoutons(acts) + '|' + (b.getAttribute('aria-label') || b.textContent.trim());
  }));
  await test('Grande carte : titre très long, sans auteur ni pages → actions sur une ligne, carte compacte', '1 ligne|sans débordement|compacte', () => avecReprise(() => {
    books = [fiche('Une très longue histoire avec un titre interminable qui ne tient vraiment pas sur deux lignes', {statut: 'en_cours', auteur: '', dateDebut: today()})];
    ui.tab = 'en_cours'; render(); const c = $('#resumeLecture');
    return ligneDeBoutons(c.querySelector('.acts')) + '|' + (c.getBoundingClientRect().height <= 210 ? 'compacte' : Math.round(c.getBoundingClientRect().height) + ' px');
  }));
  await test('Un seul bouton rose par statut (le ＋ est à part)', 'en_cours 1|a_lire 0|lu 0|abandon 0', () => avecReprise(() => {
    books = [enCours('A1'), enCours('A2', {dateDebut: addDays(-5)}), fiche('L1'), fiche('L2'), fiche('Lu', {statut: 'lu', note: 4}), fiche('Ab', {statut: 'abandon'})];
    return Object.keys(STATUTS).map(k => { ui.tab = k; render(); return k + ' ' + document.querySelectorAll('#main .btn.pri').length; }).join('|');
  }));
  const filtresVides = {q: '', genre: '', genreConfirme: '', cat: '', own: '', sort: 'recent', sousGenre: '', theme: '', ambiance: '', etiquette: ''};
  const puces = () => [...document.querySelectorAll('#filtresActifs [data-retirer-filtre]')].map(b => b.dataset.retirerFiltre).join(',') || 'aucune';
  await test('Filtres actifs : une puce par critère, chacune retire son seul critère ; aucune puce sans filtre', 'aucune|genre,own,sort|genre,sort|aucune', () => {
    books = [fiche('F1', {genre: 'Fantasy', possession: 'a_moi'}), fiche('F2', {genre: 'Polar'})]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides); render();
    const r = [puces()]; Object.assign(ui, {genre: 'Fantasy', own: 'a_moi', sort: 'titre'}); render(); r.push(puces());
    $('#filtresActifs [data-retirer-filtre="own"]').click(); r.push(puces() + (ui.own === '' && ui.genre === 'Fantasy' ? '' : ' (mauvais critère retiré)'));
    $('#filtresActifs [data-effacer]').click(); r.push(puces()); Object.assign(ui, filtresVides); render(); return r.join('|');
  });
  await test('Filtres actifs : « Tout effacer » remet tout à zéro, recherche comprise', 'tout à zéro', () => {
    books = [fiche('F1', {genre: 'Fantasy'})]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides, {q: 'F1', genre: 'Fantasy', sort: 'auteur'}); render();
    $('#filtresActifs [data-effacer]').click(); const ok = Object.entries(filtresVides).every(([k, v]) => ui[k] === v);
    Object.assign(ui, filtresVides); render(); return ok ? 'tout à zéro' : JSON.stringify(ui);
  });
  await test('Filtres actifs : après un ×, le focus va au critère suivant, puis au titre « Filtres et tri »', 'sort|filtres', () => {
    books = [fiche('F1', {genre: 'Fantasy'})]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides, {genre: 'Fantasy', sort: 'titre'}); render();
    $('#filtresActifs [data-retirer-filtre="genre"]').click(); const a = document.activeElement.dataset.retirerFiltre;
    $('#filtresActifs [data-retirer-filtre="sort"]').click(); const b = document.activeElement.closest('#filtres') ? 'filtres' : document.activeElement.tagName;
    Object.assign(ui, filtresVides); render(); return a + '|' + b;
  });
  await test('Filtres actifs : un critère devenu sans objet ne laisse pas de puce', 'aucune', () => {
    books = [fiche('F1')]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides, {theme: 'theme-qui-n-existe-pas'}); render();
    const r = puces(); Object.assign(ui, filtresVides); render(); return r;
  });
  await test('Compte des livres : absent sans recherche ni filtre, présent et annoncé avec un filtre', 'absent|présent annoncé', () => {
    books = [fiche('F1', {genre: 'Fantasy'}), fiche('F2')]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides); render();
    const a = $('#list .resultat-compte') ? 'présent' : 'absent'; ui.genre = 'Fantasy'; render(); const c = $('#list .resultat-compte');
    const b = c && c.getAttribute('role') === 'status' && c.textContent.includes('1 livre') ? 'présent annoncé' : c ? c.textContent : 'absent';
    Object.assign(ui, filtresVides); render(); return a + '|' + b;
  });
  await test('Filtres actifs : bouton × de 40 px au moins, zone de toucher de 48 px', '40+|48', () => {
    books = [fiche('F1', {genre: 'Fantasy'})]; ui.tab = 'a_lire'; Object.assign(ui, filtresVides, {genre: 'Fantasy'}); render();
    const b = $('#filtresActifs [data-retirer-filtre]'), r = b.getBoundingClientRect(), apres = getComputedStyle(b, '::after');
    const res = [r.width >= 39.5 && r.height >= 39.5 ? '40+' : Math.round(r.width) + '×' + Math.round(r.height), Math.round(r.height + 2 * Math.max(0, -parseFloat(apres.top) || 0)) >= 48 ? '48' : 'zone ' + apres.top];
    Object.assign(ui, filtresVides); render(); return res.join('|');
  });
  await test('Bandeau de prêt : une seule ligne ; la date et « Voir » restent visibles même avec un très long titre', '1 ligne|date visible|Voir visible', () => {
    books = [fiche('Un titre vraiment très très long qui ne pourra jamais tenir sur la ligne du bandeau', {possession: 'emprunte', pretRetour: addDays(2)})]; paintNotice();
    // (lot V5, U4 : la « date » est devenue l'écart en jours, « à rendre dans 2 j » (.notice-quand) ; le titre est en gras)
    const bar = $('#notice'), q = bar.querySelector('.notice-quand'), d = q.getBoundingClientRect(), v = bar.querySelector('[data-open]').getBoundingClientRect(), br = bar.getBoundingClientRect();
    // (une ligne = le bandeau n'est pas plus haut que le bouton « Voir » et ses marges ; comparer la date et le bouton ne suffit pas :
    //  sans le code, le titre prend une ligne entière et la date se retrouve à côté de « Voir », sur la ligne suivante)
    const r = [br.height <= v.height + 20 ? '1 ligne' : 'plusieurs lignes',
      d.right <= v.left + 1 && d.left >= br.left && q.scrollWidth <= Math.ceil(d.width) + 1 ? 'date visible' : 'date coupée',
      v.right <= br.right + 1 ? 'Voir visible' : 'Voir caché'];
    books = []; paintNotice(); return r.join('|');
  });
  await test('Éditorial : bandeau sans bande colorée ; le bandeau d\'erreur garde la sienne ; les autres styles aussi', 'editorial prêt 0px|editorial erreur 4px|android prêt 4px', async () => {
    const r = [], mesurer = () => parseFloat(getComputedStyle($('#notice')).borderLeftWidth) + 'px';
    books = [fiche('Prêt', {possession: 'emprunte', pretRetour: addDays(2)})];
    await avecStyle('editorial', 'light', () => { paintNotice(); r.push('editorial prêt ' + mesurer()); Store.erreur = true; paintNotice(); r.push('editorial erreur ' + mesurer()); Store.erreur = false; });
    await avecStyle('android', 'light', () => { paintNotice(); r.push('android prêt ' + mesurer()); });
    books = []; paintNotice(); return r.join('|');
  });
  // (garde-fou : passe déjà avant le code ; il doit rester vert)
  await test('Bandeau d\'erreur : le texte reste entier, jamais coupé', 'entier', () => {
    Store.erreur = true; paintNotice(); const bar = $('#notice');
    const ok = !bar.classList.contains('court') && bar.textContent.includes('pas enregistrées') && bar.scrollWidth <= bar.clientWidth + 1;
    Store.erreur = false; paintNotice(); return ok ? 'entier' : 'coupé';
  });
  await test('Éditorial : titres repliables en texte normal (icône en texte doux) ; les autres styles gardent le rose', 'editorial texte|icône douce|android rose', async () => {
    books = [fiche('F1', {genre: 'Fantasy'})]; ui.tab = 'a_lire'; const r = [];
    const couleur = v => { const s = document.createElement('i'); s.style.color = v; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    await avecStyle('editorial', 'light', () => { render(); const s = $('#filtres summary');
      r.push(getComputedStyle(s).color === couleur('var(--texte)') ? 'editorial texte' : 'editorial ' + getComputedStyle(s).color,
        getComputedStyle(s.querySelector('.ico')).backgroundColor === couleur('var(--texte-doux)') ? 'icône douce' : 'icône ' + getComputedStyle(s.querySelector('.ico')).backgroundColor); });
    await avecStyle('android', 'light', () => { render(); r.push(getComputedStyle($('#filtres summary')).color === couleur('var(--accent)') ? 'android rose' : 'android autre'); });
    return r.join('|');
  });
  await test('Cartes : la puce de format dit « Numérique » ou « Audio »', '📱 Numérique|🎧 Audio', () => {
    books = [fiche('N', {format: 'numerique'}), fiche('Au', {format: 'audio'})]; ui.tab = 'a_lire'; ui.sort = 'titre'; render();
    const r = ['t-N', 't-Au'].map(id => [...document.querySelectorAll(`#list .card[data-id="${id}"] .chip`)].map(c => c.textContent.trim()).find(t => /Numérique|Audio|📱|🎧/.test(t)) || 'aucune').join('|');
    ui.sort = 'recent'; render(); return r;
  });
  await test('Cartes (liste) : titre coupé à 3 lignes au plus, le titre complet reste dans la page', '3 lignes au plus|titre complet', () => {
    const long = 'Une très longue histoire avec un titre interminable qui continue encore et encore sans jamais vouloir se terminer vraiment';
    books = [fiche(long)]; ui.tab = 'a_lire'; prefs.view = 'liste'; render(); const t = $('#list .card .t'), lh = parseFloat(getComputedStyle(t).lineHeight);
    return (t.getBoundingClientRect().height <= 3 * lh + 2 ? '3 lignes au plus' : Math.round(t.getBoundingClientRect().height / lh) + ' lignes') + '|' + (t.textContent.includes(long) ? 'titre complet' : 'titre tronqué');
  });
  // (objectif de la conception §3 ; le lanceur règle la hauteur à 860 px : on mesure par rapport à 780 ou 640 px)
  // (lot 33, D18 : en Jardin, l'accueil « Ce soir » remplace la liste — la grande carte entière et le titre « En pousse »
  // au-dessus de la barre ; à 412 px, la première rangée de plantes entière. Renvoie null hors de l'accueil.)
  const ceSoirTient = () => {
    if (!$('.ce-soir-jardin')) return null;
    const limite = (innerWidth >= 360 ? 780 : 640) - $('#tabs').getBoundingClientRect().height;
    const carte = $('#resumeLecture').getBoundingClientRect(), titre = $('.ce-soir-jardin .titre-s').getBoundingClientRect(), p = $('.parterre > li').getBoundingClientRect();
    return carte.bottom <= limite && titre.bottom <= limite && (innerWidth < 360 || p.bottom <= limite) ? 'visible'
      : `carte ${Math.round(carte.bottom)}, titre ${Math.round(titre.bottom)}, plantes ${Math.round(p.bottom)}, limite ${Math.round(limite)}`;
  };
  await test('Bibliothèque : avec un bandeau de prêt, le premier livre de la collection se voit sous la grande carte', 'editorial:visible|jardin:visible', () => editorialEtJardin(() => avecReprise(async () => {
    books = [enCours('Les Années', {auteur: 'Annie Ernaux'}), enCours('La Communauté de l\'anneau', {auteur: 'J. R. R. Tolkien', pagesTotal: 704, pageActuelle: 90, dateDebut: addDays(-10)}),
      fiche('Chanson douce', {possession: 'emprunte', pretRetour: addDays(2)})];
    ui.tab = 'en_cours'; Object.assign(ui, filtresVides); render(); paintNotice(); scrollTo(0, 0); await pause(50);
    const jv = ceSoirTient(); if (jv) { books = []; paintNotice(); return jv; }
    const barre = $('#tabs').getBoundingClientRect().height, c = $('#list .card').getBoundingClientRect(), limite = (innerWidth >= 360 ? 780 : 640) - barre;
    const ok = innerWidth >= 360 ? c.bottom <= limite : c.top + 48 <= limite;
    books = []; paintNotice(); return ok ? 'visible' : `haut ${Math.round(c.top)}, bas ${Math.round(c.bottom)}, limite ${Math.round(limite)}`;
  })));
  // (lot 2 de la refonte, 31/10/2026 : Bibliothèque — accueil vide dégagé, rappel compact, carte « En ce moment », épinglés, grille)
  const sousLaBarre = () => (innerWidth >= 360 ? 780 : 640) - $('#tabs').getBoundingClientRect().height;
  const seCoupent = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  await test('Lot 2 : bibliothèque vide, ni statuts, ni recherche, ni filtres ; « Ajouter mon premier livre » visible, hors du ＋ ; tout revient au premier livre', 'sans statuts|sans recherche|sans filtres|ajouter visible|hors du ＋|statuts revenus', async () => {
    const avant = books;
    try {
      books = []; ui.tab = 'en_cours'; render(); paintNotice(); scrollTo(0, 0); await pause(50);
      const vu = s => { const e = $(s); return e && e.getClientRects().length; }, b = $('#list [data-ajouter]').getBoundingClientRect();
      const r = [vu('#main .library-nav') ? 'statuts' : 'sans statuts', vu('#q') ? 'recherche' : 'sans recherche', vu('#filtres') ? 'filtres' : 'sans filtres',
        b.bottom <= sousLaBarre() ? 'ajouter visible' : `ajouter en ${Math.round(b.top)}-${Math.round(b.bottom)}, limite ${Math.round(sousLaBarre())}`,
        seCoupent(b, $('.fab').getBoundingClientRect()) ? 'sous le ＋' : 'hors du ＋'];
      books = [fiche('Premier', {statut: 'a_lire'})]; render(); r.push(vu('#main .library-nav') && vu('#q') ? 'statuts revenus' : 'statuts absents');
      return r.join('|');
    } finally { books = avant; render(); }
  });
  await test('Lot 2 : rappel de sauvegarde jamais coupé ; sur une ligne sous 360 px, phrase complète au-delà', 'jamais coupé|ligne', () => {
    const l0 = prefs.lastBackup, v0 = Store.vu, r = [];
    try {
      books = [fiche('R1'), fiche('R2'), fiche('R3')];
      for (const [last, vu] of [['', ''], [addDays(-20) + 'T08:00:00.000Z', new Date().toISOString()]]) {
        prefs.lastBackup = last || undefined; Store.vu = vu; paintNotice();
        const bar = $('#notice'), btn = bar.querySelector('[data-export="backup"]'), txt = [...bar.querySelectorAll('span')].filter(s => s.getClientRects().length);
        const entier = bar.scrollWidth <= bar.clientWidth + 1 && txt.every(s => s.scrollWidth <= s.clientWidth + 1);
        const uneLigne = bar.getBoundingClientRect().height <= btn.getBoundingClientRect().height + 20;
        const complet = /Pense à sauvegarder tes livres|depuis ta dernière sauvegarde/.test(txt.map(s => s.textContent).join(' '));
        r.push(!entier ? 'coupé' : innerWidth < 360 ? (uneLigne ? 'ok' : 'plusieurs lignes sous 360 px') : (complet ? 'ok' : 'phrase raccourcie au-delà de 360 px'));
      }
      return [r.every(x => x !== 'coupé') ? 'jamais coupé' : 'coupé', r.every(x => x === 'ok') ? 'ligne' : r.join(',')].join('|');
    } finally { prefs.lastBackup = l0; Store.vu = v0; books = []; paintNotice(); }
  });
  await test('Lot 2 : carte « En ce moment » avec ruban (Éditorial seulement) et temps restant à ton rythme ; rien d’inventé sans vitesse', 'ruban|≈ 1 h 20 à ton rythme|sans vitesse : rien|pas de ruban en android', () => avecReprise(async () => {
    const r = [];
    // (vitesse : 60 pages en 30 min = 120 pages/h ; il reste 160 pages → 1 h 20)
    books = [enCours('Rythme', {pagesTotal: 300, pageActuelle: 140, sessions: [{date: today(), de: 20, a: 80, min: 30}]})]; ui.tab = 'en_cours';
    await avecStyle('editorial', 'light', () => { render(); const ru = $('#resumeLecture .ruban'); r.push(ru && ru.getClientRects().length && ru.getBoundingClientRect().height > 0 ? 'ruban' : 'pas de ruban');
      const t = $('#resumeLecture .reste'); r.push(t ? t.textContent.trim() : 'pas de temps'); });
    books = [enCours('Sans vitesse', {pagesTotal: 300, pageActuelle: 140})]; render();
    r.push($('#resumeLecture .reste') ? 'inventé : ' + $('#resumeLecture .reste').textContent : 'sans vitesse : rien');
    await avecStyle('android', 'light', () => { render(); const ru = $('#resumeLecture .ruban'); r.push(ru && ru.getClientRects().length ? 'ruban en android' : 'pas de ruban en android'); });
    return r.join('|');
  }));
  await test('Lot 2 : rangée « Épinglés pour la suite » sous les lectures en cours ; absente sans épinglé et pendant une recherche ; ouvre la fiche', 'Les Années,Sapiens|256 p.|À lire · 3|couverture et titre entiers|absente sans épinglé|absente pendant une recherche|fiche ouverte', () => avecRepriseClassique(async () => {
    const a0 = prefs.animation, c0 = prefs.consultation; prefs.animation = 'aucune'; prefs.consultation = 'continue';
    try {
      books = [enCours('Lecture'), fiche('Les Années', {epingle: true, pagesTotal: 256, ajoute: addDays(-1)}), fiche('Sapiens', {epingle: true, ajoute: addDays(-2)}), fiche('Autre')];
      ui.tab = 'en_cours'; Object.assign(ui, filtresVides); render();
      const rangee = $('#main .epingles'), r = [rangee ? [...rangee.querySelectorAll('.mini-t')].map(t => t.textContent.trim()).join(',') : 'pas de rangée'];
      r.push(rangee ? /256\sp\./.test((rangee.querySelector('[data-open="t-Les Années"]') || {textContent: '?'}).textContent) ? '256 p.' : 'pages ?' : '?');
      r.push(rangee ? (rangee.querySelector('[data-tab="a_lire"]') || {textContent: 'pas de lien'}).textContent.trim() : '?');
      // (affichage : la couverture et le titre tiennent dans la rangée, rien n'est coupé)
      if (rangee) { const zone = rangee.querySelector('.rangee-livres').getBoundingClientRect(), m = rangee.querySelector('.mini'), cv = m.querySelector('.ph').getBoundingClientRect(), t = m.querySelector('.mini-t').getBoundingClientRect();
        r.push(cv.bottom <= zone.bottom + 1 && t.height > 0 && t.bottom <= zone.bottom + 1 ? 'couverture et titre entiers' : `coupé (zone ${Math.round(zone.height)}, couverture ${Math.round(cv.height)}, titre ${Math.round(t.height)})`); }
      books = [enCours('Lecture'), fiche('Autre')]; render(); r.push($('#main .epingles') ? 'présente sans épinglé' : 'absente sans épinglé');
      books = [enCours('Lecture'), fiche('Les Années', {epingle: true})]; ui.q = 'Lecture'; render(); r.push($('#main .epingles') ? 'présente pendant une recherche' : 'absente pendant une recherche');
      ui.q = ''; render(); $('#main .epingles [data-open]').click(); await pause(30);
      r.push(ficheEtat.id === 't-Les Années' ? 'fiche ouverte' : 'fiche : ' + ficheEtat.id);
      return r.join('|');
    } finally { if (ficheEtat.id) await fermerFiche(); prefs.animation = a0; prefs.consultation = c0; ui.q = ''; render(); }
  }));
  await test('Lot 2 : grille avec l’auteur et le nombre de pages sous le titre ; les pages restent visibles avec un long nom', 'Annie Ernaux · 256 p.|Voltaire · ≈ 148 p.|Sans Pages : Auteur Test|pages visibles', () => {
    const v0 = prefs.view;
    try {
      books = [fiche('Les Années', {auteur: 'Annie Ernaux', pagesTotal: 256}), fiche('Candide', {auteur: 'Voltaire', pagesTotal: 148, pagesSource: 'estimation'}), fiche('Sans Pages'),
        fiche('Long', {auteur: 'Antoine Marie Jean-Baptiste Roger de Saint-Exupéry', pagesTotal: 120})];
      ui.tab = 'a_lire'; prefs.view = 'grille'; ui.sort = 'titre'; render();
      const l = id => ($(`#list .gcard[data-id="${id}"] .g-sous`) || {textContent: '?'}).textContent.trim().replace(/ /g, ' ');   // (« 256 p. » est insécable depuis le lot V2)
      const s = $('#list .gcard[data-id="t-Long"] .g-sous'), p = s && [...s.querySelectorAll('*')].find(e => /120\sp\./.test(e.textContent) && !e.children.length);
      const vu = p && p.getBoundingClientRect().right <= s.getBoundingClientRect().right + 1 && p.scrollWidth <= p.clientWidth + 1;
      return [l('t-Les Années'), l('t-Candide'), 'Sans Pages : ' + l('t-Sans Pages'), vu ? 'pages visibles' : 'pages coupées'].join('|');
    } finally { prefs.view = v0; ui.sort = 'recent'; render(); }
  });
  await test('Lot 2 : avec le rappel de sauvegarde, le premier livre de la collection se voit sous la grande carte', 'editorial:visible|jardin:visible', () => editorialEtJardin(() => avecReprise(async () => {
    const l0 = prefs.lastBackup;
    try {
      prefs.lastBackup = undefined;
      // (avec une vitesse connue : la ligne « ≈ … à ton rythme » s'ajoute à la carte, cas le plus haut)
      books = [enCours('Les Années', {auteur: 'Annie Ernaux', sessions: [{date: today(), de: 20, a: 80, min: 30}]}), enCours('La Communauté de l\'anneau', {auteur: 'J. R. R. Tolkien', pagesTotal: 704, pageActuelle: 90, dateDebut: addDays(-10)}), fiche('Bel-Ami'), fiche('Candide')];
      ui.tab = 'en_cours'; Object.assign(ui, filtresVides); render(); paintNotice(); scrollTo(0, 0); await pause(50);
      const jv = ceSoirTient(); if (jv) return $('#notice').hidden ? 'pas de rappel' : jv;
      const c = $('#list .card').getBoundingClientRect(), limite = sousLaBarre(), ok = innerWidth >= 360 ? c.bottom <= limite : c.top + 48 <= limite;
      return $('#notice').hidden ? 'pas de rappel' : !$('#resumeLecture .reste') ? 'pas de temps restant' : ok ? 'visible' : `haut ${Math.round(c.top)}, bas ${Math.round(c.bottom)}, limite ${Math.round(limite)}`;
    } finally { prefs.lastBackup = l0; books = []; paintNotice(); }
  })));
  // (lot 3 de la refonte, 31/10/2026 : Découvrir — tuiles des rayons et des durées, pistes en rangée, un seul rose, textes courts, états partiels)
  const piste = (titre, extra) => ({titre, auteur: 'Auteur', themeNom: 'Roman', themeE: '📖', sourceNom: 'Primé', raison: 'Pour le test', theme: 'roman', pagesTotal: 200, ...extra});
  const selectionTest = n => ({mois: moisCle(), vu: true, items: ['La Mer des Sargasses', 'Le Consentement', 'Les Furtifs', 'Sapiens', 'L’Anomalie'].slice(0, n).map(t => piste(t))});
  const avecDecouvrir = async fn => {
    const s0 = prefs.selection, r0 = {...rech}, t0 = lastTirage, o0 = ui.rechOuvert, vrai = Recherche.parTheme, b0 = books, p0 = ui.pisteOuverte;
    try { ui.tab = 'decouvrir'; return await fn(); }
    finally { prefs.selection = s0; Object.assign(rech, r0, {etat: '', res: [], inconnus: []}); lastTirage = t0; ui.rechOuvert = o0; Recherche.parTheme = vrai; books = b0; ui.pisteOuverte = p0; ui.tab = 'en_cours'; render(); }
  };
  const faux = recu => async o => { recu.push(JSON.stringify({cat: o.cat, max: o.max})); return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
  await test('Lot 3 : « politique, moins de 200 pages » en 2 gestes, dans un sens comme dans l’autre ; la recherche s’ouvre', '{"cat":"politique","max":200}|ouverte|{"cat":"politique","max":200}', () => avecDecouvrir(async () => {
    const recu = []; Recherche.parTheme = faux(recu); prefs.selection = selectionTest(5);
    Object.assign(rech, {cat: '', sous: '', texte: '', classif: [], max: 0, etat: '', par: 'theme'}); ui.rechOuvert = false; render();
    const geste = s => { const b = $(s); if (!b) throw new Error('introuvable : ' + s); b.click(); };
    geste('[data-temps="200"]'); geste('[data-rayon="politique"]'); await pause(30);
    const r = [recu.pop() || 'rien envoyé', $('.discover-search').open ? 'ouverte' : 'fermée'];
    Object.assign(rech, {cat: '', max: 0, etat: ''}); ui.rechOuvert = false; render();
    geste('[data-rayon="politique"]'); await pause(30); geste('[data-temps="200"]'); await pause(30);
    r.push(recu.pop() || 'rien envoyé'); return r.join('|');
  }));
  await test('Lot 3 : la recherche reste ouverte quand on y choisit un thème ou une longueur', 'ouverte|ouverte', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); Object.assign(rech, {cat: '', par: 'theme', etat: ''}); render();
    const d = $('.discover-search'); d.open = true; d.dispatchEvent(new Event('toggle')); await pause(20);
    $('#rq_cats [data-v]').click(); const a = $('.discover-search').open ? 'ouverte' : 'fermée';
    $('#rq_max [data-v="300"]').click(); const b = $('.discover-search').open ? 'ouverte' : 'fermée';
    return a + '|' + b;
  }));
  await test('Lot 3 : un seul bouton rose dans Découvrir (le « À lire » de la sélection) ; tirage et pistes sans rose', 'sélection : 1 rose|tirage : 0 rose', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); lastTirage = [piste('Tiré 1'), piste('Tiré 2')]; ui.rechOuvert = false; render();
    const roses = s => { const l = [...document.querySelectorAll(s + ' .btn.pri')].filter(b => b.checkVisibility ? b.checkVisibility() : b.getClientRects().length); return l.length + ' rose' + (l.length > 1 ? ' (' + l.map(b => b.id || b.textContent.trim()).join(', ') + ')' : ''); };
    return ['sélection : ' + roses('#main'), 'tirage : ' + roses('#dc_res')].join('|');
  }));
  await test('Lot 3 : « Encore 4 pistes » en rangée de couvertures ; le détail s’ouvre au toucher, avec ses actions', 'rangée 4|Le Consentement,Les Furtifs,Sapiens,L’Anomalie|détail fermé|détail : Le Consentement|actions', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); render();
    const minis = [...document.querySelectorAll('.discover-more .mini')], r = ['rangée ' + minis.length, minis.map(m => (m.querySelector('.mini-t') || {textContent: '?'}).textContent.trim()).join(',')];
    r.push($('.discover-more .sug') ? 'détail ouvert' : 'détail fermé');
    if (minis[0]) minis[0].click(); const d = $('.discover-more .sug');
    r.push(d ? 'détail : ' + d.querySelector('.t').textContent.trim() : 'pas de détail');
    r.push(d && d.querySelector('[data-sug="add"]') && d.querySelector('[data-sug="non"]') && minis[0] && $('.discover-more .mini').getAttribute('aria-expanded') === 'true' ? 'actions' : 'actions manquantes');
    return r.join('|');
  }));
  await test('Lot 3 : textes courts ; le détail est derrière « Comment ça marche ? », replié', 'tirage replié|recherche replié|titre simple', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); prefs.tirage = 'perso'; render();
    const c = s => { const d = $(s + ' details.comment'); return d && !d.open && /\S/.test(d.textContent) ? 'replié' : d ? 'ouvert' : 'absent'; };
    const tirageCourt = !/restent sur ton téléphone/.test(($('.discover-envies .sous-titre') || {textContent: ''}).textContent) || ($('.discover-envies details.comment') || {textContent: ''}).textContent.includes('restent sur ton téléphone');
    // (le titre de « Comment ça marche ? » ne reprend pas le « Ouvrir / Réduire » du titre de la recherche)
    const apres = getComputedStyle($('#rechPanel details.comment summary'), '::after').content;
    return ['tirage ' + (tirageCourt ? c('.discover-envies') : 'texte long visible'), 'recherche ' + c('#rechPanel'), /Ouvrir|Réduire/.test(apres) ? 'titre : ' + apres : 'titre simple'].join('|');
  }));
  await test('Lot 3 : sélection impossible ou partielle → un message clair', 'aucune : catalogues|partielle : 3 pistes sur 5', () => avecDecouvrir(async () => {
    const vrai = Recherche.selection, r = [];
    try {
      prefs.selection = null; Recherche.selection = async () => []; await genSelection(true); renderDecouvrir();
      r.push(/catalogues? (ne répond|n.ont pas répondu)/.test($('.discover-selection').textContent) ? 'aucune : catalogues' : 'aucune : rien dit');
      Recherche.selection = async () => [piste('Un'), piste('Deux'), piste('Trois')]; await genSelection(true); renderDecouvrir();
      r.push(/3 pistes sur 5/.test($('.discover-selection').textContent) ? 'partielle : 3 pistes sur 5' : 'partielle : rien dit');
    } finally { Recherche.selection = vrai; }
    return r.join('|');
  }));
  await test('Lot 3 : « Dans mes livres, par ambiance » mène aux livres à lire de cette ambiance ; absent sans ambiance', 'Mélancolique (1)|À lire filtré|absent sans ambiance', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5);
    books = [fiche('Triste', {classif: {genre: 'roman', sousGenres: [], themes: [], ambiances: ['melancolique']}}), fiche('Autre')]; render();
    const b = $('[data-ambiance="melancolique"]'), r = [b ? b.textContent.replace(/\s+/g, ' ').trim() : 'pas d’entrée'];
    if (b) b.click(); r.push(ui.tab === 'a_lire' && ui.ambiance === 'melancolique' && document.querySelectorAll('#list .card').length === 1 ? 'À lire filtré' : `onglet ${ui.tab}, filtre ${ui.ambiance}`);
    ui.ambiance = ''; books = [fiche('Autre')]; ui.tab = 'decouvrir'; render(); r.push($('[data-ambiance]') ? 'présent sans ambiance' : 'absent sans ambiance');
    return r.join('|');
  }));
  await test('Lot 3 : glisser le doigt sur une rangée (pistes, épinglés) la fait défiler sans changer d’espace', 'pistes : reste|épinglés : reste', () => avecDecouvrir(async () => {
    const glisser = el => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, t = (cx) => new Touch({identifier: 1, target: el, clientX: cx, clientY: y});
      el.dispatchEvent(new TouchEvent('touchstart', {bubbles: true, touches: [t(x)], changedTouches: [t(x)]}));
      el.dispatchEvent(new TouchEvent('touchend', {bubbles: true, touches: [], changedTouches: [t(x - 150)]})); };
    const r = [];
    prefs.selection = selectionTest(5); ui.tab = 'decouvrir'; render(); glisser($('.discover-more .mini') || $('#selRow .sug')); await pause(40);
    r.push('pistes : ' + (ui.tab === 'decouvrir' ? 'reste' : 'va vers ' + ui.tab));
    await avecRepriseClassique(async () => { books = [enCours('Lecture'), fiche('Épinglé', {epingle: true})]; ui.tab = 'en_cours'; render(); glisser($('#main .epingles .mini')); await pause(40);
      r.push('épinglés : ' + (ui.tab === 'en_cours' ? 'reste' : 'va vers ' + ui.tab)); });
    return r.join('|');
  }));
  await test('Lot 3 : les rangées de livres tiennent sur une ligne et défilent ; le titre « Mon bilan » des Stats garde sa mise en page', 'pistes : 1 ligne|épinglés : 1 ligne|bilan intact', () => avecDecouvrir(async () => {
    const uneLigne = l => new Set(l.map(m => Math.round(m.getBoundingClientRect().top))).size === 1 ? '1 ligne' : 'plusieurs lignes';
    const r = []; prefs.selection = selectionTest(5); ui.tab = 'decouvrir'; render();
    r.push('pistes : ' + uneLigne([...document.querySelectorAll('.discover-more .mini')]));
    await avecRepriseClassique(async () => { books = [enCours('Lecture'), ...['A', 'B', 'C', 'D', 'E'].map(t => fiche('Épinglé ' + t, {epingle: true}))]; ui.tab = 'en_cours'; render();
      r.push('épinglés : ' + uneLigne([...document.querySelectorAll('#main .epingles .mini')])); });
    // (« .rangee » est aussi la mise en page du titre « Mon bilan » : le lot 2 lui avait donné, par erreur, un défilement et des marges)
    const h = document.createElement('h3'); h.className = 'rangee'; document.body.appendChild(h); const st = getComputedStyle(h);
    r.push(st.overflowX === 'visible' && st.flexWrap === 'wrap' && st.paddingTop === '0px' ? 'bilan intact' : `bilan : ${st.overflowX}, ${st.flexWrap}, ${st.paddingTop}`); h.remove();
    return r.join('|');
  }));
  // (lot 5 de la refonte, 31/10/2026 : finitions — défis résumés, icônes dessinées, styles en cartes, signets étiquetés, couvertures, accessibilité)
  const emojisVisibles = root => { const out = []; if (!root) return out; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const el = n.parentElement; if (!el || !el.checkVisibility() || parseFloat(getComputedStyle(el).fontSize) < 1) continue;
      const m = n.textContent.match(/\p{Extended_Pictographic}/gu); if (m) out.push(...m); } return out; };
  const lecturesStats = () => ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit'].map((t, i) => fiche('Stat ' + t, {statut: 'lu', note: 4, pagesTotal: i ? 250 : 600,
    dateDebut: addDays(-30 * i - 9), dateFin: addDays(-30 * i - 2), classements: i % 2 ? [B('686', '320')] : []}));
  const avecStats = async fn => { const b0 = books, g0 = goal; try { books = lecturesStats(); ui.tab = 'stats'; render(); scrollTo(0, 0); return await fn(); } finally { books = b0; goal = g0; ui.tab = 'en_cours'; render(); } };
  await test('Lot 5 : défis résumés — « N sur M réussis », les 3 prochains (les plus avancés, sans les réussis), tous derrière « Voir tous les défis » replié', 'résumé|3 prochains|replié|tous', () => avecStats(async () => {
    const y = new Date().getFullYear(), d = defis(y), ok = d.filter(x => x.ok).length;
    const attendus = d.filter(x => !x.ok).sort((a, b) => b.n / b.but - a.n / a.but).slice(0, 3).map(x => x.id).join(',');
    const p = $('#main .defis'); if (!p) return 'pas de panneau .defis';
    const r = [p.textContent.includes(`${ok} sur ${d.length} réussis`) ? 'résumé' : 'résumé absent'];
    const prochains = [...p.querySelectorAll('.defis-prochains [data-defi]')].map(x => x.dataset.defi).join(',');
    r.push(prochains === attendus ? '3 prochains' : `prochains ${prochains} au lieu de ${attendus}`);
    const tous = p.querySelector('details.defis-tous');
    r.push(tous && !tous.open ? 'replié' : tous ? 'ouvert' : 'pas de « Voir tous »');
    r.push(tous && tous.querySelectorAll('[data-defi]').length === d.length && /Voir tous les défis/.test(tous.querySelector('summary').textContent) ? 'tous' : 'défis manquants');
    return r.join('|');
  }));
  await test('Lot 5 : Stats — « Voir tous les défis » arrive avant 2 écrans, avec le rappel de sauvegarde', 'avant 2 écrans', () => avecStats(async () => {
    const l0 = prefs.lastBackup;
    try {
      prefs.lastBackup = undefined; paintNotice(); render(); scrollTo(0, 0);
      const s = $('#main .defis-tous > summary'); if (!s) return 'pas de « Voir tous »';
      const ecran = innerWidth < 340 ? 640 : 780, bas = s.getBoundingClientRect().bottom + scrollY;
      return $('#notice').hidden ? 'pas de rappel' : bas <= 2 * ecran ? 'avant 2 écrans' : `bas à ${Math.round(bas)}, limite ${2 * ecran}`;
    } finally { prefs.lastBackup = l0; paintNotice(); }
  }));
  await test('Lot 5 : Éditorial — aucun émoji visible dans Stats, dans Réglages ni dans le rappel de sauvegarde', 'Stats : aucun|Réglages : aucun|rappel : aucun', () => avecStyle('editorial', 'light', () => avecStats(async () => {
    const l0 = prefs.lastBackup;
    try {
      prefs.lastBackup = undefined; paintNotice();
      const r = ['Stats : ' + (emojisVisibles($('#main')).join('') || 'aucun')];
      openSettings(); await pause(30); r.push('Réglages : ' + (emojisVisibles($('#modal')).join('') || 'aucun')); closeM(); await pause(30);
      r.push('rappel : ' + (emojisVisibles($('#notice')).join('') || 'aucun'));
      return r.join('|');
    } finally { prefs.lastBackup = l0; paintNotice(); }
  })));
  await test('Lot 5 : chaque défi a une icône dessinée (hors Carnet) ; le style Carnet garde ses émojis', 'dessinées|Carnet : émojis', async () => {
    const r = [];
    await avecStyle('editorial', 'light', () => avecStats(async () => {
      const n = document.querySelectorAll('#main .defis [data-defi]').length, ic = [...document.querySelectorAll('#main .defis [data-defi] .ico')];
      const sans = ic.filter(i => !getComputedStyle(i).getPropertyValue('--ico').includes('svg')).map(i => i.className);
      r.push(n && ic.length === n && !sans.length ? 'dessinées' : `${ic.length} icônes pour ${n} défis, sans dessin : ${sans.join(' ')}`);
    }));
    await avecStyle('carnet', 'light', () => avecStats(async () => { const e = emojisVisibles($('#main .defis')); r.push(e.length >= 3 ? 'Carnet : émojis' : `Carnet : ${e.length} émoji`); }));
    return r.join('|');
  });
  // (Découvrir A : les puces deviennent l'étiquette « mois · source » et la ligne « thème · pages »)
  await test('Lot 5 : Découvrir — étiquette et ligne de la carte sans émoji en Éditorial ; le Carnet les garde', 'Éditorial : aucun|Carnet : 🏆📖', async () => {
    const r = [];
    for (const [s, nom] of [['editorial', 'Éditorial'], ['carnet', 'Carnet']]) await avecStyle(s, 'light', () => avecDecouvrir(async () => {
      prefs.selection = {...selectionTest(1), items: [piste('Puce', {themeE: '📖', sourceNom: '🏆 Primé'})]}; render();
      r.push(nom + ' : ' + ([...new Set([...emojisVisibles($('.discover-lead .sug-kicker')), ...emojisVisibles($('.discover-lead .sug-ligne'))])].join('') || 'aucun'));
    }));
    return r.join('|');
  });
  await test('Lot 5 : Réglages — 5 cartes de style séparées, arrondies, le choix actif annoncé ; choisir change le style', 'séparées|arrondies|annoncé|change', () => avecStyle('editorial', 'light', async () => {
    openSettings(); await pause(30);
    const b = [...document.querySelectorAll('#st_style [data-st]')], R = b.map(x => x.getBoundingClientRect()), r = [];
    const ecart = (a, c) => Math.max(c.left - a.right, a.left - c.right, c.top - a.bottom, a.top - c.bottom);
    r.push(b.length === 5 && R.every((a, i) => R.every((c, j) => i === j || ecart(a, c) >= 4)) ? 'séparées' : 'collées');
    r.push(b.length && b.every(x => parseFloat(getComputedStyle(x).borderTopLeftRadius) >= 8 && parseFloat(getComputedStyle(x).borderBottomRightRadius) >= 8) ? 'arrondies' : 'angles droits');
    const p = b.map(x => x.getAttribute('aria-pressed')).join(',');
    r.push(p === b.map(x => String(x.dataset.st === 'editorial')).join(',') ? 'annoncé' : 'aria-pressed : ' + p);
    b.find(x => x.dataset.st === 'actuel').click(); await pause(20);
    r.push(document.documentElement.dataset.style === 'actuel' && $('#st_style [data-st="actuel"]').getAttribute('aria-pressed') === 'true' ? 'change' : 'style ' + document.documentElement.dataset.style);
    closeM(); await pause(30); return r.join('|');
  }));
  await test('Lot 5 : Feuilleter — chaque signet porte une lettre visible ; son nom complet reste pour le lecteur d’écran', 'P,N,C,H,I|noms complets', async () => {
    const b0 = books; books = [fiche('Signets', {statut: 'lu', dateFin: addDays(-2), note: 4, notes: [{texte: 'Une note', date: addDays(-2)}], citations: [{texte: 'Une citation', page: 3, date: addDays(-2)}]})];
    try {
      ouvrirFiche(books[0].id); await pause(80); $('#livre [data-fiche="ouvrir-carnet"]').click(); await pause(200);
      const s = [...document.querySelectorAll('.lv-signets button')];
      const lettres = s.map(x => { const l = x.querySelector('.lettre'); return l && l.checkVisibility() && l.getBoundingClientRect().right <= innerWidth ? l.textContent.trim() : '?'; }).join(',');
      return (lettres || 'aucun signet') + '|' + (s.length && s.every(x => /^\S.{2,}, page \d+$/.test(x.getAttribute('aria-label') || '')) ? 'noms complets' : 'noms manquants');
    } finally { await fermerFiche(); books = b0; render(); }
  });
  // (correctif du 31/10 : le lot 5 réduisait le titre par un style écrit dans la page, interdit par la règle des écrans)
  await test('Lot 5 : couvertures générées — un mot long réduit le titre sans style écrit dans la page', 'sans style|réduit', () => avecStyle('editorial', 'light', async () => {
    const d = document.createElement('div'); document.body.appendChild(d);
    try {
      const taille = t => { const g = couvGeneree({titre: t, auteur: 'Auteur'}); d.innerHTML = `<div style="width:92px;aspect-ratio:2/3;position:relative" class="ph ${g.classes}">${g.html}</div>`;
        const el = d.querySelector('.cg-titre'); return [el.hasAttribute('style'), parseFloat(getComputedStyle(el).fontSize)]; };
      const [styleLong, long] = taille('Anticonstitutionnellement'), [, court] = taille('Le Lys');
      return [styleLong ? 'style en ligne' : 'sans style', long < court ? 'réduit' : `pas réduit (${long} / ${court})`].join('|');
    } finally { d.remove(); }
  }));
  await test('Lot 5 : couvertures générées — aucun mot du titre coupé en deux (92 et 130 px de large)', [], () => avecStyle('editorial', 'light', async () => {
    const fautes = [], titres = ['Le Consentement', 'Les Bienveillantes', 'Réparer les vivants', 'Extension du domaine de la lutte', 'L’Insoutenable Légèreté de l’être', 'Les Furtifs'];
    const d = document.createElement('div'); document.body.appendChild(d);
    try {
      for (const l of [92, 130]) for (const t of titres) {
        const g = couvGeneree({titre: t, auteur: 'Auteur'});
        d.innerHTML = `<div style="width:${l}px;aspect-ratio:2/3;position:relative" class="ph ${g.classes}">${g.html}</div>`;
        const el = d.querySelector('.cg-titre'), txt = el && el.firstChild;
        if (!txt || !el.checkVisibility()) { fautes.push(`${l} px : titre absent`); continue; }
        for (const m of t.matchAll(/\S+/g)) {
          const rg = document.createRange(); rg.setStart(txt, m.index); rg.setEnd(txt, m.index + m[0].length);
          if (new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size > 1) fautes.push(`${l} px : « ${m[0]} » coupé`);
        }
      }
    } finally { d.remove(); }
    return fautes;
  }));
  await test('Lot 5 : texte agrandi de 30 % — Stats et Réglages sans débordement ni bouton coupé', 'Stats : rien ne dépasse|Réglages : rien ne dépasse', () => avecStyle('editorial', 'light', () => avecStats(async () => {
    const html = document.documentElement, f0 = html.style.fontSize, r = [];
    const coupes = root => [...root.querySelectorAll('button, .tile, h3, summary')].filter(e => e.checkVisibility() && e.scrollWidth > e.clientWidth + 1 && !['auto', 'scroll'].includes(getComputedStyle(e).overflowX)).map(e => e.textContent.trim().slice(0, 24));
    try {
      html.style.fontSize = '130%'; render(); await pause(30);
      const c1 = coupes($('#main')); r.push(html.scrollWidth <= innerWidth && !c1.length ? 'Stats : rien ne dépasse' : `Stats : page ${html.scrollWidth}, coupés ${c1.join(' / ')}`);
      openSettings(); await pause(30); const m = $('#modal'), c2 = coupes(m);
      r.push(m.scrollWidth <= m.clientWidth + 1 && !c2.length ? 'Réglages : rien ne dépasse' : `Réglages : ${m.scrollWidth}/${m.clientWidth}, coupés ${c2.join(' / ')}`); closeM(); await pause(30);
    } finally { html.style.fontSize = f0; render(); }
    return r.join('|');
  })));
  await test('Lot 5 : lecteur d’écran — chaque bouton, champ ou volet visible de Stats et de Réglages a un nom', 'Stats : tous nommés|Réglages : tous nommés', () => avecStats(async () => {
    const sansNom = root => [...root.querySelectorAll('button, summary, select, input')].filter(e => e.checkVisibility() && !((e.getAttribute('aria-label') || '').trim() || e.textContent.trim() || e.getAttribute('title') || (e.labels && e.labels.length) || e.getAttribute('placeholder'))).map(e => e.outerHTML.slice(0, 70));
    const r = [], s = sansNom($('#main')); r.push(s.length ? 'Stats : ' + s.join(' / ') : 'Stats : tous nommés');
    openSettings(); await pause(30); const g = sansNom($('#modal')); r.push(g.length ? 'Réglages : ' + g.join(' / ') : 'Réglages : tous nommés'); closeM(); await pause(30);
    return r.join('|');
  }));
  await test('Lot 5 : la touche retour ferme les Réglages (pas l’appli)', 'fermés', async () => {
    await pause(1200);   // (les « retours » laissés en route par les tests précédents sont faits)
    openSettings(); await pause(50); history.back(); await pause(250); return $('#ov').classList.contains('show') ? 'encore ouverts' : 'fermés';
  });
  // (stabilisation, 31/10/2026 : touche retour quand une fenêtre se rouvre aussitôt ; fondu de fermeture juste après une ouverture)
  await test('Stabilité : fermer une fenêtre puis en rouvrir une aussitôt — la nouvelle garde son étape « retour », et le retour la ferme', 'étape gardée|fermée', async () => {
    await pause(1200);   // (les « retours » laissés en route par les tests précédents sont faits)
    history.replaceState({repere: 'avant'}, '');
    openSettings(); await pause(300); closeM(); await Promise.resolve(); openSettings(); await pause(500);
    const st = history.state || {};
    // (sans étape, un « retour » sortirait de la page de tests : on ne l'essaie pas)
    if (!st.fenetre) { retourPose = false; closeM(); await pause(300); return 'étape perdue (état ' + JSON.stringify(history.state) + ', en attente ' + retourIgnore + ')'; }
    history.back(); await pause(500);
    return 'étape gardée|' + ($('#ov').classList.contains('show') ? 'encore ouverte' : (history.state || {}).repere === 'avant' ? 'fermée' : 'fermée, mais état ' + JSON.stringify(history.state));
  });
  await test('Stabilité : fermer la fiche pile quand l’ouverture (moins d’animations) vient de finir garde le fondu de fermeture', 'fondu', () => avecAnim('complete', async () => {
    carteAnim().querySelector('.t').click(); await attendre(() => effets().length, 500);
    effets().forEach(a => a.finish());   // (l'ouverture vient de finir ; son rangement n'est pas encore passé)
    fermerFiche(); const f = effets();
    const ok = f.length === 1 && f[0].effect.target.id === 'livreOv' && +f[0].effect.getKeyframes()[0].opacity === 1;
    await attendre(() => !effets().length, 1000); return ok ? 'fondu' : `pas de fondu (${f.length} effet)`;
  }, true));
  // (Découvrir, direction A, 31/10/2026 : recherche en haut, carte éditoriale, envies, pile, autre sélection, Vus récemment, hors ligne)
  const horsLigneSimule = async fn => {
    Object.defineProperty(navigator, 'onLine', {get: () => false, configurable: true}); dispatchEvent(new Event('offline'));
    try { return await fn(); } finally { delete navigator.onLine; dispatchEvent(new Event('online')); }
  };
  const avecVus = async fn => { const v0 = prefs.vus, p0 = prefs.proposes; try { prefs.vus = []; return await fn(); } finally { prefs.vus = v0; prefs.proposes = p0; savePrefs(); } };
  const textes = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(',');
  // (le champ suit le mode choisi — sujet, auteur ou titre — comme la recherche détaillée : les catalogues les cherchent séparément)
  await test('Découvrir A : le champ de recherche, en haut, lance la recherche (sujet, ou auteur au choix) et ouvre la recherche détaillée', '{"cat":"","texte":"lumière du nord"}|{"auteur":"Annie Ernaux"}|ouverte|en haut', () => avecDecouvrir(async () => {
    const recu = []; Recherche.parTheme = async o => { recu.push(JSON.stringify({cat: o.cat, texte: o.texte, auteur: o.auteur})); return {res: [], inconnus: [], trop: 0, examines: 0, fin: true, erreur: ''}; };
    prefs.selection = selectionTest(5); Object.assign(rech, {cat: '', sous: '', texte: '', classif: [], etat: '', par: 'theme'}); ui.rechOuvert = false; render();
    const f = $('#dq'); if (!f) return 'pas de champ';
    f.value = 'lumière du nord'; f.form.requestSubmit(); await pause(30); const r = [recu.pop() || 'rien envoyé'];
    const a = $('.discover-q [data-dqpar="auteur"]'); if (!a) return r[0] + '|pas de choix « auteur »';
    a.click(); $('#dq').value = 'Annie Ernaux'; $('#dq').form.requestSubmit(); await pause(30); r.push(recu.pop() || 'rien envoyé');
    const haut = $('#dq').compareDocumentPosition($('.discover-selection')) & Node.DOCUMENT_POSITION_FOLLOWING;
    rech.par = 'theme'; prefs.rechPar = 'theme'; savePrefs();
    return [...r, $('.discover-search').open ? 'ouverte' : 'fermée', haut ? 'en haut' : 'plus bas'].join('|');
  }));
  await test('Découvrir A : « Ce soir » montre tout de suite les livres de la pile de 100 pages au plus, même hors ligne ; chacun ouvre sa fiche', 'Le Petit Prince,La Place|hors ligne : Le Petit Prince,La Place|ouvre la fiche', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); rech.max = 0;
    books = [fiche('Guerre et Paix', {pagesTotal: 1600}), fiche('La Place', {pagesTotal: 100}), fiche('Le Petit Prince', {pagesTotal: 96}), fiche('Sans pages', {pagesTotal: 0}), fiche('Lu court', {statut: 'lu', pagesTotal: 50})];
    render(); const b = $('[data-temps="100"]'); if (!b) return 'pas de tuile'; b.click(); await pause(20);
    const r = [textes('.discover-pile .mini-t') || 'rien'];
    await horsLigneSimule(async () => { render(); r.push('hors ligne : ' + (textes('.discover-pile .mini-t') || 'rien')); });
    const m = $('.discover-pile .mini'); r.push(m && m.dataset.open === 't-Le Petit Prince' ? 'ouvre la fiche' : 'pas de lien vers la fiche');
    rech.max = 0; prefs.rechMax = 0; savePrefs(); return r.join('|');
  }));
  await test('Découvrir A : « Surprends-moi » lance le tirage choisi (d’après mes lectures ou au hasard)', 'perso|hasard', () => avecDecouvrir(async () => {
    const t0 = prefs.tirage, vp = drawPerso, vo = drawOnline, appels = [];
    drawPerso = async () => { appels.push('perso'); }; drawOnline = async () => { appels.push('hasard'); };
    try {
      prefs.selection = selectionTest(5);
      for (const mode of ['perso', 'hasard']) { prefs.tirage = mode; render(); const b = $('[data-envie="surprise"]'); if (!b) return 'pas de tuile'; b.click(); await pause(10); }
      return appels.join('|');
    } finally { drawPerso = vp; drawOnline = vo; prefs.tirage = t0; savePrefs(); }
  }));
  const nomMois = (m => m[0].toUpperCase() + m.slice(1))(new Date().toLocaleDateString('fr-FR', {month: 'long'}));
  await test('Découvrir A : carte de la sélection — étiquette « mois · source », ligne « thème · pages », plus de puces « Thème · » ni « Source · »', `${nomMois} · Primé|Roman · 200 p.|sans puces`, () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); render();
    const k = $('.discover-lead .sug-kicker'), l = $('.discover-lead .sug-ligne');
    return [k ? k.innerText.replace(/\s+/g, ' ').trim() : 'pas d’étiquette', l ? l.innerText.replace(/\s+/g, ' ').trim() : 'pas de ligne',
      /Thème ·|Source ·/.test($('.discover-selection').textContent) ? 'puces encore là' : 'sans puces'].join('|');
  }));
  await test('Découvrir A : « Une autre sélection » en prépare une nouvelle ; les livres remplacés restent dans Vus récemment', 'bouton|Nouveau 1|vus : La Mer des Sargasses,Le Consentement', () => avecDecouvrir(() => avecVus(async () => {
    const vrai = Recherche.selection;
    try {
      prefs.selection = selectionTest(2); render();
      const b = $('#selautre'); if (!b) return 'pas de bouton';
      Recherche.selection = async () => [piste('Nouveau 1'), piste('Nouveau 2')];
      b.click(); await pause(60);
      return ['bouton', (prefs.selection.items[0] || {}).titre, 'vus : ' + (textes('.discover-vus .mini-t') || 'rien')].join('|');
    } finally { Recherche.selection = vrai; }
  })));
  await test('Découvrir A : Vus récemment — 20 au plus, les plus récents d’abord ; toucher ouvre la carte avec ses actions', '20|Vu 25,Vu 24|carte : Vu 25|actions', () => avecDecouvrir(() => avecVus(async () => {
    for (let k = 1; k <= 25; k++) retenir(piste('Vu ' + k));
    prefs.selection = null; lastTirage = []; render();
    const minis = [...document.querySelectorAll('.discover-vus .mini')], r = [String((prefs.vus || []).length), minis.slice(0, 2).map(m => m.querySelector('.mini-t').textContent.trim()).join(',') || 'rien'];
    if (minis[0]) minis[0].click(); const d = $('.discover-vus .sug');
    r.push(d ? 'carte : ' + d.querySelector('.t').textContent.trim() : 'pas de carte', d && d.querySelector('[data-sug="add"]') && d.querySelector('a.btn') ? 'actions' : 'actions manquantes');
    return r.join('|');
  })));
  await test('Découvrir A : hors ligne — bandeau, boutons des catalogues grisés, durées actives ; le réseau revient → tout revient', 'bandeau|grisés|durées actives|revenu', () => avecDecouvrir(async () => {
    prefs.selection = selectionTest(5); render(); const r = [];
    await horsLigneSimule(async () => {
      await pause(10);   // (la page se met à jour d'elle-même)
      r.push($('.discover-horsligne') ? 'bandeau' : 'pas de bandeau');
      const g = [['selautre', $('#selautre')], ['surprise', $('[data-envie="surprise"]')], ['rayons', $('[data-rayon]')], ['recherche', $('#dq')]].filter(([, e]) => !e || !e.disabled).map(([n]) => n);
      r.push(g.length ? 'actifs : ' + g.join(',') : 'grisés');
      r.push([...document.querySelectorAll('[data-temps]')].some(b => b.disabled) ? 'durées grisées' : 'durées actives');
    });
    await pause(10);
    r.push(!$('.discover-horsligne') && $('#selautre') && !$('#selautre').disabled && !$('[data-rayon]').disabled ? 'revenu' : 'encore grisé');
    return r.join('|');
  }));
  // (Partager, 31/10/2026 : envoyer ma sauvegarde, partager une liste à un ami, ajouter une liste reçue)
  const avecPartage = async (fn, partageOk = true) => {
    const b0 = books, p0 = prefs.prenomPartage, l0 = prefs.lastBackup, d0 = window.download, envois = [], telecharges = [];
    Object.defineProperty(navigator, 'canShare', {value: () => partageOk, configurable: true});
    Object.defineProperty(navigator, 'share', {value: async d => { envois.push(d); }, configurable: true});
    window.download = (nom, contenu, type) => telecharges.push({nom, contenu, type});
    try { return await fn(envois, telecharges); }
    finally {
      delete navigator.canShare; delete navigator.share; window.download = d0;
      books = b0; prefs.prenomPartage = p0; prefs.lastBackup = l0; savePrefs(); await Store.persist();
      if ($('#ov').classList.contains('show')) { modalModifie = false; closeM(); await pause(250); }
      render();
    }
  };
  const livrePrive = () => fiche('Lu aimé', {statut: 'lu', note: 5, avis: 'Superbe', notes: [{texte: 'note privée'}], citations: [{texte: 'citation privée'}],
    dateDebut: '2026-01-03', dateFin: '2026-02-04', pretNom: 'Paul', possession: 'prete', etiquettes: ['perso'], couverture: 'https://exemple.invalid/c.jpg'});
  const PRIVE = /note privée|citation privée|Paul|2026-01-03|2026-02-04|perso|possession|pretNom|journal|classif/;
  await test('Partage : « Envoyer ma sauvegarde » passe par le menu de partage, avec la sauvegarde complète et vérifiée ; la date est notée', 'partagée|mes-lectures-sauvegarde|vérifiée|date notée', () => avecPartage(async envois => {
    books = [livrePrive()]; prefs.lastBackup = undefined;
    await doExport('envoyer'); await pause(20);
    const f = envois[0] && envois[0].files && envois[0].files[0]; if (!f) return 'rien partagé';
    return ['partagée', f.name.startsWith('mes-lectures-sauvegarde') ? 'mes-lectures-sauvegarde' : f.name, verifierSauvegarde(await f.text()) ? 'vérifiée' : 'pas vérifiée', prefs.lastBackup ? 'date notée' : 'date pas notée'].join('|');
  }));
  await test('Partage : sans menu de partage, « Envoyer ma sauvegarde » la télécharge ; la date est notée', 'téléchargée|date notée', () => avecPartage(async (envois, telecharges) => {
    books = [livrePrive()]; prefs.lastBackup = undefined;
    await doExport('envoyer'); await pause(20);
    return [telecharges.length === 1 && verifierSauvegarde(telecharges[0].contenu) && !envois.length ? 'téléchargée' : `${telecharges.length} téléchargé, ${envois.length} partagé`, prefs.lastBackup ? 'date notée' : 'date pas notée'].join('|');
  }, false));
  await test('Partage : une liste ne contient que les statuts choisis, jamais rien de privé ; note et avis par défaut', 'liste|Lu aimé,Lu bof|rien de privé|note et avis', () => avecPartage(async () => {
    books = [livrePrive(), fiche('Lu bof', {statut: 'lu', note: 2}), fiche('À lire')];
    const d = listePartagee({statuts: ['lu'], aimes: false, note: true, avis: true, de: 'Elias'}), t = JSON.stringify(d);
    const x = d.livres.find(l => l.titre === 'Lu aimé') || {};
    return [d.app === 'mes-lectures' && d.type === 'liste' && d.de === 'Elias' ? 'liste' : 'en-tête faux', d.livres.map(l => l.titre).join(','),
      PRIVE.test(t) ? 'privé : ' + t.match(PRIVE)[0] : 'rien de privé', x.note === 5 && x.avis === 'Superbe' ? 'note et avis' : 'sans note ni avis'].join('|');
  }));
  await test('Partage : sans les cases, ni note ni avis ; « ceux que j’ai aimés » garde les 4 étoiles et plus', 'Lu aimé|sans note ni avis', () => avecPartage(async () => {
    books = [livrePrive(), fiche('Lu bof', {statut: 'lu', note: 2}), fiche('À lire')];
    const d = listePartagee({statuts: ['lu'], aimes: true, note: false, avis: false, de: ''});
    return [d.livres.map(l => l.titre).join(','), d.livres.some(l => 'note' in l || 'avis' in l) ? 'note ou avis présents' : 'sans note ni avis'].join('|');
  }));
  await test('Partage : la fenêtre « Partager une liste » compte les livres et envoie le fichier ; le prénom est gardé', '2 livres|lectures-de-elias|N livres que je te conseille|prénom gardé', () => avecPartage(async envois => {
    books = [livrePrive(), fiche('Lu bof', {statut: 'lu', note: 2}), fiche('À lire')]; prefs.prenomPartage = '';
    await doExport('liste'); await pause(30);
    const a = $('#pl_apercu'); if (!a) return 'pas de fenêtre';
    const r = [/\b2 livres\b/.test(a.textContent) ? '2 livres' : a.textContent.trim()];
    $('#pl_de').value = 'Élias'; $('#pl_de').dispatchEvent(new Event('input')); $('#pl_go').click(); await pause(60);
    const e = envois[0] || {}, f = (e.files || [])[0];
    r.push(f ? (f.name.startsWith('lectures-de-elias') ? 'lectures-de-elias' : f.name) : 'rien partagé', /^2 livres que je te conseille/.test(e.text || '') ? 'N livres que je te conseille' : e.text || 'pas de message', prefs.prenomPartage === 'Élias' ? 'prénom gardé' : 'prénom : ' + prefs.prenomPartage);
    return r.join('|');
  }));
  const listeRecue = livres => JSON.stringify({app: 'mes-lectures', type: 'liste', version: 1, de: 'Marie', date: '2026-10-30T10:00:00.000Z', livres});
  await test('Liste reçue : les livres cochés vont dans « À lire » avec l’étiquette et l’avis de l’ami en note ; ma note et mon avis restent vides ; rien d’existant ne change', 'déjà là : pas coché|À lire, pas à moi|Conseillé par Marie|Avis de Marie ★★★★ : Magnifique|ma note vide|déjà là intact|2 livres', () => avecPartage(async () => {
    books = [fiche('Déjà là', {statut: 'lu', note: 3, avis: 'Mon avis'})]; const avant = JSON.stringify(books[0]);
    await recevoirListe(listeRecue([{titre: 'Déjà là', auteur: 'Auteur Test'}, {titre: 'Nouveau', auteur: 'Ana', note: 4, avis: 'Magnifique', couverture: 'https://exemple.invalid/n.jpg', pagesTotal: 120}])); await pause(30);
    const cases = [...document.querySelectorAll('#modal input[type=checkbox][data-i]')]; if (cases.length !== 2) return cases.length + ' cases';
    const r = [!cases[0].checked && cases[0].disabled ? 'déjà là : pas coché' : 'déjà là : coché'];
    $('#lr_go').click(); await pause(60);
    const b = books.find(x => x.titre === 'Nouveau') || {};
    r.push(b.statut === 'a_lire' && b.possession === 'non' ? 'À lire, pas à moi' : `${b.statut}, ${b.possession}`, (b.etiquettes || []).join(','), ((b.notes || [])[0] || {}).texte || 'pas de note',
      !b.note && !b.avis ? 'ma note vide' : 'ma note remplie', JSON.stringify(books.find(x => x.titre === 'Déjà là')) === avant ? 'déjà là intact' : 'déjà là modifié', books.length + ' livres');
    return r.join('|');
  }));
  await test('Liste reçue : « Annuler » retire les livres ajoutés', 'ajouté|retiré', () => avecPartage(async () => {
    books = [fiche('Le mien')];
    await recevoirListe(listeRecue([{titre: 'Conseil 1'}, {titre: 'Conseil 2'}])); await pause(30);
    if (!$('#lr_go')) return 'pas de fenêtre'; $('#lr_go').click(); await pause(60);
    const r = [books.length === 3 ? 'ajouté' : books.length + ' livres'];
    const a = $('#toastBtn'); if (a) a.click(); await pause(30);
    r.push(books.length === 1 && books[0].titre === 'Le mien' ? 'retiré' : books.map(x => x.titre).join(','));
    return r.join('|');
  }));
  await test('Liste reçue : une sauvegarde complète d’un ami ne donne que les livres (sans ses notes, citations, prêts, dates, note ni avis)', 'Livre ami|rien de privé|Conseillé par un ami', () => avecPartage(async () => {
    books = [];
    await recevoirListe(JSON.stringify({app: 'mes-lectures', version: 3, books: [{titre: 'Livre ami', auteur: 'X', statut: 'lu', note: 5, avis: 'secret', notes: [{texte: 'note privée'}],
      citations: [{texte: 'citation privée'}], pretNom: 'Paul', dateFin: '2026-02-04', etiquettes: ['perso']}]})); await pause(30);
    if (!$('#lr_go')) return 'pas de fenêtre'; const vu = $('#modal').textContent; $('#lr_go').click(); await pause(60);
    const b = books[0] || {};
    return [b.titre, /secret|note privée|citation privée|Paul/.test(vu) || b.note || b.avis || (b.notes || []).length || (b.citations || []).length || b.pretNom || b.dateFin ? 'privé repris' : 'rien de privé', (b.etiquettes || []).join(',')].join('|');
  }));
  await test('Liste reçue : un fichier piégé n’exécute rien ; une couverture « javascript: » est écartée', 'pas exécuté|couverture écartée', () => avecPartage(async () => {
    books = []; window.__piege = 0;
    await recevoirListe(listeRecue([{titre: '<img src=x onerror="window.__piege=1">Piège', auteur: '<b>gras</b>', couverture: 'javascript:window.__piege=2'}])); await pause(80);
    const m = $('#modal'), injecte = m.querySelector('img') || [...m.querySelectorAll('b')].some(x => x.textContent === 'gras');
    const r = [window.__piege ? 'exécuté' : injecte ? 'balise injectée' : !m.textContent.includes('<b>gras</b>') ? 'texte absent' : 'pas exécuté'];
    if ($('#lr_go')) { $('#lr_go').click(); await pause(60); }
    r.push(books[0] && !books[0].couverture ? 'couverture écartée' : 'couverture : ' + (books[0] || {}).couverture);
    delete window.__piege; return r.join('|');
  }));
  await test('Liste reçue : un fichier qui n’est pas une liste est refusé, avec un message', 'refusé|refusé|rien ajouté', () => avecPartage(async () => {
    books = []; const r = [];
    for (const texte of ['{"foo": 1}', 'pas du JSON']) { await recevoirListe(texte); await pause(20); r.push(/pas une liste/.test($('#toast').textContent) && !$('#ov').classList.contains('show') ? 'refusé' : 'accepté'); }
    r.push(books.length ? 'ajouté' : 'rien ajouté'); return r.join('|');
  }));
  /* ---------- 17. Direction premium : priorité, détail à la demande, densité ---------- */
  await test('Premium : Bibliothèque annonce son intention et garde les quatre statuts', 'En cours|4', () => {
    books = [enCours('Lecture')]; ui.tab = 'en_cours'; render();
    return [($('#main .library-intro h2') || {textContent: '?'}).textContent.trim(), document.querySelectorAll('#main .library-nav [data-tab]').length].join('|');
  });
  await test('Premium : densité Confortable, Compact et Concentration est mémorisable', 'concentration|confort', () => {
    const d = prefs.density; prefs.density = 'concentration'; applyTheme(); const a = document.documentElement.dataset.density;
    prefs.density = 'confort'; applyTheme(); const b = document.documentElement.dataset.density;
    prefs.density = d; applyTheme(); return a + '|' + b;
  });
  await test('Premium : fiche continue montre une dernière trace ; les signets remplacent le volet « Approfondir » (O3b)', 'trace|pas de volet|signets', async () => {
    const c0 = prefs.consultation, a0 = prefs.animation;
    prefs.consultation = 'continue'; prefs.animation = 'aucune';
    try {
      const b = fiche('Trace', {statut: 'en_cours', notes: [{id: 'n-trace', texte: 'Une note à retrouver', date: today()}], citations: [{id: 'c-trace', texte: 'Une phrase à retenir', date: today()}]});
      books = [b]; ui.tab = 'en_cours'; render(); ouvrirFiche(b.id); interrompreAnimation(); await pause(30);
      return [$('#livre .livre-trace') ? 'trace' : '?', $('#livre .livre-approfondir') ? 'volet encore là' : 'pas de volet',
        document.querySelectorAll('#livre .livre-signets [data-section]').length === 7 ? 'signets' : '?'].join('|');
    } finally { if (ficheEtat.id) await fermerFiche(); prefs.consultation = c0; prefs.animation = a0; savePrefs(); }
  });
  await test('Découvrir premium : une recommandation centrale, la recherche à la demande et le tirage restent accessibles', 'centrale|fermée|tirage', () => {
    const ancien = prefs.selection, mois = moisCle();
    prefs.selection = {mois, vu: true, items: [
      {titre: 'Piste principale', auteur: 'Autrice', themeE: '✦', themeNom: 'Roman', sourceNom: 'Sélection', raison: 'Pour le test'},
      {titre: 'Autre piste', auteur: 'Auteur', themeE: '✦', themeNom: 'Roman', sourceNom: 'Sélection', raison: 'Pour le test'}
    ]};
    try { renderDecouvrir(); return [document.querySelector('.discover-lead .sug') ? 'centrale' : '?', !$('.discover-search').open ? 'fermée' : '?', $('.discover-envies #dc_go') ? 'tirage' : '?'].join('|'); }
    finally { prefs.selection = ancien; }
  });
  await test('Onboarding : premier livre, exploration et restauration restent proposés sans compte', 'ajouter|découvrir|restaurer|local', () => {
    const avant = books, tab = ui.tab; books = []; ui.tab = 'en_cours'; render();
    try { const t = $('#list').textContent.toLowerCase(); return [$('#list [data-ajouter]') ? 'ajouter' : '?', $('#list [data-tab="decouvrir"]') ? 'découvrir' : '?', $('#list [data-export="restore"]') ? 'restaurer' : '?', /sur cet appareil/.test(t) ? 'local' : '?'].join('|'); }
    finally { books = avant; ui.tab = tab; render(); }
  });
  /* ---------- 9. 🌐 Vrais catalogues (recherche par thème) ---------- */
  if (enLigne) {
    await test('🌐 Par auteur « Annie Ernaux » : seulement ses livres, une fois chacun', true, async () => {
      const r = await Recherche.parTheme({auteur: 'Annie Ernaux', max: 0}, {});
      const t = r.res.map(x => Recherche.norm(x.titre));
      return r.erreur === '' && r.res.length > 0 && r.res.every(x => /ernaux/i.test(x.auteur)) && t.length === new Set(t).size;
    });
    await test('🌐 Par titre « Le Petit Prince », 150 p. max', true, async () => {
      const r = await Recherche.parTheme({titre: 'Le Petit Prince', max: 150}, {});
      return r.erreur === '' && r.res.some(x => /petit prince/i.test(x.titre)) && r.res.every(x => x.pagesTotal <= 150);
    });
    await test('🌐 D\'après mes lectures : un autre livre d\'un auteur aimé (pas celui déjà lu)', true, async () => {
      books = [fiche('Mort', {statut: 'lu', note: 5, auteur: 'Terry Pratchett'})];
      const x = await livreMemeAuteur(books[0]);
      return !!x && /pratchett/i.test(x.auteur) && Recherche.norm(x.titre) !== 'mort' && x.raison.includes('Parce que tu as aimé');
    });
    await test('🌐 D\'après mes lectures (vrais catalogues) : 5 livres, chacun avec sa raison', true, async () => {
      books = [fiche('Mort', {statut: 'lu', note: 5, auteur: 'Terry Pratchett', classements: [B('686', '803')], sujets: ['Fantasy']}),
        fiche('Le fascisme', {statut: 'lu', note: 4, auteur: 'Pierre Milza', classements: [B('686', '320'), B('676', '320.533'), B('606', 'Fascisme')]})];
      const box = document.createElement('div'); await drawPerso(box, null);
      return lastTirage.length === 5 && lastTirage.every(x => x.raison && x.titre) && box.querySelectorAll('.sug').length === 5;
    });
    await test('🌐 Tirage en ligne « Politique » : un livre classé Politique, avec couverture', true, async () => {
      const x = await Recherche.decouvrir('cat:politique', {exclude: () => false});
      return !!x && !!x.couverture && x.themeNom === 'Politique & Société' && cats(x).includes('politique');
    });
    let philo199;
    await test('🌐 Sciences humaines › Philosophie, 199 p. max : tous les livres font 199 pages ou moins', true, async () => {
      philo199 = await Recherche.parTheme({cat: 'shs', sous: 'shs/philo', max: 199}, {});
      return philo199.res.length > 0 && philo199.res.every(x => x.pagesTotal > 0 && x.pagesTotal <= 199);
    });
    await test('🌐 Politique, 100 p. max : livres classés Politique, ≤ 100 p., sans doublon', true, async () => {
      const r = await Recherche.parTheme({cat: 'politique', max: 100}, {});
      const cles = r.res.map(x => x.isbn || x.titre);
      return r.erreur === '' && r.res.every(x => x.pagesTotal <= 100 && cats(x).includes('politique')) && cles.length === new Set(cles).size;
    });
    await test('🌐 Les livres sans nombre de pages (ou « environ ») ne sont jamais dans la liste limitée', true, async () => {
      const r = await Recherche.parTheme({cat: 'histoire', max: 300}, {});
      return r.res.every(x => x.pagesTotal && !x.pagesEnviron && x.pagesTotal <= 300) && r.inconnus.every(x => !x.pagesTotal || x.pagesEnviron);
    });
    await test('🌐 Sujet libre « géopolitique », sans limite', true, async () => {
      const r = await Recherche.parTheme({texte: 'géopolitique', max: 0}, {}); return r.erreur === '' && r.res.length > 0;
    });
    await test('🌐 Tourisme & Voyages, sans limite : des livres rangés en Voyages', true, async () => {
      const r = await Recherche.parTheme({cat: 'voyages', max: 0}, {});
      return r.erreur === '' && r.res.length > 0 && r.res.every(x => cats(x).includes('voyages'));
    });
    await test('🌐 Tirage « Vie pratique & Loisirs » : un livre rangé dans ce rayon', true, async () => {
      const x = await Recherche.decouvrir('cat:pratique', {exclude: () => false});
      return !!x && x.themeNom === 'Vie pratique & Loisirs' && cats(x).includes('pratique');
    });
  }
  await test('Catalogue en panne → erreur annoncée (pas « aucun résultat »)', 'reseau', async () => {
    const vrai = window.fetch; window.fetch = () => Promise.reject(new TypeError('panne simulée'));
    // (texte unique : la BnF garde ses réponses 30 minutes, une requête déjà faite par un autre test ne serait pas renvoyée)
    try { return (await Recherche.parTheme({cat: 'shs', texte: 'panne ' + Date.now(), max: 300}, {})).erreur; } finally { window.fetch = vrai; }
  });
  await test('Réponse illisible du catalogue → erreur annoncée (pas « aucun résultat »)', true, async () => {
    const vrai = window.fetch; window.fetch = () => Promise.resolve(new Response('<pas du xml', {status: 200}));
    try { return ['reseau', 'pause'].includes((await Recherche.parTheme({cat: 'eco', texte: 'illisible ' + Date.now(), max: 300}, {})).erreur); } finally { window.fetch = vrai; }
  });

  /* ---------- Lot V1 (03/11/2026) : cohérence du style Éditorial ---------- */
  await test('Lot V1 : fenêtres Ajouter et Actions — icône dessinée seule (Jardin, Éditorial, Android, Actuel) ; émoji en Carnet', 'jardin:0|editorial:0|android:0|actuel:0|carnet:émojis', async () => {
    const r = [];
    for (const s of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) r.push(await enStyle(s, async () => {
      openAjout(); await pause(30); const e1 = emojisVisibles($('#modal')); closeM(); await pause(30);
      const b = fiche('V1 actions', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10}); openActions(b); await pause(30);
      const e2 = emojisVisibles($('#modal')); closeM(); await pause(30);
      return s === 'carnet' ? (e1.length && e2.length ? 'carnet:émojis' : 'carnet:émojis perdus') : `${s}:${e1.length + e2.length}`;
    }));
    return r.join('|');
  });
  await test('Lot V1 : emoTexte masque les émojis hors Carnet (sans espace orpheline) et échappe le texte', 'Épinglé en haut|Tu as déjà|a b|&lt;b&gt;|carnet:📌', async () => {
    const r = [];
    await enStyle('editorial', async () => {
      toast('Épinglé en haut 📌'); await pause(30); r.push($('#toast').innerText);
      const d = document.createElement('div'); $('#main').appendChild(d);
      d.innerHTML = emoTexte('📚 Tu as déjà'); r.push(d.innerText);
      d.innerHTML = emoTexte('a 📌 b'); r.push(d.innerText); d.remove();
    });
    r.push(emoTexte('<b>'));
    await enStyle('carnet', async () => { toast('Épinglé 📌'); await pause(30); r.push('carnet:' + emojisVisibles($('#toast')).join('')); });
    return r.join('|');
  });
  await test('Lot V1 : Éditorial — aucun émoji visible sur les écrans de la tournée ; Carnet garde les siens', 'editorial:aucun|carnet:émojis', async () => {
    const b0 = books, tab0 = ui.tab, r = [];
    books = [fiche('V1 en cours', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 20, dateDebut: addDays(-1), journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}],
        notes: [{id: 'n-v1', texte: 'Une note', date: today()}], citations: [{id: 'c-v1', texte: 'Une citation', page: '3', date: today(), commentaire: ''}]}),
      fiche('V1 épinglé', {epingle: true}), fiche('V1 autre'),
      fiche('V1 emprunté', {possession: 'emprunte', pretRetour: addDays(-2)}),
      fiche('V1 lu', {statut: 'lu', note: 4, dateDebut: addDays(-9), dateFin: today()})];
    const tournee = async () => { const vus = [];
      for (const t of ['en_cours', 'a_lire', 'lu', 'decouvrir', 'notes', 'citations', 'stats']) { ui.tab = t; render(); await pause(40); vus.push(...emojisVisibles(document.body)); }
      ui.tab = 'a_lire'; render(); await pause(30); $('#dice') && $('#dice').click(); await pause(60); vus.push(...emojisVisibles($('#modal'))); closeM(); await pause(30);
      return vus; };
    try {
      r.push(await enStyle('editorial', async () => { const v = await tournee(); return 'editorial:' + ([...new Set(v)].join('') || 'aucun'); }));
      r.push(await enStyle('carnet', async () => { const v = await tournee(); return v.length >= 3 ? 'carnet:émojis' : 'carnet:' + v.length; }));
    } finally { books = b0; ui.tab = tab0; render(); }
    return r.join('|');
  });
  await test('Lot V1 : Éditorial — tirage, rayons, explorateur et « Tu as déjà » sans émoji ; Carnet les garde', 'tirage:aucun|rayon:aucun|sans rayon:aucun|explorateur:aucun|déjà:aucun|carnet:émojis', async () => {
    const b0 = books, tab0 = ui.tab;
    const lieu = {epingle: true, possession: 'emprunte', pretRetour: addDays(3), pagesTotal: 100};
    books = [fiche('V1 tirage un', lieu), fiche('V1 tirage deux', lieu), fiche('V1 rangé', {statut: 'lu', classements: [B('686', '320')]}), fiche('V1 sans rayon', {statut: 'lu'})];
    const releve = async () => { const r = [], vus = s => [...new Set(emojisVisibles($(s)))].join('') || 'aucun';
      ui.tab = 'a_lire'; render(); await pause(30); $('#dice').click(); await pause(60); $('#nx_go').click(); for (let i = 0; i < 40 && !$('#nx_res .nxcard'); i++) await pause(100); r.push(($('#nx_res .nxcard') ? '' : 'pas de carte ') + 'tirage:' + vus('#modal')); closeM(); await pause(30);
      openCategorie('politique'); await pause(40); r.push('rayon:' + vus('#modal')); closeM(); await pause(30);
      openCategorie('_aucune'); await pause(40); r.push('sans rayon:' + vus('#modal')); closeM(); await pause(30);
      const d = document.createElement('div'); d.innerHTML = explorateurClassementHtml(); $('#main').appendChild(d); r.push('explorateur:' + vus('#main > div:last-child')); d.remove();
      openForm(); await pause(40); lastRes = [{titre: 'V1 rangé', auteur: 'Auteur Test'}]; pickResult(0); await pause(30); r.push('déjà:' + vus('#s_res')); closeM(true); await pause(30);
      return r; };
    try {
      const r = await enStyle('editorial', releve);
      const c = await enStyle('carnet', releve);
      r.push(c.filter(x => !x.endsWith(':aucun')).length >= 4 ? 'carnet:émojis' : 'carnet:' + c.join(','));
      return r.join('|');
    } finally { books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V1 : bouton ⋯ identique dans la carte et la liste, 48 × 48, icône dessinée, nommé', 'carte:48x48 dessin nommé|liste:48x48 dessin nommé', async () => {
    const b0 = books, tab0 = ui.tab;
    books = [fiche('V1 a', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 20, dateDebut: addDays(-1)}), fiche('V1 b', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 30, dateDebut: addDays(-3)})];
    try { return await avecReprise(() => enStyle('editorial', async () => { ui.tab = 'en_cours'; render(); await pause(40);
      const d = el => { if (!el) return 'absent'; const q = el.getBoundingClientRect(), i = el.querySelector('.i-plus');
        return `${Math.round(q.width)}x${Math.round(q.height)} ${i && getComputedStyle(i).fontSize === '0px' ? 'dessin' : 'caractère'} ${el.getAttribute('aria-label') ? 'nommé' : 'sans nom'}`; };
      return `carte:${d($('#resumeLecture [data-act="plus"]'))}|liste:${d($('#main .list [data-act="plus"]'))}`; })); }
    finally { books = b0; ui.tab = tab0; render(); }
  });

  await test('Lot V1 : Éditorial — même état « choisi » pour statuts, sélecteurs, puces et choix de Découvrir', 'identiques|bouton principal plein', async () => {
    return await enStyle('editorial', async () => {
      // (fond, contour — bordure ou ombre intérieure —, texte)
      const style = el => { const s = getComputedStyle(el), contour = s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) ? s.borderTopColor : (s.boxShadow.match(/rgba?\([^)]*\)/) || ['aucun'])[0];
        return [s.backgroundColor, contour, s.color].join(' '); };
      const essai = (html, sel = '.on') => { const d = document.createElement('div'); d.innerHTML = html; $('#main').appendChild(d); const v = style(d.querySelector(sel)); d.remove(); return v; };
      const ref = essai('<div class="subtabs"><button class="subtab on">a</button></div>');
      const autres = [essai('<div class="seg"><button class="on">a</button></div>'), essai('<div class="chips"><button class="chipb on">a</button></div>'),
        essai('<div class="discover-q-par"><button class="chipb on">a</button></div>'), essai('<div class="discover-envies"><div class="seg"><button class="on">a</button></div></div>')];
      const pri = essai('<button class="btn pri">a</button>', '.pri');
      return [autres.every(v => v === ref) ? 'identiques' : 'différents : ' + [ref, ...autres].join(' / '),
        pri.split(' rgb')[0] !== ref.split(' rgb')[0] ? 'bouton principal plein' : 'bouton principal changé'].join('|');
    });
  });

  await test('Lot V1 : Éditorial — tuiles et choix d’Ajouter sans contour, fond distinct de leur contenant, focus visible', 'sans contour|fond distinct|focus', async () => {
    return await enStyle('editorial', async () => {
      openAjout(); await pause(30); const b = $('#modal .ajout button'), t = document.createElement('button'); t.className = 'tuile'; $('#main').appendChild(t);
      const sb = getComputedStyle(b), st = getComputedStyle(t), carte = getComputedStyle(document.documentElement).getPropertyValue('--carte').trim();
      const transparent = s => s.borderTopStyle === 'none' || s.borderTopColor === 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) === 0;
      const r = [transparent(sb) && transparent(st) ? 'sans contour' : 'contour présent'];
      const tmp = document.createElement('i'); tmp.style.color = carte; document.body.appendChild(tmp); const c = getComputedStyle(tmp).color; tmp.remove();
      // (chaque choix se distingue de ce qui l'entoure par son fond : la fenêtre pour Ajouter, la page pour les tuiles)
      const fm = getComputedStyle($('#modal')).backgroundColor, fp = getComputedStyle(document.body).backgroundColor;
      r.push(sb.backgroundColor !== fm && st.backgroundColor === c && c !== fp ? 'fond distinct' : `fond ${sb.backgroundColor} (fenêtre ${fm}) / ${st.backgroundColor} (page ${fp})`);
      b.focus({focusVisible: true}); r.push(parseFloat(getComputedStyle(b).outlineWidth) >= 3 ? 'focus' : 'focus perdu');
      t.remove(); closeM(); await pause(30); return r.join('|');
    });
  });

  await test('Lot V1 : Éditorial — Dernière note, Dernière citation et Mon avis : même encart', 'identiques', async () => {
    return await enStyle('editorial', async () => {
      const essai = cls => { const d = document.createElement(cls === 'livre-avis' ? 'div' : 'button'); d.className = cls; $('#main').appendChild(d);
        const s = getComputedStyle(d), v = [s.backgroundColor, s.borderLeftWidth, s.borderLeftColor, s.color, s.borderTopLeftRadius, s.borderTopRightRadius].join(' '); d.remove(); return v; };
      const v = ['carnet-repere', 'livre-trace', 'livre-avis'].map(essai);
      return v.every(x => x === v[0]) ? 'identiques' : v.join(' / ');
    });
  });

  await test('Lot V1 : Éditorial — volets sans triangle natif, chevron dessiné qui tourne ; « Changer » garde son mot, plus de « Ouvrir » ni « Afficher »', 'sans triangle|chevron|tourne|Changer|sans mot', async () => {
    return await enStyle('editorial', async () => {
      const volet = cls => { const d = document.createElement('details'); if (cls) d.className = cls; d.innerHTML = '<summary>Volet</summary><p>x</p>'; $('#main').appendChild(d); return d; };
      const d = volet(), s = d.querySelector('summary'), cs = getComputedStyle(s), apres = () => getComputedStyle(s, '::after');
      const r = [cs.display !== 'list-item' ? 'sans triangle' : 'triangle natif'];
      r.push(apres().maskImage && apres().maskImage !== 'none' ? 'chevron' : 'pas de chevron');
      const t0 = apres().transform; d.open = true; r.push(t0 !== apres().transform ? 'tourne' : 'immobile'); d.remove();
      const ch = volet('discover-surprise'), ca = getComputedStyle(ch.querySelector('summary'), '::after');
      r.push(ca.content === '"Changer"' && ca.maskImage === 'none' ? 'Changer' : `Changer : ${ca.content} ${ca.maskImage.slice(0, 12)}`); ch.remove();
      const mots = ['discover-search', 'livre-resume'].map(c => { const v = volet(c), x = getComputedStyle(v.querySelector('summary'), '::after').content; v.remove(); return x; });
      r.push(mots.every(x => !/Ouvrir|Afficher/.test(x)) ? 'sans mot' : 'mots : ' + mots.join(', '));
      return r.join('|');
    });
  });

  await test('Lot V1 : bandeau de prêt — icône dessinée centrée sur la ligne du texte', 'centrée', async () => {
    const b0 = books;
    books = [fiche('V1 prêt en retard', {possession: 'emprunte', pretRetour: addDays(-2)})];
    try { return await enStyle('editorial', async () => { render(); paintNotice(); await pause(30);
      const i = $('#notice .notice-txt > .ico'), t = $('#notice .notice-titre'); if (!i || !t) return 'bandeau ou icône absents';
      const a = i.getBoundingClientRect(), b = t.getBoundingClientRect(), ecart = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
      return ecart <= 3 ? 'centrée' : `décalée de ${Math.round(ecart)} px`; }); }
    finally { books = b0; render(); paintNotice(); }
  });

  // (relecture du lot V1 : états ouverts des volets, épingle de la grille, émojis restants des fiches, série lue par TalkBack)
  await test('Lot V1 (relecture) : volets ouverts — « Réduire » à l’endroit dans Surprends-moi, chevron sans mot ailleurs', 'Réduire droit|recherche:chevron|résumé:chevron', async () => {
    return await enStyle('editorial', async () => {
      const ouvert = cls => { const d = document.createElement('details'); d.className = cls; d.open = true; d.innerHTML = '<summary>Volet</summary><p>x</p>'; $('#main').appendChild(d);
        const a = getComputedStyle(d.querySelector('summary'), '::after'); const v = {content: a.content, transform: a.transform, mask: a.maskImage}; d.remove(); return v; };
      const s = ouvert('discover-surprise'), r = [s.content === '"Réduire"' && s.transform === 'none' ? 'Réduire droit' : `Réduire : ${s.content} ${s.transform}`];
      for (const [nom, cls] of [['recherche', 'discover-search'], ['résumé', 'livre-resume']]) { const v = ouvert(cls);
        r.push(/^(none|"")$/.test(v.content) && v.mask !== 'none' ? nom + ':chevron' : `${nom} : ${v.content}`); }
      return r.join('|');
    });
  });
  await test('Lot V1 (relecture) : épingle de la grille posée sur une pastille (lisible sur toute couverture)', 'pastille', async () => {
    const b0 = books, v0 = prefs.view;
    books = [fiche('V1 grille un', {epingle: true}), fiche('V1 grille deux')];
    try { return await enStyle('editorial', async () => { ui.tab = 'a_lire'; prefs.view = 'grille'; render(); await pause(40);
      const p = $('#main .gcard .pin'); if (!p) return 'pas d’épingle en grille';
      const s = getComputedStyle(p); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(s.paddingTop) >= 2 && parseFloat(s.borderTopLeftRadius) > 0 ? 'pastille' : `fond ${s.backgroundColor}, marge ${s.paddingTop}`; }); }
    finally { books = b0; prefs.view = v0; render(); }
  });
  await test('Lot V1 (relecture) : Éditorial — puces des fiches, rayons, formulaire et bandeau d’alerte sans émoji ; Carnet les garde', 'cartes:aucun|rayon:aucun|formulaire:aucun|alerte:aucun|carnet:émojis', async () => {
    const b0 = books, tab0 = ui.tab, e0 = Store.erreur;
    const rangé = {classements: [B('686', '320'), B('686', '940')]};
    books = [fiche('V1 prêté', {possession: 'prete', pretNom: 'Léa', ...rangé}), fiche('V1 à compléter', {aCompleter: true}),
      fiche('V1 numérique', {format: 'numerique'}), fiche('V1 audio', {format: 'audio'})];
    const releve = async () => { const r = [], vus = s => [...new Set(emojisVisibles($(s)))].join('') || 'aucun';
      ui.tab = 'a_lire'; render(); await pause(40); r.push('cartes:' + vus('#main'));
      openCategorie('politique'); await pause(40); r.push('rayon:' + vus('#modal')); closeM(); await pause(30);
      openForm(books[0]); await pause(60); if ($('#catBox')) $('#catBox').open = true; await pause(30); r.push('formulaire:' + vus('#catBox')); closeM(true); await pause(30);
      Store.erreur = true; paintNotice(); await pause(20); r.push('alerte:' + vus('#notice')); Store.erreur = e0; paintNotice();
      return r; };
    try {
      const r = await enStyle('editorial', releve), c = await enStyle('carnet', releve);
      r.push(c.filter(x => !x.endsWith(':aucun')).length >= 3 ? 'carnet:émojis' : 'carnet:' + c.join(','));
      return r.join('|');
    } finally { Store.erreur = e0; books = b0; ui.tab = tab0; render(); paintNotice(); }
  });
  await test('Lot V1 (relecture) : série de jours — un texte lu par les lecteurs d’écran, pas seulement le chiffre', 'texte lu', async () => {
    const b0 = books;
    books = [fiche('V1 série', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 20, journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}]})];
    try { render(); await pause(30); const f = $('#flame'), sr = f && f.querySelector('.sr');
      return f && !f.hidden && sr && /jours? de lecture/.test(sr.textContent) ? 'texte lu' : `série : ${f && f.innerHTML}`; }
    finally { books = b0; render(); }
  });

  /* ---------- Lot V2 (03/11/2026) : confort tactile et petits écrans ---------- */
  // (ce que le doigt touche : à 3,5 px au-dessus et au-dessous du bord visible, on vise encore le bouton —
  //  ou le bouton voisin collé à moins de 8 px, qui partage l'espace entre eux par moitié)
  const zoneToucher = e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2;
    const vise = y => { const h = document.elementFromPoint(x, y), v = h && h.closest('button, a');
      if (h === e || e.contains(h)) return true; if (!v) return false; const q = v.getBoundingClientRect();
      return Math.max(q.top - r.bottom, r.top - q.bottom) < 8.5; };
    const dit = y => { const h = document.elementFromPoint(x, y); return h ? (h.className || h.tagName) + ' ' + Math.round(h.getBoundingClientRect().top - r.top) : 'rien'; };
    return vise(r.top - 3.5) ? vise(r.bottom + 3.5) ? '' : 'bas→' + dit(r.bottom + 3.5) : 'haut→' + dit(r.top - 3.5); };
  await test('Lot V2 : puces et petits boutons — zone de toucher de 48 px en haut ET en bas, dans les 5 styles', 'jardin:ok|editorial:ok|android:ok|actuel:ok|carnet:ok', async () => {
    const b0 = books, tab0 = ui.tab, r = [];
    books = [fiche('V2 lu', {statut: 'lu', note: 4, dateDebut: addDays(-9), dateFin: addDays(-1), pagesTotal: 200})];
    try {
      for (const s of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) r.push(await enStyle(s, async () => { const ko = [];
        for (const t of ['decouvrir', 'stats']) { ui.tab = t; render(); await pause(80);
          for (const e of [...document.querySelectorAll('#main :is(.chipb,.btn.small)')].filter(e => e.checkVisibility()).slice(0, 8)) {
            e.scrollIntoView({block: 'center'}); await pause(10); const c = e.getBoundingClientRect(), m = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
            if (!m || !(m === e || e.contains(m))) continue;   // (hors de vue, par exemple dans une carte rangée de côté : pas touchable ici)
            const z = zoneToucher(e); if (z) ko.push(e.textContent.trim().slice(0, 12) + ' (' + z + ')'); } }
        return s + ':' + (ko.length ? ko.join(', ') : 'ok'); }));
    } finally { books = b0; ui.tab = tab0; render(); scrollTo(0, 0); }
    return r.join('|');
  });
  await test('Lot V2 (relecture) : puces d’une rangée qui défile de côté (thèmes de Surprends-moi) — zone de toucher de 48 px', 'ok', async () => {
    const tab0 = ui.tab, o0 = ui.surpriseOuvert, t0 = prefs.tirage;
    try { ui.surpriseOuvert = true; prefs.tirage = 'hasard'; ui.tab = 'decouvrir'; render(); await pause(80);
      const e = [...document.querySelectorAll('#dc_theme .chipb')].find(x => x.checkVisibility()); if (!e) return 'rangée absente';
      e.scrollIntoView({block: 'center', inline: 'nearest'}); await pause(20); const z = zoneToucher(e); return z ? e.textContent.trim().slice(0, 12) + ' (' + z + ')' : 'ok'; }
    finally { ui.surpriseOuvert = o0; prefs.tirage = t0; ui.tab = tab0; render(); scrollTo(0, 0); }
  });
  await test('Lot V2 : bibliothèque vide — pas de ＋ sur cet écran seulement (« Ajouter mon premier livre » suffit) ; il revient au premier livre', 'caché|là dans Découvrir|revenu|nommé', async () => {
    const b0 = books, tab0 = ui.tab;
    try { books = []; ui.tab = 'en_cours'; render(); await pause(30);
      const r = [!$('#fab').checkVisibility() ? 'caché' : 'visible'];
      ui.tab = 'decouvrir'; render(); await pause(30); r.push($('#fab').checkVisibility() ? 'là dans Découvrir' : 'absent de Découvrir'); ui.tab = 'en_cours';
      books = [fiche('V2 premier')]; render(); await pause(30);
      r.push($('#fab').checkVisibility() ? 'revenu' : 'toujours caché');
      r.push($('#fab').getAttribute('aria-label') ? 'nommé' : 'sans nom');
      return r.join('|'); }
    finally { books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V2 : texte à 130 % — « Mes lectures » sur une ligne et entier, flamme comprise', 'une ligne|entier', async () => {
    const b0 = books, f0 = document.documentElement.style.fontSize;
    books = [fiche('V2 série', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 20, journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}]})];
    try { document.documentElement.style.fontSize = '130%'; render(); await pause(40);
      const t = $('header h1'), lh = parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.3;
      return [t.getBoundingClientRect().height <= lh * 1.5 ? 'une ligne' : `${Math.round(t.getBoundingClientRect().height)} px pour ${Math.round(lh)}`,
        t.scrollWidth <= t.clientWidth + 1 ? 'entier' : 'coupé'].join('|'); }
    finally { document.documentElement.style.fontSize = f0; books = b0; render(); }
  });
  await test('Lot V2 (relecture) : texte à 130 % — « Mes lectures » jamais sous la flamme, série de 11 ou 122 jours, 5 styles', 'ok', async () => {
    const b0 = books, f0 = document.documentElement.style.fontSize, ko = [];
    try { document.documentElement.style.fontSize = '130%';
      for (const n of [11, 122]) { books = [fiche('V2 longue série', {statut: 'en_cours', pagesTotal: 500, pageActuelle: n, journal: Array.from({length: n + 1}, (_, i) => ({date: addDays(i - n), page: i}))})];
        for (const st of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) await enStyle(st, async () => { render(); await pause(30);
          const t = $('header h1'), f = $('#flame').getBoundingClientRect(); if ($('#flame').hidden || !$('#flame').textContent.includes(String(n))) { ko.push(`${st} ${n} j : pas de série`); return; }
          if (t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > f.left + 1) ko.push(`${st} ${n} j`); }); } }
    finally { document.documentElement.style.fontSize = f0; books = b0; render(); }
    return ko.length ? 'titre coupé ou sous la flamme : ' + ko.join(', ') : 'ok';
  });
  await test('Lot V2 : flamme — un bouton nommé ; le toucher explique la série', 'bouton|nommé|1 jour de lecture d’affilée', async () => {
    const b0 = books;
    books = [fiche('V2 flamme', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 20, journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}]})];
    try { render(); await pause(30); const f = $('#flame');
      const r = [f.tagName === 'BUTTON' ? 'bouton' : f.tagName, /jours? de lecture/.test(f.textContent) ? 'nommé' : 'sans nom'];
      f.click(); await pause(30); r.push(($('#toast').innerText.match(/1 jour de lecture d’affilée/) || ['pas de message'])[0]);
      return r.join('|'); }
    finally { books = b0; render(); }
  });
  // (lot V5, U1 : la ligne sous le titre dit aussi le nombre de l'onglet : « 1 livre · 2 en tout »)
  await test('Lot V2 : bibliothèque — le titre suit l’onglet (« En cours ») ; le total dit « en tout »', 'En cours|1 livre · 2 en tout', async () => {
    const b0 = books, tab0 = ui.tab;
    books = [fiche('V2 a', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10}), fiche('V2 b')];
    try { ui.tab = 'en_cours'; render(); await pause(30);
      return [$('#main .library-intro h2').textContent.trim(), $('#main .library-intro .ecran-ligne').textContent.trim()].join('|'); }
    finally { books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V2 : progression écrite « p. X sur Y · Z % » (carte et liste) ; jamais d’espace sécable avant « p. »', 'carte:p. X sur Y · Z %|liste:p. X sur Y · Z %|insécables', async () => {
    const b0 = books, tab0 = ui.tab;
    books = [fiche('V2 un', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 40, dateDebut: addDays(-1), journal: [{date: today(), page: 40}]}),
      fiche('V2 deux', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 90, dateDebut: addDays(-5)}), fiche('V2 trois', {pagesTotal: 512, epingle: true}),
      fiche('V2 quatre', {statut: 'abandon', pagesTotal: 400, pageActuelle: 80})];
    try { return await avecRepriseClassique(async () => { ui.tab = 'en_cours'; render(); await pause(40);
      const net = e => e.textContent.replace(/\s+/g, ' ').trim();
      const forme = e => !e ? 'absente' : /^p\. \d+ sur \d+ · \d+ %/.test(net(e)) ? 'p. X sur Y · Z %' : net(e);
      const r = ['carte:' + forme($('#resumeLecture .meta')), 'liste:' + forme($('#list .meta'))];
      const secables = []; for (const t of ['en_cours', 'a_lire', 'abandon', 'decouvrir', 'stats']) { ui.tab = t; render(); await pause(60);
        const w = document.createTreeWalker($('#main'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/\d p\.|p\. \d+ \/ \d/.test(n.textContent)) secables.push(t + ':' + n.textContent.trim().slice(0, 30)); }
      r.push(secables.length ? secables.join(' ; ') : 'insécables'); return r.join('|'); }); }
    finally { books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V2 : Découvrir — l’exemple du champ tient en entier (Sujet, Auteur, Titre)', 'entiers', async () => {
    const tab0 = ui.tab, par0 = rech.par; try { ui.tab = 'decouvrir'; render(); await pause(80); const coupes = [], cv = document.createElement('canvas').getContext('2d');
      for (const k of ['theme', 'auteur', 'titre']) { $(`#main [data-dqpar="${k}"]`).click(); await pause(30); const champ = $('#dq'), st = getComputedStyle(champ);
        cv.font = `${st.fontSize} ${st.fontFamily}`; const place = champ.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
        if (cv.measureText(champ.placeholder).width > place) coupes.push(champ.placeholder); }
      return coupes.length ? 'coupés : ' + coupes.join(' / ') : 'entiers'; }
    finally { rech.par = par0; ui.tab = tab0; render(); }
  });
  await test('Lot V2 : fiche — la barre des signets montre qu’elle défile (fondu), plus au bout', 'fondu|plus de fondu au bout', async () => {
    const b0 = books; books = [fiche('V2 signets', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 10})];
    try { ui.tab = 'en_cours'; render(); ouvrirFiche(books[0].id); await pause(150);
      const n = $('.livre-signets'); if (!n) return 'pas de signets';
      if (n.scrollWidth <= n.clientWidth + 2) { n.style.maxWidth = '160px'; dispatchEvent(new Event('resize')); await pause(30); }
      const r = [n.classList.contains('deborde') && getComputedStyle(n).maskImage !== 'none' ? 'fondu' : 'pas de fondu'];
      n.scrollLeft = n.scrollWidth; n.dispatchEvent(new Event('scroll')); await pause(60);
      r.push(!n.classList.contains('deborde') ? 'plus de fondu au bout' : 'fondu au bout'); return r.join('|'); }
    finally { const n = $('.livre-signets'); if (n) n.style.maxWidth = ''; await fermerFiche(); books = b0; render(); }
  });
  await test('Lot V2 : bandeau de prêt — titre lisible, date entière, rien ne déborde, « » jamais séparé du titre (texte 100 % et 130 %)', 'titre lisible|date entière|sans débordement|guillemets avec le titre', async () => {
    const b0 = books, f0 = document.documentElement.style.fontSize, ko = [];
    books = [fiche('Les Furtifs', {possession: 'emprunte', pretRetour: addDays(-2)})];
    try { for (const taille of ['100%', '130%']) { document.documentElement.style.fontSize = taille; render(); paintNotice(); await pause(40);
        const bar = $('#notice'), b = bar.getBoundingClientRect(), t = $('#notice .notice-titre'), d = $('#notice .notice-quand');
        if (!t || t.getBoundingClientRect().width + 1 < Math.min(t.scrollWidth, 60)) ko.push('titre ' + taille);
        if (!d || d.getClientRects().length > 1 || d.getBoundingClientRect().right > b.right + 1) ko.push('date ' + taille);
        if (bar.scrollWidth > bar.clientWidth + 1 || [...bar.querySelectorAll('*')].some(c => c.getBoundingClientRect().right > b.right + 1)) ko.push('déborde ' + taille);
        // (le « » » fermant doit rester sur la ligne du titre)
        const w = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && !n.textContent.includes('»'));
        if (n && t) { const g = document.createRange(), i = n.textContent.indexOf('»'); g.setStart(n, i); g.setEnd(n, i + 1);
          if (Math.abs(g.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom) > 4) ko.push('guillemets ' + taille); } }
      const k = p => ko.filter(x => x.startsWith(p)).join(',');
      return [k('titre') || 'titre lisible', k('date') || 'date entière', k('déborde') || 'sans débordement', k('guillemets') || 'guillemets avec le titre'].join('|'); }
    finally { document.documentElement.style.fontSize = f0; books = b0; render(); paintNotice(); }
  });

  /* ---------- Lot V3 (03/11/2026) : Stats et Réglages ---------- */
  const livresV3 = () => [fiche('V3 prêté', {possession: 'emprunte', pretRetour: addDays(5)}),
    ...[1, 2, 3, 4].map(i => fiche('V3 lu ' + i, {statut: 'lu', note: 3 + (i % 2), genre: 'Roman', pagesTotal: 100 * i, dateDebut: addDays(-15 * i - 30), dateFin: addDays([-5, -10, -25, -40][i - 1])}))];   // (finis sur 2 mois : défis « 2 / 3 » et « 4 / 10 » côte à côte)
  await test('Lot V3 : petites couvertures visibles (Prêts et emprunts, Top du bilan) — 36 × 54 environ', 'prêts:ok|top:ok', async () => {
    const b0 = books, tab0 = ui.tab; books = livresV3();
    try { ui.tab = 'stats'; render(); await pause(40);
      const t = s => { const e = $(s); if (!e) return 'absente'; const r = e.getBoundingClientRect(); return r.height >= 40 && r.width <= 60 ? 'ok' : `${Math.round(r.width)}×${Math.round(r.height)}`; };
      return ['prêts:' + t('#main .line .mini'), 'top:' + t('#main .top5 .mini')].join('|'); }
    finally { books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V3 : graphiques des Stats en rose, jamais couleur du texte (clair et sombre)', 'light:rose|dark:rose', async () => {
    const b0 = books, tab0 = ui.tab, th0 = prefs.theme, r = []; books = livresV3();
    try { for (const th of ['light', 'dark']) { prefs.theme = th; applyTheme(); ui.tab = 'stats'; ui.statsDetail = true; render(); await pause(40);
        const p = document.createElement('i'); p.style.background = 'var(--accent)'; document.body.append(p); const rose = getComputedStyle(p).backgroundColor; p.remove();
        const barres = [...document.querySelectorAll('#main .chart i, #main .hb .bar > i')].filter(i => i.getBoundingClientRect().height > 0);
        const ko = barres.filter(i => getComputedStyle(i).backgroundColor !== rose);
        r.push(th + ':' + (barres.length && !ko.length ? 'rose' : `${ko.length}/${barres.length} pas rose`)); } }
    finally { prefs.theme = th0; applyTheme(); ui.statsDetail = false; books = b0; ui.tab = tab0; render(); }
    return r.join('|');
  });
  await test('Lot V3 : sans séance chronométrée, une ligne discrète au lieu de deux tuiles « – » ; les tuiles reviennent avec une séance', 'sans tuile vide|ligne|tuiles revenues', async () => {
    const b0 = books, tab0 = ui.tab;
    books = [fiche('V3 c', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 50})];
    try { ui.tab = 'stats'; ui.statsPlus = true; render(); await pause(30);
      const vides = [...document.querySelectorAll('#main .stats-plus .tile b')].filter(b => b.textContent.trim() === '–' && /chrono/.test(b.nextElementSibling.textContent)).length;
      const r = [vides ? `${vides} tuiles vides` : 'sans tuile vide', /Pas encore de séance chronométrée/.test($('#main').textContent) ? 'ligne' : 'pas de ligne'];
      books = [fiche('V3 c', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 50, sessions: [{date: today(), min: 30, pages: 20}]})]; render(); await pause(30);
      r.push([...document.querySelectorAll('#main .stats-plus .tile small')].some(s => /chronométrées en/.test(s.textContent)) ? 'tuiles revenues' : 'tuiles absentes');
      return r.join('|'); }
    finally { ui.statsPlus = false; books = b0; ui.tab = tab0; render(); }
  });
  // (lot V5, U7 : libellé court + détail en petit — « note moyenne » / « sur 5 », « jour d’affilée » / « record : 1 jour »)
  await test('Lot V3 : tuiles — « note moyenne sur 5 » ; série dite comme la flamme (« jour d’affilée · record : … »)', 'note moyenne sur 5|jour d’affilée record : 1 jour', async () => {
    const b0 = books, tab0 = ui.tab;
    books = [...livresV3(), fiche('V3 série', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 20, journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}]})];
    try { ui.tab = 'stats'; ui.statsPlus = true; render(); await pause(30); const tuiles = [...document.querySelectorAll('#main .stats-plus .tile')].map(t => [...t.querySelectorAll(':scope > span, :scope > small')].map(x => x.textContent).join(' ').replace(/\s+/g, ' ').trim());
      return [tuiles.find(t => /note moyenne/.test(t)) || '?', tuiles.find(t => /affilée|consécutif/.test(t)) || '?'].join('|'); }
    finally { ui.statsPlus = false; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V3 : défis — barres de progression toutes de la même longueur', 'alignées', async () => {
    const b0 = books, tab0 = ui.tab; books = livresV3();
    try { ui.tab = 'stats'; ui.statsPlus = true; render(); await pause(30); const l = [...document.querySelectorAll('#main .defis-prochains .bar')].map(b => Math.round(b.getBoundingClientRect().width));
      return l.length < 2 ? 'pas assez de défis' : Math.max(...l) - Math.min(...l) <= 1 ? 'alignées' : l.join(' / '); }
    finally { ui.statsPlus = false; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V3 : Réglages (Éditorial) — le choix actif est une pilule arrondie, détachée du bord', 'Clair:ok|Confortable:ok|Aucune:ok|Fiche de lecture:ok', () => enStyle('editorial', async () => {
    const th0 = prefs.theme, d0 = prefs.density, a0 = prefs.animation;
    try { prefs.theme = 'light'; prefs.density = 'confort'; prefs.animation = 'aucune'; applyTheme(); openSettings(); await pause(60);
      return [...document.querySelectorAll('#modal .seg:not(.styles) button.on')].map(b => { const r = b.getBoundingClientRect(), s = b.parentElement.getBoundingClientRect(), rad = parseFloat(getComputedStyle(b).borderTopLeftRadius);
        const ok = rad >= r.height / 2 - 1 && r.left - s.left >= 3 && s.right - r.right >= 3 && r.top - s.top >= 3;
        return b.textContent.trim().replace(/^\S+ (?=Clair|Sombre|Auto)/, '') + ':' + (ok ? 'ok' : `rayon ${Math.round(rad)}, marges ${Math.round(r.left - s.left)}/${Math.round(s.right - r.right)}/${Math.round(r.top - s.top)}`); }).join('|'); }
    finally { closeM(true); prefs.theme = th0; prefs.density = d0; prefs.animation = a0; applyTheme(); }
  }));
  await test('Lot V3 : un seul bouton rose — « Sauvegarder » — dans les Stats et dans les Réglages', 'stats:Sauvegarder|réglages:Sauvegarder', async () => {
    const b0 = books, tab0 = ui.tab; books = livresV3();
    const roses = root => [...root.querySelectorAll('.btn.pri')].filter(b => b.checkVisibility()).map(b => b.textContent.trim().replace(/^[^A-Za-zÀ-ÿ]+/, '')).join(' + ');
    try { ui.tab = 'stats'; ui.statsDetail = true; render(); await pause(40); const r = ['stats:' + roses($('#main'))];
      openSettings(); await pause(60); r.push('réglages:' + roses($('#modal'))); closeM(true); return r.join('|'); }
    finally { ui.statsDetail = false; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V3 : « Ma bibliothèque en détail » — 4 panneaux sous un volet replié ; l’ouvrir les montre et garde l’état ; un rayon s’ouvre toujours', 'replié|Genre,Classement,rayon,séries|ouvert gardé|rayon ouvert', async () => {
    const b0 = books, tab0 = ui.tab, d0 = ui.statsDetail;
    books = [...livresV3(), fiche('V3 série 1', {serie: 'Dune', tome: 1, classements: [{source: 'test', libelle: 'Science-fiction'}]}), fiche('V3 série 2', {serie: 'Dune', tome: 2})];
    try { ui.statsDetail = false; ui.tab = 'stats'; render(); await pause(40); const v = $('#main details.stats-detail'); if (!v) return 'pas de volet';
      const r = [!v.open && /Ma bibliothèque en détail/.test(v.querySelector('summary').textContent) ? 'replié' : 'ouvert ou sans titre'];
      v.querySelector('summary').click(); await pause(30);
      r.push(['Genre indiqué', 'Classement personnel', 'Mes livres par rayon', 'Mes séries'].filter(t => v.textContent.includes(t) && [...v.querySelectorAll('h3, summary')].some(h => h.textContent.includes(t) && h.checkVisibility())).map(t => t.split(' ').pop().replace('indiqué', 'Genre').replace('personnel', 'Classement')).join(','));
      render(); await pause(30); r.push($('#main details.stats-detail').open ? 'ouvert gardé' : 'refermé au re-rendu');
      const ray = $('#main details.stats-detail [data-cat], #main details.stats-detail .catline, #main details.stats-detail [data-rayon]');
      if (ray) { ray.click(); await pause(60); r.push($('#modal') && $('#modal').checkVisibility() ? 'rayon ouvert' : 'rayon fermé'); closeM(true); } else r.push('pas de rayon touchable');
      return r.join('|'); }
    finally { ui.statsDetail = d0; books = b0; ui.tab = tab0; render(); }
  });

  await test('Lot V3 (relecture) : sélecteur sur deux rangées — toucher le bas d’un bouton du haut le choisit, lui', 'ok', () => enStyle('editorial', async () => {
    try { openSettings(); await pause(60); const s = $('#st_density'); s.style.maxWidth = '200px'; await pause(20);   // (force deux rangées à toute largeur)
      const bs = [...s.querySelectorAll('button')], haut = bs.filter(b => b.getBoundingClientRect().top < bs[bs.length - 1].getBoundingClientRect().top - 5);
      if (!haut.length) return 'pas de deuxième rangée';
      const ko = haut.filter(b => { const r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.bottom + 3.5); return !(h === b || b.contains(h)); });
      return ko.length ? 'volé : ' + ko.map(b => b.textContent.trim()).join(', ') : 'ok'; }
    finally { const s = $('#st_density'); if (s) s.style.maxWidth = ''; closeM(true); }
  }));
  await test('Lot V3 (relecture) : sélecteurs — le bouton qui a le focus passe au-dessus de ses voisins (contour entier)', 'au-dessus', () =>
    // (la page de tests n'a pas le focus de la fenêtre : :focus ne s'y applique pas ; on vérifie donc la règle elle-même)
    [...document.styleSheets[0].cssRules].some(r => r.selectorText && /\.seg/.test(r.selectorText) && /button:focus/.test(r.selectorText) && +r.style.zIndex >= 1) ? 'au-dessus' : 'pas de règle');
  // (lot 34 : en Jardin le chrono devient la session calme — ce test garde la fenêtre classique, mesurée en Éditorial)
  await test('Lot V3 (relecture) : fenêtre du chrono — couverture et titre sur une ligne, centrés', 'même ligne|centrés', () => avecStyle('editorial', 'light', async () => {
    const b0 = books; books = [fiche('V3 chrono', {statut: 'en_cours'})];
    try { prefs.timer = {id: books[0].id, start: Date.now(), acc: 0, running: true}; openTimer(); await pause(40);
      const m = $('#timerModal'), c = m.querySelector('.mini').getBoundingClientRect(), t = [...m.querySelectorAll('b')].find(x => x.textContent.includes('V3 chrono')).getBoundingClientRect(), mm = m.getBoundingClientRect();
      const centre = (Math.min(c.left, t.left) + Math.max(c.right, t.right)) / 2, milieu = (mm.left + mm.right) / 2;
      return [t.top < c.bottom && t.bottom > c.top ? 'même ligne' : 'titre dessous', Math.abs(centre - milieu) <= 6 ? 'centrés' : `décalés de ${Math.round(centre - milieu)} px`].join('|'); }
    finally { prefs.timer = null; $('#timerOv').classList.remove('show'); paintTimerPill(); books = b0; render(); }
  }));
  await test('Lot V3 (relecture) : année passée sans chrono — « Aucune séance chronométrée en … », pas « Pas encore »', 'Aucune séance chronométrée en 2025.', async () => {
    const b0 = books, tab0 = ui.tab, y0 = ui.year; books = [fiche('V3 ancien', {statut: 'lu', note: 4, dateDebut: '2025-03-01', dateFin: '2025-03-10'}), fiche('V3 récent', {statut: 'lu', note: 4, dateDebut: addDays(-9), dateFin: addDays(-1)})];
    try { ui.tab = 'stats'; render(); await pause(30); $('#year').value = '2025'; $('#year').dispatchEvent(new Event('change', {bubbles: true})); await pause(40);
      return ($('#main .stats-chrono') || {textContent: 'pas de ligne'}).textContent.trim(); }
    finally { ui.year = y0; books = b0; ui.tab = tab0; render(); }
  });

  /* ---------- Lot 26 (03/11/2026) : P-e — chaque livre de la liste montre qu'il s'ouvre au toucher ---------- */
  const livres26 = () => [fiche('L26 en cours', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 120}), fiche('L26 à lire', {pagesTotal: 200}),
    fiche('L26 lu', {statut: 'lu', note: 4, dateDebut: addDays(-9), dateFin: addDays(-2)}), fiche('L26 abandon', {statut: 'abandon', pagesTotal: 400, pageActuelle: 50})];
  // (flèche visible, muette pour le lecteur d'écran, au bord droit, à hauteur du titre ; le titre ne passe pas dessous)
  const fleche26 = c => { const f = c && c.querySelector('.info > .card-suite'); if (!f || !f.checkVisibility()) return 'absente';
    if (f.getAttribute('aria-hidden') !== 'true') return 'lue à voix haute';
    const r = f.getBoundingClientRect(), i = c.querySelector('.info').getBoundingClientRect(), t = c.querySelector('.t'), tr = t.getBoundingClientRect();
    const finTitre = tr.right - parseFloat(getComputedStyle(t).paddingRight), ligne = parseFloat(getComputedStyle(t).lineHeight);
    if (!(r.width > 0 && i.right - r.right <= 2)) return `pas au bord (${Math.round(i.right - r.right)})`;
    if (!(r.top >= tr.top - 2 && r.bottom <= tr.top + ligne + 2)) return 'pas à hauteur du titre';
    return finTitre <= r.left ? 'ok' : 'titre dessous'; };
  await test('Lot 26 : chaque livre de la liste a une petite flèche « › » à droite du titre (4 onglets, Éditorial et Carnet) ; pas en grille', 'en_cours:ok|a_lire:ok|lu:ok|abandon:ok|carnet:ok|grille:aucune', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = livres26(); prefs.view = 'liste';
    try { const r = [];
      await enStyle('editorial', async () => { for (const t of ['en_cours', 'a_lire', 'lu', 'abandon']) { ui.tab = t; render(); await pause(20); r.push(t + ':' + fleche26($('#list .card'))); } });
      await enStyle('carnet', async () => { ui.tab = 'a_lire'; render(); await pause(20); r.push('carnet:' + fleche26($('#list .card'))); });
      prefs.view = 'grille'; ui.tab = 'a_lire'; render(); await pause(20); r.push('grille:' + ($('#list .card-suite') ? 'présente' : 'aucune'));
      return r.join('|'); }
    finally { prefs.view = v0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot 26 : sur un petit écran (liste de 296 px), « Où j’en suis » et « ⋯ » restent sur une rangée, dans les 5 styles', 'jardin:1|editorial:1|carnet:1|android:1|actuel:1', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = livres26(); prefs.view = 'liste'; const r = [];
    try { for (const st of ['jardin', 'editorial', 'carnet', 'android', 'actuel']) await enStyle(st, async () => {
        ui.tab = 'en_cours'; render(); await pause(20); $('#list').style.width = '296px'; await pause(20);
        r.push(st + ':' + new Set([...$('#list .card .acts').children].map(b => Math.round(b.getBoundingClientRect().top))).size); });
      return r.join('|'); }
    finally { const l = $('#list'); if (l) l.style.width = ''; prefs.view = v0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot 26 : toucher la ligne la fonce un instant, dans les 5 styles — mais pas quand on touche un de ses boutons', 'règle|jardin:fonce|editorial:fonce|carnet:fonce|android:fonce|actuel:fonce', async () => {
    // (la page de tests ne peut pas poser un doigt : on recopie la règle, à la même place, avec une classe à la place de :active)
    const fs = document.styleSheets[0], k = [...fs.cssRules].findIndex(r => r.selectorText && /\.card:active/.test(r.selectorText) && /:has\(/.test(r.selectorText));
    if (k < 0) return 'pas de règle';
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = livres26(); prefs.view = 'liste'; const r = ['règle'];
    fs.insertRule(fs.cssRules[k].cssText.replace(/\.card:active/, '.card.sonde26'), k + 1);
    try { for (const st of ['jardin', 'editorial', 'carnet', 'android', 'actuel']) await enStyle(st, async () => {
        ui.tab = 'en_cours'; render(); await pause(20); const c = $('#list .card'), avant = getComputedStyle(c).backgroundImage;
        c.classList.add('sonde26'); const apres = getComputedStyle(c).backgroundImage;
        r.push(st + ':' + (apres !== avant && /gradient/.test(apres) ? 'fonce' : 'rien')); });
      return r.join('|'); }
    finally { fs.deleteRule(k + 1); prefs.view = v0; books = b0; ui.tab = tab0; render(); }
  });

  /* ---------- Lot 27 (04/11/2026) : corrections de l'audit complet (B1, B2, champs sans nom, M1, M2) ---------- */
  await test('Lot 27 : « Que lire ensuite » fermé pendant le tirage — pas d’erreur, la fenêtre rouverte reste intacte', 'sans erreur|fenêtre rouverte intacte', async () => {
    const b0 = books, erreurs = [], ecoute = e => erreurs.push(String(e.reason && e.reason.message || e.reason));
    books = ['A', 'B', 'C'].map(t => fiche('L27 ' + t));
    Object.assign(pick, {mode: 'liste', len: '', genre: '', genreConfirme: '', cat: '', dispo: false, themeLivre: '', sousGenre: '', ambiance: ''});
    addEventListener('unhandledrejection', ecoute);
    try { openNext(); $('#nx_go').click(); await pause(80); closeM(true); await pause(250); openNext(); await pause(1500);
      const r = $('#nx_res'), go = $('#nx_go');
      return [erreurs.length ? 'erreur : ' + erreurs[0] : 'sans erreur', r && !r.querySelector('.nxcard, .nxspin') && go && !go.disabled ? 'fenêtre rouverte intacte' : 'fenêtre rouverte touchée'].join('|'); }
    finally { removeEventListener('unhandledrejection', ecoute); closeM(true); await pause(250); books = b0; }
  });
  await test('Lot 27 : scanner avec le lecteur de secours, caméra refusée — le scanner se ferme et dit « Caméra refusée »', 'fermé|Caméra refusée', async () => {
    const z0 = window.ZXing, l0 = lecteurOk, pk = $('#pick_scan'); pk.click = () => {};   // (pas de choix de photo pendant le test)
    window.ZXing = {BrowserMultiFormatReader: class { decodeFromConstraints() { return Promise.reject(Object.assign(new Error('refus'), {name: 'NotAllowedError'})); } reset() {} }};
    lecteurOk = false;
    try { await openScanner(); await pause(50);
      return [$('#scanOv').classList.contains('show') ? 'resté ouvert' : 'fermé', /Caméra refusée/.test($('#toast').textContent) ? 'Caméra refusée' : 'message : « ' + $('#toast').textContent + ' »'].join('|'); }
    finally { closeScanner(); if (z0) window.ZXing = z0; else delete window.ZXing; lecteurOk = l0; delete pk.click; }
  });
  await test('Lot 27 : l’objectif de l’année, la citation et sa page ont un nom lu par TalkBack', 'Objectif de livres pour l’année|Citation à ajouter|Page de la citation', async () => {
    const b0 = books, tab0 = ui.tab, g0 = goal; books = [fiche('L27 cit', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 20})]; goal = 0;
    const nom = s => { const e = $(s); return !e ? 'absent' : e.getAttribute('aria-label') || [...(e.labels || [])].map(l => l.textContent.trim()).join(' ') || 'sans nom'; };
    try { ui.year = new Date().getFullYear(); ui.tab = 'stats'; render(); await pause(30); const r = [nom('#goal')];
      openForm(books[0]); await pause(60); r.push(nom('#f_qt'), nom('#f_qp')); return r.join('|'); }
    finally { closeM(true); await pause(250); goal = g0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot 27 : export Excel — une tabulation ou un retour chariot devant « = » est aussi neutralisé', 'tab neutralisée|retour neutralisé', () => {
    const b0 = books; books = [fiche('\t=1+1'), fiche('\r=2+2')];
    let csv = ''; const dl = window.download; window.download = (n, c) => { csv = c; };
    try { doExport('excel'); return [csv.includes('"\'\t=1+1"') ? 'tab neutralisée' : 'tab brute', csv.includes('"\'\r=2+2"') ? 'retour neutralisé' : 'retour brut'].join('|'); }
    finally { window.download = dl; books = b0; }
  });
  await test('Lot 27 : mémoire de Découvrir — listes de plus de 15 jours et listes abîmées effacées, récentes gardées', 'vieille effacée|récente gardée|abîmée effacée', () => {
    const k = n => 'ml-cache-l27-' + n;
    localStorage.setItem(k('vieille'), JSON.stringify({t: Date.now() - 16 * 864e5, v: [1]}));
    localStorage.setItem(k('recente'), JSON.stringify({t: Date.now(), v: [1]}));
    localStorage.setItem(k('abimee'), '{pas du json');
    try { Recherche.nettoyerMemoire();
      return [localStorage.getItem(k('vieille')) ? 'vieille gardée' : 'vieille effacée', localStorage.getItem(k('recente')) ? 'récente gardée' : 'récente effacée',
        localStorage.getItem(k('abimee')) ? 'abîmée gardée' : 'abîmée effacée'].join('|'); }
    finally { ['vieille', 'recente', 'abimee'].forEach(n => localStorage.removeItem(k(n))); }
  });

  await test('Lot 27 : scanner fermé pendant que la caméra démarre — la caméra est éteinte (scanner simple et plusieurs livres)', 'scanner:éteinte|plusieurs:éteinte', async () => {
    const z0 = window.ZXing, l0 = lecteurOk; let arrets = 0;
    window.ZXing = {BrowserMultiFormatReader: class { decodeFromConstraints() { return new Promise(r => setTimeout(r, 200)); } reset() { arrets++; } }};
    lecteurOk = false; const r = [];
    try {
      arrets = 0; const p1 = openScanner(); await pause(50); closeScanner(); await p1; await pause(50);
      r.push('scanner:' + (arrets >= 1 && !scanStop ? 'éteinte' : 'restée allumée'));
      arrets = 0; const p2 = openBulk(); await pause(50); closeBulk(); await p2; await pause(50);
      r.push('plusieurs:' + (arrets >= 1 && !bulkStop ? 'éteinte' : 'restée allumée'));
      return r.join('|'); }
    finally { closeScanner(); closeBulk(); if (z0) window.ZXing = z0; else delete window.ZXing; lecteurOk = l0; }
  });

  /* ---------- Lot 28 (04/11/2026) : vitesse avec une grande bibliothèque (O1, O2, O4 ; O3 sans changement visible) ---------- */
  await test('Lot 28 : dates écrites vite (au moins 3 fois plus vite que l’ancienne façon), toujours au même format', '12 oct. 2026|1 janv. 2025|vide|rapide', () => {
    const r = [fdate('2026-10-12'), fdate('2025-01-01'), fdate('') || 'vide'];
    // (comparé à l'ancienne façon sur le même ordinateur : le test ne dépend pas de sa vitesse)
    const jours = Array.from({length: 3000}, (_, i) => addDays(-(i % 300)));
    let t0 = performance.now(); for (const j of jours) fdate(j); const ms = performance.now() - t0;
    t0 = performance.now(); for (const j of jours) new Date(j + 'T00:00').toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}); const ancien = performance.now() - t0;
    r.push(ms * 3 <= ancien ? 'rapide' : `${Math.round(ms)} ms contre ${Math.round(ancien)} ms`); return r.join('|');
  });
  await test('Lot 28 : livres de la liste et de la grille dessinés quand ils approchent de l’écran ; les 8 derniers toujours', 'liste:auto, fin dessinée|grille:auto, fin dessinée', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = Array.from({length: 20}, (_, i) => fiche('L28 ' + i, {statut: 'lu'})); const r = [];
    try { for (const [v, sel] of [['liste', '#list > .card'], ['grille', '#list > .gcard']]) { prefs.view = v; ui.tab = 'lu'; render(); await pause(20);
        const l = [...document.querySelectorAll(sel)], s = getComputedStyle(l[0]), fin = getComputedStyle(l[l.length - 1]).contentVisibility;
        r.push(v + ':' + (s.contentVisibility === 'auto' && s.containIntrinsicSize !== 'none' ? 'auto' : s.contentVisibility || 'non géré') + (fin === 'visible' ? ', fin dessinée' : ', fin ' + fin)); }
      return r.join('|'); }
    finally { prefs.view = v0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot 28 : recherche — chaque livre (texte et couverture dessinée) n’est « nettoyé » qu’une fois, et un titre changé est bien retrouvé', 'peu de travail|titre changé trouvé', async () => {
    const b0 = books, tab0 = ui.tab, q0 = ui.q, n0 = Recherche.norm; let n = 0;
    books = Array.from({length: 100}, (_, i) => fiche('L28 livre ' + i, {statut: 'lu'}));
    try { ui.tab = 'lu'; ui.q = ''; render(); ui.q = 'l'; renderCards();   // (premier passage : chaque livre est préparé)
      Recherche.norm = s => { n++; return n0(s); }; ui.q = 'li'; renderCards(); ui.q = 'liv'; renderCards(); Recherche.norm = n0;
      const r = [n <= 10 ? 'peu de travail' : n + ' nettoyages pour 2 lettres'];
      books[3].titre = 'Zanzibar'; ui.q = 'zanzi'; renderCards();
      r.push([...document.querySelectorAll('#list .card')].some(c => c.textContent.includes('Zanzibar')) ? 'titre changé trouvé' : 'titre changé introuvable');
      return r.join('|'); }
    finally { Recherche.norm = n0; ui.q = q0; books = b0; ui.tab = tab0; render(); }
  });

  await test('Lot 28 : longue liste (150 livres) — tout en bas, le dernier livre reste au-dessus du ＋ (liste et grille)', 'liste visible|grille visible', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view, r = [];
    books = Array.from({length: 150}, (_, k) => fiche('L28 pile ' + k, {statut: 'a_lire', pagesTotal: 200, resume: k % 3 ? '' : 'Un résumé assez long pour prendre deux lignes dans la liste des livres à lire.'}));
    try { for (const vue of ['liste', 'grille']) {
        ui.tab = 'a_lire'; prefs.view = vue; render(); scrollTo(0, document.documentElement.scrollHeight); await pause(80);
        const l = [...document.querySelectorAll('#list .card, #list .gcard')].pop(), f = $('.fab');
        const bas = Math.max(...[l, ...l.querySelectorAll('*')].map(x => x.getBoundingClientRect().bottom)), haut = f.getBoundingClientRect().top;
        r.push(bas <= haut + 1 ? vue + ' visible' : vue + ' cachée (bas ' + Math.round(bas) + ', ＋ ' + Math.round(haut) + ')'); }
      return r.join('|'); }
    finally { prefs.view = v0; books = b0; ui.tab = tab0; render(); scrollTo(0, 0); }
  });

  /* ---------- Lots 27-28 (relecture) : la liste ne saute pas, la caméra s'éteint toujours ---------- */
  const pile28 = () => Array.from({length: 150}, (_, k) => fiche('L28r ' + k, {statut: 'a_lire', pagesTotal: 200,
    resume: k % 3 ? '' : 'Un résumé assez long pour prendre plusieurs lignes dans la liste des livres à lire, et même davantage sur un petit écran.'}));
  // (le livre qui est à ~200 px du haut de l'écran, et sa position)
  const repere28 = () => { const c = [...document.querySelectorAll('#list > .card')].find(x => x.getBoundingClientRect().top >= 200); return c && {id: c.dataset.id, top: c.getBoundingClientRect().top}; };
  const ecart28 = r => { const c = document.querySelector(`#list > .card[data-id="${r.id}"]`); return c ? Math.round(c.getBoundingClientRect().top - r.top) : 'disparu'; };
  await test('Lots 27-28 (relecture) : défilé au milieu d’une longue liste, un nouvel affichage ne la fait pas sauter', 'immobile', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = pile28(); prefs.view = 'liste';
    try { ui.tab = 'a_lire'; render(); await pause(30);
      for (let y = 0; y < 9000; y += 600) { scrollTo(0, y); await pause(16); }   // (on descend peu à peu : les livres vus prennent leur vraie taille)
      await pause(50); const r = repere28(); render(); await pause(50);
      const d = ecart28(r); return Math.abs(d) <= 2 ? 'immobile' : 'saut de ' + d + ' px'; }
    finally { prefs.view = v0; books = b0; ui.tab = tab0; render(); scrollTo(0, 0); }
  });
  await test('Lots 27-28 (relecture) : défilé au milieu d’une longue liste, aller dans Stats puis revenir retrouve les mêmes livres', 'mêmes livres', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view; books = pile28(); prefs.view = 'liste';
    try { ui.tab = 'a_lire'; render(); await pause(30);
      for (let y = 0; y < 9000; y += 600) { scrollTo(0, y); await pause(16); }
      await pause(50); const r = repere28();
      document.querySelector('[data-space="stats"]').click(); await pause(80); document.querySelector('[data-space="bibliotheque"]').click(); await pause(120);
      const d = ecart28(r); return Math.abs(d) <= 2 ? 'mêmes livres' : 'décalé de ' + d + ' px'; }
    finally { prefs.view = v0; books = b0; ui.tab = tab0; render(); scrollTo(0, 0); }
  });
  // (lecteur de secours imité : chaque démarrage est compté, « actif » tant que la caméra tourne)
  const camera28 = (demarrer) => { const l = []; window.ZXing = {BrowserMultiFormatReader: class { constructor() { this.actif = false; l.push(this); }
    decodeFromConstraints() { return demarrer(this); } reset() { this.actif = false; } }}; return l; };
  await test('Lots 27-28 (relecture) : démarrage de caméra qui n’aboutit jamais — fermer le scanner l’éteint quand même', 'éteinte', async () => {
    const z0 = window.ZXing, l0 = lecteurOk; lecteurOk = false;
    const l = camera28(c => { c.actif = true; return new Promise(() => {}); });   // (la caméra tourne, la vidéo ne démarre jamais)
    try { openScanner(); await pause(50); closeScanner(); await pause(30); return l.some(c => c.actif) ? 'restée allumée' : 'éteinte'; }
    finally { closeScanner(); if (z0) window.ZXing = z0; else delete window.ZXing; lecteurOk = l0; }
  });
  await test('Lots 27-28 (relecture) : fermer puis rouvrir vite le scanner — une seule caméra allumée, puis aucune', '1 allumée|0 allumée', async () => {
    const z0 = window.ZXing, l0 = lecteurOk; lecteurOk = false;
    const l = camera28(c => new Promise(r => setTimeout(() => { c.actif = true; r(); }, 150)));
    try { openScanner(); await pause(40); closeScanner(); openScanner(); await pause(400);
      const r = [l.filter(c => c.actif).length + ' allumée']; closeScanner(); await pause(30); r.push(l.filter(c => c.actif).length + ' allumée'); return r.join('|'); }
    finally { closeScanner(); if (z0) window.ZXing = z0; else delete window.ZXing; lecteurOk = l0; }
  });
  await test('Lots 27-28 (relecture) : scanner fermé avant le refus de la caméra — ni message, ni choix de photo', 'rien', async () => {
    const z0 = window.ZXing, l0 = lecteurOk, pk = $('#pick_scan'); let photo = 0; pk.click = () => { photo++; }; lecteurOk = false;
    camera28(() => new Promise((r, x) => setTimeout(() => x(Object.assign(new Error('refus'), {name: 'NotAllowedError'})), 100)));
    $('#toast').textContent = '';
    try { openScanner(); await pause(30); closeScanner(); await pause(200);
      return photo || /Caméra/.test($('#toast').textContent) ? `photo ${photo}, message « ${$('#toast').textContent} »` : 'rien'; }
    finally { closeScanner(); if (z0) window.ZXing = z0; else delete window.ZXing; lecteurOk = l0; delete pk.click; }
  });

  /* ---------- Lot V5 (10/11/2026) : Rythme éditorial (contrat UI/UX du 10/11, plan 2026-11-10-lot-v5) ---------- */
  const fondV5 = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return getComputedStyle(document.body).backgroundColor; };
  const couleurV5 = v => { const i = document.createElement('i'); i.style.color = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
  await test('Lot V5 : note — mêmes étoiles + « 4/5 » dans la liste et la fiche, sans feu tricolore, nom lu (5 styles, clair et sombre)', 'liste:ok|fiche:ok|grille:ok|couleurs:ok|nom:ok', async () => {
    const b0 = books, tab0 = ui.tab, th0 = prefs.theme, v0 = prefs.view, ko = {liste: [], fiche: [], grille: [], couleurs: [], nom: []};
    books = [fiche('V5 note', {statut: 'lu', note: 4, dateDebut: addDays(-9), dateFin: addDays(-1)})];
    const forme = (n, ou, cle) => {
      if (!n) return ko[cle].push(ou + ' absente');
      if (n.getAttribute('aria-label') !== 'Note : 4 sur 5') ko.nom.push(ou);
      const p = n.querySelector('.pleines'), v = n.querySelector('.vides'), t = n.querySelector('b');
      if (cle !== 'grille' && (!p || p.textContent !== '★★★★' || !v || v.textContent !== '☆' || !t || t.textContent !== '4/5')) ko[cle].push(ou + ' forme');
      if (cle === 'grille' && (!p || p.textContent !== '★' || !t || t.textContent !== '4')) ko[cle].push(ou + ' forme');
      if (p && getComputedStyle(p).color !== couleurV5('--accent')) ko.couleurs.push(ou + ' pleines');
      for (const e of [p, v].filter(Boolean)) if (contraste(getComputedStyle(e).color, fondV5(e)) < 3) ko.couleurs.push(ou + ' contraste ' + contraste(getComputedStyle(e).color, fondV5(e)).toFixed(2));
    };
    try {
      for (const st of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) await enStyle(st, async () => { for (const th of ['light', 'dark']) {
        prefs.theme = th; applyTheme(); const ou = st + '-' + th;
        prefs.view = 'liste'; ui.tab = 'lu'; render(); await pause(20); forme($('#list .card .note'), ou, 'liste');
        if (document.querySelector('#main .score')) ko.couleurs.push(ou + ' pastille .score');
        prefs.view = 'grille'; render(); await pause(20); forme($('#list .gcard .gscore'), ou, 'grille');
        prefs.view = 'liste'; render(); ouvrirFiche(books[0].id); await pause(60); forme(document.querySelector('.livre-garde .note'), ou, 'fiche');
        try { fermerFiche(); } catch (e) {} await pause(30); } });
      const k = c => ko[c].length ? c + ':' + ko[c].slice(0, 3).join(',') : c + ':ok';
      return ['liste', 'fiche', 'grille', 'couleurs', 'nom'].map(k).join('|'); }
    finally { try { fermerFiche(); } catch (e) {} prefs.theme = th0; prefs.view = v0; applyTheme(); books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : petites couvertures — décor visible et jamais sur les initiales (géométrique, illustrée, classique ; liste et mini)', 'geometrique:ok|illustree:ok|classique:ok', async () => {
    const vus = {}; for (let i = 0; i < 400 && Object.keys(vus).length < 3; i++) { const b = {titre: 'V5 couv ' + i, auteur: 'Auteur Test'}, f = dessinerCouv(b).famille;
      if (['geometrique', 'illustree', 'classique'].includes(f) && !vus[f]) vus[f] = b; }
    const boite = document.createElement('div'); boite.className = 'list'; document.body.append(boite); const ko = {geometrique: [], illustree: [], classique: []};
    const coupe = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    try { for (const [f, b] of Object.entries(vus)) for (const cls of ['cover', 'ph mini']) {
        boite.innerHTML = `<article class="card">${coverHtml(b, cls)}</article>`; await pause(10);
        const c = boite.querySelector('.cg'), ini = c.querySelector('.cg-ini').getBoundingClientRect(), taille = cls === 'cover' ? 'liste' : 'mini';
        const decor = [...c.querySelectorAll(f === 'geometrique' ? '.cg-disque,.cg-bande' : f === 'illustree' ? '.cg-motif' : '.cg-cadre')];
        if (!decor.length || decor.some(d => !d.checkVisibility() || d.getBoundingClientRect().width * d.getBoundingClientRect().height < 4)) ko[f].push(taille + ' décor caché');
        if (f !== 'classique' && decor.some(d => coupe(d.getBoundingClientRect(), ini))) ko[f].push(taille + ' décor sur les initiales');
        if (ini.top < c.getBoundingClientRect().top - 1 || ini.bottom > c.getBoundingClientRect().bottom + 1) ko[f].push(taille + ' initiales coupées'); } }
    finally { boite.remove(); }
    return Object.keys(ko).map(f => !vus[f] ? f + ':introuvable' : f + ':' + (ko[f].length ? ko[f].join(',') : 'ok')).join('|');
  });

  await test('Lot V5 : rappel de prêt — une ligne (deux au plus à 130 %), « en retard de 2 j », seulement dans la Bibliothèque ; alertes de sauvegarde partout', 'une ligne|textes|bibliothèque:oui|découvrir:non|carnet:non|stats:non|sauvegarde partout', async () => {
    const b0 = books, tab0 = ui.tab, f0 = document.documentElement.style.fontSize, lb0 = prefs.lastBackup, r = [];
    const pret = j => [fiche('Les Furtifs', {possession: 'emprunte', pretRetour: addDays(j)})];
    try {
      books = pret(-2); ui.tab = 'a_lire'; const lignes = [];
      for (const t of ['100%', '130%']) { document.documentElement.style.fontSize = t; render(); paintNotice(); await pause(30);
        const tx = $('#notice .notice-txt'), h = parseFloat(getComputedStyle(tx).fontSize) * 1.6;
        if (!tx || tx.getBoundingClientRect().height > h * (t === '100%' ? 1.4 : 2.4)) lignes.push(t + ' ' + Math.round(tx ? tx.getBoundingClientRect().height : 0)); }   // (130 % : la date peut passer sous le titre pour qu'il reste lisible, test V2)
      document.documentElement.style.fontSize = f0; r.push(lignes.length ? 'deux lignes ' + lignes.join(',') : 'une ligne');
      const txt = [];
      for (const [j, att] of [[-2, 'en retard de 2 j'], [0, 'à rendre aujourd’hui'], [1, 'à rendre demain'], [3, 'à rendre dans 3 j']]) {
        books = pret(j); render(); paintNotice(); const t = $('#notice').textContent.replace(/\s+/g, ' ').trim(); if ($('#notice').hidden || !t.includes(att)) txt.push(j + ' : ' + t); }
      r.push(txt.length ? txt.join(' ; ') : 'textes');
      books = pret(-2);
      for (const [tab, nom] of [['a_lire', 'bibliothèque'], ['decouvrir', 'découvrir'], ['notes', 'carnet'], ['stats', 'stats']]) { ui.tab = tab; render(); paintNotice(); await pause(20); r.push(nom + ':' + ($('#notice').hidden ? 'non' : 'oui')); }
      books = [1, 2, 3].map(i => fiche('V5 s' + i)); delete prefs.lastBackup; const ko = [];
      for (const tab of ['a_lire', 'decouvrir', 'notes', 'stats']) { ui.tab = tab; render(); paintNotice(); if ($('#notice').hidden) ko.push(tab); }
      r.push(ko.length ? 'sauvegarde absente : ' + ko.join(',') : 'sauvegarde partout');
      return r.join('|'); }
    finally { document.documentElement.style.fontSize = f0; if (lb0) prefs.lastBackup = lb0; else delete prefs.lastBackup; books = b0; ui.tab = tab0; render(); paintNotice(); }
  });
  await test('Lot V5 : « À lire » — épingle en bouton rond nommé, « Commencer » sur la même ligne, pages avec l’auteur (5 styles, texte 100 % et 130 %)', 'nom|état|même ligne|48 px|pages avec l’auteur', async () => {
    const b0 = books, tab0 = ui.tab, v0 = prefs.view, f0 = document.documentElement.style.fontSize, ko = {nom: [], etat: [], ligne: [], taille: [], pages: []};
    books = [fiche('Sapiens', {pagesTotal: 512, epingle: true}), fiche('Le Mage du Kremlin', {pagesTotal: 288})];
    try { for (const st of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) await enStyle(st, async () => { for (const t of ['100%', '130%']) {
        document.documentElement.style.fontSize = t; prefs.view = 'liste'; ui.tab = 'a_lire'; render(); await pause(30); const ou = st + ' ' + t;
        for (const c of document.querySelectorAll('#list .card')) {
          const b = books.find(x => x.id === c.dataset.id), pin = c.querySelector('[data-act=pin]'), go = c.querySelector('[data-act=start]');
          if (!pin || pin.getAttribute('aria-label') !== 'Épingler ' + b.titre || /Épingl/.test(pin.textContent)) ko.nom.push(ou);
          if (pin && pin.getAttribute('aria-pressed') !== String(!!b.epingle)) ko.etat.push(ou);
          if (pin && go && Math.abs(pin.getBoundingClientRect().top - go.getBoundingClientRect().top) > 2) ko.ligne.push(ou);
          if (pin && (pin.getBoundingClientRect().width < 47.5 || pin.getBoundingClientRect().height < 47.5)) ko.taille.push(ou + ' ' + Math.round(pin.getBoundingClientRect().width));
          const a = c.querySelector('.info > .a'); if (!a || !new RegExp('Auteur Test · ' + b.pagesTotal + ' p\.').test(a.textContent)) ko.pages.push(ou + ' « ' + (a ? a.textContent : '') + ' »'); } } });
      const k = (c, n) => ko[c].length ? n + ' : ' + [...new Set(ko[c])].slice(0, 3).join(',') : n;
      return [k('nom', 'nom'), k('etat', 'état'), k('ligne', 'même ligne'), k('taille', '48 px'), k('pages', 'pages avec l’auteur')].join('|'); }
    finally { document.documentElement.style.fontSize = f0; prefs.view = v0; books = b0; ui.tab = tab0; render(); }
  });
  // (lot 32 : mesuré en Éditorial — en Jardin, la Bibliothèque met son titre dans la ligne d'en-tête, choix d'Elias du 12/11)
  await test('Lot V5 : têtes d’écran — Bibliothèque, Découvrir, Carnet et Stats ont un titre de même taille et une ligne douce ; année nommée', 'bibliothèque|découvrir|carnet|stats|même taille|année nommée|autres styles|Bibliothèque sur une ligne', () => avecStyle('editorial', 'light', async () => {
    const b0 = books, tab0 = ui.tab, r = [], tailles = new Set();
    books = [fiche('V5 t1'), fiche('V5 t2', {statut: 'lu', note: 4, dateDebut: addDays(-5), dateFin: addDays(-1), notes: [{id: 'n1', texte: 'Une note', date: today()}],
      citations: [{id: 'c1', texte: 'Une', page: '1', date: today(), commentaire: ''}, {id: 'c2', texte: 'Deux', page: '2', date: today(), commentaire: ''}]})];
    const ecrans = [['a_lire', 'bibliothèque', 'À lire', /^1 livre · 2 en tout$/], ['decouvrir', 'découvrir', 'Découvrir', /^Une piste pour ce soir$/],
      ['notes', 'carnet', 'Carnet', /^1 note · 2 citations$/], ['stats', 'stats', 'Ciel', /^Tes statistiques \d{4}$/]];
    try {
      for (const [tab, nom, titre, ligne] of ecrans) { ui.tab = tab; render(); await pause(30);
        const h = $('#main .ecran-tete .ecran-titre'), l = $('#main .ecran-tete .ecran-ligne');
        r.push(h && h.textContent.trim() === titre && l && ligne.test(l.textContent.trim()) && h.checkVisibility() && l.checkVisibility() ? nom : `${nom} : « ${h ? h.textContent.trim() : '?'} » « ${l ? l.textContent.trim() : '?'} »`);
        if (h) tailles.add(getComputedStyle(h).fontSize + ' ' + getComputedStyle(h).fontWeight); }
      r.push(tailles.size === 1 ? 'même taille' : 'tailles : ' + [...tailles].join(' / '));
      // (place : avec un bandeau, le premier livre doit rester visible — titre et ligne côte à côte quand ils tiennent)
      ui.tab = 'a_lire'; render(); await pause(20); const ht = $('#main .ecran-tete .ecran-titre').getBoundingClientRect(), lt = $('#main .ecran-tete .ecran-ligne').getBoundingClientRect();
      ui.tab = 'stats'; render(); await pause(20); const y = $('#main .ecran-tete #year');
      r.push(y && y.getAttribute('aria-label') === 'Année' && y.getBoundingClientRect().height >= 40 ? 'année nommée' : 'année : ' + (y ? Math.round(y.getBoundingClientRect().height) : 'absente'));
      const ko = []; for (const st of ['android', 'actuel', 'carnet']) await enStyle(st, async () => { for (const [tab, , titre] of ecrans.slice(1)) { ui.tab = tab; render(); await pause(10);
        const h = $('#main .ecran-tete .ecran-titre'); if (!h || h.textContent.trim() !== titre || !h.checkVisibility()) ko.push(st + ' ' + tab); } });
      r.push(ko.length ? 'manque : ' + ko.join(',') : 'autres styles');
      r.push(lt.top < ht.bottom && lt.bottom > ht.top ? 'Bibliothèque sur une ligne' : 'Bibliothèque sur deux lignes');
      return r.join('|'); }
    finally { books = b0; ui.tab = tab0; render(); }
  }));
  await test('Lot V5 : Carnet — plus d’encart « Dernière note/citation » ; chaque carte montre la couverture de son livre ; l’encart reste dans la fiche', 'notes:sans encart|citations:sans encart|couvertures|fiche:encart', async () => {
    const b0 = books, tab0 = ui.tab, r = [], ko = [];
    books = [fiche('V5 carnet', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 20, notes: [{id: 'n1', texte: 'Une note du carnet', date: today()}],
      citations: [{id: 'c1', texte: 'Une citation du carnet', page: '3', date: today(), commentaire: ''}]})];
    const couv = (sel, ou) => { const l = [...document.querySelectorAll(sel)]; if (!l.length) ko.push(ou + ' vide');
      for (const c of l) { const p = c.querySelector('.ph'), b = p && p.getBoundingClientRect(); if (!p || b.width < 30 || b.width > 48 || b.height < 45 || b.height > 70) ko.push(ou + ' ' + (b ? Math.round(b.width) + '×' + Math.round(b.height) : 'sans couverture')); } };
    try { ui.tab = 'notes'; render(); await pause(30); r.push('notes:' + ($('#main .carnet-repere') ? 'encart' : 'sans encart')); couv('#nlist .carnet-entry', 'notes');
      ui.tab = 'citations'; render(); await pause(30); r.push('citations:' + ($('#main .carnet-repere') ? 'encart' : 'sans encart')); couv('#qlist .quote', 'citations');
      r.push(ko.length ? ko.join(',') : 'couvertures');
      ui.tab = 'en_cours'; render(); ouvrirFiche(books[0].id); await pause(60);
      r.push('fiche:' + (/Dernière note/i.test(($('.livre-garde') || {textContent: ''}).textContent) ? 'encart' : 'sans encart'));
      return r.join('|'); }
    finally { try { fermerFiche(); } catch (e) {} books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : Stats — chiffre, libellé court sur une ligne, détail en petit ; tuiles de même hauteur (texte 100 % et 130 %)', 'libellés|détails|une ligne|même hauteur', async () => {
    const b0 = books, tab0 = ui.tab, f0 = document.documentElement.style.fontSize, y = today().slice(0, 4), r = [];
    books = [...[1, 2, 3, 4].map(i => fiche('V5 lu ' + i, {statut: 'lu', note: 4, pagesTotal: 100 * i, dateDebut: addDays(-30 - i), dateFin: addDays(-i)})),
      fiche('V5 série', {statut: 'en_cours', pagesTotal: 100, pageActuelle: 20, journal: [{date: addDays(-1), page: 10}, {date: today(), page: 20}]})];
    try { ui.tab = 'stats'; ui.statsPlus = true; render(); await pause(30);
      const t = [...document.querySelectorAll('#main .stats-plus .tiles .tile')].slice(0, 4), lib = t.map(x => (x.querySelector(':scope > span') || {textContent: '?'}).textContent.trim()), det = t.map(x => (x.querySelector(':scope > small') || {textContent: '?'}).textContent.trim());
      r.push(lib.slice(0, 3).join(',') === 'livres lus,pages lues,note moyenne' && /^jours? d’affilée$/.test(lib[3]) ? 'libellés' : 'libellés : ' + lib.join(','));
      r.push(det[0] === 'en ' + y && det[1] === '4 livres sur 4 renseignés' && det[2] === 'sur 5' && /^record : \d+ jours?$/.test(det[3]) ? 'détails' : 'détails : ' + det.join(','));
      r.push(t.every(x => { const s = x.querySelector(':scope > span'); return s && s.getClientRects().length === 1 && s.getBoundingClientRect().height < parseFloat(getComputedStyle(s).fontSize) * 1.8; }) ? 'une ligne' : 'sur deux lignes');
      const h = []; for (const taille of ['100%', '130%']) { document.documentElement.style.fontSize = taille; render(); await pause(30);
        const hs = [...document.querySelectorAll('#main .stats-plus .tiles .tile')].slice(0, 4).map(x => Math.round(x.getBoundingClientRect().height)); if (Math.max(...hs) - Math.min(...hs) > 1) h.push(taille + ' ' + hs.join('/')); }
      r.push(h.length ? 'hauteurs : ' + h.join(' ; ') : 'même hauteur');
      return r.join('|'); }
    finally { ui.statsPlus = false; document.documentElement.style.fontSize = f0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : fiche — action principale pleine largeur, puis Note, Citation, Feuilleter sur une rangée de même largeur (texte 100 % et 130 %)', 'pleine largeur|une rangée|même largeur|nom lu|sans débordement', async () => {
    const b0 = books, tab0 = ui.tab, f0 = document.documentElement.style.fontSize, ko = {plein: [], rangee: [], largeur: [], nom: [], deborde: []};
    books = [fiche('V5 fiche', {statut: 'en_cours', pagesTotal: 206, pageActuelle: 40}), fiche('V5 fiche lu', {statut: 'lu', note: 5, avis: 'Bien.', dateDebut: addDays(-9), dateFin: addDays(-1)})];
    try { for (const taille of ['100%', '130%']) for (const b of books) {
        document.documentElement.style.fontSize = taille; ui.tab = b.statut; render(); ouvrirFiche(b.id); await pause(80); const ou = b.statut + ' ' + taille;
        const zone = $('#livre .livre-actions-hero'), z = zone.getBoundingClientRect(), pri = zone.querySelector('.pri').getBoundingClientRect();
        const trois = [...zone.querySelectorAll('[data-fiche="ajouter"],[data-fiche="ouvrir-carnet"]')].map(x => x.getBoundingClientRect());
        if (Math.abs(pri.width - z.width) > 2) ko.plein.push(ou + ' ' + Math.round(pri.width) + '/' + Math.round(z.width));
        if (trois.length !== 3 || Math.max(...trois.map(x => x.top)) - Math.min(...trois.map(x => x.top)) > 2) ko.rangee.push(ou);
        if (trois.length === 3 && Math.max(...trois.map(x => x.width)) - Math.min(...trois.map(x => x.width)) > 2) ko.largeur.push(ou);
        const f = zone.querySelector('[data-fiche="ouvrir-carnet"]'); if (!f || f.getAttribute('aria-label') !== 'Feuilleter comme un livre') ko.nom.push(ou);
        if ([...zone.querySelectorAll('.btn')].some(x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().right > z.right + 1)) ko.deborde.push(ou);
        await fermerFiche(); await pause(30); }
      const k = (c, n) => ko[c].length ? n + ' : ' + ko[c].join(',') : n;
      return [k('plein', 'pleine largeur'), k('rangee', 'une rangée'), k('largeur', 'même largeur'), k('nom', 'nom lu'), k('deborde', 'sans débordement')].join('|'); }
    finally { try { await fermerFiche(); } catch (e) {} document.documentElement.style.fontSize = f0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : « Que lire ensuite ? » — « Tous » au lieu de « Peu importe », aide de longueur en texte normal, choix de longueur sur une ligne', 'pas de « Peu importe »|Tous partout|aide normale|une ligne', async () => {
    const b0 = books, tab0 = ui.tab, m0 = pick.mode;
    books = [fiche('V5 ensuite A', {statut: 'a_lire', genre: 'Roman', pagesTotal: 200}), fiche('V5 ensuite B', {statut: 'a_lire', genre: 'Essai', pagesTotal: 500})];
    try { pick.mode = 'liste'; ui.tab = 'a_lire'; render(); await pause(30); openNext(); await pause(60);
      const m = $('#modal'), r = [];
      r.push(/Peu importe/.test(m.textContent) ? 'encore « Peu importe »' : 'pas de « Peu importe »');
      const premiers = [...m.querySelectorAll('#nx_len, #nx_genre')].map(g => g.querySelector('button') && g.querySelector('button').textContent.trim());
      r.push(premiers.length === 2 && premiers.every(t => t === 'Tous') ? 'Tous partout' : 'premiers choix : ' + premiers.join(','));
      const aide = [...m.querySelectorAll('*')].find(e => e.children.length === 0 && /^Court : moins de 250 p\. · Long : plus de 450 p\.$/.test(e.textContent.trim()));
      r.push(aide && getComputedStyle(aide).textTransform === 'none' ? 'aide normale' : aide ? 'aide en ' + getComputedStyle(aide).textTransform : 'aide absente');
      const coupes = [...m.querySelectorAll('#nx_len button')].filter(x => { const g = document.createRange(); g.selectNodeContents(x); return [...g.getClientRects()].map(c => Math.round(c.top)).filter((t, i, a) => a.indexOf(t) === i).length > 1; });
      r.push(coupes.length ? 'coupés : ' + coupes.map(x => x.textContent.trim()).join(',') : 'une ligne');
      return r.join('|'); }
    finally { closeM(); pick.mode = m0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : sélecteurs — texte 100 % et 130 % : tous les choix sur une ligne ou tous empilés, jamais un choix seul ni un mot coupé', 'thème|densité|animations|longueur', async () => {
    const b0 = books, tab0 = ui.tab, m0 = pick.mode, f0 = document.documentElement.style.fontSize, ko = {};
    const NOMS = {st_theme: 'thème', st_density: 'densité', st_anim: 'animations', nx_len: 'longueur'};
    const lignes = el => { const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter(c => c.width > 0).map(c => Math.round(c.top)).filter((t, i, a) => !a.some((u, j) => j < i && Math.abs(u - t) < 3)).length; };
    const juger = (id, taille) => { const s = $('#' + id); if (!s) { (ko[id] = ko[id] || []).push(taille + ' absent'); return; }
      const bs = [...s.querySelectorAll('button')], r = bs.map(x => x.getBoundingClientRect()), hauts = r.map(x => Math.round(x.top));
      const uneLigne = Math.max(...hauts) - Math.min(...hauts) < 3;
      const empiles = new Set(hauts).size === bs.length && Math.max(...r.map(x => x.width)) - Math.min(...r.map(x => x.width)) < 2;
      if (!uneLigne && !empiles) (ko[id] = ko[id] || []).push(taille + ' bancal ' + hauts.join('/'));
      const coupes = bs.filter(x => lignes(x) > 1 || x.scrollWidth > x.clientWidth + 1); if (coupes.length) (ko[id] = ko[id] || []).push(taille + ' coupé : ' + coupes.map(x => x.textContent.trim()).join(','));
      if (taille.endsWith('100%') && innerWidth >= 360 && !uneLigne) (ko[id] = ko[id] || []).push('100 % pas sur une ligne'); };
    books = [fiche('V5 seg', {statut: 'a_lire', pagesTotal: 200})];
    try { for (const st of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) await enStyle(st, async () => { for (const taille of ['100%', '130%']) { document.documentElement.style.fontSize = taille; const ou = st + ' ' + taille;
        ui.tab = 'a_lire'; render(); openSettings(); await pause(60); ['st_theme', 'st_density', 'st_anim'].forEach(id => juger(id, ou)); closeM(); await pause(30);
        pick.mode = 'liste'; openNext(); await pause(60); juger('nx_len', ou); closeM(); await pause(30); } });
      return Object.keys(NOMS).map(id => ko[id] ? NOMS[id] + ' : ' + ko[id].join(' ; ') : NOMS[id]).join('|'); }
    finally { try { closeM(); } catch (e) {} document.documentElement.style.fontSize = f0; pick.mode = m0; books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : citations — « et » restent collés au texte par une espace insécable (Carnet, fiche feuilletable, formulaire)', 'carnet|fiche|formulaire', async () => {
    const b0 = books, tab0 = ui.tab, r = [], T = 'Écrire, c’est reprendre le pouvoir sur ce qui a été pris en silence';
    const colle = el => { if (!el) return 'absent'; const t = el.textContent.trim(); if (!t.startsWith('« ') || !t.includes(' »')) return 'espaces ordinaires';
      const n = [...el.childNodes].find(x => x.nodeType === 3 && x.textContent.includes('»')) || el.firstChild, i = n.textContent.lastIndexOf('»'), g = document.createRange();
      g.setStart(n, Math.max(0, n.textContent.lastIndexOf(' ', i - 2) + 1)); g.setEnd(n, i + 1); const tops = [...g.getClientRects()].filter(c => c.width > 0).map(c => Math.round(c.top));
      return Math.max(...tops) - Math.min(...tops) > 3 ? '» seul sur sa ligne' : 'ok'; };
    books = [fiche('V5 citation', {statut: 'en_cours', pagesTotal: 206, pageActuelle: 40, citations: [{id: 'v5c', texte: T, page: '32', date: today(), commentaire: ''}]})];
    try { ui.tab = 'citations'; render(); await pause(40); const c = colle($('#qlist .quote-texte')); r.push(c === 'ok' ? 'carnet' : 'carnet : ' + c);
      ui.tab = 'en_cours'; render(); ouvrirFiche(books[0].id); await pause(80); $('#livre [data-fiche="ouvrir-carnet"]').click(); await pause(120); montrerPage(debutsSections(Feuille.pages).citations); await pause(60);
      const f = colle([...document.querySelectorAll('#lvPages .entree.citation p')].find(p => p.textContent.includes('pouvoir'))); r.push(f === 'ok' ? 'fiche' : 'fiche : ' + f);
      await fermerFiche(); await pause(30); openForm(books[0]); await pause(80);
      const q = colle([...document.querySelectorAll('#modal .q p')].find(p => p.textContent.includes('pouvoir'))); r.push(q === 'ok' ? 'formulaire' : 'formulaire : ' + q);
      return r.join('|'); }
    finally { try { closeM(); } catch (e) {} try { await fermerFiche(); } catch (e) {} books = b0; ui.tab = tab0; render(); }
  });
  await test('Lot V5 : Stats — aucun libellé de tuile coupé par « … » (texte 100 % et 130 %, avec chrono) ; pas de « 0 livre sur 0 »', 'libellés entiers|sans lecture', async () => {
    const b0 = books, tab0 = ui.tab, f0 = document.documentElement.style.fontSize, ko = [], r = [];
    books = [fiche('V5 tuiles', {statut: 'lu', note: 3, pagesTotal: 200, dateDebut: addDays(-3), dateFin: today(), sessions: [{date: today(), de: 1, a: 60, min: 40}]})];
    try { for (const t of ['100%', '130%']) { document.documentElement.style.fontSize = t; ui.tab = 'stats'; ui.statsPlus = true; render(); await pause(40);
        const s = [...document.querySelectorAll('#main .stats-plus .tiles .tile > span')]; if (s.length < 6) ko.push(t + ' ' + s.length + ' tuiles');
        s.filter(x => x.scrollWidth > x.clientWidth + 1).forEach(x => ko.push(t + ' ' + x.textContent)); }
      r.push(ko.length ? 'coupés : ' + ko.join(',') : 'libellés entiers');
      document.documentElement.style.fontSize = f0; books = [fiche('V5 rien')]; render(); await pause(30);
      r.push(/0 livre sur 0/.test($('#main .stats-plus .tiles').textContent) ? '« 0 livre sur 0 »' : 'sans lecture');
      return r.join('|'); }
    finally { ui.statsPlus = false; document.documentElement.style.fontSize = f0; books = b0; ui.tab = tab0; render(); }
  });
  /* ---------- Lot 31 (11/11/2026) : Ciel ---------- */
  await test('Lot 31 : l’onglet s’appelle « Ciel » (5 styles), sa tête dit « Tes statistiques », la clé reste stats', 'barre:Ciel|tête:Ciel|ligne:ok|clé:stats|icône:ok', async () => {
    const st0 = prefs.style, r = [];
    try {
      const noms = [];
      for (const s of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) {
        prefs.style = s; document.documentElement.dataset.style = s; ui.tab = 'stats'; render(); await pause(20);
        noms.push($('#tabs [data-space="stats"] > span:not(.sr):not(.ico)').textContent.trim());
      }
      r.push('barre:' + ([...new Set(noms)].join(',')));
      r.push('tête:' + $('#main .ecran-titre').textContent.trim());
      r.push(/^Tes statistiques \d{4}$/.test($('#main .ecran-ligne').textContent.trim()) ? 'ligne:ok' : 'ligne:' + $('#main .ecran-ligne').textContent);
      r.push('clé:' + $('#tabs .tab.on').dataset.space);
      r.push(getComputedStyle($('#tabs [data-space="stats"] .ico')).getPropertyValue('--ico').includes('svg') ? 'icône:ok' : 'icône:absente');
    } finally { prefs.style = st0; document.documentElement.dataset.style = st0; render(); }
    return r.join('|');
  });
  await test('Lot 31 : étoiles — une par lecture finie dans l’année, ordre des dates, positions stables, tailles selon les pages, voisines groupées', 'compte:3|ordre:ok|stable:ok|bornes:ok|tailles:ok|relecture:2|groupes:ok', async () => {
    const A = fiche('Alpha', {statut: 'lu', dateFin: '2026-03-02', pagesTotal: 120});
    const B = fiche('Bêta', {statut: 'lu', dateFin: '2026-01-15', pagesTotal: 900});
    const C = fiche('Gamma', {statut: 'lu', dateFin: '2025-12-30', pagesTotal: 300});            // autre année
    const D = fiche('Delta', {statut: 'en_cours'});                                                // pas fini
    const E = fiche('Epsilon', {statut: 'lu', dateFin: '2026-11-01', historique: [{debut: '2026-01-02', fin: '2026-02-01', note: 3}]}); // relu
    const ly = [A, B, C, D, E].flatMap(b => [...(b.historique || []).filter(h => h.fin).map(h => ({b, fin: h.fin})), ...(b.statut === 'lu' && b.dateFin ? [{b, fin: b.dateFin}] : [])])
      .filter(r => r.fin.startsWith('2026'));
    const e1 = etoilesCiel(ly, 2026), e2 = etoilesCiel(ly.slice().reverse(), 2026), r = [];
    r.push('compte:' + new Set(e1.map(e => e.b.titre)).size);
    r.push(egal(e1.map(e => e.fin), e1.map(e => e.fin).slice().sort()) ? 'ordre:ok' : 'ordre:ko');
    r.push(egal(e1.map(e => [e.x, e.y, e.r]), e2.map(e => [e.x, e.y, e.r])) ? 'stable:ok' : 'stable:ko');
    r.push(e1.every(e => e.x >= CIEL.marge && e.x <= CIEL.l - CIEL.marge && e.y >= CIEL.marge && e.y <= CIEL.h - CIEL.horizon) ? 'bornes:ok' : 'bornes:ko');
    const rA = e1.find(e => e.b.titre === 'Alpha').r, rB = e1.find(e => e.b.titre === 'Bêta').r, rE = e1.find(e => e.b.titre === 'Epsilon').r;
    r.push(rB > rA && rE > rA && rE < rB ? 'tailles:ok' : `tailles:${rA}/${rB}/${rE}`);   // (pages inconnues → taille moyenne)
    r.push('relecture:' + e1.filter(e => e.b.titre === 'Epsilon').length);
    const proches = [{x: 100, y: 50}, {x: 120, y: 60}, {x: 250, y: 50}].map((p, i) => ({...p, r: 3, i, b: {titre: 'P' + i}}));
    const g = groupesCiel(proches);
    r.push(g.length === 2 && g[0].etoiles.length === 2 && g[1].etoiles.length === 1 ? 'groupes:ok' : 'groupes:' + g.map(x => x.etoiles.length).join(','));
    return r.join('|');
  });
  await test('Lot 31 : écran Ciel — dessin résumé, trois chiffres, phrase, état vide, rien de perdu, tuiles dans « Plus de chiffres »', 'résumé:ok|étoiles:3|chiffres:3|phrase:ok|vide:ok|blocs:ok|plus:replié|tuiles:6', async () => {
    await vider();
    const y = new Date().getFullYear(), r = [];
    books = ['Un', 'Deux', 'Trois'].map((t, i) => fiche(t, {statut: 'lu', dateFin: `${y}-0${i + 3}-10`, pagesTotal: 100 * (i + 1)}));
    books.push(fiche('Quatre', {statut: 'en_cours', sessions: [{date: `${y}-03-01`, min: 30, de: 1, a: 20}]}));
    ui.tab = 'stats'; ui.year = y; ui.statsPlus = false; render(); await pause(30);
    r.push(/^3 livres finis en \d{4}/.test($('#ciel svg').getAttribute('aria-label')) ? 'résumé:ok' : 'résumé:' + $('#ciel svg').getAttribute('aria-label'));
    r.push('étoiles:' + document.querySelectorAll('#ciel .ciel-point').length);
    r.push('chiffres:' + document.querySelectorAll('#main .ciel-chiffres > div').length);
    r.push($('#main .ciel-phrase') && $('#main .ciel-phrase').textContent.trim().length > 10 ? 'phrase:ok' : 'phrase:absente');
    const plus = $('#main details.stats-plus');
    r.push(['Mon objectif', 'Pages lues par semaine', 'Livres finis par mois', 'Ma bibliothèque en détail', 'Exporter ma liste', 'Sauvegarde'].every(t => $('#main').textContent.includes(t)) ? 'blocs:ok' : 'blocs:manquants');
    r.push(plus && !plus.open ? 'plus:replié' : 'plus:ouvert');
    r.push('tuiles:' + plus.querySelectorAll('.tiles .tile').length);
    books = []; render(); await pause(20);
    r.splice(4, 0, /encore vide/.test($('#ciel').textContent) && !$('#ciel .ciel-trace') ? 'vide:ok' : 'vide:ko');
    return r.join('|');
  });
  await test('Lot 31 : étoiles touchables — 48 px, nom lu échappé, ouvre le bon livre ; voisines → « Quel livre ? » ; liste de secours', 'cibles:ok|nom:ok|ouvre:ok|choix:2|choix-ouvre:ok|liste:ok', async () => {
    await vider();
    const y = new Date().getFullYear(), r = [];
    books = [fiche('Seul <b>« loin »</b>', {statut: 'lu', dateFin: `${y}-01-05`}), fiche('Voisin A', {statut: 'lu', dateFin: `${y}-11-01`}), fiche('Voisin B', {statut: 'lu', dateFin: `${y}-11-01`})];
    // (positions verticales forcées proches : on remplace hue() le temps du test)
    const h0 = window.hue; window.hue = s => /Voisin/.test(s) ? 100 : 300;
    try {
      ui.tab = 'stats'; ui.year = y; render(); await pause(30);
      const bt = [...document.querySelectorAll('#ciel .ciel-etoile')];
      r.push(bt.every(b => { const q = b.getBoundingClientRect(); return q.width >= 48 && q.height >= 48; }) ? 'cibles:ok' : 'cibles:ko');
      const seul = bt.find(b => !b.classList.contains('ciel-groupe'));
      r.push(seul.getAttribute('aria-label').startsWith('Seul <b>« loin »</b>, fini le') && !seul.querySelector('b') ? 'nom:ok' : 'nom:' + seul.getAttribute('aria-label'));
      const ouverte = t => $('#livreOv').classList.contains('show') && $('#livreOv').textContent.includes(t);
      seul.click(); await pause(60);
      r.push(ouverte('Seul') ? 'ouvre:ok' : 'ouvre:ko'); fermerFiche(); await pause(30);
      $('#ciel .ciel-groupe').click(); await pause(30);
      r.push('choix:' + document.querySelectorAll('#modal [data-open]').length);
      $('#modal [data-open]').click(); await pause(60);
      r.push(ouverte('Voisin') && !$('#ov').classList.contains('show') ? 'choix-ouvre:ok' : 'choix-ouvre:ko');
      fermerFiche(); await pause(30);
      ui.statsPlus = true; render(); await pause(20);
      r.push(document.querySelectorAll('#main .ciel-liste [data-open]').length === 3 ? 'liste:ok' : 'liste:ko');
    } finally { window.hue = h0; ui.statsPlus = false; }
    return r.join('|');
  });
  await test('Lot 31 : fin d’un livre — calque fleur → étoile (Complète), fondu (Simple), toast (Aucune) ; retour le ferme ; pas deux fois', 'complete:calque|ferme 4 s|simple:calque fondu|aucune:toast|retour:fermé, fiche ok|modifier:calque|déjà lu:rien|titre:Livre terminé !', async () => {
    await vider();
    const a0 = prefs.animation, lents = [prefs.anim3dLent, prefs.anim2dLent], r = [];
    // (un test d'ouverture précédent a pu juger le téléphone « lent » : modeAnimation() rabattrait Complète sur Simple)
    prefs.anim3dLent = prefs.anim2dLent = false;
    const finir = async (titre, mode, via) => {
      prefs.animation = mode; savePrefs();
      const b = fiche(titre, {statut: 'en_cours', pagesTotal: 100, pageActuelle: 90}); books.push(b); render();
      openForm({...b, statut: 'lu', dateFin: today()}, via === 'modifier' ? {} : {finish: true}); await pause(20);
      const t = $('#modal h2').textContent; $('#f_save').click(); await pause(80); return t;
    };
    try {
      const titre = await finir('Un', 'complete');
      r.push($('#feteOv').classList.contains('show') && $('#feteOv').classList.contains('complete') ? 'complete:calque' : 'complete:rien');
      await pause(4200); r.push(!$('#feteOv').classList.contains('show') ? 'ferme 4 s' : 'reste ouvert');
      await finir('Deux', 'simple'); r.push($('#feteOv').classList.contains('simple') ? 'simple:calque fondu' : 'simple:ko'); fermerFete();
      await finir('Trois', 'aucune'); r.push(!$('#feteOv').classList.contains('show') && /étoile de plus/.test($('#toast').textContent) ? 'aucune:toast' : 'aucune:ko');
      // Retour : ouvrir une fiche, puis finir depuis elle ; le retour ferme seulement le calque
      await finir('Quatre', 'complete'); ouvrirFiche(books.find(b => b.titre === 'Quatre').id); await pause(40);
      fermerDessus(); await pause(30);
      r.push(!$('#feteOv').classList.contains('show') && $('#livreOv').classList.contains('show') ? 'retour:fermé, fiche ok' : 'retour:ko'); fermerFiche();
      await finir('Cinq', 'complete', 'modifier'); r.push($('#feteOv').classList.contains('show') ? 'modifier:calque' : 'modifier:rien'); fermerFete();
      const deja = books.find(b => b.titre === 'Cinq'); openForm(deja); await pause(20); $('#f_save').click(); await pause(80);
      r.push(!$('#feteOv').classList.contains('show') ? 'déjà lu:rien' : 'déjà lu:rejoue');
      r.push('titre:' + titre.trim());
    } finally { prefs.animation = a0; [prefs.anim3dLent, prefs.anim2dLent] = lents; savePrefs(); if (window.fermerFete) fermerFete(); }
    return r.join('|');
  });
  await test('Lot 31 : ciel lisible dans les 5 styles × clair/sombre — étoiles ≥ 3, textes ≥ 4,5 ; rien ne déborde à 130 %', 'contrastes:ok|débord:aucun', async () => {
    const st0 = document.documentElement.dataset.style, th0 = document.documentElement.dataset.theme, ko = [];
    const y = new Date().getFullYear();
    books = [fiche('Un titre assez long pour la ligne', {statut: 'lu', dateFin: `${y}-03-10`, pagesTotal: 400}), fiche('Deux', {statut: 'lu', dateFin: `${y}-03-20`})];
    // (contraste() lit des couleurs « rgb(…) » : on passe par les couleurs calculées, jamais par les codes « #… » des variables)
    const sonde = document.createElement('div'); document.body.appendChild(sonde);
    const couleur = v => { sonde.style.background = `var(${v})`; return getComputedStyle(sonde).backgroundColor; };
    try {
      for (const s of ['jardin', 'editorial', 'android', 'actuel', 'carnet']) for (const th of ['light', 'dark']) {
        document.documentElement.dataset.style = s; document.documentElement.dataset.theme = th; ui.tab = 'stats'; ui.year = y; render(); await pause(20);
        const etoile = getComputedStyle($('#ciel .ciel-point')).fill, c0 = contraste(etoile, couleur('--surface'));
        if (c0 < 3) ko.push(`${s}/${th} étoile ${c0.toFixed(2)}`);
        for (const el of document.querySelectorAll('#main .ciel-chiffres span, #main .ciel-phrase, #main .ecran-ligne')) {
          const c = contraste(getComputedStyle(el).color, couleur('--fond'));
          if (c < 4.5) ko.push(`${s}/${th} ${el.className} ${c.toFixed(2)}`);
        }
      }
      document.documentElement.style.fontSize = '130%'; render(); await pause(20);
      const deb = [...document.querySelectorAll('#main .ciel-chiffres > div, #main .ciel-phrase')].filter(e => e.scrollWidth > e.clientWidth + 1);
      return [ko.length ? 'contrastes:' + ko.join(';') : 'contrastes:ok', deb.length ? 'débord:' + deb.length : 'débord:aucun'].join('|');
    } finally { sonde.remove(); document.documentElement.style.fontSize = ''; document.documentElement.dataset.style = st0; document.documentElement.dataset.theme = th0; render(); }
  });
  await test('Lot 31 : vitesse — la liste « Les livres de mon ciel » ne se construit qu’à l’ouverture du volet ; plus de 60 étoiles : sans halo', 'replié:vide|ouvert:65|beaucoup:sans halo', async () => {
    const y = new Date().getFullYear(), r = [];
    books = Array.from({length: 65}, (_, i) => fiche('Beaucoup ' + i, {statut: 'lu', dateFin: `${y}-01-${String(1 + i % 28).padStart(2, '0')}`}));
    try {
      ui.tab = 'stats'; ui.year = y; ui.statsPlus = false; render(); await pause(20);
      r.push($('#main .ciel-liste').childElementCount ? 'replié:' + $('#main .ciel-liste').childElementCount : 'replié:vide');
      $('#main details.stats-plus').open = true; await pause(40);
      r.push('ouvert:' + document.querySelectorAll('#main .ciel-liste [data-open]').length);
      r.push(getComputedStyle($('#ciel .ciel-point')).filter === 'none' ? 'beaucoup:sans halo' : 'beaucoup:halo');
    } finally { ui.statsPlus = false; }
    return r.join('|');
  });
  await test('Lot 31 : calque — ciel, plante, texte et boutons ne se chevauchent pas et restent dans l’écran (texte 100 % et 130 %)', 'sans chevauchement', async () => {
    const a0 = prefs.animation, f0 = document.documentElement.style.fontSize, ko = [];
    const b = fiche('Un titre de livre assez long pour passer sur deux lignes', {statut: 'lu', dateFin: today(), pagesTotal: 320});
    books = [b, fiche('Avant', {statut: 'lu', dateFin: today().slice(0, 4) + '-01-05'})];
    try {
      for (const t of ['100%', '130%']) {
        document.documentElement.style.fontSize = t; prefs.animation = 'simple'; celebrerEtoile(b); await pause(400);
        const q = s => $('#feteOv ' + s).getBoundingClientRect(), z = ['.fete-ciel', '.fete-plante', '.fete-texte', '.fete-acts'].map(s => [s, q(s)]);
        for (let i = 0; i < z.length; i++) {
          const [n, r] = z[i];
          if (r.top < -1 || r.bottom > innerHeight + 1) ko.push(`${t} ${n} hors écran`);
          for (let j = i + 1; j < z.length; j++) { const [m, s] = z[j]; if (r.bottom > s.top + 1 && s.bottom > r.top + 1 && r.right > s.left + 1 && s.right > r.left + 1) ko.push(`${t} ${n}/${m}`); }
        }
        fermerFete();
      }
      return ko.length ? 'chevauchements : ' + ko.join(', ') : 'sans chevauchement';
    } finally { prefs.animation = a0; document.documentElement.style.fontSize = f0; fermerFete(); }
  });
  await test('Lot 31 : calque Complète — la lueur monte jusqu’à l’étoile neuve (à 4 px près), quelle que soit sa place dans le ciel', 'vise l’étoile', async () => {
    const a0 = prefs.animation, lents = [prefs.anim3dLent, prefs.anim2dLent], ko = [];
    prefs.anim3dLent = prefs.anim2dLent = false;
    const y = today().slice(0, 4);
    try {
      for (const d of ['01-10', '06-15', '12-20']) {
        const b = fiche('Lueur ' + d, {statut: 'lu', dateFin: `${y}-${d}`, pagesTotal: 300});
        books = [fiche('Avant', {statut: 'lu', dateFin: `${y}-01-02`}), b];
        prefs.animation = 'complete'; celebrerEtoile(b); await pause(30);
        const l = $('#feteOv .fete-lueur'), e = $('#feteOv .fete-neuve').getBoundingClientRect(), r = l.getBoundingClientRect();
        const cs = getComputedStyle(l), dx = parseFloat(cs.getPropertyValue('--dx')), dy = parseFloat(cs.getPropertyValue('--dy'));
        const ex = e.left + e.width / 2, ey = e.top + e.height / 2, lx = r.left + r.width / 2 + dx, ly = r.top + r.height / 2 + dy;
        if (!(Math.abs(ex - lx) <= 4 && Math.abs(ey - ly) <= 4)) ko.push(`${d} écart ${Math.round(ex - lx)},${Math.round(ey - ly)}`);
        fermerFete();
      }
      return ko.length ? ko.join(' ; ') : 'vise l’étoile';
    } finally { prefs.animation = a0; [prefs.anim3dLent, prefs.anim2dLent] = lents; fermerFete(); }
  });
  /* (lot 31, relecture finale) */
  await test('Lot 31 : toucher une étoile visible ouvre CE livre, même près d’un groupe ; toucher le vide ne fait rien', 'A:A|C:C|vide:rien', async () => {
    const y = new Date().getFullYear(), r = [];
    books = [fiche('Chaîne A', {statut: 'lu', dateFin: `${y}-01-10`}), fiche('Chaîne B', {statut: 'lu', dateFin: `${y}-03-02`}), fiche('Chaîne C', {statut: 'lu', dateFin: `${y}-04-22`})];
    const h0 = window.hue; window.hue = s => /Chaîne/.test(s) ? 100 : h0(s);
    const toucher = (x, y2) => { const el = document.elementFromPoint(x, y2); el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: x, clientY: y2, detail: 1})); };
    const ouverte = () => $('#livreOv').classList.contains('show') ? ($('#livreOv').textContent.match(/Chaîne [ABC]/) || ['?'])[0].slice(-1) : $('#ov').classList.contains('show') ? 'choix' : 'rien';
    try {
      ui.tab = 'stats'; ui.year = y; render(); scrollTo(0, 0); await pause(30);
      const pts = [...document.querySelectorAll('#ciel .ciel-point')].map(c => { const q = c.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
      for (const [k, i] of [['A', 0], ['C', 2]]) {
        toucher(...pts[i]); await pause(60); r.push(k + ':' + ouverte());
        try { closeM(); } catch (e) {} await fermerFiche(); render(); scrollTo(0, 0); await pause(30);
      }
      const s = $('#ciel svg').getBoundingClientRect();
      toucher(s.left + s.width / 2, s.bottom - 4); await pause(60); r.push('vide:' + ouverte());
    } finally { window.hue = h0; try { closeM(); } catch (e) {} await fermerFiche(); }
    return r.join('|');
  });
  await test('Lot 31 : le calque allume l’étoile de CETTE lecture (relecture, date ancienne) ; sans date de fin, pas de fête', 'relu:ok|ancienne:ok|sans date:rangé', async () => {
    const a0 = prefs.animation, lents = [prefs.anim3dLent, prefs.anim2dLent], y = today().slice(0, 4), r = [];
    prefs.anim3dLent = prefs.anim2dLent = false; prefs.animation = 'complete';
    const cxDe = (b, fin) => String(etoilesCiel(readings(), +y).find(e => e.b.id === b.id && e.fin === fin).x);
    try {
      const R = fiche('Relu', {statut: 'en_cours', pagesTotal: 100, historique: [{debut: `${y}-01-02`, fin: `${y}-02-01`, note: 3}]});
      books = [R]; render(); openForm({...R, statut: 'lu', dateFin: today()}, {finish: true}); await pause(20); $('#f_save').click(); await pause(80);
      r.push($('#feteOv .fete-neuve') && $('#feteOv .fete-neuve').getAttribute('cx') === cxDe(books.find(b => b.id === R.id), today()) ? 'relu:ok' : 'relu:ko'); fermerFete();
      const apres = Array.from({length: 9}, (_, i) => fiche('Après ' + i, {statut: 'lu', dateFin: `${y}-0${2 + (i % 7)}-1${i % 9}`}));
      const V = fiche('Vieux', {statut: 'en_cours'}); books = [...apres, V]; render();
      openForm({...V, statut: 'lu', dateFin: `${y}-01-03`}, {finish: true}); await pause(20); $('#f_save').click(); await pause(80);
      r.push($('#feteOv .fete-neuve') && $('#feteOv .fete-neuve').getAttribute('cx') === cxDe(books.find(b => b.id === V.id), `${y}-01-03`) ? 'ancienne:ok' : 'ancienne:ko'); fermerFete();
      const S = fiche('Sans date', {statut: 'en_cours'}); books = [S]; render();
      openForm({...S, statut: 'lu', dateFin: ''}, {}); await pause(20); $('#f_dateFin') && ($('#f_dateFin').value = ''); $('#f_save').click(); await pause(80);
      r.push(!$('#feteOv').classList.contains('show') && /Rangé/.test($('#toast').textContent) ? 'sans date:rangé' : 'sans date:' + ($('#feteOv').classList.contains('show') ? 'fête' : $('#toast').textContent));
    } finally { prefs.animation = a0; [prefs.anim3dLent, prefs.anim2dLent] = lents; fermerFete(); }
    return r.join('|');
  });
  await test('Lot 31 : « Voir mon ciel » depuis la fiche ferme la fiche et montre le ciel en haut de l’écran', 'fiche:fermée|onglet:stats|haut:ok|liste:haut', async () => {
    const a0 = prefs.animation, y = today().slice(0, 4), r = [];
    try {
      books = Array.from({length: 30}, (_, i) => fiche('Long ' + i, {statut: 'en_cours'})); ui.tab = 'en_cours'; render(); await pause(20); scrollTo(0, 400);
      const b = books[3]; ouvrirFiche(b.id); await pause(40);
      Object.assign(b, {statut: 'lu', dateFin: today()}); prefs.animation = 'simple'; celebrerEtoile(b); await pause(30);
      $('#feteCiel').click(); await pause(80);
      await pause(150);
      r.push($('#livreOv').classList.contains('show') ? 'fiche:ouverte' : 'fiche:fermée', 'onglet:' + ui.tab, scrollY < 5 && $('#ciel') ? 'haut:ok' : 'haut:' + Math.round(scrollY));
      // (depuis la liste défilée, sans fiche ouverte)
      ui.tab = 'en_cours'; render(); await pause(20); scrollTo(0, 600); await pause(20);
      celebrerEtoile(books[5]); await pause(30); $('#feteCiel').click(); await pause(150);
      r.push(scrollY < 5 && $('#ciel') ? 'liste:haut' : 'liste:' + Math.round(scrollY));
    } finally { prefs.animation = a0; fermerFete(); await fermerFiche(); }
    return r.join('|');
  });
  await test('Lot 31 : tracé animé — le pointillé couvre tout le trait, même avec 100 livres', 'trait entier', async () => {
    const a0 = prefs.animation, t0 = prefs.cielTrace, lents = [prefs.anim3dLent, prefs.anim2dLent], y = new Date().getFullYear();
    prefs.anim3dLent = prefs.anim2dLent = false; prefs.animation = 'complete'; prefs.cielTrace = '';
    books = Array.from({length: 100}, (_, i) => fiche('Cent ' + i * 7, {statut: 'lu', dateFin: `${y}-${String(1 + i % 10).padStart(2, '0')}-${String(1 + i % 27).padStart(2, '0')}`}));
    try {
      ui.tab = 'stats'; ui.year = y; render(); await pause(20);
      const p = $('#ciel .ciel-trace.anime'); if (!p) return 'pas de tracé animé';
      const L = p.getAttribute('pathLength') ? +p.getAttribute('pathLength') : p.getTotalLength(), d = parseFloat(getComputedStyle(p).strokeDasharray);
      return d >= L ? 'trait entier' : `pointillé ${d} pour ${Math.round(L)}`;
    } finally { prefs.animation = a0; prefs.cielTrace = t0; [prefs.anim3dLent, prefs.anim2dLent] = lents; }
  });
  await test('Lot 31 : le calque rend le focus en se fermant ; une fenêtre qui s’ouvre ferme le calque', 'focus:rendu|fenêtre:calque fermé', async () => {
    const a0 = prefs.animation, r = [];
    try {
      books = [fiche('Focus', {statut: 'lu', dateFin: today()})]; ui.tab = 'en_cours'; render(); await pause(20);
      const bt = $('#fab'); bt.hidden = false; bt.focus(); prefs.animation = 'simple';
      celebrerEtoile(books[0]); await pause(20); fermerFete(); await pause(20);
      r.push(document.activeElement === bt ? 'focus:rendu' : 'focus:' + (document.activeElement.id || document.activeElement.tagName));
      celebrerEtoile(books[0]); await pause(20);
      $('#modal').innerHTML = '<h2>Essai</h2>'; showM(); await pause(20);
      r.push(!$('#feteOv').classList.contains('show') ? 'fenêtre:calque fermé' : 'fenêtre:sous le calque'); closeM();
    } finally { prefs.animation = a0; fermerFete(); }
    return r.join('|');
  });
  await test('Lot 31 : points de fond qui scintillent en Complète et Simple (chacun à son rythme), fixes en Aucune', 'complete:scintille|simple:scintille|aucune:fixe|rythmes:variés', async () => {
    const a0 = prefs.animation, lents = [prefs.anim3dLent, prefs.anim2dLent], y = new Date().getFullYear(), r = [];
    prefs.anim3dLent = prefs.anim2dLent = false;
    books = [fiche('Scintille', {statut: 'lu', dateFin: `${y}-02-02`})];
    try {
      for (const m of ['complete', 'simple', 'aucune']) {
        prefs.animation = m; ui.tab = 'stats'; ui.year = y; render(); await pause(20);
        const c = [...document.querySelectorAll('#ciel .ciel-fond circle')].map(x => getComputedStyle(x));
        r.push(m + ':' + (c.length && c.every(x => x.animationName === 'ciel-scintille') ? 'scintille' : c.every(x => x.animationName === 'none') ? 'fixe' : 'mélangé'));
        if (m === 'complete') { const rythmes = new Set(c.map(x => x.animationDelay + '/' + x.animationDuration)); r.push(rythmes.size >= 10 ? 'rythmes:variés' : 'rythmes:' + rythmes.size); }
      }
    } finally { prefs.animation = a0; [prefs.anim3dLent, prefs.anim2dLent] = lents; }
    return [r[0], r[2], r[3], r[1]].join('|');
  });
  /* ---------- Audit du 12/11 : files d'arrière-plan (résumés, rayons) ----------
     Le livre doit sortir de la file AVANT d'être cherché : sinon une bibliothèque vide fige la page (boucle sans fin)
     et, avec plusieurs livres en attente, certains sont sautés. */
  // (attend que les files des tests précédents se soient arrêtées, puis les vide)
  const filesCalmes = async (max = 5000) => { const t0 = performance.now();
    while ((resumeBusy || classBusy) && performance.now() - t0 < max) await pause(50);
    resumeQueue.length = 0; classQueue.length = 0; };
  // (bibliothèque vide piégée : si la file la parcourt plus de 50 fois sans avancer, on coupe la boucle au lieu de figer la page)
  const bibliothequePiegee = () => { const a = []; let n = 0;
    a.find = function (...x) { if (++n > 50) throw new Error('boucle sans fin'); return Array.prototype.find.apply(this, x); };
    a.tours = () => n; return a; };
  await test('File d’arrière-plan : bibliothèque vidée pendant l’attente — la page ne se fige pas (résumés et rayons)', 'resume:ok|class:ok', async () => {
    const b0 = books, resume0 = Recherche.resume, fill0 = fillClass, r = [];
    await filesCalmes();
    try {
      Recherche.resume = async () => ({});
      books = [fiche('File A', {classTente: true})];
      autoResume('t-File A'); autoResume('t-File B');   // B attend son tour…
      const p1 = books = bibliothequePiegee();           // … pendant que la bibliothèque se vide
      await pause(1200);
      r.push('resume:' + (p1.tours() > 50 ? 'boucle sans fin' : resumeQueue.length || resumeBusy ? 'file bloquée' : 'ok'));
      fillClass = async () => true;
      books = [fiche('File A')];
      autoClass('t-File A'); autoClass('t-File B');
      const p2 = books = bibliothequePiegee();
      await pause(1200);
      r.push('class:' + (p2.tours() > 50 ? 'boucle sans fin' : classQueue.length || classBusy ? 'file bloquée' : 'ok'));
    } finally {
      Recherche.resume = resume0; fillClass = fill0; books = b0;
      await filesCalmes(2000); resumeBusy = classBusy = false;   // (une boucle coupée par le piège ne remet pas son drapeau)
    }
    return r.join('|');
  });
  await test('File d’arrière-plan : 3 livres en attente → les 3 complétés, dans l’ordre (résumés et rayons)', 'resume:A,B,C|class:A,B,C', async () => {
    const b0 = books, resume0 = Recherche.resume, fill0 = fillClass, vus = [], r = [];
    await filesCalmes();
    const fin = async occupe => { const t0 = performance.now(); while (occupe() && performance.now() - t0 < 5000) await pause(50); };
    try {
      Recherche.resume = async b => { vus.push(b.titre.slice(-1)); return {}; };
      books = ['A', 'B', 'C'].map(t => fiche('File ' + t, {classTente: true}));
      ['A', 'B', 'C'].forEach(t => autoResume('t-File ' + t));
      await fin(() => resumeBusy);
      r.push('resume:' + vus.join(','));
      vus.length = 0;
      fillClass = async b => { vus.push(b.titre.slice(-1)); return true; };
      books = ['A', 'B', 'C'].map(t => fiche('File ' + t));
      ['A', 'B', 'C'].forEach(t => autoClass('t-File ' + t));
      await fin(() => classBusy);
      r.push('class:' + vus.join(','));
    } finally {
      Recherche.resume = resume0; fillClass = fill0; books = b0;
      await filesCalmes(2000); resumeBusy = classBusy = false;
    }
    return r.join('|');
  });
  /* ---------- Lot 32 : style Jardin de nuit ---------- */
  await test('Jardin : mêmes composants que l’Éditorial (compteur, ligne de livre, onglets)', 'identique', async () => {
    const b0 = books, v0 = prefs.view;
    books = [fiche('Composant un', {statut: 'en_cours', tags: ['roman']}), fiche('Composant deux', {statut: 'en_cours', tags: ['essai']})];
    try {
      ui.tab = 'en_cours'; prefs.view = 'liste'; render(); await pause(40);
      // (on compare la NATURE des valeurs — transparent ou non, épaisseurs, arrondis — pas les couleurs, différentes par conception)
      const nature = v => v === 'rgba(0, 0, 0, 0)' ? 'transparent' : /^rgb/.test(v) ? 'couleur' : v;
      const forme = () => [['.subtab .n', 'backgroundColor'], ['.list:not(.grid) .card', 'backgroundColor'], ['.list:not(.grid) .card', 'borderBottomWidth'],
        ['.list:not(.grid) .card', 'paddingLeft'], ['.subtab', 'borderRadius'], ['.subtab:not(.on)', 'borderTopColor']]
        .map(([q, p]) => { const e = document.querySelector(q); return q + ':' + (e ? nature(getComputedStyle(e)[p]) : 'absent'); }).join(' ');
      const e = await avecStyle('editorial', 'light', forme), j = await avecStyle('jardin', 'light', forme);
      return /absent/.test(e + j) ? 'composant absent : ' + e : e === j ? 'identique' : 'Éditorial ' + e + ' ≠ Jardin ' + j;
    } finally { books = b0; prefs.view = v0; render(); }
  });
  // (lot 32, tâche 4, D7 : ligne d'en-tête « Encre » — ours à gauche, ligne douce à droite, filet, puis le grand titre)
  const TETES = [['en_cours', 'Ma bibliothèque'], ['decouvrir', 'Mes lectures'], ['notes', 'Mes lectures'], ['stats', 'Mes lectures']];
  const allerEcran = async t => { ui.tab = t; render(); scrollTo(0, 0); await pause(40); };
  const avecTetes = async fn => { const b0 = books;
    books = [fiche('Tête un', {statut: 'en_cours', dateDebut: addDays(-3)}), fiche('Tête deux', {statut: 'lu', dateFin: today()})];
    try { return await fn(); } finally { books = b0; ui.tab = 'en_cours'; render(); } };
  await test('Lot 32 : ligne d’en-tête en Jardin sur 3 écrans — ours à gauche, ligne douce à droite, au-dessus du grand titre, filet dessous', 'decouvrir ok|notes ok|stats ok', () => avecTetes(() => avecStyle('jardin', 'dark', async () => {
    const r = [];
    for (const [t, ours] of TETES.slice(1)) { await allerEcran(t);
      const o = document.querySelector('#main .ecran-ours'), l = document.querySelector('#main .ecran-ligne'), h = document.querySelector('#main .ecran-titre');
      if (!o || !l || !h) { r.push(t + ' absent'); continue; }
      const ro = o.getBoundingClientRect(), rl = l.getBoundingClientRect(), rh = h.getBoundingClientRect();
      const ok = o.checkVisibility() && o.textContent === ours && Math.abs(ro.top - rl.top) < 4 && rl.left >= ro.right - 1 && ro.bottom <= rh.top
        && rl.bottom <= rh.top && getComputedStyle(o.parentElement, '::after').borderBottomWidth === '1px';
      r.push(t + (ok ? ' ok' : ` ko (ours ${Math.round(ro.top)}/${Math.round(ro.right)}, ligne ${Math.round(rl.top)}/${Math.round(rl.left)}, titre ${Math.round(rh.top)})`));
    }
    return r.join('|');
  })));
  // (choix d'Elias du 12/11, « Titre dans la ligne » : sinon, avec le rappel de sauvegarde, le premier livre passait sous la barre)
  await test('Lot 32 : Bibliothèque en Jardin — le titre du statut est la ligne d’en-tête (petites capitales, nombre à droite, filet), sans grand titre ; « Ma bibliothèque » reste lu', 'titre en ligne|nombre à droite|filet|pas de grand titre|ma bibliothèque lue', () => avecTetes(() => avecStyle('jardin', 'light', async () => {
    await allerEcran('en_cours');
    const h = document.querySelector('#main .library-intro .ecran-titre'), l = document.querySelector('#main .library-intro .ecran-ligne'), m = document.querySelector('#main .library-intro p:not(.ecran-ligne)');
    if (!h || !l || !m) return 'tête absente';
    const ch = getComputedStyle(h), rh = h.getBoundingClientRect(), rl = l.getBoundingClientRect(), fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return [h.textContent === STATUTS.en_cours && ch.textTransform === 'uppercase' ? 'titre en ligne' : 'titre ' + ch.textTransform,
      Math.abs(rh.top - rl.top) < 4 && rl.left >= rh.right - 1 ? 'nombre à droite' : `nombre ${Math.round(rl.top)}/${Math.round(rh.top)}`,
      getComputedStyle(h.parentElement, '::after').borderBottomWidth === '1px' ? 'filet' : 'sans filet',
      parseFloat(ch.fontSize) <= .8125 * fs + .5 ? 'pas de grand titre' : 'grand titre ' + ch.fontSize,
      m.textContent === 'Ma bibliothèque' && !m.hasAttribute('aria-hidden') && m.getBoundingClientRect().width <= 1 ? 'ma bibliothèque lue' : 'ma bibliothèque ' + Math.round(m.getBoundingClientRect().width)].join('|');
  })));
  await test('Lot 32 : pas de ligne d’en-tête dans les 4 autres styles (têtes inchangées ; « Ma bibliothèque » comme avant)', 'editorial|android|actuel|carnet|biblio inchangée', () => avecTetes(async () => {
    const r = [];
    for (const st of ['editorial', 'android', 'actuel', 'carnet']) await avecStyle(st, 'light', async () => { await allerEcran('notes');
      const o = document.querySelector('#main .ecran-ours'); r.push(o && o.checkVisibility() ? st + ' : visible' : st); });
    // (« Ma bibliothèque » : visible et lu en Android, Actuel, Carnet ; masqué à l'œil mais lu en Éditorial — comme avant le lot 32)
    const vu = st => avecStyle(st, 'light', async () => { await allerEcran('en_cours'); const q = document.querySelector('#main .library-intro p:not(.ecran-ligne)');
      return !!q && q.textContent === 'Ma bibliothèque' && !q.hasAttribute('aria-hidden') && q.getBoundingClientRect().width > 2; });
    const v = [await vu('android'), await vu('actuel'), await vu('carnet'), !(await vu('editorial'))];
    r.push(v.every(Boolean) ? 'biblio inchangée' : 'biblio ' + v.join(','));
    return r.join('|');
  }));
  await test('Lot 32 : TalkBack lit les mêmes titres qu’avant (h2 inchangés, nouvel ours caché aux lecteurs d’écran)', 'ok', () => avecTetes(() => avecStyle('jardin', 'light', async () => {
    await allerEcran('notes'); const h = document.querySelector('#main h2.ecran-titre'), o = document.querySelector('#main .ecran-ours');
    return h && o && h.textContent === 'Carnet' && o.getAttribute('aria-hidden') === 'true' ? 'ok' : (h && h.textContent) + ' / ' + (o && o.getAttribute('aria-hidden'));
  })));
  await test('Lot 32 : ligne d’en-tête à 130 % — rien ne dépasse ni n’est coupé sur les 4 écrans', [], () => avecTetes(() => avecStyle('jardin', 'light', async () => {
    const ko = []; document.documentElement.style.fontSize = '130%';
    try { for (const [t] of TETES) { await allerEcran(t);
      // (sur la Bibliothèque, c'est le titre du statut qui tient lieu d'ours — choix d'Elias du 12/11)
      const el = [...document.querySelectorAll('#main .ecran-ours, #main .ecran-ligne, #main .library-intro .ecran-titre')].filter(e => e.checkVisibility() && e.getBoundingClientRect().width > 1);
      if (el.length < (t === 'stats' && innerWidth < 360 ? 1 : 2)) ko.push(t + ' : ligne d’en-tête absente');   // (Ciel très étroit : l'ours décoratif se retire, relecture du lot 32)
      for (const e of el) if (e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + .5) ko.push(t + ' ' + e.className); } }
    finally { document.documentElement.style.fontSize = ''; }
    return ko;
  })));
  // (lot 32, tâche 5, D8 : grain de papier fixe sur le fond de la page, en Jardin Jour seulement)
  await test('Lot 32 : grain de papier en Jardin Jour seulement — ni en Nuit, ni dans les autres styles ; il suit le thème sans recharger', 'jour grain|nuit sans|editorial sans|carnet sans|rebascule grain', async () => {
    const grain = () => /url\(/.test(getComputedStyle(document.body).backgroundImage) ? 'grain' : 'sans';
    const r = [await avecStyle('jardin', 'light', () => 'jour ' + grain()), await avecStyle('jardin', 'dark', () => 'nuit ' + grain()),
      await avecStyle('editorial', 'light', () => 'editorial ' + grain()), await avecStyle('carnet', 'light', () => 'carnet ' + grain())];
    r.push(await avecStyle('jardin', 'dark', async () => { prefs.theme = 'light'; applyTheme(); return 'rebascule ' + grain(); }));
    return r.join('|');
  });
  // (relecture du lot 32, point 1 : au démarrage, les messages de passage se suivent au lieu de s'écraser)
  await test('Lot 32 (relecture) : au démarrage, le message du Jardin puis celui de la fiche se suivent — aucun n’écrase l’autre', 'jardin,fiche|écart ok', async () => {
    const p0 = JSON.stringify(prefs), vus = [], t0 = window.toastLater;
    try {
      Object.keys(prefs).forEach(k => delete prefs[k]);
      Object.assign(prefs, {...PREFS_DEFAUT, style: 'editorial', styleEditorial: 1, consultation: 'livre'});   // (appareil ouvert entre le 25 et le 30/10)
      window.toastLater = (m, d) => vus.push([m, d || 1000]);
      passagesAuDemarrage();
      const noms = vus.map(([m]) => m === MSG_JARDIN ? 'jardin' : m === MSG_FICHE ? 'fiche' : m === MSG_EDITORIAL ? 'editorial' : '?');
      return [noms.join(','), vus.length === 2 && vus[1][1] - vus[0][1] >= 2600 ? 'écart ok' : 'écart ' + vus.map(v => v[1]).join('/')].join('|');
    } finally { window.toastLater = t0; Object.keys(prefs).forEach(k => delete prefs[k]); Object.assign(prefs, JSON.parse(p0)); savePrefs(); applyTheme(); }
  });
  // (relecture du lot 32, point 2 : la tête du Ciel, avec son choix d'année, reste aussi serrée que celles de Découvrir et du Carnet)
  await test('Lot 32 (relecture) : en Jardin, l’espace entre la ligne d’en-tête et le grand titre du Ciel est celui des autres têtes', 'ok', () => avecTetes(() => avecStyle('jardin', 'light', async () => {
    const ecart = async t => { await allerEcran(t); const o = document.querySelector('#main .ecran-ours').getBoundingClientRect(), h = document.querySelector('#main .ecran-titre').getBoundingClientRect(); return h.top - o.bottom; };
    const carnet = await ecart('notes'), decouvrir = await ecart('decouvrir'), ciel = await ecart('stats');
    // (le choix de l'année, plus haut que le titre, est centré sur lui : on tolère la moitié de la différence de hauteur)
    const sel = document.querySelector('#main .ecran-tete #year').getBoundingClientRect().height, tit = document.querySelector('#main .ecran-titre').getBoundingClientRect().height;
    const tol = Math.max(0, (sel - tit) / 2) + 2;
    return Math.abs(carnet - decouvrir) <= 2 && ciel - carnet <= tol ? 'ok' : `Carnet ${Math.round(carnet)}, Découvrir ${Math.round(decouvrir)}, Ciel ${Math.round(ciel)} (tolérance ${Math.round(tol)})`;
  })));
  // (relecture du lot 32, point 3 : à 130 %, avec des nombres à 2 et 3 chiffres, l'ours tient sur 1 ligne et la ligne douce sur 2 au plus)
  await test('Lot 32 (relecture) : texte à 130 %, grands nombres — ours sur 1 ligne, ligne douce sur 2 lignes au plus (4 écrans)', [], () => avecStyle('jardin', 'light', async () => {
    const b0 = books, ko = [];
    books = Array.from({length: 120}, (_, i) => fiche('Nombre ' + i, {statut: i < 110 ? 'en_cours' : 'lu', dateDebut: addDays(-3), dateFin: i < 110 ? '' : today(),
      notes: i < 12 ? [{id: 'nn' + i, texte: 'Note ' + i, date: today()}] : [], citations: i < 12 ? [1, 2, 3].map(k => ({id: 'cc' + i + k, texte: 'Citation ' + k, page: '1', date: today(), commentaire: ''})) : []}));
    document.documentElement.style.fontSize = '130%';
    try {
      for (const t of ['en_cours', 'decouvrir', 'notes', 'stats']) { await allerEcran(t);
        const lignes = e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
        const ours = [...document.querySelectorAll('#main .ecran-ours, #main .library-intro .ecran-titre')].find(e => e.checkVisibility() && e.getBoundingClientRect().width > 1);
        const l = document.querySelector('#main .ecran-ligne');
        if (!l || (!ours && t !== 'stats')) { ko.push(t + ' : tête absente'); continue; }   // (Ciel très étroit : l'ours décoratif peut se retirer)
        if (ours && lignes(ours) > 1) ko.push(t + ' : ours sur ' + lignes(ours) + ' lignes');
        if (lignes(l) > 2) ko.push(t + ' : ligne douce sur ' + lignes(l) + ' lignes (« ' + l.textContent + ' »)');
        if (ours && ours.checkVisibility() && seCoupent(ours.getBoundingClientRect(), l.getBoundingClientRect())) ko.push(t + ' : ours et ligne douce se chevauchent');
      }
    } finally { document.documentElement.style.fontSize = ''; books = b0; ui.tab = 'en_cours'; render(); }
    return ko;
  }));
  /* ---------- Lot 33 : accueil « Ce soir » (style Jardin seulement) ---------- */
  await test('Lot 33 : le grand titre suit l’heure', 'Ce matin|Cet après-midi|Ce soir|Ce soir|Ce matin', () =>
    [6, 13, 20, 2, 5].map(h => momentDuJour(h)).join('|'));
  await test('Lot 33 : stade de la plante selon la progression (pages inconnues = plante moyenne, rien ne fane)', '0,null|2,null|0,0|1,10|2,40|3,75|4,95|4,100', () =>
    [[0, 0], [0, 50], [100, 0], [100, 10], [100, 40], [100, 75], [100, 95], [100, 140]]
      .map(([t, c]) => { const s = stadePlante(fiche('P' + t + c, {statut: 'en_cours', pagesTotal: t, pageActuelle: c})); return s.stade + ',' + s.pct; }).join('|'));
  await test('Lot 33 : la phrase du jardin (exemple de la maquette, sans livre en cours, jardin vide, grands nombres)', 'Une fin toute proche, une plante qui démarre, neuf graines.|Pas de livre en cours. Neuf graines t’attendent.|Ton jardin attend sa première graine.|Deux plantes en pousse, 12 graines.', () => {
    const ec = (t, tot, cur) => fiche(t, {statut: 'en_cours', pagesTotal: tot, pageActuelle: cur});
    return [chapoCeSoir([ec('Chants', 200, 188), ec('Fondation', 300, 66)], 9), chapoCeSoir([], 9), chapoCeSoir([], 0),
      chapoCeSoir([ec('A', 300, 120), ec('B', 0, 40)], 12)].join('|');
  });
  await test('Lot 33 : couleurs du jardin dans les palettes Jardin, et nulle part ailleurs', 'jardin/dark:#9CC3A4 #E8B0BA #8B6A4A|jardin/light:#4E6F53 #C77A8A #8B6A4A|editorial/dark:vides', async () => {
    const r = [];
    for (const [s, t] of [['jardin', 'dark'], ['jardin', 'light'], ['editorial', 'dark']]) r.push(s + '/' + t + ':' + await avecStyle(s, t, () => {
      const cs = getComputedStyle(document.documentElement), v = ['--sauge', '--fleur', '--graine'].map(n => cs.getPropertyValue(n).trim().toUpperCase());
      return v.every(x => !x) ? 'vides' : v.join(' ');
    }));
    return r.join('|');
  });
  // (aides du lot 33 : un jardin type — l'exemple de la maquette — et l'accueil allumé en Jardin)
  const jardinType = (nGraines = 9) => [
    fiche('Chants pour l’Afrique', {statut: 'en_cours', pagesTotal: 200, pageActuelle: 188, dateDebut: addDays(-1)}),
    fiche('Fondation', {statut: 'en_cours', pagesTotal: 300, pageActuelle: 66, dateDebut: addDays(-5)}),
    ...Array.from({length: nGraines}, (_, i) => fiche('Graine ' + i, {pagesTotal: 100 + i, ajoute: addDays(-i) + 'T10:00:00Z'}))];
  const avecCeSoir = (livres, fn, style = 'jardin', theme = 'dark') => avecReprise(() => avecStyle(style, theme, async () => {
    const b0 = books, f0 = {...ui}; books = livres; ui.listeEnCours = false; Object.assign(ui, filtresVides, {q: ''});
    try { await allerEcran('en_cours'); return await fn(); }
    finally { books = b0; Object.assign(ui, f0, {tab: 'en_cours', listeEnCours: false}); render(); }
  }));
  const $$ = s => [...document.querySelectorAll(s)];   // (aide locale : tous les éléments qui correspondent)
  const visible = s => { const e = $(s); return !!e && e.checkVisibility() && e.getBoundingClientRect().height > 0; };

  await test('Lot 33 : en Jardin, l’onglet En cours devient « Ce soir » — titre, phrase, grande carte, parterre, graines', 'une|phrase|carte|3 places|3 graines|toutes (9)|liste vide', () => avecCeSoir(jardinType(), () => [
    /^(Ce matin|Cet après-midi|Ce soir)\.$/.test($('.ce-soir-une')?.textContent) ? 'une' : 'une ' + $('.ce-soir-une')?.textContent,
    $('.ce-soir-chapo')?.textContent === 'Une fin toute proche, une plante qui démarre, neuf graines.' ? 'phrase' : 'phrase ' + $('.ce-soir-chapo')?.textContent,
    $('#resumeLecture.veille') && $('#resumeLecture h2').textContent === 'Chants pour l’Afrique' ? 'carte' : 'carte ?',
    $$('.parterre > li').length + ' places', $$('.sommaire > li').length + ' graines',
    ($('[data-ce-soir=graines]')?.textContent || '').trim().toLowerCase(), $('#list').children.length ? 'liste pleine' : 'liste vide'].join('|')));
  await test('Lot 33 : les 4 autres styles gardent l’onglet En cours d’avant (pas de jardin, liste présente)', 'editorial:ok|android:ok|actuel:ok|carnet:ok', async () => {
    const r = [];
    for (const st of ['editorial', 'android', 'actuel', 'carnet']) r.push(st + ':' + await avecCeSoir(jardinType(), () =>
      !$('.ce-soir') && !$('.veille') && !$('.aurore') && $$('#list .card').length === 1 ? 'ok' : 'jardin présent', st, 'light'));
    return r.join('|');
  });
  await test('Lot 33 : TalkBack — chaque plante dit son livre et sa progression, les titres de parties sont des titres', 'Chants pour l’Afrique, 94 %|Fondation, 22 %|Place libre, choisis une graine|En pousse|Graines · à lire|dessins cachés', () => avecCeSoir(jardinType(), () => [
    ...$$('.parterre button').map(b => b.getAttribute('aria-label') || b.textContent.replace(/\s+/g, ' ').trim()),
    ...$$('.ce-soir-jardin h3').map(h => h.textContent),
    $$('.ce-soir-jardin svg').length && $$('.ce-soir-jardin svg').every(s => s.getAttribute('aria-hidden') === 'true') ? 'dessins cachés' : 'dessin lu'].join('|')));
  await test('Lot 33 : plantes, graines et liens ont une cible d’au moins 48 px', 'ok', () => avecCeSoir(jardinType(), () => {
    const b = $$('.ce-soir-jardin button'); if (!b.length) return 'aucun bouton';
    const ko = b.map(x => x.getBoundingClientRect()).filter(r => r.width < 48 || r.height < 48).map(r => Math.round(r.width) + '×' + Math.round(r.height));
    return ko.length ? ko.join(', ') : 'ok';
  }));
  await test('Lot 33 : une recherche cache le jardin et montre les résultats ; on l’efface, le jardin revient', 'résultats|jardin', () => avecCeSoir(jardinType(), async () => {
    const r = []; ui.q = 'Fondation'; renderCards();
    r.push($('.ce-soir-jardin') && !visible('.ce-soir-jardin') && !visible('.ce-soir-haut') && $$('#list .card').length === 1 ? 'résultats' : 'jardin encore là');
    ui.q = ''; renderCards();
    r.push(visible('.ce-soir-jardin') && !$('#list').children.length ? 'jardin' : 'pas revenu');
    return r.join('|');
  }));
  await test('Lot 33 : « en liste » ramène la liste classique, « Revenir au jardin » le jardin', 'liste|retour', () => avecCeSoir(jardinType(), async () => {
    const r = []; $('[data-ce-soir=liste]')?.click(); await pause(20);
    r.push(!$('.ce-soir-jardin') && $$('#list .card').length === 1 && $('[data-ce-soir=jardin]') ? 'liste' : 'pas de liste');
    $('[data-ce-soir=jardin]')?.click(); await pause(20);
    r.push($('.ce-soir-jardin') && !ui.listeEnCours ? 'retour' : 'pas de retour');
    return r.join('|');
  }));
  await test('Lot 33 : un filtre venu d’un autre onglet — liste filtrée et volet « Filtres et tri » visibles', 'liste|volet', () => avecCeSoir([...jardinType(), fiche('Gamma', {statut: 'en_cours', genre: 'Polar', dateDebut: addDays(-9)})], () => {
    ui.genre = 'Polar'; render();
    return [$('.ce-soir-jardin') && !visible('.ce-soir-jardin') && $$('#list .card').length === 1 ? 'liste' : 'jardin', visible('#filtres') ? 'volet' : 'volet caché'].join('|');
  }));
  await test('Lot 33 : place libre et « Toutes » mènent aux graines ; sans graine, la place libre ouvre l’ajout', 'à lire|à lire|ajout', () => avecCeSoir(jardinType(), async () => {
    const r = [];
    $('[data-ce-soir=semer]')?.click(); await pause(20); r.push(ui.tab === 'a_lire' ? 'à lire' : ui.tab);
    await allerEcran('en_cours'); $('[data-ce-soir=graines]')?.click(); await pause(20); r.push(ui.tab === 'a_lire' ? 'à lire' : ui.tab);
    books = books.filter(b => b.statut !== 'a_lire'); await allerEcran('en_cours');
    let ouvert = false; $('#fab').addEventListener('click', () => ouvert = true, {once: true});
    $('[data-ce-soir=semer]')?.click(); await pause(20); closeM(); r.push(ouvert ? 'ajout' : 'rien');
    return r.join('|');
  }));
  // (lot 33, règle du 12/11 : la recherche étant sous le jardin, le parterre montre 6 plantes au plus — les plus récentes —, « en liste » donne tout)
  await test('Lot 33 : 14 livres en cours — 6 plantes (les plus récentes), le lien « 14 livres · en liste », sans place libre, sans dépasser', '6|Livre au titre assez long numéro 0|14 livres · en liste|pas de place libre|ne dépasse pas', () => avecCeSoir(Array.from({length: 14}, (_, i) => fiche('Livre au titre assez long numéro ' + i, {statut: 'en_cours', pagesTotal: 300, pageActuelle: i * 20, dateDebut: addDays(-i)})), () => [
    String($$('.parterre > li').length), ($('.parterre .pousse')?.getAttribute('aria-label') || '').split(',')[0], $('[data-ce-soir=liste]')?.textContent, $('.pousse.libre') ? 'place libre' : 'pas de place libre',
    $('.parterre') && document.documentElement.scrollWidth <= innerWidth && $$('.parterre .nom').every(n => n.scrollWidth <= n.clientWidth + 1) ? 'ne dépasse pas' : 'dépasse'].join('|')));
  await test('Lot 33 : aucun livre en cours — phrase douce, une place libre, les graines', 'Pas de livre en cours. Trois graines t’attendent.|1|3', () => avecCeSoir(jardinType(3).slice(2), () =>
    [$('.ce-soir-chapo')?.textContent, $$('.parterre > li').length, $$('.sommaire > li').length].join('|')));
  await test('Lot 33 : page de tests (grande carte coupée) — pas d’accueil, liste d’avant', 'liste', () => avecStyle('jardin', 'dark', async () => {
    const b0 = books; books = jardinType();
    try { await allerEcran('en_cours'); return !$('.ce-soir') && $$('#list .card').length === 2 ? 'liste' : 'accueil'; } finally { books = b0; render(); }
  }));
  await test('Lot 33 : au démarrage sans livre en cours — Ce soir en Jardin, À lire ailleurs (comme avant)', 'en_cours|a_lire|lu', () => avecReprise(async () => [
    await avecStyle('jardin', 'dark', () => ongletDeDepart({en_cours: 0, a_lire: 3, lu: 1})),
    await avecStyle('editorial', 'dark', () => ongletDeDepart({en_cours: 0, a_lire: 3, lu: 1})),
    await avecStyle('editorial', 'dark', () => ongletDeDepart({en_cours: 0, a_lire: 0, lu: 1}))].join('|')));
  await test('Lot 33 : graines — les épinglées d’abord ; « p. » jamais seul en début de ligne', 'Épinglée|insécable', () => avecCeSoir([...jardinType(), fiche('Épinglée', {pagesTotal: 512, epingle: true, ajoute: addDays(-40) + 'T10:00:00Z'})], () => {
    const b = $('.sommaire button'); if (!b) return 'pas de graine';
    return [b.querySelector('.t').textContent, / p\.$/.test(b.querySelector('.p').textContent) ? 'insécable' : 'sécable'].join('|');
  }));
  await test('Lot 33 : aurore — bouge en Complète (Nuit) ; fixe en Simple, Aucune, mouvement réduit et en Jour', 'complète:bouge|simple:fixe|aucune:fixe|réduit:fixe|jour:fixe', async () => {
    const a0 = prefs.animation, red0 = Ouverture.reduit, r = [];
    const etat = async (theme = 'dark') => avecCeSoir(jardinType(), () => { const a = $('.aurore'), i = a && a.querySelector('i');
      return !a ? 'absente' : a.classList.contains('bouge') && getComputedStyle(i).animationName !== 'none' ? 'bouge' : getComputedStyle(i).animationName === 'none' && !a.classList.contains('bouge') ? 'fixe' : 'incohérent'; }, 'jardin', theme);
    try {
      for (const m of ['complete', 'simple', 'aucune']) { prefs.animation = m; r.push({complete: 'complète', simple: 'simple', aucune: 'aucune'}[m] + ':' + await etat()); }
      prefs.animation = 'complete'; Ouverture.reduit = () => true; r.push('réduit:' + await etat()); Ouverture.reduit = red0;
      r.push('jour:' + await etat('light'));
    } finally { prefs.animation = a0; Ouverture.reduit = red0; }
    return r.join('|');
  });
  await test('Lot 33 : l’aurore s’endort sans toucher, se réveille au toucher ; quitter l’écran ne laisse pas d’erreur', 'endormie|réveillée|sans erreur', async () => {
    const a0 = prefs.animation; prefs.animation = 'complete';
    const s0 = typeof AURORE === 'object' ? AURORE.sommeil : null; if (s0 === null) { prefs.animation = a0; return 'AURORE absent'; }
    AURORE.sommeil = 60;
    try {
      return await avecCeSoir(jardinType(), async () => {
        const r = []; reveillerAurore(); await pause(150);
        r.push($('.aurore').classList.contains('dort') && getComputedStyle($('.aurore i')).animationPlayState === 'paused' ? 'endormie' : 'éveillée');
        AURORE.dernier = 0; document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        r.push(!$('.aurore').classList.contains('dort') ? 'réveillée' : 'toujours endormie');
        let err = null; const oe = window.onerror; window.onerror = m => { err = m; };
        reveillerAurore(); await allerEcran('decouvrir'); await pause(150); window.onerror = oe;
        r.push(err ? 'erreur ' + err : 'sans erreur');
        return r.join('|');
      });
    } finally { prefs.animation = a0; AURORE.sommeil = s0; }
  });
  await test('Lot 33 : la couleur de l’aurore suit le livre (stable pour un même titre)', 'différente|stable', () => avecCeSoir(jardinType(), async () => {
    const couleur = () => getComputedStyle($('.aurore i')).backgroundColor, c1 = couleur(); render(); const c2 = couleur();
    books[0] = {...books[0], titre: 'Un tout autre titre'}; render(); const c3 = couleur();
    return [c3 !== c1 && c1 !== 'rgba(0, 0, 0, 0)' ? 'différente' : 'même couleur', c1 === c2 ? 'stable' : 'instable'].join('|');
  }));
  // (garde-fou de la maquette : « le texte ne repose jamais sur l'aurore » sans contraste — mesuré par-dessus, pire cas des 3 taches superposées)
  await test('Lot 33 : texte de la grande carte ≥ 4,5 par-dessus l’aurore, 72 teintes, Nuit et Jour', 'ok', async () => {
    const ko = [], rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = v => { const l = v.map(x => x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    let vus = 0;
    for (const theme of ['dark', 'light']) await avecCeSoir(jardinType(), () => {
      const v = $('#resumeLecture'), taches = [...v.querySelectorAll('.aurore i')], textes = [v.querySelector('h2'), v.querySelector('.meta'), v.querySelector('.resume-titre')].filter(Boolean);
      for (let h = 0; h < 360; h += 5) {
        v.style.setProperty('--h', h);
        let fond = rgb(getComputedStyle(v).backgroundColor);
        for (const t of taches) { const bg = getComputedStyle(t).backgroundColor; if (/rgba\(.*,\s*0\)$/.test(bg)) continue; vus++; const c = rgb(bg), o = +getComputedStyle(t).opacity; fond = fond.map((f, k) => f * (1 - o) + c[k] * o); }
        for (const e of textes) { const r = ratio(rgb(getComputedStyle(e).color), fond); if (r < 4.5) ko.push(`${theme} h${h} ${e.className || e.tagName.toLowerCase()} ${r.toFixed(2)}`); }
      }
    }, 'jardin', theme);
    return !vus ? 'aurore sans couleur' : ko.length ? ko.slice(0, 6).join(', ') + (ko.length > 6 ? ` (+${ko.length - 6})` : '') : 'ok';
  });
  await test('Lot 33 : pas d’aurore dans les 4 autres styles', 'editorial:0|android:0|actuel:0|carnet:0', async () => {
    const r = []; for (const st of ['editorial', 'android', 'actuel', 'carnet']) r.push(st + ':' + await avecCeSoir(jardinType(), () => $$('.aurore').length, st, 'dark'));
    return r.join('|');
  });
  await test('Lot 33 : après « Où j’en suis », la plante du livre pousse une fois (Complète), en fondu (Simple), pas du tout (Aucune)', 'complete:pousse-anim,stade 2|simple:pousse-fondu|aucune:rien|une fois', async () => {
    const a0 = prefs.animation, r = [];
    try {
      for (const m of ['complete', 'simple', 'aucune']) { prefs.animation = m; r.push(m + ':' + await avecCeSoir(jardinType(), () => {
        enregistrerPage(books.find(b => b.titre === 'Fondation'), 150);
        const p = $$('.parterre .pousse').find(x => (x.getAttribute('aria-label') || '').startsWith('Fondation'));
        const cl = !p ? 'absente' : p.classList.contains('pousse-anim') ? 'pousse-anim' : p.classList.contains('pousse-fondu') ? 'pousse-fondu' : 'rien';
        return m === 'complete' ? cl + ',stade ' + stadePlante(books.find(b => b.titre === 'Fondation')).stade : cl;
      })); }
      prefs.animation = 'complete';
      r.push(await avecCeSoir(jardinType(), () => { enregistrerPage(books.find(b => b.titre === 'Fondation'), 150); render(); return $('.pousse-anim') ? 'rejoue' : 'une fois'; }));
    } finally { prefs.animation = a0; }
    return r.join('|');
  });
  await test('Lot 33 : une page enregistrée ailleurs, puis retour à l’accueil 3 s plus tard — rien ne pousse', 'rien', () => avecCeSoir(jardinType(), () => {
    ui.pousse = {id: books[1].id, t: Date.now() - 3000}; render(); return $('.pousse-anim, .pousse-fondu') ? 'pousse' : 'rien';
  }));
  await test('Lot 33 : au Ciel, en Jardin, les livres en cours sont des silhouettes à l’horizon (6 au plus, cachées à TalkBack)', 'jardin:2,caché,dans la bande|6 au plus|année passée:0|editorial:0', async () => {
    const r = [], b0 = books, y0 = ui.year;
    const mesure = async (st, livres, annee = new Date().getFullYear()) => avecStyle(st, 'dark', async () => {
      books = livres; ui.year = annee; await allerEcran('stats');
      const g = $('#ciel .ciel-horizon'); if (!g) return '0';
      const ys = [...g.children].map(c => +c.getAttribute('transform').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)/)[2]);
      return g.children.length + ',' + (g.getAttribute('aria-hidden') === 'true' ? 'caché' : 'lu') + ',' + (ys.every(y => y >= CIEL.h - CIEL.horizon - .5) ? 'dans la bande' : 'déborde');
    });
    try {
      r.push('jardin:' + await mesure('jardin', jardinType()));
      r.push((await mesure('jardin', Array.from({length: 9}, (_, i) => fiche('E' + i, {statut: 'en_cours'})))).startsWith('6,') ? '6 au plus' : 'trop');
      r.push('année passée:' + await mesure('jardin', jardinType(), new Date().getFullYear() - 1));
      r.push('editorial:' + await mesure('editorial', jardinType()));
    } finally { books = b0; ui.year = y0; ui.tab = 'en_cours'; render(); }
    return r.join('|');
  });
  await test('Lot 33 : texte à 130 % — rien ne dépasse, le titre, la phrase et les noms restent dans l’écran', 'ok', () => avecCeSoir([...jardinType(), fiche('Un titre de livre vraiment très long pour voir comment il se coupe', {statut: 'en_cours', pagesTotal: 0, pageActuelle: 12, dateDebut: addDays(-20)})], async () => {
    document.documentElement.style.fontSize = '130%'; render(); await pause(40);
    try {
      const ko = [];
      if (!$('.ce-soir-jardin')) return 'pas d’accueil';
      if (document.documentElement.scrollWidth > innerWidth) ko.push('la page dépasse de ' + (document.documentElement.scrollWidth - innerWidth) + ' px');
      for (const s of ['.ce-soir-une', '.ce-soir-chapo', '.parterre .nom', '.sommaire button']) for (const e of $$(s)) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1) ko.push(s + ' dépasse'); }
      return ko.length ? [...new Set(ko)].join(', ') : 'ok';
    } finally { document.documentElement.style.fontSize = ''; }
  }));
  // (choix d'Elias du 12/11, D14 revue : sur l'accueil, la recherche passe sous les graines — sinon « En pousse » tombait sous la barre à 320 px)
  await test('Lot 33 : sur l’accueil, la recherche est sous les graines ; pendant une recherche elle reste au-dessus des résultats ; ailleurs, en haut', 'sous les graines|au-dessus des résultats|en haut', () => avecCeSoir(jardinType(), async () => {
    const avant = (a, b) => !!(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const r = [avant($('.ce-soir-jardin'), $('#q')) ? 'sous les graines' : 'au-dessus du jardin'];
    ui.q = 'Fondation'; renderCards();
    const q = $('#q').getBoundingClientRect(), c = $('#list .card')?.getBoundingClientRect();
    r.push(c && q.bottom <= c.top ? 'au-dessus des résultats' : 'mal placée');
    ui.q = ''; await allerEcran('a_lire');
    r.push(avant($('#q'), $('#list')) && !$('.ce-soir-jardin') ? 'en haut' : 'déplacée');
    return r.join('|');
  }));
  // (vu sur les captures du lot 33 : la graine du sommaire tombait sous la ligne du titre)
  await test('Lot 33 : dans le sommaire, la graine est au milieu de la ligne du titre', 'alignée', () => avecCeSoir(jardinType(), () => {
    const b = $('.sommaire button'); if (!b) return 'pas de graine';
    const g = b.querySelector('i').getBoundingClientRect(), t = b.querySelector('.t').getBoundingClientRect(), m = (g.top + g.bottom) / 2;
    return m > t.top + t.height * .3 && m < t.top + t.height * .7 ? 'alignée' : `graine ${Math.round(g.top)}→${Math.round(g.bottom)}, titre ${Math.round(t.top)}→${Math.round(t.bottom)}`;
  }));
  // (vu sur les captures du lot 33 : un nom sur 2 lignes faisait monter sa plante — elles doivent toutes partir du même sol)
  await test('Lot 33 : les plantes d’une rangée partent du même sol, quelle que soit la longueur des noms', 'même sol', () => avecCeSoir(jardinType(), () => {
    const pieds = $$('.parterre .pousse svg').slice(0, 3).map(s => Math.round(s.getBoundingClientRect().bottom));
    return pieds.length === 3 && Math.max(...pieds) - Math.min(...pieds) <= 1 ? 'même sol' : 'pieds à ' + pieds.join(', ');
  }));
  // (relecture du lot 33, point 1 : l'accueil dépend du style, du thème et des animations — il doit se redessiner quand ils changent)
  await test('Lot 33 (relecture) : changer de style, de thème ou d’animations (Réglages, ou le téléphone) redessine l’accueil', 'style:liste|animations:fixe|thème:fixe|téléphone:fixe', async () => {
    const a0 = prefs.animation, r = [];
    const essai = (nom, geste) => avecCeSoir(jardinType(), async () => { prefs.animation = 'complete'; render();
      if (!$('.aurore.bouge')) return nom + ':aurore immobile au départ';
      await geste(); await pause(20);
      return nom + ':' + (nom === 'style' ? (!$('.ce-soir') && $$('#list .card').length === 1 ? 'liste' : 'jardin resté') : $('.aurore.bouge') ? 'bouge' : 'fixe'); });
    try {
      r.push(await essai('style', () => { openSettings(); $('#st_style [data-st=editorial]').click(); closeM(); }));
      r.push(await essai('animations', () => { openSettings(); $('#st_anim [data-an=aucune]').click(); closeM(); }));
      r.push(await essai('thème', () => { openSettings(); $('#st_theme [data-th=light]').click(); closeM(); }));
      r.push(await essai('téléphone', () => { prefs.theme = 'light'; darkQuery.dispatchEvent(new Event('change')); }));
    } finally { prefs.animation = a0; savePrefs(); render(); }
    return r.join('|');
  });
  // (relecture du lot 33, point 4 : « en liste » et « Toutes » gardent toute leur cible de 48 px — la rangée suivante ne la recouvre pas)
  await test('Lot 33 (relecture) : les liens « en liste » et « Toutes » se touchent sur toute leur hauteur', 'ok', () => avecCeSoir(jardinType(), async () => {
    const ko = [];
    for (const l of $$('.ce-soir-jardin .lien')) {
      l.scrollIntoView({block: 'center'}); await pause(20);
      const r = l.getBoundingClientRect(), x = r.left + r.width / 2;
      for (const y of [r.top + 2, r.bottom - 2]) if (!document.elementFromPoint(x, y)?.closest('.lien')) ko.push(l.dataset.ceSoir + ' ' + Math.round(y - r.top) + ' px');
    }
    return ko.length ? 'recouverts : ' + ko.join(', ') : 'ok';
  }));
  // (relecture du lot 33, point 5 : un nombre de pages estimé est signalé « ≈ », comme dans la rangée des épinglés qu'il remplace)
  await test('Lot 33 (relecture) : dans les graines, un nombre de pages estimé est signalé « ≈ »', '≈ 300 p.|512 p.', () => avecCeSoir([...jardinType(0), fiche('Estimée', {pagesTotal: 300, pagesSource: 'estimation', epingle: true}), fiche('Exacte', {pagesTotal: 512, ajoute: addDays(-50) + 'T10:00:00Z'})], () =>
    $$('.sommaire .p').map(e => e.textContent.replace(/ /g, ' ')).join('|')));
  /* ---------- Lot 34 : session calme (style Jardin seulement) ---------- */
  // (aide du lot 34 : jardin type, accueil allumé, aucune séance en cours ; tout est remis en place à la fin)
  const avecCalme = (fn, style = 'jardin', theme = 'dark') => avecCeSoir(jardinType(), async () => {
    const t0 = prefs.timer, d0 = prefs.dureeCalme, s0 = {...SOUFFLE}; prefs.timer = null; prefs.dureeCalme = undefined; savePrefs();
    try { return await fn(books[0]); }
    finally { fermerChrono(); prefs.timer = t0; prefs.dureeCalme = d0; Object.assign(SOUFFLE, s0); savePrefs(); paintTimerPill(); }
  }, style, theme);

  // 1.1
  await test('Lot 34 : en Jardin, « Reprendre » ouvre la session calme (rien ne démarre) ; la couverture ouvre la fiche', 'session|rien lancé|fiche', () => avecCalme(async () => {
    const r = [];
    $('#resumeLecture [data-act=calme]').click(); await pause(30);
    r.push($('#timerOv').classList.contains('show') && $('#timerOv').classList.contains('calme') ? 'session' : 'pas de session');
    r.push(!prefs.timer && $('#timerModal .durees') ? 'rien lancé' : 'chrono lancé trop tôt');
    fermerChrono(); $('#resumeLecture .couv-ruban').click(); await pause(80);
    r.push($('#livreOv').classList.contains('show') ? 'fiche' : 'pas de fiche'); await fermerFiche(); await pause(30);
    return r.join('|');
  }));
  // 1.2
  await test('Lot 34 : « ⋯ » propose « Session calme » en Jardin, « Lire avec le chrono » ailleurs, où la fenêtre reste la classique', 'jardin:Session calme|editorial:Lire avec le chrono|classique', async () => {
    const r = [];
    for (const st of ['jardin', 'editorial']) r.push(await avecCalme(async b => { openActions(b); const t = $('#modal [data-act=timer] b').textContent.replace($('#modal [data-act=timer] b .ico').textContent, '').trim(); closeM(); return st + ':' + t; }, st));
    r.push(await avecCalme(async b => { startTimer(b); await pause(20); return !$('#timerOv').classList.contains('calme') && $('#timerModal .chrono-livre') ? 'classique' : 'pas classique'; }, 'editorial'));
    return r.join('|');
  });
  // 1.3
  await test('Lot 34 : écran de départ — livre, page de reprise, durées (20 min par défaut), « Ouvrir le livre », croix « Fermer »', 'Chants pour l’Afrique|reprise à la page 188|10 min,20 min,30 min,Libre|20 min|Ouvrir le livre|Fermer', () => avecCalme(async b => {
    ouvrirCalme(b); const m = $('#timerModal');
    return [m.querySelector('.livre-s b').textContent, m.querySelector('.livre-s small').textContent,
      $$('#timerModal .durees button').map(x => x.textContent.trim()).join(), m.querySelector('.durees [aria-pressed=true]').textContent.trim(),
      m.querySelector('#c_go').textContent.trim(), m.querySelector('#c_x').getAttribute('aria-label')].join('|');
  }));
  // 1.4
  await test('Lot 34 : la durée choisie est retenue ; fermer avant de commencer n’enregistre rien', '30|rien lancé|0 séance', () => avecCalme(async b => {
    ouvrirCalme(b); $('#timerModal .durees [data-duree="30"]').click(); fermerDessus(); await pause(20);
    ouvrirCalme(b); const d = $('#timerModal .durees [aria-pressed=true]').dataset.duree; fermerDessus();
    return [d, prefs.timer ? 'chrono lancé' : 'rien lancé', (books[0].sessions || []).length + ' séance'].join('|');
  }));
  // 1.5
  await test('Lot 34 : livre pas encore commencé — « à la première page »', 'à la première page', () => avecCalme(async () => {
    const b = {...books[0], pageActuelle: 0}; books[0] = b; ouvrirCalme(b); return $('#timerModal .livre-s small').textContent;
  }));
  // 1.6 (trouvé par les gardes du lot 33 : une session fermée laissait son aurore dans la fenêtre cachée)
  await test('Lot 34 : fermer la session (croix, retour, Réduire) ne laisse pas d’aurore cachée', 'croix:0|retour:0|réduire:0', () => avecCalme(async b => {
    const r = [];
    ouvrirCalme(b); $('#c_x').click(); r.push('croix:' + $$('#timerOv .aurore').length);
    ouvrirCalme(b); fermerDessus(); r.push('retour:' + $$('#timerOv .aurore').length);
    prefs.timer = {id: b.id, start: Date.now(), acc: 0, running: true, duree: 20, calme: true}; openTimer(); fermerChrono(); r.push('réduire:' + $$('#timerOv .aurore').length);
    return r.join('|');
  }));
  // 2.1
  await test('Lot 34 : Éditorial, Android, Actuel, Carnet — même grande carte (« Reprendre » ouvre la fiche) et chrono classique', 'editorial:ok|android:ok|actuel:ok|carnet:ok', async () => {
    const r = [];
    for (const st of ['editorial', 'android', 'actuel', 'carnet']) r.push(st + ':' + await avecCalme(async b => {
      REPRISE = true; render(); const rep = $('#resumeLecture .btn.pri');
      const carte = !rep || (rep.dataset.open && !rep.dataset.act) ? 'ok' : 'carte changée';
      startTimer(b); await pause(20); const chrono = !$('#timerOv').classList.contains('calme') && $('#timerModal .chrono-livre') ? 'ok' : 'chrono changé';
      return carte === 'ok' && chrono === 'ok' ? 'ok' : carte + ' ' + chrono;
    }, st));
    return r.join('|');
  });
  // 2.2
  await test('Lot 34 : la touche retour d’Android ferme la session calme (et une séance lancée continue)', 'fermée|séance gardée', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 0, running: true, duree: 20, calme: true}; openTimer(); await pause(30);
    history.back(); await pause(250);
    return [!$('#timerOv').classList.contains('show') ? 'fermée' : 'encore ouverte', prefs.timer ? 'séance gardée' : 'séance perdue'].join('|');
  }));
  // 2.3
  await test('Lot 34 : session calme — cibles d’au moins 48 px (croix, durées, « Ouvrir le livre »)', [], () => avecCalme(async b => {
    ouvrirCalme(b);
    return $$('#timerModal #c_x, #timerModal .durees button, #timerModal #c_go').map(e => [e.id || e.textContent.trim(), e.getBoundingClientRect()])
      .filter(([, r]) => r.width < 48 || r.height < 48).map(([n, r]) => `${n} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }));
  // 3.1
  await test('Lot 34 : « Ouvrir le livre » → 3 respirations, puis la séance démarre seule avec la durée choisie', 'souffle|1 sur 3|3 sur 3|séance 10 min', () => avecCalme(async b => {
    SOUFFLE.cycle = 60; prefs.dureeCalme = 10; ouvrirCalme(b); $('#c_go').click(); const r = [];
    r.push($('#timerModal .cercle.souffle') && !prefs.timer ? 'souffle' : 'pas de souffle');
    r.push($('#c_compte').textContent.replace('Respiration ', ''));
    await pause(150); r.push(($('#c_compte') || {textContent: 'fini trop tôt'}).textContent.replace('Respiration ', ''));
    await pause(150); r.push(prefs.timer && prefs.timer.calme && prefs.timer.duree === 10 ? 'séance 10 min' : 'pas de séance');
    return r.join('|');
  }));
  // 3.2
  await test('Lot 34 : « Passer » démarre tout de suite ; fermer pendant la respiration n’enregistre rien, ni maintenant ni plus tard', 'démarrée|rien|toujours rien', () => avecCalme(async b => {
    SOUFFLE.cycle = 60; const r = [];
    ouvrirCalme(b); $('#c_go').click(); $('#c_passer').click(); r.push(prefs.timer ? 'démarrée' : 'pas démarrée');
    fermerChrono(); prefs.timer = null; savePrefs();
    ouvrirCalme(b); $('#c_go').click(); fermerDessus(); r.push(prefs.timer ? 'démarrée quand même' : 'rien');
    await pause(300); r.push(prefs.timer ? 'démarrée plus tard' : 'toujours rien');
    return r.join('|');
  }));
  // 3.3
  await test('Lot 34 : la bulle respire en Complète et Simple ; immobile en Aucune et en mouvement réduit', 'complete:anime|simple:anime|aucune:immobile|réduit:immobile', async () => {
    const a0 = prefs.animation, red0 = Ouverture.reduit, r = [];
    const etat = () => avecCalme(async b => { ouvrirCalme(b); $('#c_go').click(); const c = $('#timerModal .cercle'), n = getComputedStyle(c.querySelector('.bulle')).animationName;
      return c.classList.contains('immobile') && n === 'none' ? 'immobile' : !c.classList.contains('immobile') && n !== 'none' ? 'anime' : 'incohérent'; });
    try {
      for (const m of ['complete', 'simple', 'aucune']) { prefs.animation = m; r.push(m + ':' + await etat()); }
      prefs.animation = 'complete'; Ouverture.reduit = () => true; r.push('réduit:' + await etat());
    } finally { prefs.animation = a0; Ouverture.reduit = red0; }
    return r.join('|');
  });
  // 3.4
  await test('Lot 34 : TalkBack — le compteur de respirations est annoncé, les mots animés sont cachés', 'polite|mots cachés|Passer', () => avecCalme(async b => {
    ouvrirCalme(b); $('#c_go').click();
    return [$('#c_compte').getAttribute('aria-live'), $('#timerModal .cercle').getAttribute('aria-hidden') === 'true' ? 'mots cachés' : 'mots lus', $('#c_passer').textContent.trim()].join('|');
  }));
  // 4.1
  await test('Lot 34 : pendant la séance — temps restant, puis « Tes 10 minutes sont passées », le temps continue', '10:00|restantes|passées|continue', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 0, running: true, duree: 10, calme: true}; openTimer(); const r = [];
    r.push($('#clock').textContent); r.push(/restantes/.test($('#c_etat').textContent) ? 'restantes' : $('#c_etat').textContent);
    prefs.timer.acc = 10 * 60000 + 5000; prefs.timer.running = true; prefs.timer.start = Date.now(); verifierFinCalme();
    r.push(/Tes 10 minutes sont passées/.test($('#c_etat').textContent) ? 'passées' : $('#c_etat').textContent);
    r.push(prefs.timer && prefs.timer.running && prefs.timer.sonne ? 'continue' : 'arrêtée');
    return r.join('|');
  }));
  // 4.2
  await test('Lot 34 : la fin du temps ne prévient qu’une fois, même après fermeture et réouverture (appli rouverte en retard)', '1 vibration|1 fois', () => avecCalme(async b => {
    const v0 = navigator.vibrate; let n = 0; navigator.vibrate = () => { n++; return true; };
    try {
      prefs.timer = {id: b.id, start: Date.now() - 45 * 60000, acc: 0, running: true, duree: 10, calme: true}; savePrefs();
      verifierFinCalme(); fermerChrono(); verifierFinCalme(); openTimer(); verifierFinCalme();
      return n + ' vibration|' + (prefs.timer.sonne ? '1 fois' : 'jamais');
    } finally { navigator.vibrate = v0; }
  }));
  // 4.3
  await test('Lot 34 : le temps affiché après 45 min hors de l’appli est juste (séance de 10 min dépassée)', '45:00', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now() - 45 * 60000, acc: 0, running: false, duree: 10, calme: true};
    prefs.timer.acc = 45 * 60000; openTimer(); return $('#clock').textContent;
  }));
  // 4.4
  await test('Lot 34 : « J’ai fini de lire » demande la page ; la séance enregistrée a la même forme qu’avec le chrono', 'page demandée|date,min,de,a|12 min, 188 → 196|plus de séance', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 12 * 60000, running: false, duree: 20, calme: true}; openTimer(); const r = [];
    $('#t_stop').click(); r.push(!$('#t_end').hidden ? 'page demandée' : 'pas de question');
    $('#t_page').value = '196'; $('#t_save').click(); await pause(30);
    const s = (books.find(x => x.id === b.id).sessions || []).at(-1) || {};
    r.push(Object.keys(s).join()); r.push(`${s.min} min, ${s.de} → ${s.a}`); r.push(prefs.timer ? 'séance encore là' : 'plus de séance');
    return r.join('|');
  }));
  // 4.5
  await test('Lot 34 : une séance commencée en Jardin se termine normalement dans un autre style (fenêtre classique)', 'classique|enregistrée', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 5 * 60000, running: true, duree: 20, calme: true};
    return avecStyle('editorial', 'dark', async () => {
      openTimer(); const r = [!$('#timerOv').classList.contains('calme') && $('#timerModal .chrono-livre') ? 'classique' : 'pas classique'];
      $('#t_stop').click(); $('#t_page').value = '190'; $('#t_save').click(); await pause(30);
      r.push((books.find(x => x.id === b.id).sessions || []).length === 1 ? 'enregistrée' : 'perdue'); return r.join('|');
    });
  }));
  // 4.6
  await test('Lot 34 : une séance tourne déjà pour un autre livre — « Reprendre » la retrouve, sans nouvelle respiration', 'séance en cours|pas de respiration|Fondation', () => avecCalme(async () => {
    prefs.timer = {id: books[1].id, start: Date.now(), acc: 0, running: true, duree: 20, calme: true}; savePrefs();
    $('#resumeLecture [data-act=calme]').click(); await pause(20); const m = $('#timerModal');
    return [m.querySelector('#clock') ? 'séance en cours' : 'pas de séance', m.querySelector('.cercle.souffle') ? 'respiration' : 'pas de respiration', m.querySelector('.livre-s b').textContent].join('|');
  }));
  // 4.7
  await test('Lot 34 : un chrono lancé avant la mise à jour (sans durée) s’affiche en séance libre, sans fin de temps', 'sans limite|pas de fin', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 90 * 60000, running: true}; openTimer();
    const r = [/sans limite/.test($('#c_etat').textContent) ? 'sans limite' : $('#c_etat').textContent]; verifierFinCalme();
    r.push(prefs.timer.sonne ? 'fin signalée' : 'pas de fin'); return r.join('|');
  }));
  // 4.8
  await test('Lot 34 : « Réduire » garde la séance ; la pastille montre le temps restant et rouvre la session calme', 'pastille 20:00|session rouverte', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 0, running: false, duree: 20, calme: true}; openTimer();
    $('#t_hide').click(); const p = $('#timerPill'), r = [!p.hidden && /20:00/.test(p.textContent) ? 'pastille 20:00' : 'pastille ' + p.textContent.trim()];
    p.click(); r.push($('#timerOv').classList.contains('calme') ? 'session rouverte' : 'pas rouverte'); return r.join('|');
  }));
  // 5.1
  await test('Lot 34 : l’aurore de la session bouge en Complète (Nuit), s’endort sans toucher, se réveille ; fixe en Jour', 'bouge|endormie|réveillée|jour:fixe', async () => {
    const a0 = prefs.animation, s0 = AURORE.sommeil; prefs.animation = 'complete'; AURORE.sommeil = 60;
    try {
      const r = await avecCalme(async b => {
        ouvrirCalme(b); const a = $('#timerModal .aurore'), out = [a.classList.contains('bouge') ? 'bouge' : 'fixe'];
        await pause(150); out.push(a.classList.contains('dort') ? 'endormie' : 'éveillée');
        AURORE.dernier = 0; document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        out.push(!a.classList.contains('dort') ? 'réveillée' : 'toujours endormie'); return out;
      });
      r.push('jour:' + await avecCalme(async b => { ouvrirCalme(b); return $('#timerModal .aurore').classList.contains('bouge') ? 'bouge' : 'fixe'; }, 'jardin', 'light'));
      return r.join('|');
    } finally { prefs.animation = a0; AURORE.sommeil = s0; }
  });
  // 5.2
  await test('Lot 34 : textes de la session ≥ 4,5 par-dessus l’aurore plein écran, 72 teintes, Nuit et Jour, départ et séance', [], async () => {
    const ko = [], rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = v => { const l = v.map(x => x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const melange = (fond, tache, a) => fond.map((f, i) => f * (1 - a) + tache[i] * a);
    for (const theme of ['dark', 'light']) await avecCalme(async b => {
      for (const phase of ['depart', 'lecture']) {
        if (phase === 'depart') ouvrirCalme(b); else { prefs.timer = {id: b.id, start: Date.now(), acc: 0, running: true, duree: 20, calme: true}; openTimer(); }
        const m = $('#timerModal'), fond = rgb(getComputedStyle(m).backgroundColor);
        const textes = ['.haut span', '.livre-s b', '.livre-s small', '.aide', '#clock', '.durees button:not([aria-pressed=true])'].map(s => m.querySelector(s)).filter(Boolean);
        for (let h = 0; h < 360; h += 5) {
          m.style.setProperty('--h', h);
          const taches = [...m.querySelectorAll('.aurore i')].map(i => melange(fond, rgb(getComputedStyle(i).backgroundColor), +getComputedStyle(i).opacity));
          for (const t of textes) for (const p of taches) { const r = ratio(rgb(getComputedStyle(t).color), p); if (r < 4.5) { ko.push(`${theme} ${phase} ${t.id || t.className || t.tagName} h${h} ${r.toFixed(2)}`); break; } }
        }
        fermerChrono(); prefs.timer = null;
      }
    }, 'jardin', theme);
    return ko.slice(0, 6);
  });
  // 5.3
  await test('Lot 34 : l’aurore de l’accueil et celle de la session dorment et se réveillent ensemble', 'deux endormies|deux réveillées', async () => {
    const a0 = prefs.animation, s0 = AURORE.sommeil; prefs.animation = 'complete'; AURORE.sommeil = 60;
    try {
      return await avecCalme(async b => {
        ouvrirCalme(b); await pause(150); const toutes = () => $$('.aurore.bouge'), r = [];
        r.push(toutes().length === 2 && toutes().every(a => a.classList.contains('dort')) ? 'deux endormies' : toutes().length + ' aurores, ' + toutes().filter(a => a.classList.contains('dort')).length + ' endormies');
        AURORE.dernier = 0; document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        r.push(toutes().every(a => !a.classList.contains('dort')) ? 'deux réveillées' : 'pas toutes réveillées'); return r.join('|');
      });
    } finally { prefs.animation = a0; AURORE.sommeil = s0; }
  });
  // 6.1
  await test('Lot 34 : écran de départ — « Ouvrir le livre » visible sans défiler (320 × 640 compris)', 'visible sans défiler', () => avecCalme(async b => {
    ouvrirCalme(b); await pause(30); const r = $('#c_go').getBoundingClientRect();
    return r.bottom <= innerHeight ? 'visible sans défiler' : `bas à ${Math.round(r.bottom)} pour ${innerHeight}`;
  }));
  // 6.2
  await test('Lot 34 : texte à 130 % — départ, respiration et séance ne dépassent pas en largeur ; « Ouvrir le livre » atteignable', [], () => avecCalme(async b => {
    const html = document.documentElement, f0 = html.style.fontSize, ko = []; html.style.fontSize = '130%'; SOUFFLE.cycle = 60000;
    try {
      const deborde = nom => { const m = $('#timerModal'); for (const e of m.querySelectorAll('.zone *')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1)) { ko.push(nom + ' ' + (e.id || e.className || e.tagName)); break; } } };
      ouvrirCalme(b); await pause(30); deborde('départ');
      $('#c_go').scrollIntoView({block: 'end'}); if (!$('#c_go').checkVisibility()) ko.push('Ouvrir le livre inatteignable');
      $('#c_go').click(); await pause(30); deborde('respiration');
      $('#c_passer').click(); await pause(30); deborde('séance');
    } finally { html.style.fontSize = f0; }
    return ko;
  }));
  // 6.3 (vu sur les captures du lot 34 : Pause et « J'ai fini de lire » flottaient au milieu de l'écran, loin du temps)
  await test('Lot 34 : pendant la séance, Pause et « J’ai fini de lire » suivent le temps (pas au milieu de l’écran)', 'sous le temps', () => avecCalme(async b => {
    prefs.timer = {id: b.id, start: Date.now(), acc: 60000, running: true, duree: 20, calme: true}; openTimer(); await pause(30);
    const ecart = $('#t_stop').getBoundingClientRect().top - $('#c_etat').getBoundingClientRect().bottom;
    return ecart <= 48 ? 'sous le temps' : `écart de ${Math.round(ecart)} px`;
  }));
  // 6.4 (vu sur les captures du lot 34 : bulle immobile, mais l'aide disait « quand le cercle grandit »)
  await test('Lot 34 : l’aide de la respiration ne parle du cercle que s’il bouge', 'anime:cercle|immobile:sans cercle', async () => {
    const a0 = prefs.animation, r = [];
    try {
      for (const [m, nom] of [['complete', 'anime'], ['aucune', 'immobile']]) { prefs.animation = m;
        r.push(nom + ':' + await avecCalme(async b => { ouvrirCalme(b); $('#c_go').click(); return /cercle/.test($('#timerModal .aide').textContent) ? 'cercle' : 'sans cercle'; })); }
    } finally { prefs.animation = a0; }
    return r.join('|');
  });
  // (relecture du lot 34, I-1 : un livre supprimé pendant sa séance bloquait le Jardin — pastille morte, « Reprendre » sans effet)
  await test('Lot 34 (relecture) : livre supprimé pendant sa séance — pastille cachée, « Reprendre » ouvre une nouvelle session', 'pastille cachée|départ|plus de séance', () => avecCalme(async () => {
    prefs.timer = {id: books[1].id, start: Date.now(), acc: 0, running: true, duree: 20, calme: true}; savePrefs();
    books = books.filter(x => x.id !== prefs.timer.id); render(); paintTimerPill(); const r = [$('#timerPill').hidden ? 'pastille cachée' : 'pastille visible'];
    $('#resumeLecture [data-act=calme]').click(); await pause(20);
    r.push($('#timerModal .durees') ? 'départ' : 'rien d’ouvert'); r.push(prefs.timer ? 'séance fantôme' : 'plus de séance');
    return r.join('|');
  }));
  // (relecture du lot 34, I-2 : la fin du temps était « signalée » dans une page cachée, donc jamais vue)
  await test('Lot 34 (relecture) : page cachée à la fin du temps — rien n’est consommé ; au retour, la fin est signalée une fois', 'caché:pas signalé|retour:signalé|1 vibration', () => avecCalme(async b => {
    const v0 = navigator.vibrate; let n = 0; navigator.vibrate = () => { n++; return true; };
    const r = [];
    try {
      prefs.timer = {id: b.id, start: Date.now() - 15 * 60000, acc: 0, running: true, duree: 10, calme: true}; savePrefs();
      Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true});
      verifierFinCalme(); r.push('caché:' + (prefs.timer.sonne ? 'consommé' : 'pas signalé'));
      delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));
      r.push('retour:' + (prefs.timer.sonne ? 'signalé' : 'pas signalé')); r.push(n + ' vibration');
    } finally { delete document.visibilityState; navigator.vibrate = v0; }
    return r.join('|');
  }));
  // (relecture du lot 34, I-3 : TalkBack — l'écran plein est une boîte de dialogue nommée ; le focus suit chaque phase)
  await test('Lot 34 (relecture) : TalkBack — boîte de dialogue « Session calme », focus sur l’action de chaque phase, fin annoncée', 'dialog|true|Session calme|c_go|30|c_passer|t_stop|polite', () => avecCalme(async b => {
    const m = $('#timerModal'), r = [];
    ouvrirCalme(b); r.push(m.getAttribute('role'), m.getAttribute('aria-modal'), m.getAttribute('aria-label'), document.activeElement.id);
    const b30 = $('#timerModal .durees [data-duree="30"]'); b30.focus(); b30.click(); r.push(document.activeElement.dataset.duree || document.activeElement.id || document.activeElement.tagName);
    $('#c_go').click(); r.push(document.activeElement.id);
    $('#c_passer').click(); r.push(document.activeElement.id, $('#c_etat').getAttribute('aria-live'));
    return r.join('|');
  }));
  // (relecture du lot 34, M-1 regradé : D21 promet que la pastille montre la fin ; hors Jardin, elle montre le temps lu comme la fenêtre)
  await test('Lot 34 (relecture) : pastille — signe de fin après le temps écoulé (Jardin) ; temps lu hors Jardin', 'fin marquée|3:00', () => avecCalme(async b => {
    const r = [];
    prefs.timer = {id: b.id, start: Date.now(), acc: 12 * 60000, running: false, duree: 10, calme: true, sonne: true}; paintTimerPill();
    r.push($('#timerPill .i-fini') ? 'fin marquée' : 'pas de signe');
    prefs.timer = {id: b.id, start: Date.now(), acc: 3 * 60000, running: false, duree: 20, calme: true};
    r.push(await avecStyle('editorial', 'light', () => { paintTimerPill(); return ($('#timerPill').textContent.match(/\d+:\d\d/) || ['?'])[0]; }));
    return r.join('|');
  }));
  /* ---------- Fin : on remet la mémoire de test à zéro et on affiche le bilan ---------- */
  window.confirm = vraiConfirm;
  await vider(); try { await Store.set('avant-restauration', null); } catch (e) {}
  delete prefs.avantRestauration; savePrefs(); ui.tab = 'en_cours'; render();
  const ko = resultats.filter(r => !r.ok);
  const box = document.createElement('div');
  box.id = 'resultatsTests';
  box.style.cssText = 'position:fixed;inset:0;z-index:999;overflow:auto;background:var(--fond);color:var(--texte);padding:16px;font-size:.88rem';
  box.innerHTML = `<h2>${ko.length ? '❌' : '✅'} Tests : ${resultats.length - ko.length} réussis sur ${resultats.length}</h2>
    <p class="a">${enLigne ? '' : 'Tests 🌐 (vrais catalogues) non exécutés : ajoute « &enligne » à l’adresse pour les lancer. '}Mémoire de test séparée : tes vrais livres n'ont pas été touchés.</p>
    <table style="width:100%;border-collapse:collapse">${resultats.map(r => `<tr style="border-top:1px solid var(--trait)">
      <td style="padding:4px">${r.ok ? '✅' : '❌'}</td><td style="padding:4px">${esc(r.nom)}${r.ok ? '' : `<br><small>attendu : ${esc(JSON.stringify(r.attendu))}<br>obtenu : ${esc(JSON.stringify(r.obtenu))}</small>`}</td></tr>`).join('')}</table>`;
  document.body.appendChild(box);
  window.resultatsTests = resultats;
})();
