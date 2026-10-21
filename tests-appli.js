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
    let obtenu, ok;
    try { obtenu = await fn(); ok = egal(obtenu, attendu); }
    catch (e) { obtenu = 'ERREUR : ' + (e && e.message || e); ok = false; }
    resultats.push({nom, attendu, obtenu, ok});
  }
  const ids = l => l.map(c => c.id);
  const cats = b => ids(Recherche.categories(b));
  const vider = async () => { books = []; goal = 0; await Store.persist(); localStorage.removeItem(CLE + '-data'); };
  const fiche = (titre, extra) => norm({...blankBook('a_lire'), id: 't-' + titre, titre, auteur: 'Auteur Test', ...extra});
  // Les tests 🌐 interrogent vraiment les catalogues (BnF…) : seulement sur demande (index.html?tests&enligne),
  // pour ne pas fatiguer la BnF, qui bloque un moment ceux qui l'interrogent trop souvent
  const enLigne = new URLSearchParams(location.search).has('enligne') && navigator.onLine !== false;

  // Pas de vraies fenêtres de confirmation pendant les tests
  const vraiConfirm = window.confirm;
  let reponseConfirm = true, confirmDemande = 0;
  window.confirm = () => { confirmDemande++; return reponseConfirm; };

  await vider();
  // Mémoire de test propre : les livres « déjà proposés » ou refusés lors d'un passage précédent ne doivent pas fausser celui-ci
  prefs.proposes = []; prefs.nonMerci = []; prefs.selection = null; savePrefs();

  /* ---------- 1. Catégories (règles de classement) ---------- */
  const B = (c, l) => ({c, l, s: 'BnF'});
  await test('Catégorie : code BnF 320 → Politique', ['politique'], () => cats({classements: [B('686', '320'), B('676', '320.533 094')]}));
  await test('Catégorie : histoire de la Syrie avec « Politique et gouvernement » → Histoire seulement', ['histoire'],
    () => cats({classements: [B('676', '956.910 4'), B('686', '940'), B('606', 'Syrie -- Politique et gouvernement')]}));
  await test('Catégorie : droit social → Droit (pas Politique)', ['droit'], () => cats({classements: [B('676', '344.01'), B('606', 'Droit social')]}));
  await test('Catégorie : plusieurs catégories (320.01 + 342)', ['politique', 'droit'], () => cats({classements: [B('676', '342.040 1'), B('676', '320.01')]}));
  await test('Catégorie : anglais « Political science »', ['politique'], () => cats({sujets: ['Political science', 'Politics and government']}));
  await test('Catégorie : « Économie politique » → Économie', ['eco'], () => cats({sujets: ['Économie politique']}));
  await test('Catégorie : livre sans aucune donnée → aucune', [], () => cats({titre: 'X'}));
  await test('Catégorie : sujet inconnu → aucune', [], () => cats({sujets: ['Zzzz inconnu']}));
  await test('Catégorie : rayon Apple « SF et fantasy » sur un roman classé 803', ['litterature', 'fantasy', 'sf'],
    () => cats({classements: [B('686', '803')], sujets: ['Science-fiction et fantasy']}));
  await test('Catégorie : le rayon Apple « Histoire » n\'ajoute pas Histoire à un roman classé', ['litterature'],
    () => cats({classements: [B('686', '803')], sujets: ['Histoire']}));
  await test('Catégorie : correction à la main (retirée / ajoutée)', ['histoire'],
    () => cats({classements: [B('686', '320')], catNon: ['politique'], catOui: ['histoire']}));
  await test('Catégorie : la raison garde la source d\'origine', 'BnF : classement 320 (Sciences politiques)',
    () => Recherche.categories({classements: [B('686', '320')]})[0].raisons[0]);
  await test('Catégorie : texte « philo » → thème Philosophie', 'philo', () => Recherche.themePourTexte('philo').id);

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
    return egal(cats(books[0]), avant) && egal(avant, ['politique', 'histoire']);
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
  await test('Export Excel : colonne « Catégories » et cellule « =formule » neutralisée', 'Catégories|\'=1+1', () => {
    books = [fiche('=1+1', {classements: [B('686', '320')]})];
    let csv = ''; const dl = window.download; window.download = (n, c) => { csv = c; };
    doExport('excel'); window.download = dl;
    return (csv.includes('"Catégories"') ? 'Catégories' : '?') + '|' + (csv.includes('"\'=1+1"') ? '\'=1+1' : 'non neutralisée');
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
  const attendus = ['roman', 'polar', 'sf', 'fantasy', 'bd', 'manga', 'histoire', 'essai', 'perso', 'social', 'romance', 'classique', 'jeunesse',
    'cat:politique', 'cat:histoire', 'cat:philo', 'cat:psycho', 'cat:socio', 'cat:eco', 'cat:sciences', 'cat:bio', 'cat:education', 'cat:social', 'cat:art', 'cat:droit', 'cat:religion'];
  await test('Tirage en ligne : toutes les catégories sont proposées', [], () => attendus.filter(id => !Recherche.THEMES_TIRAGE.some(t => t.id === id)));
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
  await test('Sous-catégories : 327 → Relations internationales, 362.7 → Protection de l\'enfance', ['politique/ri', 'social/enfance'], () =>
    [...Recherche.sousCategories({classements: [B('686', '320'), B('676', '327.101')]}), ...Recherche.sousCategories({classements: [B('686', '360'), B('676', '362.709 44')]})].map(z => z.id));
  await test('Bibliothèque : filtre par sous-catégorie', ['Géopo'], () => {
    books = [fiche('Géopo', {classements: [B('686', '320'), B('676', '327.1')]}), fiche('Élections', {classements: [B('686', '320'), B('676', '324.6')]})];
    ui.tab = 'a_lire'; ui.cat = 'sous:politique/ri'; render();
    const l = [...document.querySelectorAll('#list .card .t')].map(e => e.textContent.trim()); ui.cat = ''; render(); return l;
  });
  await test('Mon profil : série à continuer, auteurs, sujets précis', 'Les Annales|2 auteurs|Relations internationales & géopolitique,Idées & philosophie politiques,Fascisme', () => {
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
  await test('Version : index.html et recherche.js ont le même numéro (affiché dans les Réglages)', true, async () => {
    openSettings(); const vu = $('#modal').textContent.includes('Version de l\'appli : ' + VERSION); closeM(); await pause(250);
    return Recherche.VERSION === VERSION && vu;
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
      return !!x && !!x.couverture && x.themeNom === 'Politique' && cats(x).includes('politique');
    });
    let philo199;
    await test('🌐 Philosophie, 199 p. max : tous les livres font 199 pages ou moins', true, async () => {
      philo199 = await Recherche.parTheme({cat: 'philo', max: 199}, {});
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
  }
  await test('Catalogue en panne → erreur annoncée (pas « aucun résultat »)', 'reseau', async () => {
    const vrai = window.fetch; window.fetch = () => Promise.reject(new TypeError('panne simulée'));
    try { return (await Recherche.parTheme({cat: 'socio', max: 300}, {})).erreur; } finally { window.fetch = vrai; }
  });
  await test('Réponse illisible du catalogue → erreur annoncée (pas « aucun résultat »)', true, async () => {
    const vrai = window.fetch; window.fetch = () => Promise.resolve(new Response('<pas du xml', {status: 200}));
    try { return ['reseau', 'pause'].includes((await Recherche.parTheme({cat: 'eco', max: 300}, {})).erreur); } finally { window.fetch = vrai; }
  });

  /* ---------- Fin : on remet la mémoire de test à zéro et on affiche le bilan ---------- */
  window.confirm = vraiConfirm;
  await vider(); try { await Store.set('avant-restauration', null); } catch (e) {}
  delete prefs.avantRestauration; savePrefs(); ui.tab = 'en_cours'; render();
  const ko = resultats.filter(r => !r.ok);
  const box = document.createElement('div');
  box.id = 'resultatsTests';
  box.style.cssText = 'position:fixed;inset:0;z-index:999;overflow:auto;background:var(--bg);color:var(--ink);padding:16px;font-size:.88rem';
  box.innerHTML = `<h2>${ko.length ? '❌' : '✅'} Tests : ${resultats.length - ko.length} réussis sur ${resultats.length}</h2>
    <p class="a">${enLigne ? '' : 'Tests 🌐 (vrais catalogues) non exécutés : ajoute « &enligne » à l’adresse pour les lancer. '}Mémoire de test séparée : tes vrais livres n'ont pas été touchés.</p>
    <table style="width:100%;border-collapse:collapse">${resultats.map(r => `<tr style="border-top:1px solid var(--line)">
      <td style="padding:4px">${r.ok ? '✅' : '❌'}</td><td style="padding:4px">${esc(r.nom)}${r.ok ? '' : `<br><small>attendu : ${esc(JSON.stringify(r.attendu))}<br>obtenu : ${esc(JSON.stringify(r.obtenu))}</small>`}</td></tr>`).join('')}</table>`;
  document.body.appendChild(box);
  window.resultatsTests = resultats;
})();
