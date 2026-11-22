import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import express, { type ErrorRequestHandler } from 'express';
import { connectCache, disconnectCache, readOffers, saveOffers } from './cache';
import { port, supplierPaths, supplierUrls, taskQueue, temporalAddress } from './config';
import { supplierHotels } from './mock-suppliers';
import type { compareHotelOffers } from './workflows';

function parsePrice(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return NaN;
  const price = Number(value);
  return Number.isFinite(price) ? price : NaN;
}

async function supplierHealth(url: string): Promise<'up' | 'down'> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

async function main(): Promise<void> {
  const connection = await Connection.connect({ address: temporalAddress, connectTimeout: 5000 });
  const temporal = new Client({ connection });
  await connectCache();
  const app = express();

  for (const supplier of ['A', 'B'] as const) {
    app.get(supplierPaths[supplier], (req, res) => {
      if (process.env[`MOCK_SUPPLIER_${supplier}_DOWN`] === 'true') {
        res.status(503).json({ error: `Supplier ${supplier} is unavailable` });
        return;
      }

      const city = req.query.city;
      if (city !== undefined && (typeof city !== 'string' || !city.trim())) {
        res.status(400).json({ error: 'city must be a non-empty string' });
        return;
      }

      const hotels = supplierHotels[supplier];
      const normalizedCity = city?.trim().toLowerCase();
      res.json(normalizedCity ? hotels.filter((hotel) => hotel.city === normalizedCity) : hotels);
    });
  }

  app.get('/health', async (_req, res) => {
    const [supplierA, supplierB] = await Promise.all([
      supplierHealth(supplierUrls.A),
      supplierHealth(supplierUrls.B),
    ]);
    const healthy = supplierA === 'up' && supplierB === 'up';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      suppliers: { supplierA, supplierB },
    });
  });

  app.get('/api/hotels', async (req, res) => {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
    if (!city || city.length > 100) {
      res.status(400).json({ error: 'city must be a non-empty string up to 100 characters' });
      return;
    }

    const minPrice = parsePrice(req.query.minPrice) ?? 0;
    const maxPrice = parsePrice(req.query.maxPrice) ?? Infinity;
    if (Number.isNaN(minPrice) || Number.isNaN(maxPrice) || minPrice > maxPrice) {
      res.status(400).json({ error: 'Price bounds must be non-negative numbers with minPrice <= maxPrice' });
      return;
    }

    const redisMax = maxPrice === Infinity ? '+inf' : maxPrice;
    const cached = await readOffers(city, minPrice, redisMax);
    if (cached !== null) {
      res.json(cached);
      return;
    }

    let offers;
    try {
      offers = await temporal.workflow.execute<typeof compareHotelOffers>('compareHotelOffers', {
        args: [city],
        workflowId: `hotel-offers-${randomUUID()}`,
        taskQueue,
        workflowExecutionTimeout: '15 seconds',
      });
    } catch (error) {
      console.error('Hotel comparison workflow failed', { city, error });
      res.status(502).json({ error: 'Could not compare hotel offers' });
      return;
    }

    await saveOffers(city, offers);
    const results = await readOffers(city, minPrice, redisMax);
    if (results === null) throw new Error('Hotel cache was unavailable after write');
    res.json(results);
  });

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error('Hotel API error', error);
    res.status(503).json({ error: 'Hotel search is temporarily unavailable' });
  };
  app.use(handleError);

  const server = app.listen(port, () => console.info(`Hotel API listening on port ${port}`));
  function shutdown(): void {
    server.close(async () => {
      disconnectCache();
      await connection.close();
    });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error) => {
  console.error('Could not start the Hotel API', error);
  process.exit(1);
});
