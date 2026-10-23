/* =====================================================================
   Mes lectures : moteur de recherche de livres
   ---------------------------------------------------------------------
   Par code-barres (ISBN) : BnF + Sudoc + Open Library + Google Books
   (+ bibliothèque allemande pour les livres allemands), interrogés en
   même temps, puis fusionnés en une seule fiche.
   Par titre / auteur : BnF + Apple Books + Google Books + Open Library,
   regroupés par livre et triés par pertinence (éditions françaises,
   résultats confirmés par plusieurs sources).
   ===================================================================== */
const Recherche = (() => {
  const SRU = 'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve';
  const NS_SRW = 'http://www.loc.gov/zing/srw/';
  const DC = 'http://purl.org/dc/elements/1.1/';
  const NSB = new RegExp('[' + String.fromCharCode(0x88, 0x89, 0x98, 0x9c) + ']', 'g');
  let googleKey = '';
  let googleBlockedUntil = 0;

  /* ---------- Outils texte ---------- */
  // La BnF code parfois la cédille avec un « crochet souscrit » : on le remplace par une vraie cédille
  const HOOK = new RegExp(String.fromCharCode(0x321), 'g'), CEDILLE = String.fromCharCode(0x327);
  const clean = s => String(s == null ? '' : s).replace(NSB, '').replace(HOOK, CEDILLE).normalize('NFC').replace(/\s+/g, ' ').trim();
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const STOP = new Set('le la les l un une des de du d et a au aux en par pour sur dans avec the of and to an t tome vol volume n no'.split(' '));
  const words = s => norm(s).split(' ').filter(w => w && !STOP.has(w));
  const surname = a => words(String(a || '').split(',')[0]).pop() || '';

  /* ---------- ISBN ---------- */
  const digits = s => String(s == null ? '' : s).toUpperCase().replace(/[^0-9X]/g, '');
  function valid13(s) {
    if (!/^97[89]\d{10}$/.test(s)) return false;
    let t = 0; for (let k = 0; k < 12; k++) t += (+s[k]) * (k % 2 ? 3 : 1);
    return (10 - t % 10) % 10 === +s[12];
  }
  function valid10(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    let t = 0; for (let k = 0; k < 10; k++) t += (10 - k) * (s[k] === 'X' ? 10 : +s[k]);
    return t % 11 === 0;
  }
  // Renvoie l'ISBN-13 si le numéro est un ISBN valide (10 ou 13 chiffres), sinon ''.
  function toIsbn13(s) {
    s = digits(s);
    if (s.length === 13) return valid13(s) ? s : '';
    if (s.length === 10 && valid10(s)) {
      const b = '978' + s.slice(0, 9); let t = 0;
      for (let k = 0; k < 12; k++) t += (+b[k]) * (k % 2 ? 3 : 1);
      return b + ((10 - t % 10) % 10);
    }
    return '';
  }
  function isbn10(i) {
    if (!/^978\d{10}$/.test(i)) return '';
    const c = i.slice(3, 12); let s = 0;
    for (let k = 0; k < 9; k++) s += (10 - k) * +c[k];
    const r = (11 - s % 11) % 11;
    return c + (r === 10 ? 'X' : r);
  }
  // Ressemble à un ISBN (même faux) ? Sert à prévenir d'une erreur de frappe.
  const looksLikeIsbn = q => { const d = digits(q); return /^97[89]\d{10}$/.test(d) || /^\d{9}[\dX]$/.test(d) || /^\d{12,14}$/.test(d); };

  /* ---------- Réseau ---------- */
  // Les catalogues publics (BnF, Sudoc) bloquent ceux qui envoient trop de requêtes :
  // on espace les envois vers eux et on réessaie une fois si ça échoue.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // (la BnF bloque un moment ceux qui l'interrogent trop vite : au moins 0,7 s entre deux demandes)
  const GAPS = {'catalogue.bnf.fr': 700, 'www.sudoc.fr': 300};
  const gates = {};
  function gate(host) {
    const gap = GAPS[host]; if (!gap) return Promise.resolve();
    const g = gates[host] || (gates[host] = {chain: Promise.resolve(), t: 0});
    const p = g.chain.then(async () => { const w = g.t + gap - Date.now(); if (w > 0) await sleep(w); g.t = Date.now(); });
    g.chain = p;
    return p;
  }
  // Si un catalogue nous bloque (plusieurs échecs de suite), on le laisse tranquille 5 minutes
  const pause = {}, echecs = {};
  async function fetchT(url, ms, retry) {
    const host = new URL(url).hostname;
    if (pause[host] && Date.now() < pause[host]) { const e = new Error('en pause'); e.status = 503; throw e; }
    await gate(host);
    // Le délai maximal couvre TOUTE la réponse (pas seulement son début) : une réponse qui arrive au compte-gouttes est coupée
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 10000);
    let garder = false;
    try {
      const r = await fetch(url, {signal: ctl.signal});
      if ((r.status === 429 || r.status === 503) && GAPS[host] && !retry) { clearTimeout(t); await sleep(2000); return fetchT(url, ms, true); }
      echecs[host] = 0;
      garder = true; r.finir = () => clearTimeout(t);
      return r;
    } catch (e) {
      // (sans internet, ce n'est pas le catalogue qui refuse : on ne le met pas en pause)
      if (GAPS[host] && e.name !== 'AbortError' && navigator.onLine !== false) {
        echecs[host] = (echecs[host] || 0) + 1;
        if (echecs[host] >= 3) { pause[host] = Date.now() + 5 * 60e3; echecs[host] = 0; }
        if (!retry && !(pause[host] > Date.now())) { await sleep(1500); return fetchT(url, ms, true); }
      }
      throw e;
    } finally { if (!garder) clearTimeout(t); }
  }
  async function lire(url, ms, json) {
    const r = await fetchT(url, ms);
    try {
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return await (json ? r.json() : r.text());
    } finally { r.finir(); }
  }
  const getJson = (url, ms) => lire(url, ms, true);
  const getText = (url, ms) => lire(url, ms, false);
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  // Réponse du catalogue illisible (coupée, page d'erreur…) : c'est une panne, pas « aucun résultat »
  const xmlSru = s => {
    const doc = xml(s);
    if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagNameNS(NS_SRW, 'numberOfRecords').length) { const e = new Error('réponse illisible'); e.status = 502; throw e; }
    return doc;
  };

  /* ---------- Fiches UNIMARC (BnF et Sudoc) ---------- */
  function romanToInt(s) {
    const v = {I: 1, V: 5, X: 10, L: 50, C: 100}; let n = 0;
    for (let k = 0; k < s.length; k++) { const a = v[s[k]], b = v[s[k + 1]] || 0; n += a < b ? -a : a; }
    return n;
  }
  function cleanTome(t) {
    t = clean(t);
    const d = t.match(/\d+/); if (d) return String(+d[0]);
    const r = t.match(/\b[IVXLC]+\b/i); return r ? String(romanToInt(r[0].toUpperCase())) : '';
  }
  // Garde la mention seulement si elle ressemble à des noms de personnes (« J. R. R. Tolkien », « Fabcaro, Didier Conrad »)
  const PARTICLES = new Set(['de', 'du', 'des', 'd', 'le', 'la', 'van', 'von', 'der', 'den', 'da', 'di', 'y', 'et', 'al', 'bin', 'ben', 'el', 'dos', 'das']);
  function cleanName(m) {
    const toks = String(m || '').replace(/[.,;]/g, ' ').split(/\s+/).filter(Boolean);
    if (!toks.length || toks.length > 12) return '';
    return toks.every(t => /^\p{Lu}/u.test(t) || /^\p{Ll}['’]\p{Lu}/u.test(t) || PARTICLES.has(t.toLowerCase())) ? m : '';
  }
  // Résumé lisible : sans balises HTML, sans « Prix du roman FNAC » en tête, 1 500 caractères au plus
  function cleanResume(s) {
    s = String(s || '');
    if (!s) return '';
    // (deux passes : certaines sources envoient du HTML « codé deux fois »)
    for (let k = 0; k < 2 && /[<&]/.test(s); k++)
      s = new DOMParser().parseFromString('<div>' + s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n') + '</div>', 'text/html').body.textContent;
    s = s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    // On retire les paragraphes techniques (EPUB, format…) et la publicité du début (prix, « élu… », ventes)
    const technique = p => /\b(epub|fichier|mise en page fixe|format num[ée]rique|version num[ée]rique|ce livre num[ée]rique|cet e-?book|liseuse|texte int[ée]gral\.?$|cet ouvrage a fait l.objet|[ée]dition num[ée]rique|table des mati[èe]res (interactive|dynamique))\b/i.test(p);
    const pub = p => p.length < 280 && /(\bprix (?!de vente)[a-zé]|r[ée]compens[ée]|laur[ée]at|\b[ée]lue? (roman|livre|meilleur)|best-?seller|meilleures? ventes?|coup de c(œ|oe)ur des libraires|vendus? à plus|exemplaires vendus|ph[ée]nom[èe]ne (mondial|de librairie)|d[ée]j[àa] culte)/i.test(p);
    let paras = s.split(/\n+/).map(p => p.trim()).filter(p => p && !technique(p));
    while (paras.length > 1 && pub(paras[0])) paras.shift();
    s = paras.join('\n');
    return s.length > 1500 ? s.slice(0, 1500).replace(/\s+\S*$/, '') + '…' : s;
  }
  // « Une aventure d'Astérix. » → « Astérix » ; « Les aventures de Tintin » → « Tintin »
  const cleanSerie = s => clean(s).replace(/^(une |les )?aventures? (de |d'|d’|du |des )/i, '').replace(/[\s.,;:]+$/, '');

  function parseUnimarc(root) {
    const F = {};
    for (const f of root.getElementsByTagNameNS('*', 'datafield')) {
      const sf = {};
      for (const s of f.getElementsByTagNameNS('*', 'subfield')) {
        const c = s.getAttribute('code'); (sf[c] = sf[c] || []).push(clean(s.textContent));
      }
      (F[f.getAttribute('tag')] = F[f.getAttribute('tag')] || []).push(sf);
    }
    const first = (tag, code) => { for (const x of F[tag] || []) if (x[code] && x[code][0]) return x[code][0]; return ''; };

    // Titre, série, tome
    let titre = first('200', 'a'), serie = '', tome = '';
    const h = first('200', 'h'), partie = first('200', 'i');
    if (partie) { serie = titre; titre = partie; tome = cleanTome(h); }
    else if (h) { serie = titre; tome = cleanTome(h); }
    const lien = (F['461'] || []).find(x => x.t);
    if (!serie && lien) { serie = lien.t[0]; tome = cleanTome((lien.v || [''])[0]); }
    if (serie && norm(serie) === norm(titre) && !tome) serie = '';
    const sousTitre = first('200', 'e');

    // Auteurs (sans traducteurs, préfaciers…) : 070 auteur, 440 illustrateur, 690 scénariste
    const auteurs = [];
    for (const tag of ['700', '701', '702']) for (const p of F[tag] || []) {
      const role = (p['4'] || [''])[0];
      if (!['070', '440', '690', ''].includes(role) || (role === '' && tag === '702')) continue;
      const nom = clean([(p.b || [''])[0], (p.a || [''])[0]].join(' '));
      if (nom && !auteurs.includes(nom)) auteurs.push(nom);
    }
    // Mention telle qu'imprimée (« J. R. R. Tolkien ») : plus lisible quand elle contient bien le nom de l'auteur
    let mention = clean(first('200', 'f').split(/\s*;\s*/)[0].replace(/\[[^\]]*\]/g, '').replace(/,?\s*(\.\.\.|…)\s*/g, ', '));
    // « avant-propos de X », « traduit par Y »… : ce n'est pas l'auteur
    if (/^(avant-propos|pr[ée]face|postface|traduction|traduit|adaptation|introduction|sous la dir|coordonn|choix|[ée]dition [ée]tablie|pr[ée]sent[ée])/i.test(mention)) mention = '';
    // « texte, Fabcaro », « scénario de X », « par X » : on garde le nom
    mention = cleanName(mention.replace(/^((par|by|de|écrit par|d'après|textes|texte|scénarios|scénario|scenario|dessins|dessin|illustrations|illustration|récit|histoire|[oœ]uvre originale|supervision|un manga de|un roman de|une histoire de|une bande dessinée de)\s*(,|:|de\b|d'|par\b)?\s*)+/i, '')
      .replace(/(\s*\.\.\.|\s*…)+$/, '').replace(/[\s,:;]+$/, ''));
    // (tous les noms, pour la recherche par auteur : dans « Astérix », chercher Uderzo doit trouver le livre)
    const noms = [...auteurs, ...(F['710'] || []).map(p => clean((p.a || [''])[0])).filter(Boolean)];
    let auteur = auteurs.slice(0, 3).join(', ');
    if (mention && mention.length < 80 && (!auteurs.length || norm(mention).includes(surname(auteurs[0])))) auteur = mention.replace(/\s+et\s+/g, ', ');
    if (!auteur) for (const p of F['710'] || []) { const n = clean((p.a || [''])[0]); if (n) { auteur = n; break; } }

    // Pages de CETTE édition (« 1 vol. (254 p.) », « 1 volume (217 pages) », « non paginé [ca 168] p. », « 1 vol. (185) »)
    const ext = first('215', 'a');
    const pages = +((ext.match(/\[?(?:ca\.?\s*)?(\d+)\]?\s*(?:p\b|p\.|pages)/) || ext.match(/vol(?:\.|ume)?\s*\((\d+)\)/) || [])[1] || 0);
    const pagesEnviron = /non pagin|\[ca/i.test(ext);
    const pub = [...(F['214'] || []), ...(F['210'] || [])];
    const editeur = clean(((pub.find(x => x.c) || {}).c || [''])[0]);
    const annee = (pub.map(x => (x.d || [''])[0]).join(' ').match(/\d{4}/) || [''])[0];
    const collections = (F['225'] || []).map(x => (x.a || [''])[0]).filter(Boolean);
    // Résumé de l'éditeur (330) et sujets (606 : sujets, 608 : forme du texte, sans les mentions techniques)
    const resume = cleanResume(first('330', 'a'));
    // (seulement les vocabulaires documentaires : RAMEAU, MeSH… pas les étiquettes internes d'une bibliothèque, comme « ND-12.2023 »)
    const documentaire = x => !x['2'] || /rameau|fmesh/i.test(x['2'][0]);
    const technique = s => /enregistrement|édition phonographique|édition commerciale|édition de poche|^lecture$|texte imprimé|ressource|livre numérique|^oeuvre d'origine|^ouvrages? pour/i.test(s);
    const sujets = [...(F['606'] || []), ...(F['608'] || [])].filter(documentaire).map(x => clean((x.a || [''])[0]))
      .filter(s => s && !technique(s));
    // Classements du catalogue, gardés tels quels : sujets RAMEAU (606, 607, 608, avec leurs subdivisions),
    // indice Dewey (676) et cadre de classement de la Bibliographie nationale française (686)
    const classements = [];
    const ajoute = (c, l) => { l = clean(l); if (l && !technique(l) && !classements.some(k => k.c === c && k.l === l)) classements.push({c, l}); };
    for (const tag of ['606', '607', '608']) for (const x of F[tag] || []) if (documentaire(x)) ajoute(tag, [x.a, x.x, x.y, x.z].flatMap(v => v || []).join(' -- '));
    for (const x of F['676'] || []) ajoute('676', (x.a || [''])[0]);
    for (const x of F['686'] || []) if (!x['2'] || /cadre de classement|bnf/i.test(x['2'][0])) ajoute('686', (x.a || [''])[0]);
    return {
      titre: clean(titre), sousTitre: clean(sousTitre), serie: cleanSerie(serie), tome,
      auteur, noms, pagesTotal: pages > 0 && pages < 5000 ? pages : '', pagesEnviron: pages > 0 && pagesEnviron,
      editeur, annee, langue: first('101', 'a'), isbn: toIsbn13(first('010', 'a')),
      resume, sujets: [...new Set(sujets)].slice(0, 6), classements: classements.slice(0, 14),
      indices: [...collections, ...sujets]
    };
  }

  /* ---------- Sources ---------- */
  // Chaque classement garde sa provenance (s : le catalogue qui l'a donné)
  const provenance = (b, s) => { b.classements = (b.classements || []).map(k => ({...k, s})); return b; };
  // Réunit les classements de plusieurs fiches sans doublon (même champ, même libellé, même catalogue)
  function unirClassements(listes) {
    const out = [];
    for (const l of listes) for (const k of l || []) if (k && k.l && !out.some(z => z.c === k.c && z.l === k.l && z.s === k.s)) out.push(k);
    return out.slice(0, 20);
  }
  function bnfRecord(r) {
    const ark = ((r.getElementsByTagNameNS(NS_SRW, 'recordIdentifier')[0] || {}).textContent || '').trim();
    const b = provenance(parseUnimarc(r), 'BnF');
    b.source = 'BnF';
    b.covers = ark ? ['https://catalogue.bnf.fr/couverture?&appName=NE&idArk=' + ark + '&couverture=1'] : [];
    return b;
  }
  // Mémoire des réponses de la BnF (30 minutes) : une même demande n'est jamais envoyée deux fois
  // (changer la limite de pages, rouvrir une fiche, relancer un tirage… réutilisent les fiches déjà reçues)
  const memoBnf = new Map();
  function enMemoire(cle, fn) {
    const m = memoBnf.get(cle);
    if (m && Date.now() - m.t < 30 * 60e3) return m.p;
    const p = fn().catch(e => { memoBnf.delete(cle); throw e; });   // (une erreur n'est jamais gardée)
    memoBnf.set(cle, {t: Date.now(), p});
    if (memoBnf.size > 80) memoBnf.delete(memoBnf.keys().next().value);
    return p;
  }
  async function bnf(query, n) {
    const recs = await enMemoire('q|' + n + '|' + query, async () => {
      const doc = xmlSru(await getText(SRU + '&recordSchema=unimarcXchange&maximumRecords=' + n + '&query=' + encodeURIComponent(query)));
      return [...doc.getElementsByTagNameNS(NS_SRW, 'record')].map(bnfRecord).filter(b => b.titre);
    });
    return recs.map(r => ({...r}));
  }
  // Un « paquet » de fiches à partir d'une position (pour feuilleter de grands résultats)
  async function bnfLot(query, start, n) {
    const lot = await enMemoire('l|' + start + '|' + n + '|' + query, async () => {
      const doc = xmlSru(await getText(SRU + '&recordSchema=unimarcXchange&maximumRecords=' + n + '&startRecord=' + start + '&query=' + encodeURIComponent(query), 25000));
      const diag = doc.getElementsByTagNameNS('*', 'diagnostic')[0];
      if (diag && !doc.getElementsByTagNameNS(NS_SRW, 'record').length) { const e = new Error('BnF : requête refusée'); e.status = 400; throw e; }
      const total = +((doc.getElementsByTagNameNS(NS_SRW, 'numberOfRecords')[0] || {}).textContent || 0);
      return {total, recs: [...doc.getElementsByTagNameNS(NS_SRW, 'record')].map(bnfRecord)};
    });
    return {total: lot.total, recs: lot.recs.map(r => ({...r}))};
  }

  async function sudoc(isbn) {
    let j;
    try { j = await getJson('https://www.sudoc.fr/services/isbn2ppn/' + isbn + '&format=text/json'); }
    catch (e) { if (e.status === 404) return []; throw e; }   // 404 = « aucune notice »
    let res = j && j.sudoc && j.sudoc.query && j.sudoc.query.result;
    if (!res) return [];
    const ppns = [].concat(res).map(r => r.ppn).filter(Boolean).slice(0, 2);
    const recs = await Promise.all(ppns.map(p => getText('https://www.sudoc.fr/' + p + '.xml')
      .then(x => parseUnimarc(xml(x).documentElement)).catch(() => null)));
    return recs.filter(r => r && r.titre).map(r => Object.assign(provenance(r, 'Sudoc'), {source: 'Sudoc', covers: []}));
  }

  async function openLibraryIsbn(isbn) {
    const j = await getJson('https://openlibrary.org/api/books?format=json&jscmd=data&bibkeys=ISBN:' + isbn);
    const d = j['ISBN:' + isbn];
    if (!d || !d.title) return [];
    return [{
      titre: clean(d.title), sousTitre: clean(d.subtitle), auteur: (d.authors || []).slice(0, 3).map(a => clean(a.name)).join(', '),
      pagesTotal: d.number_of_pages || '', editeur: clean(((d.publishers || [])[0] || {}).name),
      annee: ((d.publish_date || '').match(/\d{4}/) || [''])[0], isbn,
      covers: d.cover ? [d.cover.large || d.cover.medium] : [], indices: (d.subjects || []).slice(0, 5).map(s => s.name),
      source: 'Open Library'
    }];
  }

  async function openLibraryText(q) {
    const j = await getJson('https://openlibrary.org/search.json?limit=10&fields=title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i,language,subject&q=' + encodeURIComponent(q));
    // (pas de nombre de pages : Open Library ne donne ici que la médiane de toutes les éditions, qui n'est celle d'aucune)
    return (j.docs || []).map(d => ({
      titre: clean(d.title), sousTitre: clean(d.subtitle), auteur: (d.author_name || []).slice(0, 3).join(', '),
      pagesTotal: '', annee: d.first_publish_year ? String(d.first_publish_year) : '',
      langue: '', isbn: '', covers: d.cover_i ? ['https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg'] : [],
      indices: (d.subject || []).slice(0, 5), source: 'Open Library'
    })).filter(b => b.titre);
  }

  async function google(q, isbn) {
    const key = googleKey.trim();
    if (!key && Date.now() < googleBlockedUntil) { const e = new Error('quota'); e.status = 429; throw e; }
    try {
      const j = await getJson('https://www.googleapis.com/books/v1/volumes?maxResults=10&printType=books&q=' +
        encodeURIComponent(q) + (key ? '&key=' + encodeURIComponent(key) : ''), 8000);
      return (j.items || []).map(it => {
        const v = it.volumeInfo || {}, l = v.imageLinks || {};
        const ids = (v.industryIdentifiers || []).map(x => toIsbn13(x.identifier)).filter(Boolean);
        return {
          titre: clean(v.title), sousTitre: clean(v.subtitle), auteur: (v.authors || []).slice(0, 3).join(', '),
          pagesTotal: v.pageCount || '', editeur: clean(v.publisher), annee: (v.publishedDate || '').slice(0, 4),
          langue: v.language === 'fr' ? 'fre' : v.language || '', isbn: ids.find(x => x.startsWith('97')) || '', isbns: ids,
          covers: (l.thumbnail || l.smallThumbnail) ? [(l.thumbnail || l.smallThumbnail).replace(/^http:/, 'https:').replace('&edge=curl', '')] : [],
          resume: v.language === 'fr' ? cleanResume(v.description) : '', sujets: v.categories || [],
          indices: v.categories || [], source: 'Google'
        };
      }).filter(b => b.titre && (!isbn || b.isbns.includes(isbn)));
    } catch (e) {
      if (e.status === 429 && !key) googleBlockedUntil = Date.now() + 30 * 60e3;
      throw e;
    }
  }

  function storeTitle(t) {
    return clean(t)
      .replace(/\s+[-–]\s+(Prix|Lauréat|Grand Prix|Le phénomène|Best[- ]?seller|Nouvelle édition|Édition collector|Le livre événement|Le roman événement|Coup de cœur|Nouveau roman|Le nouveau roman|Le nouveau|Nouveauté|Roman \d{4}|Le roman de l'année).*$/i, '')
      .replace(/\s*\((?:Fiche de lecture|Résumé|Analyse)[^)]*\)\s*$/i, '')
      .replace(/\s*\((?:Enhanced Edition|Édition enrichie|Edition enrichie|Version enrichie|ebook)\)\s*$/i, '')
      .replace(/\s*\((?:Prix|Grand Prix|Lauréat|Sélection|Finaliste)[^)]*\)/gi, '')
      .replace(/\s+[-–]\s+\d+e?\s*(éd\.?|édition)\s*$/i, '')
      .replace(/\s*\((?:avec|pr[ée]face|[ée]dition|nouvelle [ée]dition|inclus|version)[^)]*\)/gi, '').trim();
  }
  async function apple(q) {
    const j = await getJson('https://itunes.apple.com/search?country=fr&media=ebook&limit=15&term=' + encodeURIComponent(q), 8000);
    return (j.results || []).map(r => ({
      titre: storeTitle(r.trackName), sousTitre: '',
      auteur: (r.artistName || '').split(/\s*&\s*/).slice(0, 3).join(', '),
      annee: (r.releaseDate || '').slice(0, 4), langue: 'fre', isbn: '', pagesTotal: '',
      covers: r.artworkUrl100 ? [r.artworkUrl100.replace(/\d+x\d+bb/, '600x600bb')] : [],
      resume: cleanResume(r.description).replace(/^(Prix [^\n.]{2,40}|Lauréat[^\n.]{2,40}|Best-?seller[^\n.]{0,40})\s+/i, ''),
      sujets: (r.genres || []).filter(g => g !== 'Livres'), note: r.averageUserRating || 0, avis: r.userRatingCount || 0, prix: r.price,
      indices: r.genres || [], source: 'Apple'
    })).filter(b => b.titre);
  }

  async function dnb(isbn) {
    const doc = xml(await getText('https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&recordSchema=oai_dc&maximumRecords=1&query=isbn%3D' + isbn));
    const g = n => [...doc.getElementsByTagNameNS(DC, n)].map(e => clean(e.textContent));
    const t = g('title')[0];
    if (!t) return [];
    return [{
      titre: t.split(' / ')[0].split(' : ')[0], auteur: g('creator').slice(0, 2).map(c => c.replace(/\s*\[.*?\]/g, '').split(', ').reverse().join(' ')).join(', '),
      editeur: g('publisher')[0] || '', annee: (g('date')[0] || '').slice(0, 4), isbn, covers: [], source: 'DNB'
    }];
  }

  /* ---------- Genre deviné ---------- */
  const GENRE_RULES = [
    [/manga|shonen|sh[oō]nen|seinen|shojo|kodomo|webtoon/i, 'BD / Manga'],
    [/bande dessin|bandes dessin|comics?\b|\bbd\b|roman graphique|graphic novel/i, 'BD / Manga'],
    [/policier|polar|thriller|suspense|crime|mystery|noir\b/i, 'Polar / Thriller'],
    [/science-fiction|science fiction|fantasy|fantastique|imaginaire|dystop|anticipation/i, 'SF / Fantasy'],
    [/biograph|mémoires|autobiograph|témoignage/i, 'Biographie'],
    [/développement personnel|developpement personnel|self-help|bien-être|psychologie positive|motivation/i, 'Développement perso'],
    [/travail social|éducat|educat|action sociale|protection de l.enfance|médico-social|pédagog|vae|parentalit|autorité \(psych|psychologie de l.enfant|enfants -- psychologie|relation parent/i, 'Pro / VAE'],
    [/essai|histoire|philosoph|sociolog|politique|sciences humaines|économie|society/i, 'Essai'],
    [/roman|fiction|littérature|literature|novel|nouvelles/i, 'Roman']
  ];
  function guessGenre(indices) {
    const s = (indices || []).join(' | ');
    for (const [re, g] of GENRE_RULES) if (re.test(s)) return g;
    return '';
  }

  /* ---------- Lancer plusieurs sources en même temps ---------- */
  async function runSources(jobs, onStatus) {
    const st = {};
    Object.keys(jobs).forEach(k => st[k] = 'attente');
    if (onStatus) onStatus({...st});
    const all = await Promise.all(Object.entries(jobs).map(([k, p]) => p.then(
      r => { st[k] = r.length ? 'ok' : 'rien'; if (onStatus) onStatus({...st}); return r; },
      e => { st[k] = e && e.status === 429 ? 'quota' : 'erreur'; if (onStatus) onStatus({...st}); return []; })));
    api.dernierStatut = st;
    return all.flat();
  }

  const FIELDS = ['titre', 'sousTitre', 'serie', 'tome', 'auteur', 'pagesTotal', 'editeur', 'annee', 'langue', 'isbn', 'resume'];
  const PRIO_ISBN = ['BnF', 'Sudoc', 'Google', 'Open Library', 'DNB'];

  // Même édition vue par plusieurs sources → une seule fiche, champ par champ.
  function mergeSame(recs, prio) {
    const sorted = recs.slice().sort((a, b) => prio.indexOf(a.source) - prio.indexOf(b.source));
    const m = {sources: [...new Set(sorted.map(r => r.source))], covers: [], indices: []};
    for (const f of FIELDS) m[f] = (sorted.find(r => r[f]) || {})[f] || '';
    // Série et tome viennent ensemble de la même fiche ; une « série » sans numéro (collection) est ignorée
    const st = sorted.find(r => r.serie && r.tome);
    m.serie = st ? st.serie : ''; m.tome = st ? st.tome : '';
    // Pour un tome, préférer le vrai titre du volume (« L'épreuve de Kakashi ») au nom de la série
    if (m.serie && norm(m.titre) === norm(m.serie)) {
      const t = sorted.map(r => r.titre).find(t => t && norm(t) !== norm(m.serie) && !norm(t).startsWith(norm(m.serie) + ' '));
      if (t) m.titre = t;
    }
    sorted.forEach(r => {
      (r.covers || []).forEach(c => { if (c && !m.covers.includes(c)) m.covers.push(c); });
      (r.indices || []).forEach(c => m.indices.push(c));
    });
    m.sujets = [...new Set(sorted.flatMap(r => r.sujets || []))].slice(0, 6);
    // Classements : seulement ceux de l'édition retenue (une édition jeunesse ou une étude du livre a d'autres codes)
    const avecCl = sorted.filter(r => (r.classements || []).length);
    const memeEd = avecCl.filter(r => m.isbn && r.isbn === m.isbn);
    m.classements = unirClassements((memeEd.length ? memeEd : avecCl.slice(0, 1)).map(r => r.classements));
    m.pagesEnviron = !!(sorted.find(r => r.pagesTotal) || {}).pagesEnviron;
    m.genre = guessGenre(m.indices);
    return m;
  }

  /* ---------- Recherche par ISBN ---------- */
  async function parIsbn(isbn, onStatus) {
    const i10 = isbn10(isbn);
    const jobs = {
      'BnF': bnf('bib.isbn adj "' + isbn + '"' + (i10 ? ' or bib.isbn adj "' + i10 + '"' : ''), 2).then(r => r.slice(0, 1)),
      'Sudoc': sudoc(isbn).then(r => r.slice(0, 1)),
      'Open Library': openLibraryIsbn(isbn),
      'Google': google('isbn:' + isbn, isbn).then(r => r.slice(0, 1))
    };
    if (/^9783/.test(isbn)) jobs['Bibl. allemande'] = dnb(isbn);
    const recs = (await runSources(jobs, onStatus)).map(splitTome);
    if (!recs.length) return [];
    const m = mergeSame(recs, PRIO_ISBN);
    m.isbn = isbn;
    // (toutes les sources ont répondu pour CET ISBN : le nombre de pages est celui de cette édition)
    m.pagesSource = m.pagesTotal ? 'edition' : '';
    // Couvertures : librairies françaises d'abord (Decitre, Epagine : rapides et fiables),
    // puis BnF (belle qualité mais parfois lente ou indisponible), puis le reste
    m.covers = [...new Set([...isbnCovers(isbn).slice(0, 2), ...m.covers, ...isbnCovers(isbn).slice(2)])];
    m.score = 99;
    return [m];
  }

  /* ---------- Couvertures à partir d'un ISBN ---------- */
  function isbnCovers(isbn) {
    if (!isbn) return [];
    const i10 = isbn10(isbn);
    return [
      'https://products-images.di-static.com/image/livre/' + isbn + '-475x500-1.jpg',   // Decitre
      'https://images.epagine.fr/' + isbn.slice(-3) + '/' + isbn + '_1_75.jpg',          // librairies indépendantes
      'https://covers.openlibrary.org/b/isbn/' + isbn + '-L.jpg?default=false',
      ...(i10 ? ['https://images-na.ssl-images-amazon.com/images/P/' + i10 + '.08.LZZZZZZZ.jpg'] : [])
    ];
  }

  /* ---------- Recherche par titre / auteur ---------- */
  const JUNK = /(fiche de lecture|\br[ée]sum[ée]\b|analyse (de l|du livre)|[ée]tude de l.oeuvre|commentaire compos|profil d.une oeuvre|lepetitlitteraire|study guide|summary of|cahier d.activit|coloriage|agenda \d{4}|calendrier \d{4})/i;
  const SRC_WEIGHT = {'BnF': 1.2, 'Apple': 1.2, 'Google': 1, 'Sudoc': 1, 'Open Library': 0.5};
  // Un tome de série est identifié par série + auteur + numéro (son titre varie selon les sources)
  const workKey = b => (b.serie && b.tome ? 'S:' + words(cleanSerie(b.serie)).slice(0, 4).join(' ') : words(b.titre).slice(0, 7).join(' ')) + '|' + (b.tome || '');

  function rank(q, recs) {
    const qw = words(q), qn = norm(q);
    const kept = recs.filter(r => !JUNK.test(r.titre + ' ' + r.sousTitre) && !JUNK.test(r.auteur));
    // Regroupe les fiches d'un même livre : même titre (ou même série + tome) ET au moins un auteur en commun.
    // Les fiches sans auteur rejoignent le groupe du même titre s'il existe.
    const gl = [];
    const names = r => new Set(String(r.auteur || '').split(',').map(surname).filter(Boolean));
    for (const r of [...kept.filter(r => surname(r.auteur)), ...kept.filter(r => !surname(r.auteur))]) {
      const k = workKey(r), n = names(r);
      let g = gl.find(x => x.k === k && (!n.size || !x.names.size || [...n].some(s => x.names.has(s))));
      if (!g) { g = {k, names: new Set(), recs: []}; gl.push(g); }
      g.recs.push(r); n.forEach(s => g.names.add(s));
    }
    const groups = new Map(gl.map((x, i) => [i, x.recs]));
    // Popularité d'un auteur dans les résultats (départage les titres identiques)
    const freq = {};
    kept.forEach(r => { const s = surname(r.auteur); if (s) freq[s] = (freq[s] || 0) + 1; });
    // Le mot cherché est-il présent (tolère pluriel et une faute de frappe) ?
    const near = (a, b) => {
      if (a === b) return true;
      if (a.length >= 4 && (a + 's' === b || a + 'x' === b || b + 's' === a || b + 'x' === a)) return true;
      if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
      let i = 0, j = 0, diff = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++diff > 1) return false;
        if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
      }
      return diff + (a.length - i) + (b.length - j) <= 1;
    };
    const has = (hayWords, w) => hayWords.some(h => near(w, h));
    const nums = qw.filter(w => /^\d+$/.test(w));
    // Recherche d'un auteur (« Amélie Nothomb », « Musso ») : ses livres passent devant les livres sur lui
    const authorHits = kept.filter(r => qw.length && qw.every(w => has(words(r.auteur), w))).length;
    const titleHits = kept.filter(r => qw.length && qw.every(w => has(words(r.titre + ' ' + r.serie), w))).length;
    const authorQuery = authorHits >= 2 && authorHits > titleHits;
    const out = [];
    for (const g of groups.values()) {
      // Édition de référence : la plus récente qui a un ISBN (BnF puis Google), sinon la meilleure source
      const order = ['BnF', 'Google', 'Apple', 'Sudoc', 'Open Library'];
      const sorted = g.slice().sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
      // (éditions « normales » d'abord : sans sous-titre du genre « grand livre », « édition collector »…)
      const special = r => /(collector|luxe|int[ée]grale|coffret|grand livre|[ée]dition sp[ée]ciale|perfect edition|hokage|deluxe)/i.test(r.titre + ' ' + r.sousTitre + ' ' + r.serie) ? 1 : 0;
      const fr = r => (r.langue === 'fre' ? 0 : 1);
      const ed = g.filter(r => r.isbn && (r.source === 'BnF' || r.source === 'Google'))
        .sort((a, b) => fr(a) - fr(b) || special(a) - special(b) || (+b.annee || 0) - (+a.annee || 0))[0];
      const m = mergeSame(ed ? [ed, ...sorted.filter(r => r !== ed)] : sorted, ed ? [ed.source, ...order] : order);
      if (ed) for (const f of ['isbn', 'pagesTotal', 'editeur', 'annee']) m[f] = ed[f] || m[f];
      // Pages de l'édition de référence (celle de l'ISBN affiché), sinon venues d'une autre fiche : une estimation
      m.pagesSource = m.pagesTotal ? (ed && ed.pagesTotal ? 'edition' : 'estimation') : '';
      // Couvertures : édition de référence d'abord, puis Apple (belle qualité), puis le reste
      const appleCov = g.filter(r => r.source === 'Apple').flatMap(r => r.covers);
      m.covers = [...new Set([...isbnCovers(m.isbn).slice(0, 1), ...appleCov, ...(ed ? ed.covers : []), ...m.covers, ...isbnCovers(m.isbn)])];

      // Pertinence
      const hay = ' ' + norm([m.titre, m.sousTitre, m.serie, m.tome, m.auteur].join(' ')) + ' ';
      const hayW = hay.trim().split(' ');
      const found = qw.filter(w => has(hayW, w)).length;
      let s = qw.length ? found / qw.length * 10 : 0;
      // Numéro de tome demandé (« asterix 40 », « naruto tome 3 »)
      if (nums.length) s += nums.includes(String(m.tome)) ? 4 : (m.tome ? -2 : -1);
      if (authorQuery) s += qw.every(w => has(words(m.auteur), w)) ? 4 : -3;
      const nt = norm(m.titre), ns = norm((m.serie ? m.serie + ' ' : '') + m.titre);
      if (nt === qn || ns === qn) s += 6;
      else if ((qn.startsWith(nt + ' ') || qn.startsWith(ns + ' ')) && nt.length > 2) s += 4;
      else if (nt.startsWith(qn) || ns.startsWith(qn)) s += 3;
      else if (hay.includes(' ' + qn + ' ')) s += 2;
      // « stephen king ça » : une fois les mots de l'auteur retirés, il reste exactement le titre
      const aw = words(m.auteur), rest = qw.filter(w => !has(aw, w)), tw = words(m.titre);
      if (rest.length && rest.length < qw.length && rest.join(' ') === tw.join(' ')) s += 5;
      s -= Math.min(3, words(m.titre).filter(w => !qw.includes(w)).length * 0.35);
      s += Math.max(...g.map(r => SRC_WEIGHT[r.source] || 1)) * 0.8;
      s += Math.min(2, (new Set(g.map(r => r.source)).size - 1) * 0.9);
      s += Math.min(1.5, (g.length - 1) * 0.3);
      s += Math.min(1.5, ((freq[surname(m.auteur)] || 1) - 1) * 0.25);
      if (!m.auteur) s -= 1.5;
      // Open Library seul : souvent le titre original ou des fiches approximatives
      if (g.every(r => r.source === 'Open Library')) s -= 1.2;
      if (m.langue === 'fre' || g.some(r => r.source === 'Apple' || r.source === 'BnF')) s += 1;
      if (m.covers.length) s += 0.4;
      if (m.pagesTotal) s += 0.3;
      m.score = Math.round(s * 10) / 10;
      out.push(m);
    }
    return out.filter(m => m.score >= 5).sort((a, b) => b.score - a.score).slice(0, 10);
  }

  // « Naruto - Tome 3 », « One Piece T.100 : Le fluide royal », « Astérix (Tome 40) » → série + tome
  const TOME_RE = /^(.+?)[\s,:–\-(\[]+(?:tome|t\.|t|vol\.?|volume|n°|no\.?)\s*(\d{1,4})\b\s*[)\]]?\s*(?:[:–-]\s*(.*))?$/i;
  function splitTome(r) {
    if (r.tome || r.source === 'BnF' || r.source === 'Sudoc') return r;
    const m = clean(r.titre).match(TOME_RE);
    if (!m) return r;
    let serie = m[1].replace(/[\s,:–-]+$/, '').trim(), titre = m[3] ? m[3].trim() : '';
    // « Astérix - L'Iris blanc - n°40 » : série, puis titre du volume
    // (sauf si la partie suivante parle juste de l'édition : « One Piece - Édition originale - Tome 100 »)
    const parts = serie.split(/\s+[-–]\s+/).filter(p => !/^(nouvelle |)[ée]dition|^int[ée]grale|^version|^collector/i.test(p));
    if (parts.length > 1) { serie = parts[0]; titre = titre || parts.slice(1).join(' - '); }
    else if (parts.length === 1) serie = parts[0];
    return {...r, serie: r.serie || cleanSerie(serie), tome: String(+m[2]), titre: titre || serie};
  }

  async function parTexte(q, onStatus) {
    const qq = clean(q.replace(/["*?]/g, ' '));
    // La BnF ne met pas le mot « tome » dans ses titres : on l'enlève pour elle
    const qb = clean(qq.replace(/\b(tome|tomes|vol|volume|n°|numéro|numero)\b\.?/gi, ' ').replace(/\bt\.?\s*(?=\d)/gi, ' '));
    // Si le titre seul ne donne presque rien, l'utilisateur a sûrement tapé « titre + auteur » (ou l'inverse) :
    // on essaie aussi « le(s) dernier(s) mot(s) = auteur » et « le premier mot = auteur ».
    const ws = qb.split(' ').filter(Boolean);
    const DOC = ' and bib.doctype any "a"';
    const splits = [];
    if (ws.length >= 2) splits.push([ws.slice(0, -1), ws.slice(-1)], [ws.slice(1), ws.slice(0, 1)]);
    if (ws.length >= 3) splits.push([ws.slice(0, -2), ws.slice(-2)]);
    const titreAuteur = ([t, a]) => bnf('bib.title all "' + t.join(' ') + '" and bib.author all "' + a.join(' ') + '"' + DOC, 10).catch(() => []);
    const okSplits = splits.filter(([t]) => t.join('').length > 1);
    const jobs = {
      // Toujours : titre complet + « titre, puis auteur en dernier mot » ; si presque rien : le reste
      'BnF': Promise.all([bnf('bib.title all "' + qb + '"' + DOC, 15), okSplits.length ? titreAuteur(okSplits[0]) : []])
        .then(async ([r, r2]) => {
          r = r.concat(r2);
          if (r.length >= 4) return r;
          const more = await Promise.all([bnf('bib.anywhere all "' + qb + '"' + DOC, 12).catch(() => []), ...okSplits.slice(1).map(titreAuteur)]);
          return r.concat(...more);
        }),
      'Apple': apple(qq),
      'Google': google(qq),
      'Open Library': openLibraryText(qq)
    };
    return rank(qq, (await runSources(jobs, onStatus)).map(splitTome));
  }

  /* ---------- Compléter une fiche (pages, ISBN…) après un choix par titre ---------- */
  async function completer(x) {
    if (x.pagesTotal && x.isbn && x.editeur) return x;
    const a = surname(x.auteur);
    try {
      const r = await bnf('bib.title all "' + clean(x.titre.replace(/["*?]/g, ' ')) + '"' + (a ? ' and bib.author all "' + a + '"' : '') + ' and bib.doctype any "a"', 8);
      // Uniquement le même titre, en édition française de préférence, édition « normale » plutôt que spéciale
      const special = b => /(collector|luxe|int[ée]grale|coffret|grand livre|[ée]dition sp[ée]ciale|gros caract[èe]res|large print)/i.test(b.titre + ' ' + b.sousTitre) ? 1 : 0;
      const same = r.filter(b => norm(b.titre) === norm(x.titre) && (!x.tome || !b.tome || String(b.tome) === String(x.tome)));
      const best = same.filter(b => b.pagesTotal)
        .sort((p, q) => ((p.langue === 'fre') ? 0 : 1) - ((q.langue === 'fre') ? 0 : 1) || special(p) - special(q) || (+q.annee || 0) - (+p.annee || 0))[0];
      if (!best || (best.langue && best.langue !== 'fre' && x.langue === 'fre')) return x;
      const y = {...x};
      for (const f of ['pagesTotal', 'isbn', 'editeur', 'annee']) if (!y[f] && best[f]) y[f] = best[f];
      // Pages de l'édition dont on reprend aussi l'ISBN : celles de cette édition ; sinon, d'une autre édition (estimation)
      if (!x.pagesTotal && y.pagesTotal) y.pagesSource = !x.isbn && best.isbn ? 'edition' : 'estimation';
      y.covers = [...(x.covers || []), ...(best.covers || [])];
      return y;
    } catch (e) { return x; }
  }

  /* ---------- Trouver la meilleure couverture qui existe vraiment ---------- */
  // Images « pas de couverture » renvoyées par certains sites (taille fixe reconnaissable)
  const placeholder = (w, h) => w <= 20 || h <= 20 || (w === 154 && h === 173);
  function probe(src, ms) {
    return new Promise(res => {
      const i = new Image(); const t = setTimeout(() => res(false), ms || 7000);
      i.onload = () => { clearTimeout(t); res(!placeholder(i.naturalWidth, i.naturalHeight)); };
      i.onerror = () => { clearTimeout(t); res(false); };
      i.referrerPolicy = 'no-referrer'; i.src = src;
    });
  }
  async function couverture(list) {
    list = [...new Set((list || []).filter(u => /^https:\/\//.test(u || '')))];
    const tests = list.map(u => probe(u));
    for (let k = 0; k < list.length; k++) if (await tests[k]) return list[k];
    return '';
  }

  // Cherche toutes les couvertures possibles d'un livre (par ISBN, titre, auteur, série) et ne garde que celles qui existent
  async function chercherCouvertures(b, max) {
    const list = [...isbnCovers(toIsbn13(b.isbn || ''))];
    const titre = clean(String(b.titre || '').replace(/["*?]/g, ' ')), sn = surname(b.auteur);
    if (titre) {
      const nt = norm(titre).slice(0, 14), ns = norm(b.serie || '');
      const meme = r => {
        const rt = norm(r.titre), rs = norm(r.serie || '');
        const titreOk = rt.startsWith(nt) || nt.startsWith(rt.slice(0, 14)) ||
          (ns && (rs === ns || rt.startsWith(ns)) && (!b.tome || String(r.tome) === String(b.tome) || rt.includes(' ' + b.tome)));
        return titreOk && (!sn || !surname(r.auteur) || norm(r.auteur).includes(sn));
      };
      const qApple = (b.serie && b.tome ? b.serie + ' ' + b.tome : titre) + (sn ? ' ' + sn : '');
      const [ap, bn, ol] = await Promise.all([
        apple(qApple).then(r => r.map(splitTome)).catch(() => []),
        bnf('bib.title all "' + titre + '"' + (sn ? ' and bib.author all "' + sn + '"' : '') + ' and bib.doctype any "a"', 8).catch(() => []),
        openLibraryText(titre + (sn ? ' ' + sn : '')).catch(() => [])
      ]);
      ap.filter(meme).forEach(r => list.push(...r.covers));
      bn.filter(meme).forEach(r => list.push(...r.covers, ...isbnCovers(r.isbn).slice(0, 2)));
      ol.filter(meme).forEach(r => list.push(...r.covers));
    }
    const uniq = [...new Set(list.filter(Boolean))].slice(0, 24);
    const ok = await Promise.all(uniq.map(u => probe(u, 8000).then(x => x ? u : '')));
    return ok.filter(Boolean).slice(0, max || 12);
  }

  /* ---------- Résumé, sujets et genre d'un livre ---------- */
  // Cherche le résumé de l'éditeur (BnF) ou la présentation d'Apple Books, en vérifiant que c'est bien le même livre
  async function resume(b) {
    const titre = clean(String(b.titre || '').replace(/["*?]/g, ' ')), sn = surname(b.auteur);
    if (!titre) return {resume: '', sujets: [], genre: ''};
    const nt = norm(titre);
    const meme = r => { const rt = norm(r.titre); return (rt === nt || rt.startsWith(nt) || nt.startsWith(rt)) && (!sn || norm(r.auteur).includes(sn)); };
    const isbn = toIsbn13(b.isbn || '');
    const [bn, ap] = await Promise.all([
      (isbn ? bnf('bib.isbn adj "' + isbn + '"', 1) : Promise.resolve([]))
        .then(r => r.length && r[0].resume ? r : bnf('bib.title all "' + titre + '"' + (sn ? ' and bib.author all "' + sn + '"' : '') + ' and bib.doctype any "a"', 6)).catch(() => []),
      apple(titre + (sn ? ' ' + sn : '')).then(r => r.map(splitTome)).catch(() => [])
    ]);
    const okB = bn.filter(r => r.resume && (isbn && r.isbn === isbn || meme(r)));
    const okA = ap.filter(r => r.resume && (meme(r) || (b.serie && norm(r.serie || '') === norm(b.serie) && String(r.tome) === String(b.tome)) ||
      (!b.serie && norm(r.serie || '') === nt && (!sn || norm(r.auteur).includes(sn)))));
    const bnfFr = okB.find(r => r.langue === 'fre') || okB[0];
    const r = bnfFr || okA[0];
    const sujets = [...new Set([...(bnfFr ? bnfFr.sujets : []), ...(okA[0] ? okA[0].sujets : [])])].slice(0, 6);
    return {resume: r ? r.resume : '', sujets, classements: bnfFr ? bnfFr.classements || [] : [],
      genre: guessGenre([...sujets, ...(okA[0] ? okA[0].indices : [])])};
  }

  // Classements documentaires d'un livre déjà enregistré : par son ISBN (BnF + Sudoc), sinon par titre + auteur (BnF)
  async function classement(b) {
    const isbn = toIsbn13(b.isbn || '');
    let recs = [];
    if (isbn) {
      const [bn, su] = await Promise.all([bnf('bib.isbn adj "' + isbn + '"', 2).catch(() => []), sudoc(isbn).catch(() => [])]);
      recs = [...bn, ...su].filter(r => !r.isbn || r.isbn === isbn);
    }
    if (!recs.length && b.titre) {
      const titre = clean(String(b.titre).replace(/["*?]/g, ' ')), sn = surname(b.auteur), nt = norm(titre);
      const bn = await bnf('bib.title all "' + titre + '"' + (sn ? ' and bib.author all "' + sn + '"' : '') + ' and bib.doctype any "a"', 6);
      recs = bn.filter(r => norm(r.titre) === nt && (!sn || norm(r.auteur).includes(sn)) && (r.langue === 'fre' || !r.langue));
    }
    return {classements: unirClassements(recs.map(r => r.classements)), trouve: recs.length > 0};
  }

  /* ---------- Découverte : des livres à découvrir, par thème ---------- */
  // rayon : rayons Apple Books acceptés pour ce thème (Apple mélange tout dans ses recherches)
  const THEMES = [
    {id: 'roman', nom: 'Roman', e: '📖', prix: [['Q187300', 'Prix Goncourt'], ['Q755723', 'Prix Renaudot'], ['Q18945', 'Prix Femina'], ['Q58352', 'Prix Médicis'], ['Q930356', 'Goncourt des lycéens'], ['Q1543399', 'Prix Interallié']], wd: [], bnf: 'roman', apple: ['roman', 'roman français'], rayon: /romans et littérature|littérature/i, genre: 'Roman'},
    {id: 'polar', nom: 'Polar / Thriller', e: '🔍', prix: [['Q1475121', 'Prix du Quai des Orfèvres']], wd: ['Q208505'], bnf: 'policier', apple: ['thriller', 'polar'], rayon: /policier|suspense|thriller/i, genre: 'Polar / Thriller'},
    {id: 'sf', nom: 'Science-fiction', e: '🚀', prix: [['Q255032', 'Prix Hugo']], wd: ['Q24925'], bnf: 'science-fiction', apple: ['science-fiction'], rayon: /science-fiction/i, genre: 'SF / Fantasy'},
    {id: 'fantasy', nom: 'Fantasy', e: '🐉', prix: [['Q63475727', 'Grand Prix de l\'Imaginaire']], wd: ['Q132311'], bnf: 'fantasy', apple: ['fantasy'], rayon: /fantasy|fantastique/i, genre: 'SF / Fantasy'},
    {id: 'bd', nom: 'BD', e: '💬', prix: [['Q2004825', 'Fauve d\'or d\'Angoulême']], wd: [], bnf: 'bande dessinée', apple: ['bande dessinée'], rayon: /bandes? dessinées|bd|comics|romans graphiques/i, genre: 'BD / Manga'},
    {id: 'manga', nom: 'Manga', e: '🗾', prix: [], wd: ['Q8274'], bnf: 'manga', apple: ['manga'], rayon: /manga/i, genre: 'BD / Manga'},
    {id: 'histoire', nom: 'Roman historique', e: '🏰', prix: [], wd: ['Q192239'], bnf: 'roman historique', apple: ['roman historique'], rayon: /historique/i, genre: 'Roman'},
    {id: 'essai', nom: 'Essai', e: '💡', prix: [], wd: ['Q35760'], bnf: 'essai', apple: ['essai'], rayon: /sciences humaines|histoire|politique|philosophie|société|sociologie|essais/i, genre: 'Essai'},
    {id: 'perso', nom: 'Développement perso', e: '🌱', prix: [], wd: [], bnf: 'développement personnel', apple: ['développement personnel'], rayon: /développement personnel|bien-être|psychologie|motivation/i, genre: 'Développement perso'},
    {id: 'social', nom: 'Éducation & social', e: '🤝', prix: [], wd: [], references: true, bnf: 'travail social', apple: ['éducation bienveillante', 'parentalité', 'travail social'], rayon: /éducation|enseignement|parentalité|famille|enfance|psychologie|travail social|sciences humaines/i, minAvis: 5, genre: 'Pro / VAE'},
    {id: 'romance', nom: 'Romance', e: '💞', prix: [], wd: ['Q858330', 'Q738473'], bnf: 'roman sentimental', apple: ['romance'], rayon: /romance|sentiment|amour/i, genre: 'Roman'},
    {id: 'classique', nom: 'Classiques', e: '🏛️', prix: [], wd: [], classiques: true, bnf: '', apple: [], genre: 'Roman'},
    {id: 'jeunesse', nom: 'Jeunesse', e: '🧸', prix: [], wd: [], bnf: '', apple: ['roman jeunesse', 'livre jeunesse'], rayon: /jeunesse|enfants|ado/i, minAvis: 10, genre: 'Jeunesse'},
    {id: 'ya', nom: 'Jeunes adultes', e: '🌱', prix: [], wd: [], bnf: 'roman pour adolescents', apple: ['young adult', 'roman ado'], rayon: /ados|jeunes adultes|young adult/i, minAvis: 10, genre: 'Jeunesse'}
  ];
  // Grands classiques (liste choisie : plus fiable et instantané)
  const CLASSIQUES = ['Les Misérables|Victor Hugo', 'Notre-Dame de Paris|Victor Hugo', 'Madame Bovary|Gustave Flaubert', 'L\'Éducation sentimentale|Gustave Flaubert',
    'Le Rouge et le Noir|Stendhal', 'La Chartreuse de Parme|Stendhal', 'Le Père Goriot|Honoré de Balzac', 'Eugénie Grandet|Honoré de Balzac',
    'Germinal|Émile Zola', 'L\'Assommoir|Émile Zola', 'Au Bonheur des Dames|Émile Zola', 'Bel-Ami|Guy de Maupassant', 'Une vie|Guy de Maupassant',
    'Le Comte de Monte-Cristo|Alexandre Dumas', 'Les Trois Mousquetaires|Alexandre Dumas', 'L\'Étranger|Albert Camus', 'La Peste|Albert Camus',
    'Le Petit Prince|Antoine de Saint-Exupéry', 'Vol de nuit|Antoine de Saint-Exupéry', 'Le Grand Meaulnes|Alain-Fournier', 'Candide|Voltaire',
    'Les Liaisons dangereuses|Choderlos de Laclos', 'La Princesse de Clèves|Madame de La Fayette', 'Le Horla|Guy de Maupassant',
    'Vingt mille lieues sous les mers|Jules Verne', 'Le Tour du monde en quatre-vingts jours|Jules Verne', 'Les Fleurs du mal|Charles Baudelaire',
    'Thérèse Raquin|Émile Zola', 'Voyage au bout de la nuit|Louis-Ferdinand Céline', 'La Condition humaine|André Malraux', 'Le Lys dans la vallée|Honoré de Balzac',
    'Les Chants de Maldoror|Lautréamont', 'Bonjour tristesse|Françoise Sagan', 'L\'Écume des jours|Boris Vian', 'Les Mots|Jean-Paul Sartre', 'La Nausée|Jean-Paul Sartre',
    'Mémoires d\'Hadrien|Marguerite Yourcenar', 'L\'Amant|Marguerite Duras', 'La Vie devant soi|Romain Gary', 'La Promesse de l\'aube|Romain Gary',
    'Le Silence de la mer|Vercors', 'Les Raisins de la colère|John Steinbeck', 'Des souris et des hommes|John Steinbeck', '1984|George Orwell',
    'La Ferme des animaux|George Orwell', 'Orgueil et Préjugés|Jane Austen', 'Jane Eyre|Charlotte Brontë', 'Les Hauts de Hurle-Vent|Emily Brontë',
    'Crime et Châtiment|Fiodor Dostoïevski', 'Anna Karénine|Léon Tolstoï', 'Cent ans de solitude|Gabriel García Márquez', 'Le Vieil Homme et la Mer|Ernest Hemingway',
    'Gatsby le Magnifique|F. Scott Fitzgerald', 'Le Portrait de Dorian Gray|Oscar Wilde', 'Frankenstein|Mary Shelley', 'Dracula|Bram Stoker',
    'Le Maître et Marguerite|Mikhaïl Boulgakov', 'Le Procès|Franz Kafka', 'La Métamorphose|Franz Kafka', 'Ne tirez pas sur l\'oiseau moqueur|Harper Lee']
    .map(s => { const [titre, auteur] = s.split('|'); return {titre, auteur, raison: 'Un grand classique'}; });
  // Livres de référence en éducation, enfance et travail social (vérifiés en ligne avant d'être proposés)
  const REFERENCES = ['Éduquer sans punir|Thomas Gordon', 'Parler pour que les enfants écoutent, écouter pour que les enfants parlent|Adele Faber',
    'Au cœur des émotions de l\'enfant|Isabelle Filliozat', 'J\'ai tout essayé !|Isabelle Filliozat', 'Pour une enfance heureuse|Catherine Gueguen',
    'Un merveilleux malheur|Boris Cyrulnik', 'Les Vilains Petits Canards|Boris Cyrulnik', 'Psychanalyse des contes de fées|Bruno Bettelheim',
    'Les mots sont des fenêtres (ou bien ce sont des murs)|Marshall B. Rosenberg', 'L\'enfant et la peur d\'apprendre|Serge Boimare',
    'Libres enfants de Summerhill|A. S. Neill', 'Pédagogie des opprimés|Paulo Freire', 'Surveiller et punir|Michel Foucault', 'Asiles|Erving Goffman',
    'Stigmate|Erving Goffman', 'La Misère du monde|Pierre Bourdieu', 'Les Héritiers|Pierre Bourdieu', 'Psychologie de l\'enfant|Jean Piaget',
    'La Cause des enfants|Françoise Dolto', 'Lorsque l\'enfant paraît|Françoise Dolto', 'Le cerveau de votre enfant|Daniel J. Siegel']
    .map(s => { const [titre, auteur] = s.split('|'); return {titre, auteur, raison: 'Un livre de référence'}; });

  // Résumé Wikipédia d'une œuvre connue (meilleur que la présentation d'une édition)
  async function wikipedia(titre, auteur) {
    try {
      const j = await getJson('https://fr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titre.replace(/ /g, '_')), 6000);
      const sn = surname(auteur);
      if (j.type !== 'standard' || !j.extract || (sn && !norm(j.extract + ' ' + (j.description || '')).includes(sn))) return '';
      return cleanResume(j.extract);
    } catch (e) { return ''; }
  }
  const SOURCES_DECOUVERTE = {prix: '🏆 Primé', genre: '🌍 Incontournable', bnf: '🆕 Nouveauté', apple: '⭐ Aimé des lecteurs'};

  // Petite mémoire (15 jours) pour ne pas redemander les mêmes listes à chaque tirage
  async function memo(key, fn) {
    try { const c = JSON.parse(localStorage.getItem('ml-cache-' + key)); if (c && Date.now() - c.t < 15 * 864e5 && c.v.length) return c.v; } catch (e) {}
    const v = await fn();
    try { if (v.length) localStorage.setItem('ml-cache-' + key, JSON.stringify({t: Date.now(), v})); } catch (e) {}
    return v;
  }
  async function wikidata(q) {
    const j = await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 20000);
    const seen = new Set();
    return j.results.bindings.map(b => ({titre: clean(b.titre.value), auteur: clean(b.auteur ? b.auteur.value : ''), annee: b.annee ? b.annee.value : ''}))
      .filter(b => b.titre && b.auteur && !/^Q\d+$/.test(b.titre) && !seen.has(norm(b.titre)) && seen.add(norm(b.titre)));
  }
  const candPrix = t => memo('prix-' + t.id, async () => (await Promise.all(t.prix.map(([qid, nom]) => wikidata(
    `SELECT ?titre ?auteur (MAX(YEAR(?d)) AS ?annee) WHERE { ?l p:P166 ?s . ?s ps:P166 wd:${qid} . OPTIONAL { ?s pq:P585 ?d } ?l wdt:P50 ?a .
     ?l rdfs:label ?titre FILTER(LANG(?titre)='fr') ?a rdfs:label ?auteur FILTER(LANG(?auteur)='fr') } GROUP BY ?titre ?auteur ORDER BY DESC(?annee) LIMIT 40`)
    .then(l => l.map(b => ({...b, raison: nom + (b.annee ? ' ' + b.annee : '')}))).catch(() => [])))).flat());
  const candGenre = t => t.classiques ? Promise.resolve(CLASSIQUES) : t.references ? Promise.resolve(REFERENCES) : memo('genre-' + t.id, async () => (await Promise.all(t.wd.map(qid => wikidata(
    `SELECT ?titre ?auteur ?links WHERE { ?l wdt:P136 wd:${qid} ; wikibase:sitelinks ?links ; wdt:P50 ?a . FILTER(?links >= 8) VALUES ?t { wd:Q7725634 wd:Q8261 wd:Q47461344 wd:Q571 wd:Q21198342 wd:Q1760610 } ?l wdt:P31 ?t .
       ?l rdfs:label ?titre FILTER(LANG(?titre)='fr') ?a rdfs:label ?auteur FILTER(LANG(?auteur)='fr') } ORDER BY DESC(?links) LIMIT 100`)
    .then(l => l.map(b => ({...b, raison: 'Un incontournable du genre'}))).catch(() => [])))).flat());
  const candApple = t => memo('apple-' + t.id, async () => {
    const all = (await Promise.all(t.apple.map(term => getJson('https://itunes.apple.com/search?country=fr&media=ebook&limit=150&term=' + encodeURIComponent(term), 10000)
      .then(j => j.results || []).catch(() => [])))).flat();
    // Seulement les livres payants (pas les tomes offerts en promotion) bien notés par beaucoup de lecteurs, un par auteur
    const parAuteur = new Set();
    return all.filter(r => r.price > 0 && (r.userRatingCount || 0) >= (t.minAvis || 25) && (r.averageUserRating || 0) >= 4 && !JUNK.test(r.trackName)
        && (!t.rayon || (r.genres || []).some(g => t.rayon.test(g)))
        // pas de titres « bourrés de mots-clés » ni d'éditeur à la place de l'auteur
        && !/\b(livre|roman)\s+\S+\s*,\s*(livre|roman)\b/i.test(r.trackName) && !/[ée]ditions?\b/i.test(r.artistName || ''))
      .sort((a, b) => b.userRatingCount - a.userRatingCount)
      .filter(r => !parAuteur.has(r.artistName) && parAuteur.add(r.artistName))
      .map(r => ({titre: storeTitle(r.trackName), auteur: (r.artistName || '').split(/\s*&\s*/)[0], raison: 'Très apprécié des lecteurs (' + String(r.averageUserRating).replace('.', ',') + '★, ' + r.userRatingCount + ' avis)'}));
  });
  async function candBnf(t) {
    // Parutions de l'année (ou de l'an dernier) avec un résumé d'éditeur : signe d'un vrai livre « en librairie »
    const y = new Date().getFullYear(), annee = Math.random() < 0.6 ? y : y - 1;
    const q = 'bib.anywhere all "' + t.bnf + '" and bib.date adj "' + annee + '" and bib.doctype any "a"';
    const n = +((await getText(SRU + '&recordSchema=dublincore&maximumRecords=0&query=' + encodeURIComponent(q))).match(/<srw:numberOfRecords>(\d+)/) || [0, 0])[1];
    if (!n) return [];
    const start = 1 + Math.floor(Math.random() * Math.max(1, Math.min(n, 400) - 30));
    const doc = xml(await getText(SRU + '&recordSchema=unimarcXchange&maximumRecords=30&startRecord=' + start + '&query=' + encodeURIComponent(q)));
    return [...doc.getElementsByTagNameNS(NS_SRW, 'record')].map(r => {
      const ark = ((r.getElementsByTagNameNS(NS_SRW, 'recordIdentifier')[0] || {}).textContent || '').trim();
      return {...parseUnimarc(r), source: 'BnF', covers: ark ? ['https://catalogue.bnf.fr/couverture?&appName=NE&idArk=' + ark + '&couverture=1'] : [], raison: 'Nouveauté ' + annee, fiche: true};
    }).filter(b => b.titre && b.auteur && b.resume && b.resume.length > 120 && b.isbn && b.langue === 'fre'
      // le genre deviné doit coller au thème (pas de BD dans « Roman »)
      && (!guessGenre(b.indices) || guessGenre(b.indices) === t.genre || (t.id === 'social' && /Pro|Essai/.test(guessGenre(b.indices)))));
  }

  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sourcesDe = t => [t.prix.length ? 'prix' : '', (t.wd.length || t.classiques || t.references) ? 'genre' : '', t.bnf ? 'bnf' : '', t.apple.length ? 'apple' : ''].filter(Boolean);

  // Tire au sort un livre à découvrir. exclude(livre) → true pour écarter (déjà dans ma liste, déjà proposé…)
  async function decouvrir(themeId, opts) {
    opts = opts || {};
    // 🎁 Surprise : n'importe quel thème, catégories comprises
    if (!themeId) themeId = THEMES_TIRAGE[Math.floor(Math.random() * THEMES_TIRAGE.length)].id;
    if (themeId.startsWith('cat:')) return decouvrirCat(themeId.slice(4), opts);
    const t = THEMES.find(x => x.id === themeId) || THEMES[Math.floor(Math.random() * THEMES.length)];
    const srcs = opts.source && sourcesDe(t).includes(opts.source) ? [opts.source, ...shuffle(sourcesDe(t).filter(s => s !== opts.source))] : shuffle(sourcesDe(t));
    const exclude = opts.exclude || (() => false);
    for (const src of srcs) {
      let cands = [];
      try { cands = src === 'prix' ? await candPrix(t) : src === 'genre' ? await candGenre(t) : src === 'apple' ? await candApple(t) : await candBnf(t); } catch (e) { cands = []; }
      let essais = 0;
      for (const c of shuffle(cands)) {
        if (exclude(c)) continue;
        if (++essais > 5) break;
        let x = null;
        if (c.fiche) x = c;   // fiche BnF déjà complète
        else {
          // On retrouve l'édition française : d'abord Apple (léger), sinon la recherche complète
          const nt = norm(c.titre), sn = surname(c.auteur);
          const meme = r => (norm(r.titre).startsWith(nt.slice(0, 18)) || nt.startsWith(norm(r.titre).slice(0, 18))) && norm(r.auteur).includes(sn);
          const ap = (await apple(c.titre + ' ' + c.auteur).catch(() => [])).map(splitTome).filter(r => !JUNK.test(r.titre));
          x = ap.find(meme) || null;
          if (x) x = {...x, sources: ['Apple'], sujets: x.sujets || []};
          else x = (await parTexte(c.titre + ' ' + c.auteur).catch(() => [])).find(meme) || null;
          if (x) {
            x = {...x, raison: c.raison};
            if (!x.pagesTotal) { const y = await completer(x).catch(() => x); x = {...x, pagesTotal: y.pagesTotal || '', pagesSource: y.pagesSource || '', isbn: x.isbn || y.isbn || '', covers: [...(x.covers || []), ...(y.covers || [])]}; }
          }
        }
        if (!x || exclude(x)) continue;
        const cov = await couverture(x.covers) || (await chercherCouvertures(x, 3).catch(() => []))[0];
        if (!cov) continue;   // une suggestion sans couverture donne moins envie : on passe à la suivante
        // Œuvre connue : le résumé Wikipédia raconte l'histoire (la présentation d'une édition parle souvent des notes et préfaces)
        const blabla = r => !r || r.length < 150 || /[ée]dition (illustr[ée]e|enrichie|annot[ée]e|int[ée]grale|num[ée]rique|augment[ée]e)|pr[ée]face|dossier (p[ée]dagogique|sur l.auteur)|biographie de l.auteur|notes et commentaires|texte int[ée]gral|cet ouvrage a fait l.objet|illustrations originales/i.test(r.slice(0, 250));
        if ((src === 'genre' || src === 'prix') && blabla(x.resume)) { const w = await wikipedia(c.titre, c.auteur); if (w) x.resume = w; }
        if (!x.resume) { const r = await resume(x).catch(() => ({})); if (r.resume) x.resume = r.resume; if (r.sujets && r.sujets.length) x.sujets = r.sujets; }
        const sourceNom = src === 'genre' && t.references ? '📚 Référence' : src === 'genre' && t.classiques ? '🏛️ Classique' : SOURCES_DECOUVERTE[src];
        return {...x, couverture: cov, theme: t.id, themeNom: t.nom, themeE: t.e, source: src, sourceNom,
          raison: src === 'genre' && t.references ? 'Un livre de référence' : x.raison, genre: t.genre};
      }
    }
    return null;
  }

  // Sélection du mois : 5 livres, 5 thèmes différents, sources variées. favoris = thèmes préférés de la personne
  async function selection(favoris, exclude, onProgress) {
    const ids = [...new Set([...shuffle(favoris || []).slice(0, 2), ...shuffle(THEMES.map(t => t.id))])];
    const ordreSources = shuffle(Object.keys(SOURCES_DECOUVERTE));
    const out = [], dejaPris = new Set();
    for (let k = 0; k < ids.length && out.length < 5; k++) {
      if (onProgress) onProgress(out.length, THEMES.find(t => t.id === ids[k]));
      const x = await decouvrir(ids[k], {source: ordreSources[out.length % ordreSources.length],
        exclude: b => exclude(b) || dejaPris.has(norm(b.titre))}).catch(() => null);
      if (x) { out.push(x); dejaPris.add(norm(x.titre)); }
    }
    return out;
  }

  /* ---------- Rayons de librairie : ranger les livres comme en librairie (familles CLIL) ---------- */
  // Chaque rayon est DÉDUIT de données réelles (code de classement, indice Dewey, sujet du catalogue, rayon d'une librairie en ligne)
  // et garde la liste de ses raisons : rien n'est inventé, et la donnée d'origine reste visible.
  // nature : « doc » (cherché à la BnF par Dewey ou par sujet) ou « fiction » (cherché à partir de livres connus du genre)
  const DW = (...l) => l.map(d => 'bib.dewey all "' + d + '"');
  const SUJ = (...l) => l.map(s => 'bib.subject adj "' + s + '"');
  const RAYONS = [
    {id: 'litterature', nom: 'Littérature', e: '📖', nature: 'fiction', mots: ['littérature', 'roman', 'romans', 'classique', 'classiques']},
    {id: 'polar', nom: 'Policier & Thriller', e: '🔍', nature: 'fiction', mots: ['polar', 'polars', 'policier', 'policiers', 'thriller', 'thrillers']},
    {id: 'imaginaire', nom: 'Science-fiction, Fantastique & Fantasy', e: '🚀', nature: 'fiction', mots: ['imaginaire']},
    {id: 'romance', nom: 'Romance', e: '💞', nature: 'fiction', mots: ['romance', 'romances', 'roman sentimental', 'roman d\'amour']},
    {id: 'ya', nom: 'Jeunes adultes', e: '🌱', nature: 'fiction', mots: ['jeunes adultes', 'young adult', 'ya', 'ado', 'ados']},
    {id: 'jeunesse', nom: 'Jeunesse', e: '🧸', nature: 'fiction', mots: ['jeunesse', 'enfants']},
    {id: 'bd', nom: 'BD, Comics & Manga', e: '💬', nature: 'fiction', mots: ['bd', 'bande dessinée', 'bandes dessinées']},
    {id: 'art', nom: 'Arts & Beaux livres', e: '🎨', nature: 'doc', mots: ['art', 'arts', 'beaux livres', 'culture'],
      rech: [...DW('700', '701', '709', '720', '730', '750', '759', '770', '780', '781', '791', '792'), ...SUJ('art', 'peinture', 'musique', 'cinéma')]},
    {id: 'histoire', nom: 'Histoire', e: '📜', nature: 'doc', mots: ['histoire', 'history'],
      rech: DW('900', '904', '909', '930', '937', '940', '943', '944', '945', '946', '947', '950', '956', '960', '970', '973', '980')},
    {id: 'politique', nom: 'Politique & Société', e: '🏛️', nature: 'doc', mots: ['politique', 'politiques', 'société', 'science politique', 'sciences politiques', 'politics'],
      rech: [...DW('320', '321', '322', '323', '324', '325', '327', '328', '351'), ...SUJ('science politique', 'philosophie politique', 'sociologie politique', 'relations internationales', 'géopolitique', 'idées politiques')]},
    {id: 'shs', nom: 'Sciences humaines', e: '🧠', nature: 'doc', mots: ['sciences humaines', 'shs']},
    {id: 'religion', nom: 'Religion & Ésotérisme', e: '🕊️', nature: 'doc', mots: ['religion', 'religions', 'spiritualité'],
      rech: [...DW('200', '220', '230', '270', '290', '294', '296', '297', '133'), ...SUJ('religion', 'spiritualité')]},
    {id: 'voyages', nom: 'Tourisme & Voyages', e: '🧭', nature: 'doc', mots: ['voyage', 'voyages', 'tourisme']},
    {id: 'pratique', nom: 'Vie pratique & Loisirs', e: '🍳', nature: 'doc', mots: ['vie pratique', 'loisirs']},
    {id: 'eco', nom: 'Économie, Entreprise & Droit', e: '💼', nature: 'doc', mots: ['eco', 'économie', 'entreprise']},
    {id: 'sciences', nom: 'Sciences & Techniques', e: '🔬', nature: 'doc', mots: ['science', 'sciences', 'vulgarisation', 'techniques'],
      rech: [...DW('500', '509', '510', '520', '523', '530', '539', '540', '550', '551', '560', '570', '576', '577', '580', '590', '591', '599', '612'), ...SUJ('ouvrages de vulgarisation')]},
    {id: 'reference', nom: 'Dictionnaires & Scolaire', e: '📚', nature: 'doc', horsRecherche: true, mots: ['dictionnaire', 'dictionnaires', 'scolaire']}
  ];
  // Sous-rayons. dw : début de l'indice Dewey (ou motif) ; cadre : code de classement BnF ; re : mots des sujets (texte sans accents) ;
  // rech : de quoi le chercher à la BnF (sinon il sert seulement à ranger la bibliothèque)
  // (8x, avec x de 1 à 9 : les indices 80x sont la théorie et l'histoire de la littérature, rangées en Essais littéraires)
  const d8 = n => new RegExp('^8[1-9]' + n);   // littératures : 8x1 poésie, 8x2 théâtre, 8x3 romans, 8x4 essais, 8x6 lettres, 8x7 humour, 8x8 récits
  const SOUS_RAYONS = [
    {id: 'litterature/romans', nom: 'Romans', dw: [d8(3)], cadre: ['803'], re: /\b(romans?|fiction|novels?)\b/},
    {id: 'litterature/classiques', nom: 'Classiques', re: /\bclassiques?\b/, mots: ['classiques']},
    {id: 'litterature/poesie', nom: 'Poésie', dw: [d8(1)], cadre: ['801'], re: /\b(poesie|poemes|poetry)\b/, mots: ['poésie']},
    {id: 'litterature/theatre', nom: 'Théâtre', dw: [d8(2)], cadre: ['802'], re: /\btheatre\b/, mots: ['théâtre']},
    {id: 'litterature/nouvelles', nom: 'Nouvelles & contes', dw: ['398.2'], re: /\b(nouvelles|contes|legendes|short stories)\b/, mots: ['nouvelles', 'contes']},
    {id: 'litterature/bio', nom: 'Biographies & mémoires', dw: ['92'], cadre: ['920'], re: /\b(biographies?|autobiographi\w*|memoires|memoirs)\b/, mots: ['biographie', 'biographies', 'autobiographie', 'mémoires']},
    {id: 'litterature/recits', nom: 'Récits & témoignages', dw: [d8(6), d8(8)], re: /\b(recits personnels|temoignages?|correspondances?)\b/, mots: ['témoignages']},
    {id: 'litterature/essais', nom: 'Essais littéraires', dw: [d8(4), '80'], cadre: ['804'], re: /\b(histoire et critique|critique litteraire|essais litteraires)\b/},
    {id: 'litterature/humour', nom: 'Humour', dw: [d8(7)], re: /\b(humour|humor|humoristiques?)\b/, mots: ['humour']},
    {id: 'polar/policier', nom: 'Romans policiers', re: /\b(romans? policiers?|policiers?|polars?|enquetes?|detectives?|crime fiction)\b/},
    {id: 'polar/thriller', nom: 'Thrillers & suspense', re: /\b(thrillers?|suspense)\b/},
    {id: 'polar/noir', nom: 'Roman noir', re: /\broman noir\b/},
    {id: 'polar/espionnage', nom: 'Espionnage', re: /\bespionnage\b/, mots: ['espionnage']},
    {id: 'imaginaire/sf', nom: 'Science-fiction', re: /\b(science fiction|space opera|cyberpunk)\b/, mots: ['sf', 'science-fiction']},
    {id: 'imaginaire/fantasy', nom: 'Fantasy', re: /\b(fantasy|heroic fantasy|dragons?)\b/, mots: ['fantasy']},
    {id: 'imaginaire/fantastique', nom: 'Fantastique & horreur', re: /\b(fantastique|horreur|epouvante|horror|surnaturel)\b/, mots: ['fantastique', 'horreur']},
    {id: 'imaginaire/dystopie', nom: 'Dystopie & anticipation', re: /\b(dystopi\w*|anticipation|post apocalyptique|uchronie)\b/, mots: ['dystopie']},
    {id: 'jeunesse/albums', nom: 'Albums & premières lectures', re: /\b(albums?|premieres lectures|livres? d images|imagiers?)\b/},
    {id: 'jeunesse/romans', nom: 'Romans jeunesse', re: /\b(romans? (pour la )?jeunesse|juvenile fiction|romans? pour enfants)\b/},
    {id: 'jeunesse/documentaires', nom: 'Documentaires jeunesse', re: /\b(documentaires? (pour la )?jeunesse|ouvrages pour la jeunesse|juvenile nonfiction)\b/},
    {id: 'bd/bd', nom: 'Bandes dessinées', re: /\b(bandes? dessinees?|bd)\b/, sauf: ['bd/mangas', 'bd/comics']},
    {id: 'bd/comics', nom: 'Comics', dw: ['741.5973'], re: /\b(comics|super heros)\b/, mots: ['comics']},
    {id: 'bd/mangas', nom: 'Mangas', dw: ['741.5952'], re: /\b(mangas?|seinen|shonen|shojo|webtoons?)\b/, mots: ['manga', 'mangas']},
    {id: 'bd/graphiques', nom: 'Romans graphiques', re: /\b(romans? graphiques?|graphic novels?)\b/},
    {id: 'art/musique', nom: 'Musique', dw: ['78'], re: /\b(musique|chansons?|rock|jazz|rap|musiciens?)\b/, rech: [...DW('780', '781'), ...SUJ('musique')], mots: ['musique']},
    {id: 'art/cinema', nom: 'Cinéma & séries', dw: ['791.43', '791.45'], re: /\b(cinema|films?|series televisees)\b/, rech: SUJ('cinéma'), mots: ['cinéma']},
    {id: 'art/peinture', nom: 'Peinture & arts visuels', dw: ['75', '76', '740', '741.2', '741.6', '709'], re: /\b(peinture|peintres?|dessin|gravure|art contemporain)\b/, rech: [...DW('750', '759'), ...SUJ('peinture')], mots: ['peinture']},
    {id: 'art/photo', nom: 'Photographie', dw: ['77'], re: /\bphotographi\w*\b/, rech: [...DW('770'), ...SUJ('photographie')], mots: ['photographie', 'photo']},
    {id: 'art/archi', nom: 'Architecture & design', dw: ['72', '745', '747'], re: /\b(architecture|design|urbanisme)\b/, rech: [...DW('720'), ...SUJ('architecture')], mots: ['architecture']},
    {id: 'art/scene', nom: 'Danse & spectacle', dw: ['792', '793'], re: /\b(danse|spectacle vivant|cirque)\b/, rech: [...DW('792'), ...SUJ('danse')], mots: ['danse']},
    {id: 'histoire/antiquite', nom: 'Antiquité', dw: ['93'], re: /\b(antiquite|empire romain|rome antique|grece antique|egypte ancienne)\b/, rech: [...DW('930', '937', '938'), ...SUJ('antiquité')], mots: ['antiquité']},
    {id: 'histoire/moyenage', nom: 'Moyen Âge', dw: ['940.1', '944.02', '942.02'], re: /\b(moyen age|medieva\w*|croisades|feodal\w*)\b/, rech: SUJ('moyen âge'), mots: ['moyen âge', 'moyen age']},
    {id: 'histoire/moderne', nom: 'Époque moderne', dw: ['940.2', '944.03', '944.04'], re: /\b(1[678]e siecle|revolution francaise|renaissance|ancien regime)\b/, rech: SUJ('révolution française', 'ancien régime')},
    {id: 'histoire/contemporaine', nom: 'XIXe-XXe & guerres mondiales', dw: ['940.3', '940.4', /^940\.5[0-4]/, '944.05', '944.06', '944.07', '944.081', '944.082'], re: /\b(19e siecle|20e siecle|guerre mondiale|1914 1918|1939 1945|guerre d algerie|colonisation|shoah|resistance)\b/, rech: [...DW('940.53'), ...SUJ('guerre mondiale')]},
    {id: 'histoire/depuis1945', nom: 'Depuis 1945', dw: ['909.82', '909.83', '940.55', '944.083', '944.084'], re: /\b(guerre froide|decolonisation|apres guerre|21e siecle)\b/, rech: [...DW('909.82'), ...SUJ('guerre froide')]},
    {id: 'histoire/france', nom: 'Histoire de France', dw: ['944'], re: /\bfrance\b.*\bhistoire\b/, rech: DW('944')},
    {id: 'politique/ri', nom: 'Géopolitique & relations internationales', dw: ['327', '355'], re: /\b(relations internationales|geopoliti\w*|international relations|politique (internationale|etrangere)|diplomatie)\b/, rech: ['bib.dewey all "327"', 'bib.subject adj "relations internationales"', 'bib.subject adj "géopolitique"'], mots: ['géopolitique']},
    {id: 'politique/idees', nom: 'Idées politiques', dw: ['320.01', '320.1', '320.5'], re: /\b(philosophie politique|idees politiques|ideologies?|liberalisme|socialisme|communisme|anarchisme|fascisme|nationalisme|populisme|democratie)\b/, rech: ['bib.subject adj "philosophie politique"', 'bib.subject adj "idées politiques"']},
    {id: 'politique/vie', nom: 'Vie politique & élections', dw: ['324', '328'], re: /\b(elections?|partis politiques|vie politique|parlement|campagnes? electorales?)\b/, rech: ['bib.dewey all "324"', 'bib.subject adj "vie politique"', 'bib.subject adj "élections"']},
    {id: 'politique/publiques', nom: 'État & politiques publiques', dw: ['320.6', '351', '352', '353', '354'], re: /\b(politiques? publiques?|administration publique|decentralisation)\b/, rech: ['bib.dewey all "351"', 'bib.subject adj "politique publique"']},
    {id: 'politique/societe', nom: 'Société', dw: ['303', '305', '306', '307', '363'], re: /\b(feminisme|feministes?|egalite des sexes|inegalites|pauvrete|immigration|immigres|migrations?|racisme|discriminations?|reseaux sociaux|internet|medias|conditions sociales)\b/, rech: SUJ('féminisme', 'inégalités sociales', 'immigration', 'racisme', 'réseaux sociaux'), mots: ['société', 'féminisme']},
    {id: 'shs/philo', nom: 'Philosophie', re: /\b(philosophie|philosophy|ethique|ethics|morale)\b/, rech: [...DW('100', '109', '110', '111', '121', '128', '140', '160', '170', '172', '177', '179', '180', '190', '194'), ...SUJ('philosophie')], mots: ['philo', 'philosophie']},
    {id: 'shs/psycho', nom: 'Psychologie & psychanalyse', re: /\b(psychologie(?! positive)|psychology|psychanalyse|psychoanalysis|psychiatrie)\b/, rech: [...DW('150', '152', '153', '155', '156'), ...SUJ('psychologie', 'psychanalyse')], mots: ['psycho', 'psychologie', 'psychanalyse']},
    {id: 'shs/socio', nom: 'Sociologie & anthropologie', re: /\b(sociologie|sociology|sciences sociales|social sciences|anthropologie|ethnologie)\b/, rech: [...DW('301', '302', '304', '306'), ...SUJ('sociologie', 'anthropologie')], mots: ['socio', 'sociologie', 'anthropologie']},
    {id: 'shs/education', nom: 'Éducation & pédagogie', re: /\b(pedagogi\w*|sciences de l education|enseignement|didactique|apprentissages?|montessori|teaching)\b/, rech: [...DW('370', '371', '372', '373', '374', '379'), ...SUJ('pédagogie', 'sciences de l\'éducation')], mots: ['éducation', 'pédagogie']},
    {id: 'shs/social', nom: 'Travail social & protection de l\'enfance', re: /\b(travail social|social work|travailleurs sociaux|action sociale|aide sociale|protection de l enfance|enfants places|placement familial|maltraitance|medico social|educateurs? specialises?|intervention sociale|accompagnement social|services sociaux)\b/, rech: [...DW('361', '362'), ...SUJ('travail social', 'travailleurs sociaux', 'protection de l\'enfance', 'action sociale', 'enfants placés')], mots: ['travail social', 'social', 'protection de l\'enfance']},
    {id: 'religion/christianisme', nom: 'Christianisme', dw: ['22', '23', '24', '25', '26', '27', '28'], re: /\b(christianisme|bible|eglise|catholi\w*|protestant\w*|jesus)\b/, rech: [...DW('230', '220'), ...SUJ('christianisme')]},
    {id: 'religion/islam', nom: 'Islam', dw: ['297'], re: /\b(islam|coran|musulmans?)\b/, rech: [...DW('297'), ...SUJ('islam')]},
    {id: 'religion/judaisme', nom: 'Judaïsme', dw: ['296'], re: /\b(judaisme|torah|juifs)\b/, rech: [...DW('296'), ...SUJ('judaïsme')]},
    {id: 'religion/bouddhisme', nom: 'Bouddhisme & sagesses d\'Asie', dw: ['294'], re: /\b(bouddhisme|zen|hindouisme|tao\w*)\b/, rech: [...DW('294'), ...SUJ('bouddhisme')]},
    {id: 'religion/spiritualite', nom: 'Spiritualité & méditation', dw: ['204', '291', '299'], re: /\b(spiritualite|meditation|mystique)\b/, rech: SUJ('spiritualité', 'méditation')},
    {id: 'religion/esoterisme', nom: 'Ésotérisme', dw: ['13'], re: /\b(esoterisme|occultisme|astrologie|tarot|parapsychologie|spiritisme|sciences occultes)\b/, rech: [...DW('133'), ...SUJ('ésotérisme', 'occultisme')], mots: ['ésotérisme']},
    {id: 'voyages/guides', nom: 'Guides de voyage', dw: ['910.2', '911', '912', '913', '914', '915', '916', '917', '918', '919'], re: /\b(guides? (touristiques?|de voyages?)|travel guides?|tourisme)\b/, rech: [...DW('914'), ...SUJ('guides touristiques')], mots: ['guides de voyage']},
    {id: 'voyages/recits', nom: 'Récits de voyage', dw: ['910.4'], re: /\b(recits? de voyages?|travel writing|voyages et explorations)\b/, rech: [...DW('910.4'), ...SUJ('récits de voyage', 'voyages et explorations')], mots: ['récits de voyage']},
    {id: 'pratique/cuisine', nom: 'Cuisine', dw: ['641'], re: /\b(cuisine|recettes|gastronomie|cooking|patisserie|vins?)\b/, rech: [...DW('641'), ...SUJ('cuisine')], mots: ['cuisine']},
    {id: 'pratique/sante', nom: 'Santé & bien-être', dw: ['613'], re: /\b(sante|bien etre|corps et esprit|nutrition|dietetique|medecines? douces?)\b/, rech: [...DW('613'), ...SUJ('bien-être')], mots: ['bien-être', 'santé']},
    {id: 'pratique/perso', nom: 'Développement personnel', dw: ['158.1'], re: /\b(developpement personnel|self help|realisation de soi|psychologie positive|confiance en soi|estime de soi|motivation)\b/, rech: SUJ('réalisation de soi', 'développement personnel', 'confiance en soi'), mots: ['développement personnel', 'développement perso', 'dev perso']},
    {id: 'pratique/famille', nom: 'Famille & parentalité', dw: ['649'], re: /\b(parentalite|parenting|education des enfants|relations parents enfants)\b/, rech: [...DW('649'), ...SUJ('parentalité', 'éducation des enfants')], mots: ['parentalité', 'famille']},
    {id: 'pratique/sport', nom: 'Sport', dw: ['794', '795', '796', '797', '798', '799'], re: /\b(sports?|football|randonnee|fitness|alpinisme)\b/, rech: [...DW('796'), ...SUJ('sports')], mots: ['sport', 'sports']},
    {id: 'pratique/nature', nom: 'Nature, animaux & jardin', dw: ['63'], re: /\b(nature|jardinage|jardins?|potagers?|animaux de compagnie)\b/, rech: [...DW('635', '636'), ...SUJ('jardinage')], mots: ['jardinage', 'jardin']},
    {id: 'pratique/maison', nom: 'Maison & loisirs créatifs', dw: ['640', '642', '643', '644', '645', '646', '647', '648', '745.5'], re: /\b(bricolage|decoration|loisirs creatifs|couture|tricot|travaux manuels)\b/, rech: [...DW('643', '645', '745.5'), ...SUJ('bricolage', 'loisirs créatifs')], mots: ['bricolage']},
    {id: 'eco/economie', nom: 'Économie', dw: ['330', '331', '333', '334', '335', '336', '337', '338', '339', '38'], re: /\b(economie|economics|mondialisation|capitalisme|emploi|chomage)\b/, rech: [...DW('330', '331', '333', '336', '337', '338', '339'), ...SUJ('économie politique')], mots: ['économie']},
    {id: 'eco/entreprise', nom: 'Entreprise & management', dw: ['65'], re: /\b(management|entreprises?|marketing|business|leadership)\b/, rech: [...DW('658'), ...SUJ('management')], mots: ['management', 'entreprise']},
    {id: 'eco/finance', nom: 'Argent & finance', dw: ['332'], re: /\b(finances?|banques?|monnaie|bourse|epargne|credit|investissements?)\b/, rech: DW('332'), mots: ['finance', 'argent']},
    {id: 'eco/droit', nom: 'Droit', dw: ['34'], re: /\b(droit|droits|law|jurisprudence)\b/, rech: [...DW('340', '342', '344', '345', '346'), ...SUJ('droit')], mots: ['droit']},
    {id: 'sciences/maths', nom: 'Mathématiques', dw: ['51', '31'], re: /\bmathematiques?\b/, rech: [...DW('510'), ...SUJ('mathématiques')], mots: ['maths', 'mathématiques']},
    {id: 'sciences/astro', nom: 'Astronomie', dw: ['52'], re: /\b(astronomie|univers|cosmologie|astrophysique|planetes?)\b/, rech: [...DW('520', '523'), ...SUJ('astronomie')], mots: ['astronomie']},
    {id: 'sciences/physique', nom: 'Physique & chimie', dw: ['53', '54'], re: /\b(physique|chimie|quantique)\b/, rech: DW('530', '540'), mots: ['physique', 'chimie']},
    {id: 'sciences/terre', nom: 'Terre & environnement', dw: ['55', '577'], re: /\b(geologie|climat\w*|oceans?|volcans?|ecologie|environnement|developpement durable)\b/, rech: DW('551', '577'), mots: ['écologie', 'climat']},
    {id: 'sciences/vivant', nom: 'Vivant', dw: [/^57[0-689]/, '58', '59'], re: /\b(biologie|animaux|plantes|evolution|botanique|zoologie)\b/, rech: DW('576', '590', '580'), mots: ['biologie']},
    {id: 'sciences/medecine', nom: 'Médecine', dw: ['61'], re: /\b(medecine|maladies?)\b/, rech: DW('610', '612'), mots: ['médecine']},
    {id: 'sciences/info', nom: 'Informatique', dw: ['004', '005', '006'], re: /\b(informatique|programmation|logiciels?|internet|computer science|programming|intelligence artificielle)\b/, rech: [...DW('005', '006'), ...SUJ('informatique')], mots: ['informatique']}
  ].map(z => ({...z, rayon: z.id.split('/')[0]}));
  // Indice Dewey → rayon (ou rayon/sous-rayon). Le premier qui convient l'emporte : les indices précis sont en tête.
  const DEWEY = [
    ['158.1', 'pratique/perso'], ['398.2', 'litterature/nouvelles'], ['613', 'pratique/sante'], ['641', 'pratique/cuisine'], ['649', 'pratique/famille'],
    ['745.5', 'pratique/maison'], ['741.5', 'bd'], ['791.43', 'art/cinema'], ['791.45', 'art/cinema'], ['910.4', 'voyages/recits'], ['332', 'eco/finance'],
    [[4, 6], 'sciences/info'], [[30, 39], 'reference'], [[130, 139], 'religion/esoterisme'], [[150, 159], 'shs/psycho'], [[100, 199], 'shs/philo'],
    [[200, 299], 'religion'], [[303, 303], 'politique/societe'], [[305, 307], 'politique/societe'], [[300, 309], 'shs/socio'], [[310, 319], 'sciences/maths'],
    [[320, 329], 'politique'], [[330, 339], 'eco/economie'], [[340, 349], 'eco/droit'], [[350, 354], 'politique/publiques'], [[355, 359], 'politique/ri'],
    [[360, 362], 'shs/social'], [[363, 363], 'politique/societe'], [[364, 364], 'shs/socio'], [[365, 369], 'shs/social'], [[370, 379], 'shs/education'],
    [[380, 389], 'eco/economie'], [[390, 399], 'shs/socio'], [[400, 499], 'reference'], [[500, 609], 'sciences'], [[610, 619], 'sciences/medecine'],
    [[620, 629], 'sciences'], [[630, 639], 'pratique/nature'], [[640, 648], 'pratique/maison'], [[650, 659], 'eco/entreprise'], [[660, 699], 'sciences'],
    [[780, 789], 'art/musique'], [[792, 793], 'art/scene'], [[794, 799], 'pratique/sport'], [[700, 799], 'art'], [[800, 899], 'litterature'],
    [[910, 919], 'voyages/guides'], [[920, 929], 'litterature/bio'], [[900, 909], 'histoire'], [[930, 999], 'histoire']
  ];
  function deweyCibles(code) {
    const s = String(code || '').replace(/\s+/g, ''), m = s.match(/^(\d{3})(?:\.(\d+))?/);
    if (!m) return [];
    const n = +m[1], dec = m[2] || '', full = m[1] + (dec ? '.' + dec : '');
    const r = DEWEY.find(([t]) => Array.isArray(t) ? n >= t[0] && n <= t[1] : full.startsWith(t));
    const out = r ? [r[1]] : [];
    // « 092 » à la fin = biographie (subdivision standard)
    if ((n < 920 || n > 929) && dec.length > 2 && /092\d?$/.test(dec)) out.push('litterature/bio');
    return out;
  }
  // Cadre de classement de la Bibliographie nationale française (686) : libellés officiels de la BnF
  const CADRE_NOM = {'100': 'Philosophie', '150': 'Psychologie, psychanalyse', '200': 'Religion', '300': 'Sciences sociales', '320': 'Sciences politiques',
    '330': 'Économie', '340': 'Droit', '350': 'Administration publique', '360': 'Problèmes et services sociaux', '370': 'Éducation et enseignement',
    '500': 'Sciences', '610': 'Sciences médicales', '700': 'Arts', '740': 'Dessin, arts décoratifs', '800': 'Histoire et critique littéraires', '801': 'Poésie',
    '802': 'Théâtre', '803': 'Romans', '804': 'Essais littéraires', '805': 'Bandes dessinées', '809': 'Livres pour la jeunesse', '920': 'Biographies',
    '930': 'Histoire', '940': 'Histoire', '944': 'Histoire de France'};
  const CADRE = {'1': 'shs/philo', '37': 'shs/education', '360': 'shs/social', '801': 'litterature/poesie', '802': 'litterature/theatre',
    '803': 'litterature/romans', '804': 'litterature/essais', '805': 'bd', '809': 'jeunesse', '920': 'litterature/bio'};
  // (anciennes fiches : codes à 2 chiffres, « 32 » = 320)
  const cadreCibles = code => { const c = String(code || '').trim(); return CADRE[c] ? [CADRE[c]] : /^\d{3}$/.test(c) ? deweyCibles(c) : /^\d{2}$/.test(c) ? deweyCibles(c + '0') : []; };
  // Mots des sujets (RAMEAU, Apple Books, Google, Open Library…), en français et en anglais (texte sans accents ni ponctuation)
  const MOTS = [
    ['bd', /\b(bandes? dessinees?|bd|comics?|mangas?|romans? graphiques?|graphic novels?|seinen|shonen|shojo|webtoons?)\b/],
    ['imaginaire/sf', /\b(science fiction|space opera|cyberpunk)\b/],
    ['imaginaire/dystopie', /\b(dystopi\w*|anticipation|post apocalyptique|uchronie)\b/],
    ['imaginaire/fantasy', /\bfantasy\b/],
    ['imaginaire/fantastique', /\b(fantastique|horreur|epouvante|horror|surnaturel)\b/],
    ['romance', /\b(romans? sentimenta\w*|romance|new romance|romans? d amour|chick lit|romantasy)\b/],
    ['ya', /\b(young adult|jeunes adultes|romans? pour adolescents|litterature pour adolescents|ados)\b/],
    ['polar', /\b(romans? policiers?|policiers?|polars?|thrillers?|suspense|romans? noirs?|detective|crime fiction|mystery|espionnage)\b/],
    ['litterature/bio', /\b(biographies?|autobiographies?|memoires|memoirs)\b/],
    ['litterature/recits', /\b(recits personnels|temoignages?)\b/],
    ['litterature/humour', /\b(humour|humor|humoristiques?)\b/],
    ['pratique/perso', /\b(developpement personnel|self help|realisation de soi|psychologie positive|confiance en soi|estime de soi|motivation)\b/],
    ['pratique/sante', /\b(bien etre|corps et esprit|nutrition|dietetique|medecines? douces?)\b/],
    ['pratique/cuisine', /\b(cuisine|recettes|gastronomie|cooking|patisserie|vins?)\b/],
    ['pratique/famille', /\b(parentalite|parenting|education des enfants|relations parents enfants)\b/],
    ['pratique/sport', /\b(sports?|football|randonnee|fitness|alpinisme)\b/],
    ['pratique/nature', /\b(jardinage|potagers?|animaux de compagnie)\b/],
    ['pratique/maison', /\b(bricolage|loisirs creatifs|couture|tricot|travaux manuels)\b/],
    ['voyages/guides', /\b(guides? touristiques?|guides? de voyages?|travel guides?)\b/],
    ['voyages/recits', /\b(recits? de voyages?|travel writing|voyages et explorations)\b/],
    ['shs/social', /\b(travail social|social work|travailleurs sociaux|action sociale|aide sociale|protection de l enfance|enfants places|medico social|educateurs? specialises?|intervention sociale|services sociaux)\b/],
    ['shs/education', /\b(education|pedagogie|enseignement|teaching)\b/],
    ['shs/philo', /\b(philosophie|philosophy|ethique|ethics)\b/],
    ['shs/psycho', /\b(psychologie(?! positive)|psychology|psychanalyse|psychoanalysis|psychiatrie)\b/],
    ['shs/socio', /\b(sociologie|sociology|sciences sociales|social sciences|anthropologie|ethnologie)\b/],
    // (« migrations » seul n'est pas retenu : ce peut être celle des oiseaux ; seulement les migrations humaines)
    ['politique/societe', /\b(feminisme|feministes?|egalite des sexes|inegalites|immigration|immigres|migrations humaines|migrants?|refugies?|racisme|discriminations?|reseaux sociaux|medias)\b/],
    ['eco/economie', /\b(economie|economics)\b/],
    ['eco/finance', /\b(finances?|banques?|bourse|epargne)\b/],
    ['eco/entreprise', /\b(management|marketing|business|leadership|entreprises?)\b/],
    ['eco/droit', /\b(droit|droits|law|jurisprudence)\b/],
    ['histoire', /\b(histoire|history)\b(?! et critique)/],
    ['sciences/info', /\b(informatique|programmation|computer science|programming)\b/],
    ['sciences', /(?<!(political|social|computer) )\bsciences?\b(?! (fiction|politiques?|sociales|humaines|de l education|economiques|occultes))|\b(vulgarisation|popular works|physique|biologie|astronomie|mathematiques|chimie|neurosciences|medecine|ecologie)\b/],
    ['art', /\barts?\b(?! de vivre| martiaux)|\b(beaux arts|peinture|painting|musique|music|cinema|photographie|photography|architecture|sculpture|danse)\b/],
    ['litterature', /\b(romans?|litterature|literature|novels?|poesie|poetry|theatre|nouvelles|contes)\b|(?<!non )\bfiction\b/],
    ['religion/esoterisme', /\b(esoterisme|occultisme|astrologie|tarot|parapsychologie|spiritisme|sciences occultes)\b/],
    ['religion', /\b(religions?|spiritualite|spirituality|theologie|christianisme|islam|bouddhisme|judaisme|bible)\b/],
    ['jeunesse', /\b(jeunesse|juvenile fiction|livres? pour enfants|albums? pour enfants)\b/],
    ['reference', /\b(dictionnaires?|encyclopedies?|manuels? scolaires?)\b/]
  ];
  // Politique : les mots « forts » suffisent ; « politique » tout seul (« Politique et gouvernement ») se trouve aussi
  // sur des livres d'histoire ou des mémoires → il ne compte que si le catalogue ne donne aucun code de classement
  const POL_FORT = /\b(sciences? politiques?|political science|philosophie politique|political philosophy|sociologie politique|relations internationales|international relations|geopolitique|geopolitics|idees politiques|political ideas|politiques? publiques?|public policy|partis politiques|political parties|vie politique|communication en politique|democratie|democracy|ideologies? politiques?)\b/;
  const POL_FAIBLE = /\b(politique|politics)\b/;
  // Rayons « de genre » : un livre qui y est rangé ne va pas aussi dans Littérature (comme en librairie),
  // sauf pour ce qui n'est pas un roman (poésie, théâtre, biographie…)
  const GENRES = ['polar', 'imaginaire', 'romance', 'ya', 'bd', 'jeunesse'];
  const LITT_NON_ROMAN = ['litterature/classiques', 'litterature/poesie', 'litterature/theatre', 'litterature/nouvelles', 'litterature/bio', 'litterature/recits', 'litterature/essais', 'litterature/humour'];
  const memoClasse = new WeakMap();
  function classer(b) {
    if (!b || typeof b !== 'object') return {rayons: [], sous: []};
    const liste = v => Array.isArray(v) ? v : [];
    const cl = liste(b.classements).filter(k => k && k.l);
    // (la mémoire tient compte du CONTENU des classements : une fiche modifiée sur place est recalculée)
    const sig = JSON.stringify([cl, liste(b.sujets), liste(b.catNon), liste(b.catOui)]);
    const m = memoClasse.get(b); if (m && m.sig === sig) return m.res;
    const R = new Map(), S = new Map();
    const ajoute = (cible, raison, officiel) => {
      const rid = cible.split('/')[0], r = RAYONS.find(x => x.id === rid);
      if (!r || (cible.includes('/') && !SOUS_RAYONS.some(z => z.id === cible))) return;
      let x = R.get(rid); if (!x) R.set(rid, x = {id: rid, nom: r.nom, e: r.e, raisons: [], officiel: false, sources: []});
      if (!x.raisons.includes(raison)) x.raisons.push(raison);
      x.sources.push({raison, sous: cible.includes('/') ? cible : ''});
      x.officiel = x.officiel || officiel;
      if (cible.includes('/') && !S.has(cible)) S.set(cible, raison);
    };
    // 1. Les codes de classement (les plus sûrs)
    for (const k of cl) if (k.c === '686') cadreCibles(k.l).forEach(c => ajoute(c, (k.s || 'Catalogue') + ' : classement ' + k.l + (CADRE_NOM[k.l] ? ' (' + CADRE_NOM[k.l] + ')' : ''), true));
    for (const k of cl) if (k.c === '676') deweyCibles(k.l).forEach(c => ajoute(c, (k.s || 'Catalogue') + ' : indice Dewey ' + k.l, true));
    const codes = R.size > 0;
    // 2. Les sujets (avec leur provenance quand on la connaît)
    const libelles = cl.filter(k => /^60/.test(k.c)).map(k => [k.l, (k.s || 'Catalogue') + ' : sujet « ' + k.l + ' »']);
    // Rayons des librairies en ligne (Apple, Google…) : si le catalogue donne un code officiel, ils ne servent qu'à préciser
    // le genre d'un roman (la BnF range tous les romans ensemble), jamais à ajouter un rayon d'essais
    const enLigne = new Set();
    for (const s of liste(b.sujets)) if (s && !cl.some(k => norm(k.l).startsWith(norm(s)))) { libelles.push([s, 'Thème trouvé en ligne : « ' + s + ' »']); enLigne.add(s); }
    for (const [l, raison] of libelles) {
      // Quand le livre a déjà un code officiel, on ne regarde pas les précisions entre parenthèses
      // (« Innocence (théologie) » ne fait pas d'un conte un livre de religion)
      const n = norm(codes ? l.replace(/\([^)]*\)/g, ' ') : l);
      const precisionSeule = codes && enLigne.has(l);
      // (précision seule : uniquement les rayons de genre, jamais Littérature ni ses sous-rayons, comme le veut le §3.1 du spec)
      for (const [cible, re] of MOTS) if (re.test(n) && !(cible === 'litterature' && /\bromans? graphiques?\b/.test(n)) && (!precisionSeule || GENRES.includes(cible.split('/')[0]))) ajoute(cible, raison, false);
      if (precisionSeule) continue;
      if (POL_FORT.test(n) || (!codes && POL_FAIBLE.test(n) && !/\beconomie politique\b/.test(n))) ajoute('politique', raison, false);
    }
    // 3. Les sous-rayons des rayons trouvés, d'après l'indice Dewey, le code BnF ou les mots des sujets
    const dws = cl.filter(k => k.c === '676').map(k => String(k.l).replace(/\s+/g, ''));
    const cadres = cl.filter(k => k.c === '686').map(k => String(k.l).trim());
    const textes = [...cl.filter(k => /^60/.test(k.c)).map(k => k.l), ...liste(b.sujets)].map(norm);
    for (const z of SOUS_RAYONS) {
      if (!R.has(z.rayon) || S.has(z.id)) continue;
      const parCode = dws.find(c => (z.dw || []).some(d => d instanceof RegExp ? d.test(c) : c.startsWith(d)));
      const parCadre = (z.cadre || []).find(c => cadres.includes(c));
      const parMot = z.re && textes.find(t => z.re.test(t));
      if (parCode || parCadre || parMot) S.set(z.id, parCode ? 'indice Dewey ' + parCode : parCadre ? 'classement ' + parCadre : 'sujet « ' + parMot + ' »');
    }
    for (const z of SOUS_RAYONS) if (S.has(z.id) && (z.sauf || []).some(x => S.has(x))) S.delete(z.id);
    // 4. Les corrections faites à la main (réversibles : les données du catalogue ne sont pas touchées)
    const enleve = id => {
      if (!id.includes('/')) { R.delete(id); for (const k of [...S.keys()]) if (k.startsWith(id + '/')) S.delete(k); return; }
      S.delete(id);
      const x = R.get(id.split('/')[0]); if (!x) return;
      x.sources = x.sources.filter(s => s.sous !== id);
      x.raisons = [...new Set(x.sources.map(s => s.raison))];
      // Plus aucune raison propre : le rayon part, avec les sous-rayons trouvés seulement par affinage (ils n'existaient que grâce à lui)
      if (!x.raisons.length) enleve(x.id);
    };
    liste(b.catNon).forEach(id => enleve(String(id)));
    liste(b.catOui).forEach(id => ajoute(String(id), 'Ajouté par toi', false));
    // 5. Rayon de genre : pas aussi dans « Littérature » (sauf poésie, théâtre, biographie…), appliqué APRÈS les corrections :
    // ajouter « Policier » à un roman de la BnF (tous classés 803) le sort de Littérature, retirer « Policier » l'y remet ;
    // seul ce qui a été ajouté à la main est toujours gardé (Littérature, ou Littérature › Romans)
    const aMain = liste(b.catOui).map(String);
    if (R.has('litterature') && GENRES.some(id => R.has(id))) {
      if (!aMain.includes('litterature/romans')) S.delete('litterature/romans');
      if (!aMain.some(id => id === 'litterature' || id.startsWith('litterature/')) && !LITT_NON_ROMAN.some(id => S.has(id))) R.delete('litterature');
    }
    const rang = (l, ref) => l.sort((x, y) => ref.findIndex(c => c.id === x.id) - ref.findIndex(c => c.id === y.id));
    const res = {
      rayons: rang([...R.values()].map(({sources, ...x}) => x), RAYONS),
      sous: rang([...S.entries()].filter(([id]) => R.has(id.split('/')[0])).map(([id, raison]) => {
        const z = SOUS_RAYONS.find(y => y.id === id); return {id, rayon: z.rayon, nom: z.nom, raison};
      }), SOUS_RAYONS)
    };
    memoClasse.set(b, {sig, res});
    return res;
  }
  const rayons = b => classer(b).rayons;
  const sousRayons = b => classer(b).sous;
  // « philo » → Sciences humaines › Philosophie, « polar » → Policier & Thriller, « manga » → BD › Mangas…
  function rayonPourTexte(t) {
    const n = norm(t); if (!n) return null;
    const z = SOUS_RAYONS.find(x => [x.nom, ...(x.mots || [])].some(m => norm(m) === n));
    if (z) return {rayon: RAYONS.find(r => r.id === z.rayon), sous: z.id};
    const r = RAYONS.find(c => [c.nom, ...c.mots].some(x => norm(x) === n));
    return r ? {rayon: r, sous: ''} : null;
  }
  // Anciens noms des catégories (avant les rayons) → nouveaux identifiants ; '' si inconnu
  const ANCIENS = {philo: 'shs/philo', psycho: 'shs/psycho', socio: 'shs/socio', fantasy: 'imaginaire/fantasy', sf: 'imaginaire/sf', bio: 'litterature/bio',
    education: 'shs/education', social: 'shs/social', perso: 'pratique/perso', droit: 'eco/droit',
    'socio/genre': 'politique/societe', 'socio/migrations': 'politique/societe', 'socio/numerique': 'politique/societe', 'socio/inegalites': 'politique/societe',
    'socio/famille': 'pratique/famille', 'eco/travail': 'eco/economie', 'eco/monde': 'eco/economie', 'eco/ecologie': 'sciences/terre',
    'sf/dystopie': 'imaginaire/dystopie', 'sf/space': 'imaginaire/sf', 'litterature/contemporaine': 'litterature/romans', 'bd/franco': 'bd/bd'};
  function convertirAncienId(id) {
    id = String(id || '');
    if (RAYONS.some(r => r.id === id) || SOUS_RAYONS.some(z => z.id === id)) return id;
    if (ANCIENS[id]) return ANCIENS[id];
    const [a, s] = id.split('/');
    if (s) {   // anciennes sous-catégories : « philo/morale » → Philosophie, « polar/noir » → Roman noir…
      const parent = ANCIENS[a] || a;
      if (parent.includes('/')) return parent;
      if (SOUS_RAYONS.some(z => z.id === parent + '/' + s)) return parent + '/' + s;
    }
    return '';
  }

  /* ---------- Recherche par thème, avec une longueur maximale ---------- */
  // Livres « documentaires » : la BnF permet de chercher par indice Dewey et par sujet ; chaque fiche est ensuite revérifiée
  // (son classement doit vraiment correspondre au rayon : pas de livre de droit ou d'économie dans « Politique & Société »).
  // Requêtes d'un rayon : sa propre liste si elle existe (mêmes résultats qu'avant les rayons), sinon celles de ses sous-rayons,
  // réunies si elles tiennent en 20 termes, sinon interrogées à tour de rôle (un lot chacune)
  function requetesDuRayon(cat) {
    if (cat.rech) return [cat.rech];
    const l = SOUS_RAYONS.filter(z => z.rayon === cat.id && z.rech).map(z => z.rech);
    const tous = [...new Set(l.flat())];
    return !l.length ? [] : tous.length <= 20 ? [tous] : l;
  }
  // Romans de genre : la BnF les range tous dans « romans » (on ne peut pas y chercher « fantasy »).
  // On part donc de livres connus du genre (rayons d'Apple Books, prix, Wikipédia), puis on cherche leurs éditions françaises à la BnF.
  const RECH_FICTION = {litterature: ['roman', 'classique'], polar: ['polar'], imaginaire: ['sf', 'fantasy'], romance: ['romance'], ya: ['ya'],
    bd: ['bd', 'manga'], jeunesse: ['jeunesse']};
  const THEMES_RECHERCHE = RAYONS.filter(r => !r.horsRecherche && (r.nature === 'doc' ? requetesDuRayon(r).length : RECH_FICTION[r.id]));
  const BASE = ' and bib.language any "fre" and bib.recordtype any "mon" and bib.doctype any "a"';
  const parAnnee = (a, b) => (+b.annee || 0) - (+a.annee || 0);

  /* ---------- Tirage au sort : tous les thèmes ---------- */
  // Les 14 thèmes de découverte (prix, incontournables, coups de cœur…) + les 9 rayons documentaires de la BnF
  // (id « cat:… » ; Dictionnaires & Scolaire n'est jamais tiré)
  const CATS_TIRAGE = RAYONS.filter(r => r.nature === 'doc' && !r.horsRecherche).map(r => r.id);
  const THEMES_TIRAGE = [...THEMES.map(t => ({id: t.id, nom: t.nom, e: t.e})),
    ...CATS_TIRAGE.map(id => RAYONS.find(c => c.id === id)).map(c => ({id: 'cat:' + c.id, nom: c.nom, e: c.e}))];
  // Un livre d'un rayon documentaire, tiré au hasard parmi les parutions récentes classées ainsi par la BnF
  // (un ancien thème « cat:philo » est converti : Sciences humaines › Philosophie)
  async function decouvrirCat(id, opts) {
    const c = convertirAncienId(id), rid = c.split('/')[0], cat = RAYONS.find(r => r.id === rid);
    if (!cat || cat.nature !== 'doc' || cat.horsRecherche) return null;
    const sous = c.includes('/') ? c : '';
    const exclude = opts.exclude || (() => false);
    for (const debut of [1 + 50 * Math.floor(Math.random() * 6), 1]) {
      const r = await parTheme({cat: rid, sous, max: 0}, {debut, qi: Math.floor(Math.random() * 10)});
      if (r.erreur) return null;
      let essais = 0;
      for (const x of shuffle([...r.res, ...r.inconnus])) {
        if (exclude(x)) continue;
        if (++essais > 6) break;
        const cov = await couverture(x.covers);
        if (!cov) continue;   // une suggestion sans couverture donne moins envie
        let txt = x.resume;
        if (!txt) txt = (await resume(x).catch(() => ({}))).resume || '';
        return {...x, resume: txt, couverture: cov, theme: 'cat:' + rid, themeNom: cat.nom, themeE: cat.e, source: 'bnf', sourceNom: '🏛️ Catalogue BnF',
          raison: 'Rangé en « ' + cat.nom + ' » d’après le classement de la BnF' + (x.annee ? ' · paru en ' + x.annee : '')};
      }
    }
    return null;
  }

  // Le livre est-il bien de cet auteur ? (tous ses noms : auteur, scénariste, dessinateur… mais pas préfacier ni traducteur)
  function estDeLAuteur(r, auteur) {
    const tokens = norm([r.auteur, ...(r.noms || [])].join(' ')).split(' ');
    return words(auteur).every(w => tokens.some(m => m === w || (w.length > 2 && m.startsWith(w))));
  }
  // Apple Books ne dit pas la langue : on la devine avec les petits mots du titre et de la présentation
  function estFrancais(t) {
    const n = ' ' + norm(t) + ' ';
    const fr = (n.match(/ (le|la|les|des|une|et|du|est|dans|pour|qui|sur|avec) /g) || []).length;
    const en = (n.match(/ (the|and|of|to|with|is|in|for|this|that|from) /g) || []).length;
    return fr >= en;
  }
  // 2e source pour la recherche par auteur : Apple Books (beaucoup de livres récents, belles couvertures, mais sans nombre de pages)
  async function appleAuteur(auteur) {
    const j = await getJson('https://itunes.apple.com/search?country=fr&media=ebook&entity=ebook&attribute=authorTerm&limit=60&term=' + encodeURIComponent(auteur), 10000);
    return (j.results || []).map(r => ({
      titre: storeTitle(r.trackName), auteur: (r.artistName || '').split(/\s*&\s*/).slice(0, 3).join(', '),
      annee: (r.releaseDate || '').slice(0, 4), langue: 'fre', isbn: '', pagesTotal: '', editeur: '',
      covers: r.artworkUrl100 ? [r.artworkUrl100.replace(/\d+x\d+bb/, '600x600bb')] : [],
      resume: cleanResume(r.description), sujets: (r.genres || []).filter(g => g !== 'Livres'), indices: r.genres || [], classements: [],
      source: 'Apple', _texte: r.trackName + ' ' + (r.description || '').slice(0, 400)
    })).filter(b => b.titre && !JUNK.test(b.titre) && estDeLAuteur(b, auteur) && estFrancais(b._texte)).map(splitTome);
  }
  async function editionsFr(c) {
    const titre = clean(String(c.titre || '').replace(/["*?()]/g, ' ')).slice(0, 80), sn = surname(c.auteur), nt = norm(titre);
    if (!titre) return [];
    const recs = await bnf('bib.title all "' + titre + '"' + (sn ? ' and bib.author all "' + sn + '"' : '') + BASE, 12);
    return recs.filter(r => r.titre && !JUNK.test(r.titre) && (!sn || norm(r.auteur).includes(sn)) &&
      (norm(r.titre) === nt || norm(r.titre).startsWith(nt + ' ') || (norm(r.titre).length > 6 && nt.startsWith(norm(r.titre)))));
  }
  const versResultat = (r, extra) => ({...r, sources: [r.source || 'BnF'], genre: guessGenre(r.indices),
    pagesSource: r.pagesTotal ? (r.isbn ? 'edition' : 'estimation') : '',
    covers: [...new Set([...isbnCovers(r.isbn).slice(0, 2), ...(r.covers || [])])], ...extra});

  // o : {cat, texte, max (0 = sans limite), exclude(livre), stop()} — cur : où on en est (pour « Plus de résultats »)
  // Résultat : res (pages connues et ≤ max), inconnus (nombre de pages inconnu : jamais mélangés aux autres quand il y a une limite),
  // trop (trouvés mais plus longs), examines (fiches regardées), fin (plus rien à chercher), erreur
  async function parTheme(o, cur, onProgress) {
    const max = +o.max || 0, out = {res: [], inconnus: [], trop: 0, examines: 0, fin: false, erreur: ''};
    const vus = cur.vus || (cur.vus = new Set());
    const stop = () => !!(o.stop && o.stop());
    const cat = RAYONS.find(c => c.id === o.cat && !c.horsRecherche) || null;
    const sous = SOUS_RAYONS.find(z => z.id === o.sous && z.rech && (!cat || z.rayon === cat.id)) || null;
    const texte = clean(String(o.texte || '').replace(/["*?()<>=]/g, ' ')).slice(0, 60);
    // Recherche par auteur ou par titre (toutes les éditions françaises de la BnF ; une seule par livre)
    const auteur = clean(String(o.auteur || '').replace(/["*?()<>=]/g, ' ')).slice(0, 60);
    const titre = clean(String(o.titre || '').replace(/["*?()<>=]/g, ' ')).slice(0, 80);
    // Même livre (même ISBN, ou même titre + même auteur) vu deux fois : on ne le montre qu'une fois
    const garder = (r, extra) => {
      const k = norm(r.titre) + '|' + surname(r.auteur);
      if (vus.has(k) || (r.isbn && vus.has(r.isbn))) return;
      if (r.pagesTotal && max && r.pagesTotal > max) { out.trop++; return; }
      vus.add(k); if (r.isbn) vus.add(r.isbn);
      // (une pagination approximative du catalogue, « [ca 168] p. », n'est pas sûre : rangée à part, comme les inconnues)
      (max && (!r.pagesTotal || r.pagesEnviron) ? out.inconnus : out.res).push(versResultat(r, extra));
    };
    try {
      if (cat && RECH_FICTION[cat.id] && !auteur && !titre) {
        if (!cur.cands) {
          const ts = RECH_FICTION[cat.id].map(id => THEMES.find(t => t.id === id)).filter(Boolean);
          const listes = await Promise.all(ts.flatMap(t => [t.apple.length ? candApple(t) : null, (t.wd.length || t.classiques) ? candGenre(t) : null,
            t.prix.length ? candPrix(t) : null]).filter(Boolean).map(p => p.catch(() => [])));
          const deja = new Set();
          cur.cands = shuffle(listes.flat()).filter(c => c.titre && c.auteur && !deja.has(norm(c.titre)) && deja.add(norm(c.titre)));
          cur.ci = 0;
          if (!cur.cands.length) { out.erreur = 'reseau'; return out; }
        }
        let essais = 0, echecs = 0;
        while (cur.ci < cur.cands.length && out.res.length < 5 && essais < 10 && !stop()) {
          const c = cur.cands[cur.ci++]; essais++;
          if (o.exclude && o.exclude(c)) continue;
          let eds;
          try { eds = await editionsFr(c); echecs = 0; }
          catch (e) { if (e.status === 503 || ++echecs >= 3) throw e; continue; }
          out.examines++;
          const avecPages = eds.filter(r => r.pagesTotal).sort(parAnnee), p = avecPages.map(r => +r.pagesTotal);
          const ok = avecPages.filter(r => !max || r.pagesTotal <= max);
          const extra = {raison: c.raison || '', theme: cat.id, autresEditions: p.length > 1 && Math.min(...p) !== Math.max(...p) ? [Math.min(...p), Math.max(...p)] : null};
          if (ok.length) garder(ok[0], extra);
          else if (avecPages.length) out.trop++;
          else if (eds.length) garder(eds.sort(parAnnee)[0], extra);
          if (onProgress) onProgress(out);
        }
        out.fin = cur.ci >= cur.cands.length;
      } else {
        if (!cat && !texte && !auteur && !titre) { out.fin = true; return out; }
        // (Apple Books : demandé une seule fois par recherche, en même temps que la BnF)
        const apple = auteur && !cur.appleFait ? (cur.appleFait = true, appleAuteur(auteur).catch(() => [])) : null;
        const fixes = [];
        if (auteur) fixes.push('bib.author all "' + auteur + '"');
        if (titre) fixes.push('bib.title all "' + titre + '"');
        // Listes de termes BnF à interroger (un rayon trop large : une liste par sous-rayon, à tour de rôle)
        const groupes = sous ? [sous.rech] : cat && cat.nature === 'doc' ? requetesDuRayon(cat) : [null];
        const requete = g => {
          const parts = [...fixes];
          if (g) parts.push('(' + g.join(' or ') + ')');
          if (texte) parts.push(parts.length ? 'bib.subject all "' + texte + '"' : 'bib.subject adj "' + texte + '"');
          // Les plus récents d'abord (livres qu'on trouve encore en librairie), sans les annonces de livres pas encore parus
          return parts.join(' and ') + BASE + ' and bib.publicationdate <= "' + new Date().getFullYear() + '" sortBy Dat/sort.descending';
        };
        cur.starts = cur.starts || groupes.map(() => cur.debut || 1);
        cur.finis = cur.finis || groupes.map(() => false);
        cur.qi = (cur.qi || 0) % groupes.length;
        let lots = 0, panneBnf = null;
        try {
          // (2 paquets de 50 fiches au plus par demande : « Plus de résultats » va chercher la suite)
          while (out.res.length < 10 && lots < 2 && !stop() && cur.finis.some(f => !f)) {
            while (cur.finis[cur.qi]) cur.qi = (cur.qi + 1) % groupes.length;
            const i = cur.qi;
            let lot;
            try { lot = await bnfLot(requete(groupes[i]), cur.starts[i], 50); }
            catch (e) {
              // Requête d'un sous-rayon refusée par la BnF : on la laisse de côté et on passe aux autres
              // (l'erreur n'est annoncée que si toutes les requêtes du rayon ont été refusées)
              if (e.status !== 400 || groupes.length < 2) throw e;
              lots++; cur.finis[i] = true; cur.refus = (cur.refus || 0) + 1; cur.qi = (i + 1) % groupes.length;
              if (cur.refus >= groupes.length) throw e;
              continue;
            }
            const {total, recs} = lot;
            lots++; cur.starts[i] += 50; cur.total = total;
            if (cur.starts[i] > total) cur.finis[i] = true;
            cur.qi = (i + 1) % groupes.length;
            for (const r of recs) {
              out.examines++;
              if (!r.titre || !r.isbn || JUNK.test(r.titre) || (r.langue && r.langue !== 'fre')) continue;
              // Revérification : le classement de la fiche doit correspondre au rayon
              if (cat && cat.nature === 'doc' && !rayons(r).some(c => c.id === cat.id)) continue;
              if (sous && !sousRayons(r).some(z => z.id === sous.id)) continue;
              // (par auteur : l'auteur doit vraiment être celui cherché, pas un préfacier ou un traducteur)
              if (auteur && !estDeLAuteur(r, auteur)) continue;
              // (le nom cherché n'est pas parmi les noms affichés, ex. le dessinateur d'Astérix : on l'ajoute pour qu'on comprenne)
              let fiche = r;
              if (auteur && !estDeLAuteur({auteur: r.auteur}, auteur)) {
                const nom = (r.noms || []).find(n => estDeLAuteur({auteur: n}, auteur));
                if (nom) fiche = {...r, auteur: r.auteur ? r.auteur + ', ' + nom : nom};
              }
              garder(fiche, {theme: cat ? cat.id : ''});
            }
            if (onProgress) onProgress(out);
          }
          if (cur.finis.every(Boolean)) out.fin = true;
        } catch (e) { if (!apple) throw e; panneBnf = e; }
        // Les livres de l'auteur trouvés sur Apple Books en plus (sans nombre de pages : rangés à part quand il y a une limite)
        if (apple) {
          for (const r of await apple) { out.examines++; garder(r, {theme: ''}); }
          if (onProgress) onProgress(out);
          if (panneBnf && !out.res.length && !out.inconnus.length) throw panneBnf;
          if (panneBnf) { out.note = 'bnf'; out.fin = true; }
        }
      }
    } catch (e) { out.erreur = e.status === 503 ? 'pause' : e.status === 400 ? 'requete' : 'reseau'; }
    return out;
  }

  const api = {
    VERSION: '2026.10.23-8',   // (le même numéro que dans index.html)
    toIsbn13, isbn10, looksLikeIsbn, norm, words, surname, guessGenre,
    RAYONS, SOUS_RAYONS, classer, rayons, sousRayons, rayonPourTexte, convertirAncienId, deweyCibles,
    THEMES_RECHERCHE, requetesDuRayon, parTheme, classement, unirClassements,
    parIsbn, parTexte, completer, couverture, chercherCouvertures, isbnCovers, placeholder,
    resume, decouvrir, selection, THEMES, THEMES_TIRAGE, SOURCES_DECOUVERTE,
    setGoogleKey(k) { googleKey = k || ''; googleBlockedUntil = 0; },
    dernierStatut: {},
    _rank: rank, _parseUnimarc: parseUnimarc, _candBnf: candBnf, _candPrix: candPrix,
    // (page de tests : oublier les réponses d'un faux catalogue, pour qu'elles ne servent jamais aux tests suivants)
    _oublierBnf() { memoBnf.clear(); }
  };
  return api;
})();
