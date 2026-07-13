# Municipality Choropleth Notes

## Purpose

The V2 dashboard now supports a municipality-level choropleth map. The first example is on the Biomedical page as:

```text
Municipality Infection Choropleth
```

It joins municipal infection values from a prepared CSV to municipality polygons from Cartomap.

## Files

Prepared dashboard data:

```text
public/data/biomedical/municipal_infections.csv
public/data/biomedical/municipal_infections_2021_harmonized.csv
```

Map geometry:

```text
public/data/geo/gemeente_2020.geojson
public/data/geo/gemeente_2021.geojson
public/data/geo/gemeente_2026.geojson
```

Dashboard config:

```text
public/config/dashboard.json
```

Renderer and edit controls:

```text
src/lib/buildEchartsOption.js
src/components/ChartSettingsPanelV2.jsx
src/lib/chartOptionRegistry.js
src/lib/validateConfig.js
```

## Data Preparation

The raw CSV provided by the user was:

```text
C:\Users\hekma\OneDrive - Erasmus University Rotterdam\Documents\RIVM_NL_municipal.csv
```

The prepared dashboard CSV keeps municipality rows where:

```text
Type = Totaal
Gemeentecode is not -1
```

The prepared CSV columns are:

```text
Datum
MunicipalityCode
Gemeentecode
Gemeentenaam
Provincienaam
Provinciecode
Aantal
AantalCumulatief
population
populationMunicipalityName
infectionsPerPopulation
infectionsPer1000
infectionsPer10000
```

`MunicipalityCode` is generated from `Gemeentecode`:

```text
14 -> GM0014
3 -> GM0003
```

This is what allows the CSV to join to the Cartomap GeoJSON.

## GeoJSON Source

The user-provided `gemeente_2026.geojson` uses Dutch RD coordinates, such as:

```text
[247394, 589397]
```

Those are not longitude/latitude coordinates, so the dashboard uses Cartomap's WGS84 files instead:

```text
https://raw.githubusercontent.com/cartomap/nl/gh-pages/wgs84/gemeente_2020.geojson
https://raw.githubusercontent.com/cartomap/nl/gh-pages/wgs84/gemeente_2021.geojson
https://raw.githubusercontent.com/cartomap/nl/gh-pages/wgs84/gemeente_2026.geojson
```

Cartomap repository:

```text
https://github.com/cartomap/nl
```

The GeoJSON feature properties include:

```text
statcode
statnaam
```

The current dashboard join is:

```text
CSV MunicipalityCode -> GeoJSON properties.statcode
```

## Initial Panel Defaults

The default choropleth panel uses:

```text
dataSource: bio_municipal_infections
geoSource: geo_netherlands_municipalities_2021
joinField: MunicipalityCode
valueField: infectionsPer10000
labelField: Gemeentenaam
geoNameProperty: statcode
geoLabelProperty: statnaam
dateSelection: single date, 2021-04-17
colorScheme: caseIntensity
```

The raw RIVM dataset is historical and currently ends on:

```text
2021-04-17
```

This is separate from the fictional 2027 scenario dates used by several other biomedical charts.

Although the user supplied a 2026 municipality file, the RIVM CSV uses older municipality codes. A join check showed:

```text
2020 GeoJSON: 354 of 354 latest-date rows matched
2021 GeoJSON: 350 of 354 latest-date rows matched
2026 GeoJSON: 336 of 354 latest-date rows matched
```

The original temporary panel used the 2020 WGS84 geometry because that was the closest direct match to the raw RIVM municipality rows.

The current panel instead uses a harmonized 2021 dataset and the 2021 WGS84 geometry. This keeps the map boundary year consistent while ensuring every municipality on the map has an infection rate.

## Population Join And Rate Column

The municipality population file provided by the user was:

```text
C:\Users\hekma\Downloads\municipalities-population.csv
```

It was joined to `municipal_infections.csv` by:

```text
MunicipalityCode -> Municipality_code
```

The join added:

```text
population
populationMunicipalityName
infectionsPerPopulation
infectionsPer1000
infectionsPer10000
```

The raw rate is:

```text
infectionsPerPopulation = AantalCumulatief / population
```

The dashboard rates are:

```text
infectionsPer1000 = infectionsPerPopulation * 1,000
infectionsPer10000 = infectionsPerPopulation * 10,000
```

The arbitrary `infectionsPerPopulationScaled` column was removed.

Current join result:

```text
146,910 infection rows
140,685 rows matched directly to population
6,225 raw rows did not match population
```

The unmatched rows mostly involve older or merged municipality codes such as:

```text
GM0003 Appingedam
GM0010 Delfzijl
GM0024 Loppersum
GM0788 Haaren
```

That mismatch is expected when historical infection rows are joined to a population file based on newer municipality definitions.

## Harmonized 2021 Map Dataset

The dashboard choropleth now uses:

```text
public/data/biomedical/municipal_infections_2021_harmonized.csv
```

This file has exactly one row per 2021 GeoJSON municipality per date:

```text
415 dates
352 municipalities
146,080 rows
```

The raw infection rows and 2021 GeoJSON differ because some municipality definitions changed:

```text
Appingedam, Delfzijl, and Loppersum are not separate 2021 GeoJSON features; the 2021 map has Eemsdelta.
Haaren appears in the raw infection file but not in the 2021 GeoJSON.
Nuenen, Gerwen en Nederwetten appears in the 2021 GeoJSON but not in the raw infection file.
```

Harmonization method:

- Direct matches use the observed infection count.
- Merged predecessor rows are summed when predecessor values exist.
- If a map municipality has no usable source value for a date, the infection count is imputed from that date's population-weighted province infection rate.
- If a map municipality has no population in the supplied population CSV, population is imputed from the province median population.
- Each row records `dataMethod` and `populationSource` so imputed values are visible in tooltips and auditable in the CSV.

For `2021-04-16`, every one of the 352 map municipalities has an infection rate. On that date, Eemsdelta and Nuenen use province-rate imputation.

## Edit Mode Controls

For a `Choropleth map` panel, edit mode exposes:

- CSV data source.
- GeoJSON source.
- Date selection.
- CSV join field.
- CSV value field.
- CSV label field.
- GeoJSON code property.
- GeoJSON label property.
- Color palette and reverse option.
- Visual scale minimum and maximum.
- Missing-data color.
- Boundary color and width.
- Source hover text.
- Panel size and global/custom panel colors.

## Practical Notes

- Use WGS84 GeoJSON for browser map rendering.
- Choropleth maps use ECharts `layoutCenter` and `layoutSize` instead of fixed top/right/bottom/left bounds so the map keeps its aspect ratio when the panel or browser size changes.
- The `Map fill size` edit control adjusts how large the map appears inside the chart area without stretching the geography.
- The default choropleth value field is `infectionsPer10000`, not raw cumulative infections.
- The animated choropleth panel uses the same harmonized data with a selectable start/end date range and a timeline slider in view mode.
- Keep the dashboard-ready CSV in `public/data/**`.
- Do not make end users run Python or Docker to prepare data.
- If future raw files are large or include unused event types, prepare a smaller CSV before adding it to the dashboard.
- For a different choropleth, the most important fields are the join field, value field, and GeoJSON code property.
