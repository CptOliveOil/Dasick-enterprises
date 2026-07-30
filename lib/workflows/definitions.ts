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
    id: stableId('workflow:youtube_video_full'),
    owner_id: null,
    business_id: null,
    key: 'youtube_video_full',
    name: 'Faceless YouTube Video',
    description:
      'The complete production pipeline: idea through research, script, fact check, narration, visuals, assets, thumbnail, metadata, assembly and quality control, to a video ready for publishing.',
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
        // The gate everything else waits behind: no production work begins
        // until the operator has approved the script.
        requires_approval: true,
        approval_label: 'Approve script',
      },
      {
        key: 'voiceover_plan',
        title: 'Plan narration',
        capability: 'youtube.voiceover.plan',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'voiceover',
        title: 'Generate narration',
        capability: 'youtube.voiceover.generate',
        depends_on: ['voiceover_plan'],
        requires_approval: false,
      },
      {
        key: 'visual_plan',
        title: 'Plan visuals',
        capability: 'youtube.visual_plan',
        depends_on: ['voiceover'],
        requires_approval: false,
      },
      {
        key: 'assets',
        title: 'Source scene assets',
        capability: 'youtube.asset_generate',
        depends_on: ['visual_plan'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_concepts',
        title: 'Thumbnail concepts',
        capability: 'youtube.thumbnail.concepts',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_images',
        title: 'Render thumbnail candidates',
        capability: 'youtube.thumbnail.generate',
        depends_on: ['thumbnail_concepts'],
        requires_approval: false,
      },
      {
        key: 'metadata',
        title: 'Write metadata',
        capability: 'youtube.metadata',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'assembly',
        title: 'Assemble video',
        capability: 'youtube.video_assemble',
        depends_on: ['assets', 'metadata'],
        requires_approval: false,
      },
      {
        key: 'quality_check',
        title: 'Quality check',
        capability: 'youtube.quality_check',
        depends_on: ['assembly', 'thumbnail_images'],
        // Quality control raises the final approval itself, carrying the QC
        // verdict, so this step declares no separate gate.
        requires_approval: false,
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:pokemon_youtube_video'),
    owner_id: null,
    business_id: null,
    key: 'pokemon_youtube_video',
    name: 'Pokémon YouTube Video',
    description:
      'Pokémon research from the specialist, then the ordinary faceless production pipeline: script, fact check, narration, visuals, assets, thumbnail, metadata, assembly and quality control.',
    steps: [
      {
        // The only step that is new. Everything after it is the existing
        // pipeline, run by the existing agents — the specialist replaces the
        // general research step and changes nothing else.
        key: 'research',
        title: 'Pokémon research',
        capability: 'pokemon.research.ideas',
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
        // The same gate as every other video: no production work and no
        // spending until the operator has approved the script.
        requires_approval: true,
        approval_label: 'Approve script',
      },
      {
        key: 'voiceover_plan',
        title: 'Plan narration',
        capability: 'youtube.voiceover.plan',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'voiceover',
        title: 'Generate narration',
        capability: 'youtube.voiceover.generate',
        depends_on: ['voiceover_plan'],
        requires_approval: false,
      },
      {
        key: 'visual_plan',
        title: 'Plan visuals',
        capability: 'youtube.visual_plan',
        depends_on: ['voiceover'],
        requires_approval: false,
      },
      {
        key: 'assets',
        title: 'Source scene assets',
        capability: 'youtube.asset_generate',
        depends_on: ['visual_plan'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_concepts',
        title: 'Thumbnail concepts',
        capability: 'youtube.thumbnail.concepts',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_images',
        title: 'Render thumbnail candidates',
        capability: 'youtube.thumbnail.generate',
        depends_on: ['thumbnail_concepts'],
        requires_approval: false,
      },
      {
        key: 'metadata',
        title: 'Write metadata',
        capability: 'youtube.metadata',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'assembly',
        title: 'Assemble video',
        capability: 'youtube.video_assemble',
        depends_on: ['assets', 'metadata'],
        requires_approval: false,
      },
      {
        key: 'quality_check',
        title: 'Quality check',
        capability: 'youtube.quality_check',
        depends_on: ['assembly', 'thumbnail_images'],
        requires_approval: false,
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:islamic_youtube_video'),
    owner_id: null,
    business_id: null,
    key: 'islamic_youtube_video',
    name: 'Islamic YouTube Video',
    description:
      'Sourced Islamic research, verified before a word is written and reviewed again after, then the ordinary production pipeline.',
    steps: [
      {
        key: 'research',
        title: 'Islamic research package',
        capability: 'islamic.research',
        depends_on: [],
        requires_approval: false,
      },
      {
        // Verification comes *before* the script, so a bad citation is caught
        // while it is one line in a package rather than woven into narration
        // that has already been recorded.
        key: 'source_check',
        title: 'Verify sources',
        capability: 'islamic.source_verify',
        depends_on: ['research'],
        requires_approval: false,
      },
      {
        key: 'script',
        title: 'Write script',
        capability: 'youtube.script.write',
        depends_on: ['source_check'],
        requires_approval: false,
      },
      {
        key: 'script_review',
        title: 'Islamic script review',
        capability: 'islamic.script_review',
        depends_on: ['script'],
        requires_approval: false,
      },
      {
        key: 'fact_check',
        title: 'Fact check',
        capability: 'youtube.script.factcheck',
        depends_on: ['script_review'],
        // The same gate as every other video: nothing is produced and no money
        // is spent until the operator has read the script.
        requires_approval: true,
        approval_label: 'Approve script',
      },
      // Everything below is the existing production pipeline, unchanged. There
      // is no second media pipeline for Islamic content.
      {
        key: 'voiceover_plan',
        title: 'Plan narration',
        capability: 'youtube.voiceover.plan',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'voiceover',
        title: 'Generate narration',
        capability: 'youtube.voiceover.generate',
        depends_on: ['voiceover_plan'],
        requires_approval: false,
      },
      {
        key: 'visual_plan',
        title: 'Plan visuals',
        capability: 'youtube.visual_plan',
        depends_on: ['voiceover'],
        requires_approval: false,
      },
      {
        key: 'assets',
        title: 'Source scene assets',
        capability: 'youtube.asset_generate',
        depends_on: ['visual_plan'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_concepts',
        title: 'Thumbnail concepts',
        capability: 'youtube.thumbnail.concepts',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'thumbnail_images',
        title: 'Render thumbnail candidates',
        capability: 'youtube.thumbnail.generate',
        depends_on: ['thumbnail_concepts'],
        requires_approval: false,
      },
      {
        key: 'metadata',
        title: 'Write metadata',
        capability: 'youtube.metadata',
        depends_on: ['fact_check'],
        requires_approval: false,
      },
      {
        key: 'assembly',
        title: 'Assemble video',
        capability: 'youtube.video_assemble',
        depends_on: ['assets', 'metadata'],
        requires_approval: false,
      },
      {
        key: 'quality_check',
        title: 'Quality check',
        capability: 'youtube.quality_check',
        depends_on: ['assembly', 'thumbnail_images'],
        requires_approval: false,
      },
    ],
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: stableId('workflow:islamic_research'),
    owner_id: null,
    business_id: null,
    key: 'islamic_research',
    name: 'Islamic Research and Verification',
    description: 'Research a topic and verify its sources, without producing a video.',
    steps: [
      {
        key: 'research',
        title: 'Islamic research package',
        capability: 'islamic.research',
        depends_on: [],
        requires_approval: false,
      },
      {
        key: 'source_check',
        title: 'Verify sources',
        capability: 'islamic.source_verify',
        depends_on: ['research'],
        requires_approval: true,
        approval_label: 'Approve research package',
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
