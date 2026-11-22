import type { SupplierHotel } from './types';

export const supplierHotels = {
  A: [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    { hotelId: 'a3', name: 'Sea View', price: 4000, city: 'mumbai', commissionPct: 12 },
  ],
  B: [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Radison', price: 6300, city: 'delhi', commissionPct: 16 },
    { hotelId: 'b3', name: 'Harbour Inn', price: 4500, city: 'mumbai', commissionPct: 11 },
  ],
} satisfies Record<string, SupplierHotel[]>;
