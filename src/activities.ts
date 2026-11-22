import { supplierUrls } from './config';
import type { SupplierHotel } from './types';

type SupplierId = keyof typeof supplierUrls;

function isSupplierHotel(value: unknown): value is SupplierHotel {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.hotelId === 'string' &&
    typeof row.name === 'string' &&
    row.name.trim().length > 0 &&
    typeof row.city === 'string' &&
    typeof row.price === 'number' &&
    Number.isFinite(row.price) &&
    row.price >= 0 &&
    typeof row.commissionPct === 'number' &&
    Number.isFinite(row.commissionPct)
  );
}

export async function fetchSupplierHotels(
  supplier: SupplierId,
  city: string,
): Promise<SupplierHotel[]> {
  const url = new URL(supplierUrls[supplier]);
  url.searchParams.set('city', city);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const hotels: unknown = await response.json();
    if (!Array.isArray(hotels) || !hotels.every(isSupplierHotel)) {
      throw new Error('Invalid supplier response');
    }
    return hotels.filter((hotel) => hotel.city.trim().toLowerCase() === city);
  } catch (error) {
    console.warn(`Supplier ${supplier} request failed for ${city}`, error);
    throw error;
  }
}
