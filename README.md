# stations-prix

Stations proches et prix du carburant choisi. Toutes les stations du viewport qui ont un prix sont affichées ; l’âge change l’opacité du pin (plein ≤24 h, moyen ≤72 h, pâle au-delà).

Lucas ouvre la page avant le plein, choisit un carburant, lit le prix et l'âge sur les pins.

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

La page fetch l'API depuis le navigateur. L'API envoie `Access-Control-Allow-Origin: *`, donc pas de proxy. Les coordonnées viennent de `geom.lat` et `geom.lon`, pas des champs `latitude` et `longitude` en micro-degrés.

Si la géoloc est refusée ou expire, le centre est Bayonne (43.49, -1.47). Ensuite chaque pan/zoom recharge les stations de la **zone visible** (`in_bbox`, debounce 400 ms). Pas de dump national.

Si la bbox dépasse 1° de lat ou lon (~80–110 km), aucun fetch : le bandeau demande de zoomer (choix le plus simple pour le mobile). L’API ODS v2.1 plafonne à 100 records ; au plafond le bandeau le dit.

Le schéma live n’a pas `marque` / `nom` / `enseigne` (47 champs). Ils sont parsés s’ils arrivent, sinon la fiche n’invente rien. Horaires : `horaires_automate_24_24` (`Oui` → « Automate 24h ») et créneaux dans `horaires` (JSON). Distance haversine depuis la géoloc si elle a réussi, sinon le centre du viewport.

Revenir sur l’onglet après plus de ~3 min depuis le dernier fetch réussi relance le viewport. Pas de poll périodique.

## Vérifier à la main

1. Autorise la géoloc. La carte se centre sur toi et le bandeau dit `votre position`. Refuse la géoloc. Le bandeau dit `Bayonne (défaut)`.
2. Choisis Gazole, puis SP95, SP98, E85, E10. Les pins et la liste bas changent. Une station sans prix pour ce carburant disparaît.
3. Chaque pin montre un prix et un âge (`12 min`, `3 h`, `2 j`). L’opacité suit l’âge : pleine ≤24 h, moyenne ≤72 h, pâle au-delà. La liste top 5 aussi.
4. Un prix de plus de 72 h reste visible (pin pâle). Pour le prouver hors carte, lance `npm test` (E85 du 20 août = `faint` au 5 septembre).
5. Déplace la carte hors Pays Basque : d’autres pins apparaissent, la liste top 5 se recalcule sur le viewport (y compris les prix anciens s’ils sont les moins chers). Change de carburant. Tape une ligne : le pin se centre. Dézoome trop loin : plus de pins ni de liste, bandeau « Zoomez pour afficher les stations ».
6. Fiche et top 5 : liens **Y aller** / Waze / Google Maps / Apple Plans (`geo:` + URLs https). La distance en km s’affiche à côté.
7. Si ODS envoie des horaires : « Automate 24h » et/ou les créneaux sur la fiche. S’ils manquent (ex. 22 Chemin d'Arancette, `horaires` null), rien n’est inventé. L’enseigne n’apparaît que si le champ est présent.
8. Laisse l’onglet en arrière-plan plus de 3 min, reviens : un nouveau fetch viewport part (pas de timer périodique).
