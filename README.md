# stations-prix

Stations proches et prix du carburant choisi. Toutes les stations du viewport qui ont un prix sont affichées ; l’âge change l’opacité du pin (plein ≤24 h, moyen ≤72 h, pâle au-delà).

Lucas ouvre la page avant le plein, choisit un carburant, lit le **logo enseigne** (pastille / monogramme SVG, pas un logo officiel), le **type**, le **prix** et l’**âge** sur les pins. Fond de carte **Carto Positron** (clair, tuiles Leaflet libres — pas Mapbox, pas satellite, pas dark). La carte prend tout l’écran ; **Filtres** et **Top** ouvrent les panneaux (fermés par défaut). Pas de barre bas compte / historique / favoris / stats.

## Lancer

```bash
npm i
npm test
npm run dev
```

Ouvre l'URL Vite affichée, en local `http://localhost:5173`.

En ligne : https://allardlucas.github.io/stations-prix/

## Données

Flux open data [prix-des-carburants-en-france-flux-instantane-v2](https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records), refresh côté source d'environ 10 min.

La page fetch l'API depuis le navigateur. L'API envoie `Access-Control-Allow-Origin: *`, donc pas de proxy. Les coordonnées viennent de `geom.lat` et `geom.lon`, pas des champs `latitude` et `longitude` en micro-degrés. Après le fetch viewport, un recalage OSM (`amenity=fuel` dans ~2 km, Nominatim puis Overpass) peut remplacer le pin et les liens **Y aller** si le match est fiable (lien `ref:FR:prix-carburants`, un seul candidat, ou meilleur score proximité + adresse/ville/CP). Sinon les coords ODS restent. Cache mémoire par id pour la session ; échec OSM = fallback ODS silencieux. Pas de table de corrections hardcodée.

Si la géoloc est refusée ou expire, le centre est Bayonne (43.49, -1.47). Ensuite chaque pan/zoom recharge les stations de la **zone visible** (`in_bbox`, debounce 400 ms). Pas de dump national.

Si la bbox dépasse 1° de lat ou lon (~80–110 km), aucun fetch : le bandeau demande de zoomer (choix le plus simple pour le mobile). L’API ODS v2.1 plafonne à 100 records ; au plafond le bandeau le dit.

Le schéma live n’a pas `marque` / `nom` / `enseigne` (47 champs). Ils sont parsés s’ils arrivent. Sinon l’enseigne est déduite des tokens connus dans le nom/brand OSM au recalage, ou dans l’adresse. Nominatim omet souvent `brand` : un passage Overpass complète le tag si le nom n’a pas de token (ex. Relais + `brand=TotalEnergies`). Pas de match → tag filtre **Autre** (visible tant que le filtre est « Toutes ») ; la fiche n’affiche pas « Autre » comme une enseigne. La liste du filtre = enseignes présentes dans le viewport. Pas de table id→enseigne.

`pop` est bien dans le flux live : **A** = autoroute, **R** = route (sample 2026-09-06 : 436 A / 9369 R, dont Bidart A63 `64210005`). Le toggle **Autoroute** ne garde que `pop=A`.

Recherche lieu : Nominatim (`User-Agent` hors navigateur, file d’attente ≥1,1 s partagée avec le snap). Centre la carte et recharge le viewport.

Favoris : `localStorage`, max 8, sans compte. Ajout / retrait depuis la fiche ; chips pour recentrer / highlight.

Gain net détour (approx.) : `litres × (prix réf − prix station) − (km × conso/100 × prix station)`. Réf = moins chère autre station ≤ 8 km de l’origine, sinon moyenne viewport. Défauts plein 50 L / 6,5 L/100 en `localStorage`.

Horaires : `horaires_automate_24_24` (`Oui` → « Automate 24h ») et créneaux dans `horaires` (JSON). Distance haversine depuis la géoloc si elle a réussi, sinon le centre du viewport.

Revenir sur l’onglet après plus de ~3 min depuis le dernier fetch réussi relance le viewport. Pas de poll périodique.

## Vérifier à la main

1. Autorise la géoloc. La carte se centre sur toi et le bandeau dit `votre position`. Refuse la géoloc. Le bandeau dit `Bayonne (défaut)`.
2. Choisis Gazole, puis SP95, SP98, E85, E10. Les pins et la liste bas changent. Une station sans prix pour ce carburant disparaît.
3. Chaque pin montre pastille enseigne + carburant + prix + âge (`12 min`, `3 h`, `2 j`). L’opacité suit l’âge : pleine ≤24 h, moyenne ≤72 h, pâle au-delà. La liste top 5 aussi. Le fond est clair (Carto Positron), sans filtre d’inversion.
4. Un prix de plus de 72 h reste visible (pin pâle). Pour le prouver hors carte, lance `npm test` (E85 du 20 août = `faint` au 5 septembre).
5. Déplace la carte hors Pays Basque : d’autres pins apparaissent, la liste top 5 se recalcule sur le viewport (y compris les prix anciens s’ils sont les moins chers). Change de carburant. Tape une ligne : le pin se centre. Dézoome trop loin : plus de pins ni de liste, bandeau « Zoomez pour afficher les stations ».
6. Fiche et top 5 : liens **Y aller** / Waze / Google Maps / Apple Plans (`geo:` + URLs https). La distance en km s’affiche à côté.
7. Si ODS envoie des horaires : « Automate 24h » et/ou les créneaux sur la fiche. S’ils manquent (ex. 22 Chemin d'Arancette, `horaires` null), rien n’est inventé.
8. Laisse l’onglet en arrière-plan plus de 3 min, reviens : un nouveau fetch viewport part (pas de timer périodique).
9. Intermarché Itxassou `64250001` : ODS `43.338,-1.405` est faux (~1,6 km). Après recalage, le pin et **Y aller** doivent viser la pompe OSM (~`43.3504,-1.4156`), pas le geom ODS. Fiche : mention discrète « position OSM » ; enseigne **Intermarché** si le nom OSM est là.
10. Tape « Bidart » (ou une ville) : la carte se centre, le viewport recharge. Filtre enseigne : « Toutes » par défaut, liste = enseignes du viewport, **Autre** = pas de token connu.
11. Toggle **Autoroute** : plus que `pop=A` (Aire de Bidart Est/Ouest sur l’A63). Sans le toggle, R et A restent.
12. Fiche : **Ajouter aux favoris** (max 8) ; un chip recentre et highlight. Retrait depuis la fiche.
13. Fiche / top 5 : ligne `approx. ±X,XX €` vs moins chère proche ou vs moyenne. Change plein / L/100 : le gain se recalcule.
