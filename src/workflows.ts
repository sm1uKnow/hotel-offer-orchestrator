import { log, proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type { HotelOffer, Supplier, SupplierHotel } from './types';

const { fetchSupplierHotels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 seconds',
  retry: { maximumAttempts: 2, initialInterval: '250 milliseconds' },
});

export async function compareHotelOffers(city: string): Promise<HotelOffer[]> {
  try {
    const [supplierA, supplierB] = await Promise.all([
      fetchSupplierHotels('A', city),
      fetchSupplierHotels('B', city),
    ]);

    const bestOffers = new Map<string, HotelOffer>();
    const supplierResults: [Supplier, SupplierHotel[]][] = [
      ['Supplier A', supplierA],
      ['Supplier B', supplierB],
    ];

    for (const [supplier, hotels] of supplierResults) {
      for (const { name, price, commissionPct } of hotels) {
        const key = name.trim().toLowerCase();
        const currentOffer = bestOffers.get(key);
        if (!currentOffer || price < currentOffer.price) {
          bestOffers.set(key, { name: name.trim(), price, supplier, commissionPct });
        }
      }
    }

    log.info('Compared hotel offers', { city, count: bestOffers.size });
    return [...bestOffers.values()];
  } catch (error) {
    log.error('Hotel comparison failed', { city });
    throw error;
  }
}
