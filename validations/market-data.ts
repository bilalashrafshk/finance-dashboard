
import { z } from 'zod';

export const AssetCategoryEnum = z.enum([
    'crypto',
    'equity',
    'pk-equity', // Legacy/Specific
    'us-equity', // Legacy/Specific
    'macro',
    'financials',
    'dividend',
    'index',
    'kse100', // New
    'spx500', // Legacy
    'metals', // Legacy
    'commodity',
    'commodities', // Supports DB value
]);

export type AssetCategory = z.infer<typeof AssetCategoryEnum>;

export const priceQuerySchema = z.object({
    symbol: z.string().trim().min(1).toUpperCase(),
    interval: z.enum(['1d', '1wk', '1mo']).optional(),
    refresh: z.string().transform((val) => val === 'true').optional(),
});

export const batchPriceSchema = z.object({
    tokens: z.array(
        z.object({
            symbol: z.string().trim().min(1).toUpperCase(),
            type: AssetCategoryEnum,
        })
    ).min(1),
});

export const ingestDataSchema = z.object({
    symbol: z.string().trim().min(1).toUpperCase(),
    price: z.number().positive(),
    date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), // ISO or YYYY-MM-DD
    source: z.string().min(1),
    assetType: AssetCategoryEnum,
});
