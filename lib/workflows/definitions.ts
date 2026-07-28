import { stableId } from '@/lib/ids';
import type { WorkflowDefinition } from '@/types/domain';

const timestamp = '2024-01-01T00:00:00.000Z';

/**
 * Reusable workflow definitions. Steps declare a *capability*, not an agent —
 * the engine resolves capability → concrete agent at run time, so adding a
 * replacement agent does not require editing workflows.
 */
export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    id: stableId('workflow:youtube_video'),
    owner_id: null,
    business_id: null,
    key: 'youtube_video',
    name: 'YouTube Video',
    description:
      'Full pipeline from idea through research, script, fact check, thumbnail and production plan.',
    steps: [
      {
        key: 'ideas',
        title: 'Generate ideas',
        capability: 'youtube.research.ideas',
        depends_on: [],
        requires_approval: true,
        approval_label: 'Approve video idea',
      },
      {
        key: 'research',
        title: 'Research package',
        capability: 'youtube.research.package',
        depends_on: ['ideas'],
        requires_approval: false,
      },
      {
        key: 'script',
        title: 'Write script',
        capability: 'youtube.script.write',
        depends_on: ['research'],
        requires_approval: false,
      },
      {
        key: 'fact_check',
        title: 'Fact check',
        capability: 'youtube.script.factcheck',
        depends_on: ['script'],
        requires_approval: true,
        approval_label: 'Approve script',
      },
      {
        key: 'thumbnail',
        title: 'Thumbnail concepts',
        capability: 'youtube.thumbnail.concepts',
        depends_on: ['fact_check'],
        requires_approval: true,
        approval_label: 'Approve thumbnail set',
      },
      {
        key: 'production',
        title: 'Production plan',
        capability: 'youtube.production.plan',
        depends_on: ['fact_check'],
        requires_approval: true,
        approval_label: 'Approve final video',
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:youtube_ideas'),
    owner_id: null,
    business_id: null,
    key: 'youtube_ideas',
    name: 'YouTube Idea Generator',
    description: 'Generate and score video opportunities for a channel.',
    steps: [
      {
        key: 'ideas',
        title: 'Generate ideas',
        capability: 'youtube.research.ideas',
        depends_on: [],
        requires_approval: false,
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:youtube_script'),
    owner_id: null,
    business_id: null,
    key: 'youtube_script',
    name: 'YouTube Script',
    description: 'Turn an approved idea into a research package, a script and a fact check.',
    steps: [
      {
        key: 'research',
        title: 'Research package',
        capability: 'youtube.research.package',
        depends_on: [],
        requires_approval: false,
      },
      {
        key: 'script',
        title: 'Write script',
        capability: 'youtube.script.write',
        depends_on: ['research'],
        requires_approval: false,
      },
      {
        key: 'fact_check',
        title: 'Fact check',
        capability: 'youtube.script.factcheck',
        depends_on: ['script'],
        requires_approval: true,
        approval_label: 'Approve script',
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:etsy_product'),
    owner_id: null,
    business_id: null,
    key: 'etsy_product',
    name: 'Etsy Product',
    description: 'Research an opportunity, then draft an optimised listing for approval.',
    steps: [
      {
        key: 'research',
        title: 'Product research',
        capability: 'etsy.research.opportunities',
        depends_on: [],
        requires_approval: true,
        approval_label: 'Approve product opportunity',
      },
      {
        key: 'keywords',
        title: 'Keyword research',
        capability: 'seo.keywords',
        depends_on: ['research'],
        requires_approval: false,
      },
      {
        key: 'listing',
        title: 'Draft listing',
        capability: 'etsy.listing.write',
        depends_on: ['keywords'],
        requires_approval: true,
        approval_label: 'Approve Etsy listing',
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:channel_analysis'),
    owner_id: null,
    business_id: null,
    key: 'channel_analysis',
    name: 'Channel Performance Analysis',
    description: 'Analyse recorded analytics and refresh channel intelligence.',
    steps: [
      {
        key: 'analyse',
        title: 'Analyse performance',
        capability: 'youtube.analytics.analyse',
        depends_on: [],
        requires_approval: false,
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
];

export function findWorkflow(key: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.key === key);
}
