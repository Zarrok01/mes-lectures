/* =====================================================================
   Mes lectures : classification fine des livres
   ---------------------------------------------------------------------
   Genre principal (une liste courte et normalisée). Les sous-genres, thèmes et ambiances
   s'ajouteront ici à l'étape 4. Les rayons de librairie (CLIL) restent dans recherche.js.
   ===================================================================== */
const Taxonomie = (() => {
  const VERSION = '2026.10.22-3';   // (le même numéro que dans index.html et recherche.js)
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
  const PAR_TEXTE = new Map(GENRES.flatMap(g => [g.nom, ...g.syn].map(s => [cle(s), g.id])));
  // Ancien champ « Genre » → identifiant d'un genre principal, seulement si le texte EST ce genre ('' sinon :
  // « Roman policier » ou « Science-fiction » ne proposent rien, on ne devine pas)
  const genreDepuisTexte = t => PAR_TEXTE.get(cle(t)) || '';
  return {VERSION, GENRES, genreDepuisTexte, genre: id => GENRES.find(g => g.id === id) || null};
})();
