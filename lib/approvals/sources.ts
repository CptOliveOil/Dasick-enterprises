import type { SourceEntry, SourceGroup, Tone } from './dossier/types';
import { normalisePublisher } from './quality';

/**
 * Every source behind a piece of work, grouped by what kind of evidence it is.
 *
 * Grouping is the point. A list of twelve links tells an operator nothing; the
 * same twelve split into "one government dataset, two newspapers, nine posts on
 * a community wiki" tells them immediately what the piece actually rests on.
 *
 * Reliability descriptions are written as what a source *is*, never as a
 * verdict on the claim. A community wiki is not wrong, it is unverified — and a
 * documentary can legitimately rest on one so long as the operator knows that
 * is what they are approving.
 *
 * Nothing is fetched. These are the citations the research already recorded,
 * read back and organised; no URL is visited, no source is validated live, and
 * nothing is invented for a claim that arrived without one.
 */

export interface SourceCitation {
  /** As recorded by the agent: a URL, a publication, a book title. */
  source: string | null;
  /** The claim it supports. */
  claim: string;
  /** Where in the work it is used. */
  location: string | null;
}

interface Classification {
  group: string;
  reliability: string;
  tone: Tone;
  /** Matched against the normalised publisher and the raw text. */
  test: RegExp;
}

/**
 * Order matters: the first match wins, so the specific sits above the general.
 * `.gov` before "news", official domains before community wikis.
 */
const CLASSES: Classification[] = [
  {
    group: 'Government and official statistics',
    reliability: 'Primary. Published by the body that holds the data.',
    tone: 'emerald',
    test: /\.gov(?:\.[a-z]{2})?\b|\bgov\.uk\b|\boffice for national statistics\b|\bons\b|\bcensus\b|\beurostat\b|\bwho\.int\b/i,
  },
  {
    group: 'Academic and peer-reviewed',
    reliability: 'Peer-reviewed or archived scholarship. The strongest evidence available here.',
    tone: 'emerald',
    test: /\bdoi\.org\b|\.edu\b|\bjstor\b|\barxiv\b|\bpubmed\b|\bnature\.com\b|\bsciencedirect\b|\bjournal\b|\bproceedings\b/i,
  },
  {
    group: 'Official and first-party',
    reliability: 'The organisation speaking about itself. Authoritative on its own facts, not neutral about them.',
    tone: 'emerald',
    test: /\bofficial\b|\bpress release\b|\bnewsroom\b|\bnintendo\b|\bpokemon\.com\b|\bpokemon\.co\.jp\b|\binvestor\b/i,
  },
  {
    group: 'Interviews and first-hand accounts',
    reliability: 'First-hand testimony. Direct, and carries the speaker’s point of view with it.',
    tone: 'sky',
    test: /\binterview\b|\boral history\b|\bspoke to\b|\bin conversation with\b|\btestimony\b|\bq&a\b/i,
  },
  {
    group: 'Books',
    reliability: 'Edited and published at length. Usually well-checked, sometimes out of date.',
    tone: 'sky',
    test: /\bisbn\b|\bpress\b(?!\s*release)|\bpublish(?:ers?|ing)\b|\b(?:book|chapter|volume|edition)\b/i,
  },
  {
    group: 'News and journalism',
    reliability: 'Reported and edited. Reliable for events, weaker for detail and for anything contested.',
    tone: 'sky',
    test: /\bbbc\b|\bguardian\b|\bnytimes\b|\breuters\b|\bapnews\b|\bwashingtonpost\b|\bft\.com\b|\bbloomberg\b|\btimes\b|\bnews\b|\bwired\b|\bpolygon\b|\bkotaku\b|\bign\b|\beurogamer\b/i,
  },
  {
    group: 'Encyclopedias',
    reliability:
      'Tertiary. Good for orientation and for finding primary sources; not itself a citation for a contested claim.',
    tone: 'amber',
    test: /\bwikipedia\b|\bbritannica\b|\bencyclopedi|\bwikiwand\b/i,
  },
  {
    group: 'Community wikis and fan resources',
    reliability:
      'Community-maintained and unverified. Often accurate and thorough, with no editorial accountability behind it.',
    tone: 'amber',
    test: /\bbulbapedia\b|\bfandom\b|\bwikia\b|\bserebii\b|\bwiki\b|\bforum\b|\breddit\b|\bdiscord\b/i,
  },
  {
    group: 'Video and social',
    reliability: 'Self-published. Treat as a lead to follow rather than as evidence.',
    tone: 'amber',
    test: /\byoutube\b|\btwitter\b|\bx\.com\b|\btiktok\b|\binstagram\b|\bmedium\.com\b|\bsubstack\b|\bblog\b/i,
  },
];

const UNCITED: Classification = {
  group: 'Uncited',
  reliability:
    'No source was recorded. The claim may still be true — nothing stands behind it in this workspace.',
  tone: 'red',
  test: /(?:)/,
};

export function classifySource(source: string): Omit<Classification, 'test'> {
  const publisher = normalisePublisher(source);
  const haystack = `${source} ${publisher}`;
  const found = CLASSES.find((entry) => entry.test.test(haystack));
  return found
    ? { group: found.group, reliability: found.reliability, tone: found.tone }
    : {
        group: 'Other sources',
        reliability: 'Not recognised as a known publisher type. Worth opening before you rely on it.',
        tone: 'amber',
      };
}

/** A readable publisher name from whatever the agent wrote down. */
export function publisherName(source: string): string {
  const trimmed = source.trim();
  const host = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?([^/\s]+\.[a-z]{2,})/i)?.[1];
  if (host) return host.replace(/^(?:en|m)\./i, '');
  // Not a URL — take the leading clause, which is usually the publication.
  return trimmed.split(/\s*[—–|,:]\s*/)[0]?.slice(0, 80) ?? trimmed.slice(0, 80);
}

export function groupSources(citations: SourceCitation[]): SourceGroup[] {
  const byKey = new Map<string, SourceEntry & { group: string; groupTone: Tone; groupReliability: string }>();

  for (const citation of citations) {
    const raw = citation.source?.trim();
    const cls = raw ? classifySource(raw) : { ...UNCITED };
    const key = raw ? `${cls.group}::${normalisePublisher(raw)}` : 'uncited';
    const existing = byKey.get(key);

    if (existing) {
      existing.citations += 1;
      if (citation.location && !existing.usedIn.includes(citation.location)) {
        existing.usedIn.push(citation.location);
      }
      continue;
    }

    byKey.set(key, {
      id: key,
      title: raw ? publisherName(raw) : 'Claims with no source',
      publisher: raw ?? '—',
      reliability: cls.reliability,
      tone: cls.tone,
      citations: 1,
      usedIn: citation.location ? [citation.location] : [],
      note: raw && raw !== publisherName(raw) ? raw : null,
      group: cls.group,
      groupTone: cls.tone,
      groupReliability: cls.reliability,
    });
  }

  const groups = new Map<string, SourceGroup>();
  for (const entry of byKey.values()) {
    const { group, groupTone, groupReliability, ...source } = entry;
    const bucket = groups.get(group) ?? {
      name: group,
      reliability: groupReliability,
      tone: groupTone,
      sources: [],
    };
    bucket.sources.push(source);
    groups.set(group, bucket);
  }

  // Strongest evidence first, uncited last — the operator should meet the
  // weakest part of the foundation at the bottom, having seen the rest.
  const order = [...CLASSES.map((c) => c.group), 'Other sources', UNCITED.group];
  return [...groups.values()]
    .map((group) => ({
      ...group,
      sources: group.sources.sort((a, b) => b.citations - a.citations),
    }))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}
