import { z } from 'zod'
export const episodeCatalogSchema = z.object({
  media_type: z.literal('series'), media_id: z.string(), stale: z.boolean(),
  items: z.array(z.object({
    id: z.string(), title: z.string(), season: z.number().int().nonnegative().nullable(), episode: z.number().int().nonnegative().nullable(),
    released: z.string().optional(), overview: z.string().optional(), thumbnail: z.string().optional(),
    releasePrecision: z.enum(['date','instant','unknown']), releaseState: z.enum(['released','upcoming','unknown']),
    releaseConflicting: z.boolean(), videoIds: z.array(z.string()), addonIds: z.array(z.string()), watched: z.boolean(), position_seconds: z.number(),
  })),
  sources: z.array(z.object({ addonId:z.string(),fetchedAt:z.string().nullable(),stale:z.boolean(),error:z.string().optional() })),
})
