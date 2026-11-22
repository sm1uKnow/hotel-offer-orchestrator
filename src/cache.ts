import { createClient } from 'redis';
import type { HotelOffer } from './types';

const redis = createClient({
  url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  disableOfflineQueue: true,
  socket: { connectTimeout: 3000 },
});
redis.on('error', (error) => console.error('Redis connection error', error));

const ttlSeconds = 300;
const marker = { score: -1, value: 'cache-ready' };

function cityKey(city: string): string {
  return `hotel-offers:v1:${city}`;
}

export async function connectCache(): Promise<void> {
  await redis.connect();
}

export function disconnectCache(): void {
  redis.destroy();
}

export async function readOffers(
  city: string,
  minPrice: number,
  maxPrice: number | '+inf',
): Promise<HotelOffer[] | null> {
  const key = cityKey(city);
  // Read existence and prices atomically so expiry cannot split the two lookups.
  const [exists, offers] = await redis
    .multi()
    .exists(key)
    .zRangeByScore(key, minPrice, maxPrice)
    .execTyped();
  if (!exists) return null;

  return offers.map((offer) => JSON.parse(offer) as HotelOffer);
}

export async function saveOffers(city: string, offers: HotelOffer[]): Promise<void> {
  const key = cityKey(city);
  const members = offers.map((offer) => ({ score: offer.price, value: JSON.stringify(offer) }));
  // The negative score marks a cached empty city and stays outside all API ranges.
  await redis.multi().del(key).zAdd(key, [marker, ...members]).expire(key, ttlSeconds).exec();
}
