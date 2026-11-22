# Hotel Offer Orchestrator

A Node.js and TypeScript API that compares hotel prices from two mock suppliers. Express serves the routes, Temporal runs the comparison, and Redis stores the results and applies price filters.

## Run with Docker Compose

Install Docker Desktop with Docker Compose enabled, then run this from the project directory.

```sh
docker compose up --build -d
docker compose ps
```

- API and mock suppliers at [http://localhost:3000](http://localhost:3000)
- Temporal UI and workflow history at [http://localhost:8233](http://localhost:8233)

The Compose stack uses a Temporal development server and binds the exposed ports to the host's loopback interface. The Redis cache and Temporal workflow history are disposable for the assessment. Run the same Compose command on a Docker host for a demo deployment and access it locally on that host or through an SSH tunnel.

```sh
docker compose logs -f api worker
docker compose down
```

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

## Test with Postman

Import `postman/Hotel_Offer_Orchestrator.postman_collection.json` and run the collection against the Compose stack. It checks deduplication, cheapest supplier and commission, price ranges, a city with no results, invalid input, and supplier health.

To simulate a supplier outage, create a `.env` file with `MOCK_SUPPLIER_B_DOWN=true` and run:

```sh
docker compose up -d api
docker compose exec redis redis-cli DEL hotel-offers:v1:delhi
```

Now `/health` returns 503 and marks Supplier B down. A fresh `/api/hotels?city=delhi` request returns 502 after the activity retry. Set the flag back to `false` and run `docker compose up -d api` to restore service.

## GitHub submission

Create a repository on GitHub and push the files in this project directory. Start with an empty repository so the first push does not need to merge generated files.

```sh
git init
git add .
git commit -m "Build hotel offer orchestrator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hotel-offer-orchestrator.git
git push -u origin main
```
