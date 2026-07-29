import type { QuranEvidence, SourcePolicy } from '@/types/islamic';

/**
 * Getting verified Arabic onto the screen.
 *
 * The rule this file exists to enforce: **an image model must never be asked to
 * produce Arabic.** Diffusion models render Arabic as convincing-looking
 * nonsense — the shapes are right, the letters are not — and a corrupted
 * Qur'anic verse burned into a thumbnail is both wrong and unrecoverable once
 * published.
 *
 * So Arabic never travels through an image prompt. It travels as text, from a
 * verified structured record, into the same libass text layer the captions use.
 * `renderArabicOverlay` produces exactly that, and only from evidence that
 * genuinely carries the Arabic — a record with `arabic: null` produces nothing,
 * because null means the agent did not reliably know the wording and inventing
 * it here would defeat the whole design.
 */

/** Arabic, Arabic Supplement, Extended-A, Presentation Forms. */
const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function containsArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

/**
 * A font that can actually shape Arabic.
 *
 * DejaVu Sans — the font the caption styles use — has no Arabic coverage, so
 * text set in it renders as boxes. libass falls back through fontconfig, and
 * these are the families most likely to be present on a Linux host. Naming
 * several lets fontconfig pick whichever exists.
 */
export const ARABIC_FONT_STACK = 'Noto Naskh Arabic,Amiri,Scheherazade New,DejaVu Sans';

export interface ArabicOverlay {
  /** The Arabic itself, exactly as stored. Never transformed. */
  arabic: string;
  translation: string | null;
  reference: string | null;
}

/**
 * Turns Qur'an evidence into on-screen text, honouring the channel's Arabic
 * display setting.
 *
 * Returns an empty array rather than a placeholder when there is nothing
 * verified to show. A verse the system does not have the wording for simply
 * does not appear.
 */
export function arabicOverlays(
  evidence: QuranEvidence[],
  policy: Pick<SourcePolicy, 'arabic_display'> | null,
): ArabicOverlay[] {
  const display = policy?.arabic_display ?? 'arabic_with_translation';
  if (display === 'none') return [];

  return evidence
    .filter((item) => {
      if (display === 'translation_only') return Boolean(item.translation);
      // Everything else needs real Arabic. `arabic: null` is the agent saying
      // it did not know the wording — that is a legitimate answer, and the
      // correct response is to show nothing rather than approximate it.
      return typeof item.arabic === 'string' && containsArabic(item.arabic);
    })
    .map((item) => ({
      arabic: display === 'translation_only' ? '' : (item.arabic ?? ''),
      translation: display === 'arabic_only' ? null : item.translation,
      reference: item.reference ?? formatReference(item),
    }));
}

function formatReference(item: QuranEvidence): string | null {
  if (!item.surah) return null;
  const number = item.surah_number ? ` ${item.surah_number}` : '';
  const ayah = item.ayah_number ? `:${item.ayah_number}` : '';
  return `Qur’an — ${item.surah}${number}${ayah}`;
}

/**
 * ASS style lines for Arabic text.
 *
 * Appended to the styles the renderer already emits, so Arabic reuses the
 * existing libass pipeline rather than acquiring a second text path. Alignment
 * 8 (top-centre) keeps the verse clear of the caption band at the bottom.
 */
export function arabicAssStyles(width: number, height: number): string[] {
  const arabicSize = Math.round(height * 0.055);
  const translationSize = Math.round(height * 0.032);
  const margin = Math.round(height * 0.1);
  void width;
  return [
    `Style: Arabic,${ARABIC_FONT_STACK},${arabicSize},&H00FFFFFF,&H00101010,&H80000000,0,0,3,1,8,100,100,${margin},1`,
    `Style: ArabicTranslation,DejaVu Sans,${translationSize},&H00E2E8F0,&H00101010,&H80000000,0,0,2,1,8,120,120,${margin + Math.round(arabicSize * 1.5)},1`,
  ];
}

/**
 * Flags an image or video prompt that would bake Arabic into generated imagery.
 *
 * Used by the visual-rule check. Kept here so the one place that knows what
 * Arabic looks like is the same place that decides it may not be generated.
 */
export function promptWouldGenerateArabic(prompt: string): boolean {
  return containsArabic(prompt);
}
