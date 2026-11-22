export const port = Number(process.env.PORT ?? 3000);
export const temporalAddress = process.env.TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
export const taskQueue = 'hotel-offers';

const supplierBaseUrl = process.env.SUPPLIER_BASE_URL ?? `http://127.0.0.1:${port}`;
export const supplierPaths = {
  A: '/supplierA/hotels',
  B: '/supplierB/hotels',
};
export const supplierUrls = {
  A: new URL(supplierPaths.A, supplierBaseUrl).toString(),
  B: new URL(supplierPaths.B, supplierBaseUrl).toString(),
};
