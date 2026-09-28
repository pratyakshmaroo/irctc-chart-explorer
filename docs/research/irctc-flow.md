# IRCTC Online Charts — Verified Network Flow

Status: **VERIFIED LIVE** from this Termux/Android phone on **2026-09-24** using train **22637 (WESTCOAST SF EXP)**, journey date **2026-09-24**, boarding **MAS**, class **2A** (coach A1).

All five requests below were reproduced from Termux with **Node's built-in `fetch`** and returned HTTP 200 with real data (no mock data, no auth, no cookies, no CAPTCHA).

---

## Reproducibility from Termux (important)

| Client | Result |
|---|---|
| `curl` (HTTP/2, default fingerprint) | **BLOCKED** — stream reset by server after TLS (Akamai WAF fingerprints `curl`'s TLS/HTTP2 signature) |
| `curl --http1.1` | **BLOCKED** — timeout, 0 bytes |
| **Node `fetch` (undici)** | **WORKS** — 200 on all 5 endpoints |

Other scripted clients (Python `requests`, etc.) are untested; expect the same fingerprinting risk as `curl`. Use **Node fetch** (or a real browser) for any programmatic access. Do not attempt to defeat Akamai — if a client is blocked, use a working one or stop.

---

## Endpoints (all verified)

### 1. Train autocomplete
- `GET https://www.irctc.co.in/eticketing/trainList`
- Headers: `Accept: application/json`
- Response 200: a plain **comma-separated string** of `"<trainNo> - <trainName>"` entries:
  ```
  "22637 - WEST COAST SFEXP","22638 - WEST COAST SFEXP","20452 - NDLS SGAC SF EX",...
  ```
- No request params needed.

### 2. Train schedule / full route station list
- `GET https://www.irctc.co.in/eticketing/protected/mapps1/trnscheduleenquiry/<trainNo>`
- Headers: `greq: <epoch milliseconds>` (e.g. `new Date().getTime()`), `bmirak: "webbm"`
- Response 200 JSON:
  ```
  trainNumber, trainName, stationFrom, stationTo, trainOwner,
  trainRunsOnMon..Sun,
  stationList: [ { stationCode, stationName, arrivalTime, departureTime,
                   routeNumber, haltTime, distance, dayCount,
                   stnSerialNumber, boardingDisabled, status } ]
  ```
- `stationList` is the **source of truth for the full route order** (29 stations in the test). The train-composition API does **not** return a route station list.

### 3. Train composition (coach list + chart metadata)
- `POST https://www.irctc.co.in/online-charts/api/trainComposition`
- Headers: `Content-Type: application/json`, `Accept: application/json`
- Body: `{ "trainNo": "22637", "jDate": "2026-09-24", "boardingStation": "MAS" }`
  - `jDate` format is **`yyyy-MM-dd`**.
- Response 200 JSON keys:
  ```
  cdd: [ { coachName, classCode, positionFromEngine, vacantBerths } ]   // coach list
  trainNo, trainName, from, to, trainStartDate,
  remoteLocationChartDate, remote, nextRemote, avlRemoteForBooking,
  destinationStation, chartOneDate ("yyyy-MM-dd HH:mm:ss"), chartTwoDate (nullable),
  status, error
  ```
- `remote` / `nextRemote` are TTE booking boundary stations; `from` = source station code; `trainStartDate` is already `yyyy-MM-dd` (reuse it as `jDate` for downstream calls).

### 4. Class-wise vacant berth list
- `POST https://www.irctc.co.in/online-charts/api/vacantBerth`
- Headers: `Content-Type: application/json`, `Accept: application/json`
- Body:
  ```json
  { "trainNo": "22637", "boardingStation": "MAS",
    "remoteStation": "MAS", "trainSourceStation": "MAS",
    "jDate": "2026-09-24", "cls": "2A", "chartType": 1 }
  ```
- Response 200 JSON: `{ "vbd": [ ...vacant berth rows... ], "error": null }`
- `vbd` row keys: `{ coachName, cabinCoupe, cabinCoupeNo, berthCode, berthNumber, from, to, splitNo }`
  - Each row = **one vacant berth with the free segment `from`→`to`** and the charing `splitNo`.
  - Test: 69 rows for coach A1 (2A), e.g. berth 1 (L) free **TUP→CBE**.
- **Pagination target:** this list is small (tens of rows per class) — 10/25/50/100/All pagination is trivially client-side.

### 5. Coach composition (per-berth occupancy layout)
- `POST https://www.irctc.co.in/online-charts/api/coachComposition`
- Headers: `Content-Type: application/json`, `Accept: application/json`
- Body:
  ```json
  { "trainNo": "22637", "boardingStation": "MAS",
    "remoteStation": "MAS", "trainSourceStation": "MAS",
    "jDate": "2026-09-24", "coach": "A1", "cls": "2A" }
  ```
- Response 200 JSON: `{ "bdd": [ ...berths... ], "coachName": "A1", "error": null }`
- `bdd` row keys: `{ cabinCoupe, cabinCoupeNameNo, berthCode, berthNo, from, to, bsd, quotaCntStn, enable }`
  - `enable: false` = berth out of service / not bookable.
  - `bsd` = **booking-segment details** per berth, the key data for "availability across boarding stations":
    `[ { splitNo, from, to, quota, occupancy } ]`
  - Observed on berth 1 (A1): split1 `MAS→TUP` (GN, occupancy true), split2 `TUP→CBE` (GN, false), split3 `CBE→MAQ` (GN, ...)
  - **`occupancy` semantics CONFIRMED during Phase 2 live CLI run** (22637, 2026-09-24, 2A): `occupancy: true` = occupied, `false` = vacant. Every row in the `vacantBerth` `vbd` response corresponds one-to-one to a `bsd` segment with `occupancy: false` (e.g. berth 1 `TUP→CBE` vacant ↔ `s2:TUP->CBE:GN:occ=false`). Both APIs are consistent.

### Confirmed quirk: `cdd.vacantBerths` is not reliable
On the Phase 2 live run, `trainComposition.cdd[].vacantBerths` was `0` for **all** coaches/classes while `vacantBerth` (chartType 1) returned 69 rows for 2A. Do not use `cdd.vacantBerths` as a vacancy summary — the authoritative per-class vacancy comes from the `vacantBerth` API. Also, a coach name is not unique across classes (observed `HA1` once as `1A` and once as `2A`); always pair coach name with `classCode`.

---

## Call order (as the page executes it)

```
1. GET  trainList                                    → pick train → train no
2. GET  trnscheduleenquiry/<trainNo>                 → boarding-station dropdown (full route)
3. POST trainComposition  {trainNo, jDate, boardingStation}
     └─ supplies from / remote / nextRemote / trainStartDate / cdd (coaches)
4. POST vacantBerth       {...per class... cls, chartType}   → vbd (vacant rows)
5. POST coachComposition  {...coach, cls}                     → bdd (per-berth layout)
```

## Caveats / notes for later phases

- **`chartType`:** `1` was used and verified. The page offers First/Second chart; a `2` variant exists in the UI but was **not** tested here.
- **Berth codes vary by class.** Coach A1 (2A) used `L`/`U`/`P`/`R`; Sleeper/3A coaches typically use `LB`/`UB`/`MB`/`SL`/`SU`. Mapping must be class-aware and confirmed against real coaches (3A/SL) in a later phase.
- **No route station list in `trainComposition`** (verified: `stationList` key absent). Always use schedule enquiry for station ordering.
- Raw captures (comp.json / vb.json / cc.json) are session-local and were not committed; this ticket documents the verified shapes.
- Rate limiting: keep the request count low and space calls out; these endpoints are public but operated by CRIS — be polite.

## Local development workflow

- Run `npm run dev` for the static Vite React frontend at `http://127.0.0.1:5173`. No backend needed — the browser calls IRCTC directly.
- Run `npm run build` to write the static site to `frontend/dist/` for GitHub Pages.
- `npm run chart -- <trainNo> <date> <boarding>` still works as a Node CLI for debugging.
- The old Node API server (`src/server.ts`) and dual runner (`src/dev.ts`) were removed; `frontend/src` is the only application.
