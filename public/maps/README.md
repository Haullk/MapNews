# Local Map Assets

These GeoJSON files are derived from Natural Earth public domain data:

- `countries.geojson`: Natural Earth 50m Admin 0 countries
- `regions.geojson`: Natural Earth 10m Admin 1 states/provinces, simplified for browser rendering
- `places.geojson`: Natural Earth 10m populated places filtered to capitals, world cities, megacities, and cities with population >= 500,000

The frontend loads these files directly from `/maps/` and does not call an external map SDK.
