/* =====================================================================
   Mes lectures : classification fine des livres
   ---------------------------------------------------------------------
   Les rayons de librairie restent distincts des genres, sous-genres, thèmes,
   ambiances et étiquettes personnelles.
   ===================================================================== */
const Taxonomie = (() => {
  const VERSION = '2026.10.23-10';   // (le même numéro que dans index.html et recherche.js)
  // Comparaison sans majuscules, accents ni ponctuation, et sans le « s » ou le « x » du pluriel (« Théâtres » = « Théâtre »)
  const cle = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map(m => m.length > 3 ? m.replace(/[sx]$/, '') : m).join(' ');
  const GENRES = [
    {id: 'roman', nom: 'Roman', syn: ['romans']},
    {id: 'nouvelles', nom: 'Nouvelles', syn: ['nouvelle', 'recueil de nouvelles']},
    {id: 'conte', nom: 'Conte', syn: ['contes']},
    {id: 'poesie', nom: 'Poésie', syn: ['poesies', 'poeme', 'poemes']},
    {id: 'theatre', nom: 'Théâtre', syn: ['piece de theatre', 'pieces de theatre']},
    {id: 'essai', nom: 'Essai', syn: ['essais']},
    {id: 'biographie', nom: 'Biographie', syn: ['biographies']},
    {id: 'autobiographie', nom: 'Autobiographie', syn: ['autobiographies']},
    {id: 'memoires', nom: 'Mémoires', syn: []},
    {id: 'recit', nom: 'Récit & témoignage', syn: ['recit', 'recits', 'temoignage', 'temoignages']},
    {id: 'bd', nom: 'Bande dessinée', syn: ['bd', 'bandes dessinees', 'roman graphique', 'romans graphiques']},
    {id: 'manga', nom: 'Manga', syn: ['mangas']},
    {id: 'documentaire', nom: 'Documentaire', syn: ['documentaires']},
    {id: 'pratique', nom: 'Livre pratique', syn: ['livres pratiques', 'guide pratique']},
    {id: 'reference', nom: 'Ouvrage de référence', syn: ['ouvrages de reference', 'dictionnaire', 'encyclopedie']},
    {id: 'album', nom: 'Album illustré', syn: ['album', 'albums', 'albums illustres', 'livre illustre']}
  ];
  const SOUS_GENRES = [
    ['roman/policier', 'roman', 'Policier'], ['roman/historique', 'roman', 'Historique'], ['roman/psychologique', 'roman', 'Psychologique'],
    ['roman/epistolaire', 'roman', 'Épistolaire'], ['roman/romance', 'roman', 'Romance'], ['roman/noir', 'roman', 'Roman noir'],
    ['roman/aventure', 'roman', 'Aventure'], ['roman/anticipation', 'roman', 'Anticipation'], ['roman/fantastique', 'roman', 'Fantastique'],
    ['nouvelles/recueil', 'nouvelles', 'Recueil de nouvelles'], ['conte/merveilleux', 'conte', 'Merveilleux'],
    ['essai/philosophie', 'essai', 'Philosophie'], ['essai/histoire', 'essai', 'Histoire'], ['essai/sciences-sociales', 'essai', 'Sciences sociales'],
    ['essai/politique', 'essai', 'Politique'], ['essai/litteraire', 'essai', 'Littéraire'], ['essai/scientifique', 'essai', 'Scientifique'],
    ['bd/comics', 'bd', 'Comics'], ['bd/manga', 'bd', 'Manga'], ['bd/roman-graphique', 'bd', 'Roman graphique'],
    ['documentaire/histoire', 'documentaire', 'Histoire'], ['documentaire/sciences', 'documentaire', 'Sciences'],
    ['pratique/cuisine', 'pratique', 'Cuisine'], ['pratique/sante', 'pratique', 'Santé et bien-être'],
    ['pratique/loisirs', 'pratique', 'Loisirs']
  ].map(([id, genre, nom]) => ({id, genre, nom}));
  const THEMES = [
    ['deuil', 'Deuil'], ['identite', 'Identité'], ['amitie', 'Amitié'], ['pouvoir', 'Pouvoir'], ['justice', 'Justice'],
    ['famille', 'Famille'], ['solitude', 'Solitude'], ['liberte', 'Liberté'], ['memoire', 'Mémoire'], ['amour', 'Amour'],
    ['guerre', 'Guerre'], ['exil', 'Exil'], ['transmission', 'Transmission'], ['nature', 'Nature'], ['amitie', 'Amitié'],
    ['inegalites', 'Inégalités'], ['religion', 'Religion'], ['ecologie', 'Écologie'], ['quete-de-soi', 'Quête de soi'],
    ['violence', 'Violence'], ['education', 'Éducation'], ['travail', 'Travail'], ['famille', 'Famille']
  ].map(([id, nom]) => ({id, nom})).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const AMBIANCES = [
    ['sombre', 'Sombre'], ['contemplatif', 'Contemplatif'], ['drole', 'Drôle'], ['oppressant', 'Oppressant'],
    ['reconfortant', 'Réconfortant'], ['poetique', 'Poétique'], ['intense', 'Intense'], ['aventureux', 'Aventureux'],
    ['mysterieux', 'Mystérieux'], ['apaisant', 'Apaisant'], ['ironique', 'Ironique'], ['melancolique', 'Mélancolique'],
    ['haletant', 'Haletant'], ['lumineux', 'Lumineux']
  ].map(([id, nom]) => ({id, nom}));
  const PAR_TEXTE = new Map(GENRES.flatMap(g => [g.nom, ...g.syn].map(s => [cle(s), g.id])));
  // Ancien champ « Genre » → identifiant d'un genre principal, seulement si le texte EST ce genre ('' sinon :
  // « Roman policier » ou « Science-fiction » ne proposent rien, on ne devine pas)
  const genreDepuisTexte = t => PAR_TEXTE.get(cle(t)) || '';
  const genre = id => GENRES.find(g => g.id === id) || null;
  const element = (dimension, id) => dimension === 'genre' ? genre(id) : (collection(dimension).find(x => x.id === id) || null);
  const nom = (dimension, id) => (element(dimension, id) || {}).nom || id || '';
  const collection = dimension => ({genre: GENRES, sousGenres: SOUS_GENRES, themes: THEMES, ambiances: AMBIANCES}[dimension] || []);
  return {VERSION, GENRES, SOUS_GENRES, THEMES, AMBIANCES, genreDepuisTexte, genre, element, nom, collection};
})();
