import { uuid } from '@/lib/ids';
import type {
  HadithEvidence,
  SourcePolicy,
  VisualRules,
  WeakHadithPolicy,
} from '@/types/islamic';
import { WEAK_GRADINGS } from '@/types/islamic';

/**
 * Per-channel source and visual policy.
 *
 * Pure functions only, so both the server handlers and the settings UI can use
 * them. Defaults are deliberately the cautious end of every choice: a channel
 * that has never opened the settings screen behaves as though it asked for care.
 * None of these defaults encode a madhhab or a theological position — they are
 * about sourcing discipline, which every school shares.
 */

export function defaultSourcePolicy(
  ownerId: string,
  businessId: string,
  channelId: string | null = null,
): SourcePolicy {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: ownerId,
    business_id: businessId,
    channel_id: channelId,
    methodology_notes: '',
    preferred_translation: '',
    source_policy_notes: '',
    arabic_display: 'arabic_with_translation',
    religious_disclaimer: '',
    require_quran_reference: true,
    require_hadith_grading: true,
    require_source_check_before_script_approval: true,
    weak_hadith_policy: 'labelled',
    require_difference_labelling: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function defaultVisualRules(
  ownerId: string,
  businessId: string,
  channelId: string | null = null,
): VisualRules {
  const timestamp = new Date().toISOString();
  return {
    id: uuid(),
    owner_id: ownerId,
    business_id: businessId,
    channel_id: channelId,
    no_prophet_depiction: true,
    no_divine_depiction: true,
    no_generated_sacred_text: true,
    require_calligraphy_approval: true,
    human_depiction: 'faceless',
    background_music: 'none',
    extra_notes: '',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Renders the source policy as prompt text.
 *
 * The agent is told what the *channel* has asked for, not what the application
 * believes. That distinction matters: these are the operator's editorial
 * choices, and the agent should follow them rather than substitute its own.
 */
export function renderSourcePolicy(policy: SourcePolicy | null): string {
  if (!policy) return '';
  const lines: string[] = ['This channel has configured the following source policy. Follow it.'];

  if (policy.methodology_notes.trim()) {
    lines.push(`- Methodology notes from the operator: ${policy.methodology_notes.trim()}`);
  }
  if (policy.preferred_translation.trim()) {
    lines.push(`- Preferred Qur'an translation: ${policy.preferred_translation.trim()}.`);
  }
  if (policy.source_policy_notes.trim()) {
    lines.push(`- Citation preferences: ${policy.source_policy_notes.trim()}`);
  }
  lines.push(
    policy.require_quran_reference
      ? "- Every Qur'an citation must carry a surah and ayah reference. If you cannot give one, do not present the verse."
      : "- Qur'an references are encouraged but not mandatory.",
  );
  lines.push(
    policy.require_hadith_grading
      ? '- Every hadith must carry a grading. Where the grading is not established, say "unknown" rather than guessing.'
      : '- Hadith gradings are encouraged but not mandatory.',
  );
  lines.push(`- Weak hadith: ${WEAK_HADITH_GUIDANCE[policy.weak_hadith_policy]}`);
  if (policy.require_difference_labelling) {
    lines.push(
      '- Where scholars differ, label it explicitly as a difference of opinion. Do not present one position as the settled answer.',
    );
  }
  lines.push(`- Arabic display: ${ARABIC_GUIDANCE[policy.arabic_display]}`);
  if (policy.religious_disclaimer.trim()) {
    lines.push(`- The channel carries this disclaimer: "${policy.religious_disclaimer.trim()}"`);
  }
  return lines.join('\n');
}

const WEAK_HADITH_GUIDANCE: Record<WeakHadithPolicy, string> = {
  never:
    'do not use weak, disputed, fabricated or ungraded hadith at all. Leave them out rather than including them with a caveat.',
  labelled:
    'weak, disputed or ungraded hadith may only appear if they are explicitly labelled as such in the content itself.',
  allowed: 'weak hadith may be used, though a grading should still be recorded.',
};

const ARABIC_GUIDANCE: Record<SourcePolicy['arabic_display'], string> = {
  none: 'do not include Arabic text.',
  arabic_only: 'Arabic may appear on its own.',
  arabic_with_translation: 'Arabic must always be accompanied by a translation.',
  translation_only: 'use translation only; do not include Arabic text.',
};

/**
 * Renders visual rules as hard constraints.
 *
 * These go to the Visual Director and the Asset Agent verbatim. They are also
 * checked after the fact in `violatedVisualRules` — a constraint that lives
 * only in a prompt is a request, not a rule.
 */
export function renderVisualRules(rules: VisualRules | null): string {
  if (!rules) return '';
  const lines: string[] = [
    'Hard visual constraints for this channel. These are not preferences — a scene that breaks one of them is rejected.',
  ];
  if (rules.no_prophet_depiction) {
    lines.push(
      '- Never depict any Prophet, including their face, body or a figure standing in for them. Use landscape, architecture, calligraphy, manuscript, natural imagery or abstract light instead.',
    );
  }
  if (rules.no_divine_depiction) {
    lines.push('- Never depict Allah, or attempt any visual representation of the divine.');
  }
  if (rules.no_generated_sacred_text) {
    lines.push(
      "- Never ask an image model to render Qur'anic text, hadith text or any Arabic scripture. Image models produce corrupted Arabic. If sacred text must appear, request it as an on-screen text layer with the verified wording, never as part of a generated image.",
    );
  }
  if (rules.require_calligraphy_approval) {
    lines.push(
      '- Arabic calligraphy requires a human to approve it before use. Mark any scene that needs calligraphy so it can be reviewed.',
    );
  }
  lines.push(HUMAN_GUIDANCE[rules.human_depiction]);
  lines.push(MUSIC_GUIDANCE[rules.background_music]);
  if (rules.extra_notes.trim()) lines.push(`- ${rules.extra_notes.trim()}`);
  return lines.join('\n');
}

const HUMAN_GUIDANCE: Record<VisualRules['human_depiction'], string> = {
  none: '- Do not depict people at all.',
  faceless:
    '- People may appear only as silhouettes, from behind, or with faces out of frame. No identifiable faces.',
  allowed: '- People may be depicted normally.',
};

const MUSIC_GUIDANCE: Record<VisualRules['background_music'], string> = {
  none: '- No background music. Narration and natural ambience only.',
  ambient_only: '- Background music may only be non-instrumental ambience.',
  allowed: '- Background music is permitted.',
};

/**
 * Mechanical check of a scene plan against the visual rules.
 *
 * Catches the cases that are actually detectable in text: a prompt asking to
 * draw a Prophet, or asking an image model for Arabic scripture. It cannot see
 * inside a generated image, and it does not pretend to — this is a second line
 * behind the prompt constraints, not a content filter.
 */
export interface ScenePlanLike {
  scene_number?: number;
  image_prompt?: string;
  video_prompt?: string;
  visual_direction?: string;
  on_screen_text?: string;
}

const PROPHET_PATTERNS = [
  /\b(prophet|nabi|rasul|messenger)\b[^.]{0,40}\b(face|portrait|depict|shown|standing|figure|likeness|appearance)\b/i,
  /\b(depict|draw|render|show|illustrat\w*|portrait of)\b[^.]{0,40}\b(prophet|muhammad|isa|musa|ibrahim|yusuf|nuh|adam)\b/i,
];

const DIVINE_PATTERNS = [/\b(depict|draw|render|show|image of|illustrat\w*)\b[^.]{0,30}\b(allah|god|the divine)\b/i];

const ARABIC_SCRIPT = /[؀-ۿ]/;

const SACRED_TEXT_PATTERNS = [
  /\b(quran|qur'an|qur’an|ayah|ayat|surah|verse|hadith)\b[^.]{0,40}\b(text|calligraphy|written|arabic|script|inscription)\b/i,
  /\b(arabic)\b[^.]{0,30}\b(calligraphy|script|text|writing)\b/i,
];

export function violatedVisualRules(
  scene: ScenePlanLike,
  rules: VisualRules | null,
): string[] {
  if (!rules) return [];
  const violations: string[] = [];
  const label = scene.scene_number ? `Scene ${scene.scene_number}` : 'A scene';
  const imagery = [scene.image_prompt, scene.video_prompt, scene.visual_direction]
    .filter(Boolean)
    .join(' ');

  if (rules.no_prophet_depiction && PROPHET_PATTERNS.some((p) => p.test(imagery))) {
    violations.push(`${label} asks for a depiction of a Prophet, which this channel forbids.`);
  }
  if (rules.no_divine_depiction && DIVINE_PATTERNS.some((p) => p.test(imagery))) {
    violations.push(`${label} asks for a depiction of the divine, which this channel forbids.`);
  }
  if (rules.no_generated_sacred_text) {
    if (ARABIC_SCRIPT.test(imagery)) {
      violations.push(
        `${label} puts Arabic text into an image prompt. Image models corrupt Arabic — move it to an on-screen text layer with verified wording.`,
      );
    } else if (SACRED_TEXT_PATTERNS.some((p) => p.test(imagery))) {
      violations.push(
        `${label} asks an image model for Arabic or scriptural text. Request it as an on-screen text layer instead.`,
      );
    }
  }
  return violations;
}

/** Hadith that the channel's policy will not allow to be presented as-is. */
export function disallowedHadith(
  evidence: Pick<HadithEvidence, 'collection' | 'reference' | 'grading'>[],
  policy: SourcePolicy | null,
): string[] {
  if (!policy || policy.weak_hadith_policy === 'allowed') return [];
  return evidence
    .filter((item) => WEAK_GRADINGS.includes(item.grading))
    .map((item) => {
      const name = `${item.collection}${item.reference ? ` ${item.reference}` : ''}`;
      return policy.weak_hadith_policy === 'never'
        ? `${name} is graded "${item.grading}" and this channel does not use weak or ungraded hadith.`
        : `${name} is graded "${item.grading}" and must be explicitly labelled as such wherever it appears.`;
    });
}
