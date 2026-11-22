# Hotel Offer Orchestrator

A Node.js and TypeScript API that compares hotel prices from two mock suppliers. Express serves the routes, Temporal runs the comparison, and Redis stores the results and applies price filters.

## Run in GitHub Codespaces

On this repository's GitHub page, select **Code → Codespaces → Create codespace on main**. When the browser editor opens, select **Terminal → New Terminal** and run the commands below from the repository root. The Codespace runs the containers, so you can use this setup without installing Docker Desktop on your computer.

```bash
docker compose up --build -d
docker compose ps
```

Once `api`, `worker`, `redis`, and `temporal` are running, send a few requests from the same terminal.

```bash
curl -fsS "http://localhost:3000/health"
curl -fsS "http://localhost:3000/api/hotels?city=delhi"
curl -fsS "http://localhost:3000/api/hotels?city=delhi&minPrice=5300&maxPrice=5500"
curl -fsS "http://localhost:3000/api/hotels?city=jaipur"
```

Delhi returns Holtin and Radison. The filtered request returns only Holtin, and Jaipur returns an empty array.

To inspect a workflow, open the **Ports** tab, forward port **8233**, and open the forwarded address for the Temporal UI. After sending the first Delhi request, look for a `compareHotelOffers` workflow to see the two supplier activities. You can also query the cached price range directly from the terminal.

```bash
docker compose exec redis redis-cli ZRANGE hotel-offers:v1:delhi 5300 5500 BYSCORE
```

If a container exits or a request fails, check the status and logs.

```bash
docker compose ps -a
docker compose logs --tail=50 api worker redis temporal
```

When finished, run `docker compose down`, then stop the Codespace from [Your codespaces](https://github.com/codespaces).

## Run locally or on a Docker host

With Docker and Compose installed, run the same commands from the project directory.

```sh
docker compose up --build -d
docker compose ps
```

The API listens on port 3000 and the Temporal UI listens on port 8233. Compose binds both ports to the host's loopback interface. For a demo on a remote Docker host, access them through an SSH tunnel. The stack uses a Temporal development server and treats cached results and workflow history as disposable.

## Endpoints

| Request | Expected result |
| --- | --- |
| `GET /api/hotels?city=delhi` | Holtin at 5340 from Supplier B and Radison at 5900 from Supplier A |
| `GET /api/hotels?city=delhi&minPrice=5300&maxPrice=5500` | Holtin only |
| `GET /api/hotels?city=mumbai` | Sea View and Harbour Inn, one from each supplier |
| `GET /api/hotels?city=jaipur` | An empty array with HTTP 200 |
| `GET /supplierA/hotels?city=delhi` | Supplier A mock offers before comparison |
| `GET /supplierB/hotels?city=delhi` | Supplier B mock offers before comparison |
| `GET /health` | Status of each supplier, with HTTP 503 if either supplier is down |

The mock routes also accept requests without a city and return all their available offers.

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

`city` is required for hotel searches and is trimmed and compared case-insensitively. Price bounds are optional and inclusive. Either bound can be used on its own, and invalid bounds or repeated query parameters return HTTP 400. Results are ordered by ascending price.

## How the search works

1. The API checks Redis for the normalized city. On a cache miss, it starts a Temporal workflow and waits for the result.
2. The workflow starts one HTTP activity per supplier in parallel. It groups offers by hotel name, ignoring case and outer whitespace, and keeps the lowest priced offer with that supplier's commission. Supplier A wins ties between the two suppliers.
3. The API writes the full deduplicated list to a Redis sorted set with prices as scores and a five-minute TTL. A sentinel with a negative score allows empty cities to be cached. The API queries the sorted set by score on both cold and warm requests, so filtering always happens in Redis.

If a supplier call fails, Temporal retries it once. If comparison still fails on a cache miss, the API returns HTTP 502. Cached results remain available until expiry. A Redis error returns HTTP 503.

## Run the Postman collection

In Codespaces, run the collection from the terminal with Newman.

```bash
npx --yes newman@6.2.2 run postman/Hotel_Offer_Orchestrator.postman_collection.json
```

Expect **8 requests, 16 assertions, and 0 failures**. For a local Compose stack, you can import [the collection](postman/Hotel_Offer_Orchestrator.postman_collection.json) into Postman and run it with `baseUrl` set to `http://localhost:3000`.

### Simulate a supplier outage

In the Codespaces terminal, recreate the API with Supplier B disabled and clear the Delhi cache key.

```bash
MOCK_SUPPLIER_B_DOWN=true docker compose up -d api
docker compose exec redis redis-cli DEL hotel-offers:v1:delhi
curl -si "http://localhost:3000/health"
curl -si "http://localhost:3000/api/hotels?city=delhi"
```

The health check returns HTTP 503 and reports Supplier B as down. The fresh Delhi search returns HTTP 502 after the activity retry. Restore Supplier B before rerunning the Postman collection.

```bash
MOCK_SUPPLIER_B_DOWN=false docker compose up -d api
```
