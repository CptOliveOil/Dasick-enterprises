import { IP_RISK_ORDER, type IpRisk } from '@/types/pokemon';

/**
 * Two rules the Pokémon Researcher is held to, applied to what it returned
 * rather than merely asked for in the prompt.
 *
 * A prompt is a request. A model that has been told not to quote a card price
 * will still sometimes quote one, and a model told to avoid protected artwork
 * will still sometimes propose a print of it. Both of those are the kind of
 * mistake that matters — one is a made-up number the operator might act on, the
 * other is a product we have no right to sell — so both are checked here, after
 * the fact, on the text that actually came back.
 *
 * Everything in this module is pure and synchronous so it can be tested
 * directly, and so the same rules apply identically to a live model and to the
 * simulated provider.
 */

/* ------------------------------------------------------------------ */
/* Live market data                                                    */
/* ------------------------------------------------------------------ */

/**
 * Claims that can only be answered from a live source.
 *
 * Card *history* is knowledge — which set a card came from, why a print run was
 * unusual, what collectors made of it at the time. Card *prices* are a moving
 * number that nothing in this system is connected to. The researcher is
 * genuinely useful for the first and must never pretend at the second.
 */
const MARKET_CLAIMS: { pattern: RegExp; need: string }[] = [
  {
    pattern: /\b(current|today'?s|latest|live|up[- ]to[- ]date)\s+(price|value|worth|market)/i,
    need: 'a live card-pricing source for current prices',
  },
  {
    pattern: /\b(price|pricing|value|valuation|worth|resale|sells? for|selling for|going rate|market value)\b/i,
    need: 'a live card-pricing source before any price or valuation is stated',
  },
  {
    pattern: /\b(trending|trend(s)? right now|hot right now|rising|spiking|surging|crash(ing|ed)?|dipped?)\b/i,
    need: 'a live market-trend source before any claim about current movement',
  },
  {
    pattern: /\b(psa|bgs|cgc)\s*\d{1,2}\b|\bgraded\s+(population|pop)\b|\bpop(ulation)?\s+report\b/i,
    need: 'a live graded-population source for grading and population figures',
  },
  {
    pattern: /\b(auction|sold\s+(for|at)|last\s+sale|recent\s+sales?|ebay|tcgplayer|cardmarket)\b/i,
    need: 'a live sales-history source for auction and sale results',
  },
  {
    pattern: /[£$€]\s?\d|\b\d+\s?(usd|gbp|eur)\b/i,
    need: 'a live card-pricing source for any monetary figure',
  },
];

/**
 * What, if anything, would have to be connected before this text could be
 * asserted. Empty means the topic stands on knowledge alone.
 */
export function liveDataNeeds(text: string): string[] {
  const needs = new Set<string>();
  for (const claim of MARKET_CLAIMS) {
    if (claim.pattern.test(text)) needs.add(claim.need);
  }
  return [...needs];
}

/** True when the text makes a claim no connected source can support. */
export function requiresLiveData(text: string): boolean {
  return liveDataNeeds(text).length > 0;
}

/* ------------------------------------------------------------------ */
/* Intellectual property                                               */
/* ------------------------------------------------------------------ */

/**
 * Material we have no licence to reproduce and sell.
 *
 * Note what is *not* here: the franchise name on its own. Researching demand
 * for a subject, and naming that subject, is ordinary research. What these
 * patterns catch is a product concept that would reproduce someone else's
 * artwork, characters or branding — the point at which research would have
 * quietly turned into an infringement.
 */
const REPRODUCES_PROTECTED: { pattern: RegExp; concern: string }[] = [
  {
    pattern: /\b(official|licensed|original)\s+(card\s+)?(art(work)?|illustration|render)/i,
    concern: 'reproduces official artwork, which is copyright of the rights holders',
  },
  {
    pattern: /\b(card|pack|booster|tin)\s+(art(work)?|scan|image|face|front)\b|\bscan(s|ned)?\s+of\s+(the\s+)?cards?\b/i,
    concern: 'reproduces trading card artwork, which is copyright of the rights holders',
  },
  {
    pattern: /\b(pok[eé]mon|nintendo|game\s?freak|creatures\s+inc)\b.{0,40}\b(logo|wordmark|typeface|font|branding|brand\s+mark)\b|\b(logo|wordmark|branding)\b.{0,40}\b(pok[eé]mon|nintendo)\b/i,
    concern: 'uses protected branding or a logo belonging to Nintendo / The Pokémon Company',
  },
  {
    pattern: /\bpok[eé]?\s?ball\b|\bpoke\s?ball\b/i,
    concern: 'uses a protected design element belonging to the rights holders',
  },
  {
    pattern:
      /\b(pikachu|charizard|charmander|bulbasaur|squirtle|eevee|mewtwo|mew|snorlax|gengar|lucario|greninja|umbreon|sylveon|rayquaza|arceus|jigglypuff|psyduck|magikarp|gyarados|dragonite|blastoise|venusaur)\b/i,
    concern: 'depicts a specific copyrighted character',
  },
  {
    pattern: /\b(character|creature)\s+(art(work)?|design|sticker|print|portrait|illustration)\b/i,
    concern: 'reproduces character designs, which are copyright of the rights holders',
  },
  {
    pattern: /\b(fan\s?art|trace|traced|redraw|recreat(e|ion)|replica|copy)\b/i,
    concern: 'a derivative of protected artwork is still a derivative of protected artwork',
  },
];

/** Uses the franchise name where a buyer would read it as an official product. */
const FRANCHISE_NAME = /\bpok[eé]mon\b|\bnintendo\b|\bthe\s+pok[eé]mon\s+company\b/i;

/** An original work that shares only a genre or an aesthetic. */
const ORIGINAL_DIRECTION =
  /\b(original|our own|unbranded|generic|inspired\s+by\s+the\s+(genre|era|aesthetic)|no\s+(character|artwork|branding)|creature[- ]collect|monster[- ]collect|retro\s+gaming\s+aesthetic)\b/i;

/**
 * Narrower than `ORIGINAL_DIRECTION`, and deliberately so.
 *
 * Once the franchise name is on the product, saying the layout is "our own" does
 * not undo that — the buyer still reads a branded product. Only an explicit
 * statement that the name is *not* being used as branding brings the risk down,
 * and even then it comes down one step rather than away.
 */
const EXPLICITLY_UNBRANDED =
  /\b(unbranded|no\s+branding|without\s+branding|generic|purely\s+descriptive|descriptive\s+(use|reference)\s+only|name\s+not\s+used)\b/i;

export interface IpAssessment {
  risk: IpRisk;
  /** Named specifics, not a general warning. */
  concerns: string[];
  /** Set when there is a version of this that keeps the demand and drops the risk. */
  safe_direction: string | null;
}

/**
 * Assesses an Etsy product concept.
 *
 * `description` is everything the researcher said about the product — the
 * concept, what it depicts, what it would be printed on. It is all treated as
 * one body of text because the risky part is as likely to be in an aside as in
 * the headline.
 *
 * The result is deliberately conservative. This decides whether a person needs
 * to look at something, not whether something may be sold; nothing here grants
 * permission, and `blocked` means the concept as described cannot proceed.
 */
export function assessIpRisk(description: string): IpAssessment {
  const concerns: string[] = [];
  for (const rule of REPRODUCES_PROTECTED) {
    if (rule.pattern.test(description)) concerns.push(rule.concern);
  }

  if (concerns.length > 0) {
    return {
      risk: 'blocked',
      concerns: [...new Set(concerns)],
      safe_direction:
        'Keep the demand, drop the protected material: sell an original design of our own that serves the same buyer, and describe it in our own words.',
    };
  }

  const namesFranchise = FRANCHISE_NAME.test(description);
  const isOriginal = ORIGINAL_DIRECTION.test(description);

  if (namesFranchise && !EXPLICITLY_UNBRANDED.test(description)) {
    return {
      risk: 'high',
      concerns: [
        'names the franchise in the product itself, which a buyer would read as an official product and the rights holders would read as trademark use',
      ],
      safe_direction:
        'Describe what the product actually is without borrowing the franchise name for the product itself.',
    };
  }

  if (namesFranchise) {
    return {
      risk: 'medium',
      concerns: [
        'names the franchise, which is a trademark — acceptable as a factual reference, not as branding',
      ],
      safe_direction:
        'Keep the franchise name out of the design and the title; use it only where it is genuinely descriptive.',
    };
  }

  if (isOriginal) {
    return { risk: 'low', concerns: [], safe_direction: null };
  }

  return { risk: 'none', concerns: [], safe_direction: null };
}

/** The worse of two risks. Used to summarise a set of concepts. */
export function escalate(a: IpRisk, b: IpRisk): IpRisk {
  return IP_RISK_ORDER[a] >= IP_RISK_ORDER[b] ? a : b;
}

/** The highest risk across a set, or `none` when the set is empty. */
export function highestRisk(risks: IpRisk[]): IpRisk {
  return risks.reduce<IpRisk>((worst, risk) => escalate(worst, risk), 'none');
}

/** True when a person must sign this off before a product concept proceeds. */
export function needsIpReview(risk: IpRisk): boolean {
  return IP_RISK_ORDER[risk] >= IP_RISK_ORDER.high;
}
