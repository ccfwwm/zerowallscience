# Climate trends — a non-bio example project

Real global temperature data, small enough to analyze in seconds, rich enough
for a genuine end-to-end workflow: trend estimation, decadal comparison, a
publication-quality figure, and a report with every number traced to code.

## Data

`data/gistemp_global_means.csv` — **NASA GISS Surface Temperature Analysis
(GISTEMP v4)**, Land-Ocean Temperature Index, global means.

- Values are temperature **anomalies in °C relative to the 1951–1980 mean**.
- Columns: `Year`, monthly anomalies (`Jan`…`Dec`), annual mean `J-D`,
  December-to-November mean `D-N`, and seasonal means (`DJF`, `MAM`, `JJA`,
  `SON`). Missing values are `***`. Note the file's first line is a title —
  the header is on line 2 (`skiprows=1` in pandas).
- Source: <https://data.giss.nasa.gov/gistemp/> (retrieved 2026-07-03; NASA
  data, public domain). Cite as: GISTEMP Team, GISS Surface Temperature
  Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies.

## Suggested workflow

1. Load the annual (`J-D`) series and plot it with a smoothed trend.
2. Compare decadal means (1880s vs 1990s vs 2010s) and quantify the warming
   rate (°C/decade) over the full record and over 1975–present.
3. Save the figure and write a short report — every number from code output.
