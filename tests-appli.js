/* =====================================================================
   Tests de l'appli « Mes lectures »
   Ouvrir : index.html?tests  (mémoire séparée « test-mes-lectures » : les vrais livres ne sont jamais touchés)
   Chaque test affiche : ce qui est vérifié, le résultat attendu, le résultat obtenu, réussi ou échoué.
   Les tests marqués 🌐 interrogent les vrais catalogues (internet nécessaire).
   ===================================================================== */
(async () => {
  const resultats = [];
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  async function test(nom, attendu, fn) {
    let obtenu, ok; window.testEnCours = nom;
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
  await test('Notes en pastille : contraste lisible (au moins 4,5) pour les notes 1 à 5', [], async () => {
    books = [1, 2, 3, 4, 5].map(n => fiche('Note ' + n, {statut: 'lu', note: n}));
    ui.tab = 'lu'; render();
    const lum = c => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(x => +x / 255).map(x => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const ratio = el => { const s = getComputedStyle(el), a = lum(s.color), b = lum(s.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const faibles = [1, 2, 3, 4, 5].map(n => [n, document.querySelector('#list .score.n' + n)]).filter(([, el]) => !el || ratio(el) < 4.5)
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
  await test('Les 7 onglets s\'affichent sans erreur', 'ok', () => {
    for (const t of ['en_cours', 'a_lire', 'decouvrir', 'lu', 'abandon', 'citations', 'stats']) { ui.tab = t; render(); }
    ui.tab = 'a_lire'; render(); return 'ok';
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
    prefs.tirage = 'perso'; ui.tab = 'decouvrir'; render(); return $('#main').textContent.includes('seules des recherches partent vers les catalogues');
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
  const COMBOS = [['android', 'light'], ['android', 'dark'], ['actuel', 'light'], ['actuel', 'dark'], ['carnet', 'light'], ['carnet', 'dark']];
  const avecStyle = async (style, theme, fn) => {
    const s0 = prefs.style, t0 = prefs.theme; prefs.style = style; prefs.theme = theme; applyTheme();
    try { return await fn(); } finally { prefs.style = s0; prefs.theme = t0; applyTheme(); }
  };
  // (valeurs du §3 du design : fond, texte, accent, texte sur accent)
  const PALETTE_ATTENDUE = {
    'android/light': '#f5faf4 #191c19 #1b6c3d #ffffff', 'android/dark': '#101410 #e0e4dc #9bd5a8 #00391a',
    'actuel/light': '#f2f2f0 #141414 #0b7f45 #ffffff', 'actuel/dark': '#0d0d0d #f1f1f1 #2ecc71 #04210f',
    'carnet/light': '#f7f3ec #2b2622 #a0461f #ffffff', 'carnet/dark': '#1b1815 #efe7dd #e08a5e #1b1815'
  };
  const lirePalette = el => ['--fond', '--texte', '--accent', '--sur-accent'].map(v => getComputedStyle(el).getPropertyValue(v).trim()).join(' ');
  await test('Style : Android moderne par défaut (préférence absente ou inconnue)', 'android|android', () => {
    const s0 = prefs.style; delete prefs.style; applyTheme(); const a = document.documentElement.dataset.style;
    prefs.style = 'xyz'; applyTheme(); const b = document.documentElement.dataset.style;
    prefs.style = s0; applyTheme(); return a + '|' + b;
  });
  await test('Style : les 6 palettes ont les valeurs du design', [], async () => {
    const fautes = [];
    for (const [s, t] of COMBOS) await avecStyle(s, t, () => { const v = lirePalette(document.documentElement); if (v !== PALETTE_ATTENDUE[s + '/' + t]) fautes.push(s + '/' + t + ' : ' + v); });
    return fautes;
  });
  await test('Style : un aperçu garde sa palette même si la page est dans un autre style', '#f7f3ec #2b2622 #a0461f #ffffff', async () =>
    avecStyle('android', 'dark', () => { const s = document.createElement('span'); s.dataset.style = 'carnet'; s.dataset.theme = 'light'; document.body.appendChild(s); const v = lirePalette(s); s.remove(); return v; }));
  await test('Style : choix dans les Réglages, immédiat et gardé', 'carnet|carnet|3 aperçus', async () => {
    const s0 = prefs.style; openSettings(); await pause(50);
    document.querySelector('#st_style [data-st="carnet"]').click();
    const r = document.documentElement.dataset.style + '|' + JSON.parse(localStorage.getItem(CLE + '-prefs')).style + '|' + document.querySelectorAll('#st_style .apercu').length + ' aperçus';
    prefs.style = s0; savePrefs(); applyTheme(); closeM(); await pause(250);
    return r;
  });
  await test('Style : la barre du navigateur prend la couleur de l\'en-tête', '#f5faf4|#141414', async () => {
    const lire = () => document.querySelector('meta[name="theme-color"]').content;
    return (await avecStyle('android', 'light', lire)) + '|' + (await avecStyle('actuel', 'light', lire));
  });

  /* ---------- 10 bis. Phase 1 : feuille de style ---------- */
  // Toutes les règles de la feuille principale (et celles des @media, sauf l'impression)
  const regles = () => { const out = []; const lire = (l, imp) => { for (const r of l) { if (r.cssRules && r.media) lire(r.cssRules, imp || /print/.test(r.media.mediaText)); else if (r.selectorText && !imp) out.push(r); } }; lire(document.styleSheets[0].cssRules, false); return out; };
  const estPalette = sel => sel.split(',').every(s => /^\s*(:root|\[data-style|\[data-theme)/.test(s));
  await test('CSS : aucune couleur écrite en dur hors des palettes', [], () =>
    regles().filter(r => !estPalette(r.selectorText) && !/^\.cam\b/.test(r.selectorText) && /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b(?!-)/i.test(r.style.cssText)).map(r => r.selectorText).slice(0, 20));
  await test('CSS : tailles de texte toutes sur l\'échelle (6 tailles)', [], () =>
    regles().filter(r => r.style.fontSize && !/^(var\(--t-(xs|s|m|l|xl|xxl)\)|inherit|0|0px)$/.test(r.style.fontSize) && !/^\.clock$|\.badge \.be$/.test(r.selectorText))
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
  await test('Couvertures de secours : initiale lisible (≥ 4,5:1) pour 36 titres, dans les 6 combinaisons', [], async () => {
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
  await test('Icônes : dessinées en Android et Actuel, émojis en Carnet', 'android:dessin|actuel:dessin|carnet:émoji', async () => {
    const r = [];
    for (const s of ['android', 'actuel', 'carnet']) await avecStyle(s, 'light', () => {
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
  await test('Icônes : sur la même ligne que leur libellé (onglet, résumé, bouton)', [], async () => {
    books = [fiche('Un roman', {genre: 'Roman'})]; ui.tab = 'a_lire'; render();
    const fautes = [];
    for (const s of ['android', 'carnet']) await avecStyle(s, 'light', () => {
      for (const el of ['.tab[data-tab=decouvrir]', '#filtres summary']) {
        const box = document.querySelector(el), i = box.querySelector('.ico'), t = document.createRange(); t.selectNodeContents(box.lastChild.nodeType === 3 ? box.lastChild : box);
        const a = i.getBoundingClientRect(), b = [...t.getClientRects()].pop();
        if (Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) > 6) fautes.push(s + ' ' + el + ' décalée de ' + Math.round((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) + ' px');
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
    books = []; ui.tab = 'en_cours'; render();
    return ($('#main .etat [data-ajouter]') ? 'ajouter' : '?') + '|' + ($('#main .etat [data-export="restore"]') ? 'restaurer' : '?');
  });
  await test('États : l\'avertissement sous l\'accueil est centré comme l\'accueil', 'centré', () => {
    books = []; ui.tab = 'en_cours'; render();
    const a = $('#main .etat').getBoundingClientRect(), b = $('#main .etat + .etat-texte').getBoundingClientRect();
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
  await test('Accessibilité : onglets marqués (tablist, onglet actif sélectionné)', 'tablist|stats', () => {
    ui.tab = 'stats'; render(); const r = $('#tabs').getAttribute('role') + '|' + ($('#tabs [aria-selected="true"]') || {dataset: {}}).dataset.tab;
    ui.tab = 'en_cours'; render(); return r;
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
  /* ---------- 10 septies. Phase 1 : audit visuel (5 écrans × 6 combinaisons) ---------- */
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
  await test('Audit : contrastes ≥ 4,5:1 (3:1 grand texte) sur 5 écrans × 6 combinaisons', [], () => auditEcrans(() => textesVisibles().map(el => {
    const st = getComputedStyle(el), fs = parseFloat(st.fontSize), fw = parseInt(st.fontWeight, 10);
    const fg = sur(rgba(st.color), fondReel(el)), bg = fondReel(el), r = (Math.max(lumi(fg), lumi(bg)) + .05) / (Math.min(lumi(fg), lumi(bg)) + .05);
    return r < (fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5) ? `« ${el.textContent.trim().slice(0, 24)} » (${el.className || el.tagName}) ${r.toFixed(2)}` : null;
  }).filter(Boolean), COMBOS));
  await test('Audit : aucun texte visible sous 13 px (5 écrans)', [], () => auditEcrans(() => textesVisibles().filter(el => parseFloat(getComputedStyle(el).fontSize) < 12.99)
    .map(el => `« ${el.textContent.trim().slice(0, 20)} » ${getComputedStyle(el).fontSize}`)));
  await test('Audit : zones tactiles (48 px, puces 40 px) sur 5 écrans', [], () => auditEcrans(() =>
    [...document.querySelectorAll('button, a.btn, select, input:not([type=checkbox]):not([type=hidden]):not([type=file]), summary, [role=tab]')]
      .filter(el => el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true}) && !el.closest('.cam'))
      .filter(el => el.getBoundingClientRect().height < (el.matches('.chipb, .btn.small, .catchip button') ? 39.5 : 47.5))
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
  await test('Icônes : thème, « Chercher par » et chrono ont leur icône', 'thème 3/3|chercher par 3/3|chrono 1', async () => {
    openSettings(); await pause(50); const a = [...document.querySelectorAll('#st_theme button')], th = a.filter(x => x.textContent.trim() === 'Auto' || x.querySelector('.ico')).length + '/' + a.length;
    closeM(); await pause(250);
    ui.tab = 'decouvrir'; render(); const p = [...document.querySelectorAll('#rq_par button')], rp = p.filter(x => x.querySelector('.ico')).length + '/' + p.length;
    books = [fiche('Chrono', {statut: 'en_cours'})]; prefs.timer = {id: books[0].id, start: Date.now(), acc: 0, running: true}; openTimer();
    const c = document.querySelectorAll('#t_pause .ico').length;
    prefs.timer = null; $('#timerOv').classList.remove('show'); paintTimerPill(); ui.tab = 'en_cours'; render();
    return 'thème ' + th + '|chercher par ' + rp + '|chrono ' + c;
  });
  await test('Style posé avant le premier affichage (script en tête), y compris préférence corrompue', 'carnet/dark|android/light|android', () => {
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
    '2026-01-10 Fini', '2026-01-10 p. 300 (+180) sur 300', '2026-01-05 Séance de chrono : 30 min · 40 p.', '2026-01-05 Séance de chrono : 20 min',
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
    $('#fs_progression [data-fiche="pages"]').click(); await pause(50); $('#p_val').value = '60'; $('#p_ok').click(); await pause(200);
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
  await test('Carnet : fiche complète (classification en lecture seule, suggestion marquée, avis, infos, historique)', 'Roman · suggéré|Mon avis|Fayard|Commencé|aucun bouton de classification', async () => {
    books = [fiche('Complet', {statut: 'en_cours', genre: 'roman', avis: 'Très bien', editeur: 'Fayard', dateDebut: '2026-01-02', pagesTotal: 200, pageActuelle: 20,
      journal: [{date: '2026-01-02', page: 0}, {date: '2026-01-04', page: 20}], classements: [{c: '686', l: '843'}]})];
    ouvrirFiche('t-Complet'); const t = $('#livre').textContent;
    const r = [$('#livre .chip.suggere') ? $('#livre .chip.suggere').textContent.trim() : '?', t.includes('Mon avis') ? 'Mon avis' : '?', t.includes('Fayard') ? 'Fayard' : '?',
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
    reponseConfirm = false; $('#fs_notes [data-fiche="retirer"][data-id="n-x"]').click(); await pause(100); const a = books[0].notes.length;
    reponseConfirm = true; $('#fs_notes [data-fiche="retirer"][data-id="n-x"]').click(); await pause(150); const b = books[0].notes.length;
    $('#fs_citations [data-fiche="retirer"][data-id="c-a"]').click(); await pause(150);
    const r = [a, b, 'reste ' + books[0].citations.map(q => q.id).join(',')]; await fermerTout(); return r.join('|');
  });
  await test('Citations identiques : modifier l\'une ne touche jamais l\'autre', 'c-a:Pareil|c-b:Changée', async () => {
    books = [ficheNote({citations: [{id: 'c-a', texte: 'Pareil', date: today()}, {id: 'c-b', texte: 'Pareil', date: today()}]})]; ouvrirFiche('t-Carnet');
    $('#fs_citations [data-fiche="modifier"][data-id="c-b"]').click(); taper('#fe_texte', 'Changée'); $('#livreOv [data-fiche="enregistrer"]').click(); await pause(150);
    const r = books[0].citations.map(q => q.id + ':' + q.texte).sort().join('|'); await fermerTout(); return r;
  });
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
  await test('Fluidité : règle de repli automatique (16 ms fluide, 50 ms saccadé, trop court sans avis, deux saccades → Simple, fluide → compteur à zéro)', 'true|false|null|simple|complete|0', () => {
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
  const effets = () => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && (a.effect.target.closest('#ouverture') || a.effect.target.id === 'livreOv'));
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
      !$('#livreOv').classList.contains('masque') && getComputedStyle($('#livreOv')).opacity === '1' ? 'visible' : '?', duree >= 600 && duree <= 1100 ? 'durée ok' : 'durée ' + duree);
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
  await test('Copie de couverture fidèle (sans image : initiale et couleur)', 'S|couleur', () => avecAnim('complete', async () => {
    books = [norm({id: 'sans', titre: 'Sans image', statut: 'en_cours'})]; ui.tab = 'en_cours'; render(); $('#list .card .t').click();
    const c = $('#ouverture .ouv-couv'), r = [c ? c.textContent.trim() : '?', c && getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'couleur' : '?']; return r.join('|');
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
  // (relecture : le vrai geste au doigt, c'est « appui » puis « clic » au relâchement, sur la fiche encore invisible)
  const appui = el => el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
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
