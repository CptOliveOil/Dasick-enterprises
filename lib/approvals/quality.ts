import type { Score, ScoreBand } from './dossier/types';
import type { FactCheckFinding, ScriptSection, YoutubeResearch } from '@/types/domain';

/**
 * Automatic quality measures for a piece of written work.
 *
 * Every number here is *measured*, not guessed, and every one carries the
 * sentence that says what was measured. That constraint is the whole point:
 * a score board an operator cannot interrogate is worse than no score board,
 * because it lends authority to an opinion nobody can check.
 *
 * Two honesty rules follow from it:
 *
 * 1. Where there is nothing to measure, the score is `null` and the band is
 *    `unknown`. Originality with no history behind it is unknowable; SEO with
 *    no metadata written yet is unknowable. Inventing 80/100 for either would
 *    be a lie that reads exactly like a fact.
 * 2. Nothing here predicts audience behaviour. "Retention" scores the structural
 *    devices that hold attention — pattern interrupts, section length, cadence —
 *    and says so. Real retention comes from analytics, and once a business has
 *    published enough to know its own numbers, those live in Business
 *    Intelligence Memory rather than in a heuristic.
 *
 * No provider is called. Reviewing must never cost money.
 */

const STRONG = 75;
const FAIR = 50;

export function bandFor(value: number | null): ScoreBand {
  if (value === null) return 'unknown';
  if (value >= STRONG) return 'strong';
  if (value >= FAIR) return 'fair';
  return 'weak';
}

function score(label: string, value: number | null, basis: string): Score {
  const clamped = value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return { label, value: clamped, band: bandFor(clamped), basis };
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const sentences = (text: string) => text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);

export interface ScriptQualityInput {
  title: string;
  sections: ScriptSection[];
  wordCount: number;
  estimatedSeconds: number;
  findings: FactCheckFinding[];
  research: YoutubeResearch | null;
  metadata: { title: string; description: string; tags: string[] } | null;
  /** Topics this business has already covered, for the originality measure. */
  priorTopics: string[];
}

export interface ScriptQuality {
  overall: Score | null;
  scores: Score[];
}

export function scoreScript(input: ScriptQualityInput): ScriptQuality {
  const scores = [
    hookStrength(input),
    retentionStructure(input),
    narrativePacing(input),
    storyClarity(input),
    sourceDiversity(input),
    factConfidence(input),
    originality(input),
    evergreen(input),
    seoQuality(input),
    visualOpportunity(input),
  ];

  const measured = scores.filter((s): s is Score & { value: number } => s.value !== null);
  const overall =
    measured.length === 0
      ? score(
          'Overall documentary quality',
          null,
          'Nothing measurable yet — the script is empty or has not been checked.',
        )
      : score(
          'Overall documentary quality',
          measured.reduce((sum, s) => sum + s.value, 0) / measured.length,
          `The mean of the ${measured.length} measures below. ${
            scores.length - measured.length > 0
              ? `${scores.length - measured.length} could not be measured and are excluded rather than assumed.`
              : 'All measures had something to work from.'
          }`,
        );

  return { overall, scores };
}

/* ------------------------------------------------------------------ */

/** Branding openings kill a cold open, so they are penalised explicitly. */
const BRANDING = /\b(welcome back|in (?:this|today's) video|hey guys|don't forget to|smash that|subscribe|like and)\b/i;
const CURIOSITY = /\b(why|how|what if|but|until|never|nobody|no one|secret|hidden|mistake|actually|turns out)\b/i;

function hookStrength(input: ScriptQualityInput): Score {
  const hook = input.sections.find((s) => s.kind === 'hook') ?? input.sections[0];
  if (!hook || hook.body.trim().length === 0) {
    return score('Hook strength', null, 'There is no opening section to measure.');
  }

  const count = words(hook.body);
  const opener = sentences(hook.body)[0] ?? hook.body;
  const reasons: string[] = [];
  let value = 50;

  // 40–130 words is roughly 15–50 seconds — long enough to set a question up,
  // short enough that the question arrives before the viewer leaves.
  if (count >= 40 && count <= 130) {
    value += 15;
    reasons.push(`${count} words, in the 40–130 range a cold open needs`);
  } else {
    value -= 10;
    reasons.push(`${count} words, outside the 40–130 a cold open wants`);
  }

  if (words(opener) <= 22) {
    value += 10;
    reasons.push('the first sentence is short');
  } else {
    value -= 5;
    reasons.push('the first sentence runs long');
  }

  if (CURIOSITY.test(hook.body)) {
    value += 15;
    reasons.push('it opens a question rather than stating a topic');
  } else {
    reasons.push('no explicit question or contrast was found');
  }

  if (/\d/.test(hook.body)) {
    value += 5;
    reasons.push('it anchors on a specific figure');
  }

  if (BRANDING.test(hook.body)) {
    value -= 30;
    reasons.push('it contains channel branding, which does not belong in a cold open');
  }

  return score('Hook strength', value, `Measured on the opening section: ${reasons.join('; ')}.`);
}

function retentionStructure(input: ScriptQualityInput): Score {
  if (input.sections.length === 0) {
    return score('Retention prediction', null, 'There are no sections to measure.');
  }

  const interrupts = input.sections.filter(
    (s) => s.kind === 'pattern_interrupt' || s.kind === 'transition',
  ).length;
  const minutes = input.estimatedSeconds / 60;
  // One reset roughly every four minutes is the documentary convention.
  const wanted = Math.max(1, Math.round(minutes / 4));
  const longest = Math.max(...input.sections.map((s) => words(s.body)));
  const hasPayoff = input.sections.some((s) => s.kind === 'payoff' || s.kind === 'ending');

  let value = 45;
  const reasons: string[] = [];

  value += Math.min(25, (interrupts / wanted) * 25);
  reasons.push(`${interrupts} attention reset${interrupts === 1 ? '' : 's'} against ${wanted} expected for ${minutes.toFixed(0)} minutes`);

  if (longest <= 450) {
    value += 15;
    reasons.push(`the longest section is ${longest} words`);
  } else {
    value -= 10;
    reasons.push(`the longest section is ${longest} words, long enough to lose people`);
  }

  if (hasPayoff) {
    value += 15;
    reasons.push('the question raised at the start is paid off');
  } else {
    value -= 15;
    reasons.push('no payoff or ending section closes the loop');
  }

  return score(
    'Retention prediction',
    value,
    `Structural only — this measures the devices that hold attention, not measured audience retention: ${reasons.join('; ')}. Real retention comes from published analytics.`,
  );
}

function narrativePacing(input: ScriptQualityInput): Score {
  const lengths = input.sections.map((s) => words(s.body)).filter((n) => n > 0);
  if (lengths.length < 2) {
    return score('Narrative pacing', null, 'Fewer than two sections carry text.');
  }

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const deviation = Math.sqrt(
    lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length,
  );
  // Some variation is rhythm; a lot is lurching. The sweet spot sits around a
  // quarter to a half of the mean.
  const spread = deviation / Math.max(1, mean);
  const evenness = spread < 0.15 ? 55 : spread <= 0.55 ? 85 : Math.max(35, 85 - (spread - 0.55) * 90);

  return score(
    'Narrative pacing',
    evenness,
    `Section lengths run ${Math.min(...lengths)}–${Math.max(...lengths)} words around a ${Math.round(mean)}-word mean (spread ${spread.toFixed(2)}). Too even reads flat; too uneven lurches.`,
  );
}

const ARC: ScriptSection['kind'][] = ['hook', 'introduction', 'main', 'payoff', 'ending'];

function storyClarity(input: ScriptQualityInput): Score {
  if (input.sections.length === 0) {
    return score('Story clarity', null, 'There are no sections to measure.');
  }

  const present = ARC.filter((kind) => input.sections.some((s) => s.kind === kind));
  const headings = new Set(input.sections.map((s) => s.heading.trim().toLowerCase()));
  const body = input.sections.map((s) => s.body).join(' ');
  const sentenceList = sentences(body);
  const meanSentence =
    sentenceList.length > 0
      ? sentenceList.reduce((sum, s) => sum + words(s), 0) / sentenceList.length
      : 0;

  let value = (present.length / ARC.length) * 60;
  const reasons = [`${present.length} of the ${ARC.length} arc beats are present (${present.join(', ') || 'none'})`];

  if (headings.size === input.sections.length) {
    value += 15;
    reasons.push('every section heading is distinct');
  } else {
    reasons.push('some section headings repeat');
  }

  // 12–24 words is comfortable spoken English. Much longer and a listener
  // loses the thread; much shorter reads as staccato.
  if (meanSentence >= 12 && meanSentence <= 24) {
    value += 25;
    reasons.push(`sentences average ${meanSentence.toFixed(0)} words, comfortable to narrate`);
  } else {
    value += 8;
    reasons.push(`sentences average ${meanSentence.toFixed(0)} words, outside the 12–24 that narrates cleanly`);
  }

  return score('Story clarity', value, `${reasons.join('; ')}.`);
}

function sourceDiversity(input: ScriptQualityInput): Score {
  const facts = [...(input.research?.facts ?? []), ...(input.research?.statistics ?? [])];
  if (facts.length === 0) {
    return score(
      'Source diversity',
      null,
      'No research package is attached, so there are no sources to count.',
    );
  }

  const sourced = facts.filter((f) => f.source && f.source.trim().length > 0);
  const distinct = new Set(sourced.map((f) => normalisePublisher(f.source!)));
  const share = sourced.length / facts.length;

  // Diversity is two things: are claims sourced at all, and do they lean on
  // more than one place. Ten claims from one site is not a researched piece.
  const value = share * 55 + Math.min(45, distinct.size * 11);

  return score(
    'Source diversity',
    value,
    `${sourced.length} of ${facts.length} research claims cite a source, across ${distinct.size} distinct publisher${distinct.size === 1 ? '' : 's'}.`,
  );
}

function factConfidence(input: ScriptQualityInput): Score {
  if (input.findings.length === 0) {
    return score('Fact confidence', null, 'No fact check has been run against this draft.');
  }

  const total = input.findings.length;
  const verified = input.findings.filter((f) => f.verdict === 'verified').length;
  const review = input.findings.filter((f) => f.verdict === 'needs_review').length;
  const unsourced = input.findings.filter((f) => f.verdict === 'unsourced').length;
  const wrong = input.findings.filter((f) => f.verdict === 'potentially_incorrect').length;

  const value = ((verified * 1 + review * 0.5 + unsourced * 0.3 + wrong * 0) / total) * 100;

  return score(
    'Fact confidence',
    value,
    `Of ${total} checked claim${total === 1 ? '' : 's'}: ${verified} verified, ${review} need review, ${unsourced} unsourced, ${wrong} possibly incorrect.`,
  );
}

/** `en.wikipedia.org/wiki/…` and `Wikipedia` are the same publisher. */
export function normalisePublisher(source: string): string {
  const text = source.trim().toLowerCase();
  const url = text.match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+)/);
  const host = url?.[1] ?? text;
  return host.replace(/^(?:en|www|m)\./, '').split(/[\s,;]/)[0] ?? host;
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'with', 'that', 'this',
  'how', 'why', 'what', 'is', 'was', 'were', 'it', 'its', 'from', 'by', 'at',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP.has(word)),
  );
}

function originality(input: ScriptQualityInput): Score {
  if (input.priorTopics.length === 0) {
    return score(
      'Originality',
      null,
      'This business has no completed work yet, so there is nothing to compare against. It becomes measurable once missions start finishing.',
    );
  }

  const mine = significantWords(input.title);
  if (mine.size === 0) {
    return score('Originality', null, 'The title carries no distinctive words to compare.');
  }

  let worst = 0;
  let nearest = '';
  for (const topic of input.priorTopics) {
    const theirs = significantWords(topic);
    const shared = [...mine].filter((word) => theirs.has(word)).length;
    const overlap = shared / mine.size;
    if (overlap > worst) {
      worst = overlap;
      nearest = topic;
    }
  }

  return score(
    'Originality',
    (1 - worst) * 100,
    worst === 0
      ? `No title overlap with the ${input.priorTopics.length} topic${input.priorTopics.length === 1 ? '' : 's'} this business has already covered.`
      : `${Math.round(worst * 100)}% of the distinctive words overlap with an earlier piece — "${nearest}".`,
  );
}

const TIME_BOUND =
  /\b(this (?:year|month|week)|last (?:year|month|week)|currently|right now|recently|just (?:announced|released|dropped)|as of|upcoming|202\d|the new)\b/gi;

function evergreen(input: ScriptQualityInput): Score {
  const body = input.sections.map((s) => s.body).join(' ');
  if (body.trim().length === 0) {
    return score('Evergreen score', null, 'There is no script body to measure.');
  }
  const hits = body.match(TIME_BOUND) ?? [];
  const per1000 = (hits.length / Math.max(1, words(body))) * 1000;
  const value = Math.max(0, 100 - per1000 * 22);

  return score(
    'Evergreen score',
    value,
    hits.length === 0
      ? 'No time-bound phrasing found, so the script should not date.'
      : `${hits.length} time-bound phrase${hits.length === 1 ? '' : 's'} (${[...new Set(hits.map((h) => h.toLowerCase()))].slice(0, 4).join(', ')}) will date the video.`,
  );
}

function seoQuality(input: ScriptQualityInput): Score {
  if (!input.metadata) {
    return score(
      'SEO quality',
      null,
      'Title, description and tags have not been written yet — that is a later step, so there is nothing to score.',
    );
  }

  const { title, description, tags } = input.metadata;
  const reasons: string[] = [];
  let value = 40;

  // Under 60 characters survives truncation in search and on mobile.
  if (title.length > 0 && title.length <= 60) {
    value += 20;
    reasons.push(`the title is ${title.length} characters and will not be truncated`);
  } else {
    reasons.push(`the title is ${title.length} characters, past the 60 that display in full`);
  }

  if (description.length >= 200) {
    value += 20;
    reasons.push(`the description runs ${description.length} characters`);
  } else {
    reasons.push(`the description is only ${description.length} characters`);
  }

  if (tags.length >= 8) {
    value += 20;
    reasons.push(`${tags.length} tags`);
  } else {
    value += tags.length * 2;
    reasons.push(`only ${tags.length} tag${tags.length === 1 ? '' : 's'}`);
  }

  return score('SEO quality', value, `${reasons.join('; ')}.`);
}

const CONCRETE = /\b(?:[A-Z][a-z]{2,}|\d{3,}|\d+(?:st|nd|rd|th)|per cent|%)/g;

function visualOpportunity(input: ScriptQualityInput): Score {
  const withBody = input.sections.filter((s) => s.body.trim().length > 0);
  if (withBody.length === 0) {
    return score('Visual opportunity', null, 'There is no script body to measure.');
  }

  // A section full of named things, dates and figures can be cut to pictures.
  // A section of abstractions cannot, and becomes a slideshow of stock footage.
  const scored = withBody.map((section) => {
    const hits = (section.body.match(CONCRETE) ?? []).length;
    return hits / Math.max(1, words(section.body) / 100);
  });
  const mean = scored.reduce((a, b) => a + b, 0) / scored.length;
  const thin = scored.filter((n) => n < 3).length;

  return score(
    'Visual opportunity',
    Math.min(100, mean * 9),
    `About ${mean.toFixed(0)} nameable things, dates or figures per 100 words — the material a visual can be cut to. ${thin} of ${withBody.length} sections are thin enough to risk becoming stock footage.`,
  );
}
