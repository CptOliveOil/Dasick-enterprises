import { z } from 'zod';
import { opportunityBreakdownSchema } from './youtube';

export const etsyOpportunitySchema = z.object({
  product: z.string().min(3),
  target_customer: z.string().min(3),
  problem: z.string().min(5),
  demand: z.string().min(3),
  competition: z.string().min(3),
  pricing_range: z.string().min(1),
  seasonality: z.string().min(3),
  production_difficulty: z.string().min(3),
  seo_opportunity: z.string().min(3),
  market_gap: z.string().min(3),
  profit_potential: z.string().min(3),
  breakdown: opportunityBreakdownSchema,
});

export const etsyOpportunitiesResponseSchema = z.object({
  opportunities: z.array(etsyOpportunitySchema).min(1).max(20),
});

export type EtsyOpportunityOutput = z.infer<typeof etsyOpportunitySchema>;

export const etsyListingResponseSchema = z.object({
  title: z.string().min(10).max(140),
  description: z.string().min(40),
  /** Etsy allows thirteen. */
  tags: z.array(z.string()).min(1).max(13),
  keywords: z.array(z.string()).default([]),
  category_suggestions: z.array(z.string()).default([]),
  price_suggestion: z.number().nonnegative(),
  benefits: z.array(z.string()).default([]),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  image_brief: z.string().min(10),
});

export type EtsyListingOutput = z.infer<typeof etsyListingResponseSchema>;

export const keywordResponseSchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(2),
        search_volume: z.string(),
        competition: z.string(),
        relevance: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

export type KeywordOutput = z.infer<typeof keywordResponseSchema>;
