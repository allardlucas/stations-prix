# stations-prix

Stations proches et prix du carburant choisi, si la mise à jour a 72 h ou moins.

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

## Vérifier à la main

1. Autorise la géoloc. La carte se centre sur toi et le bandeau dit `votre position`. Refuse la géoloc. Le bandeau dit `Bayonne (défaut)`.
2. Choisis Gazole, puis SP95, SP98, E85. Les pins changent. Une station sans prix frais pour ce carburant disparaît.
3. Chaque pin montre un prix et un âge (`12 min`, `3 h`, `2 j`). Le bandeau répète `pins = prix ≤72h`.
4. Aucun pin ne montre un prix plus vieux que 72 h. Pour le prouver hors carte, lance `npm test` (cas E85 du 20 août masqué au 5 septembre).
5. Déplace la carte hors Pays Basque : d’autres pins apparaissent. Change de carburant. Dézoome trop loin : plus de pins, bandeau « Zoomez pour afficher les stations ».
