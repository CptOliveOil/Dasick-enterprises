/**
 * Whether this deployment is unintentionally public.
 *
 * Demo mode is correct and useful locally: no database, seeded data, nothing to
 * sign in to. Deployed to a public URL it is something else entirely — an open
 * workspace anyone who finds the link can read. That is a configuration mistake
 * with no visible symptom, so it gets a banner that cannot be missed.
 *
 * Pure, and exported separately from the component, so the decision is testable
 * without a browser.
 */
export function isPubliclyExposedDemo(input: {
  /** True when no Supabase credentials are configured. */
  demo: boolean;
  /** `process.env.NODE_ENV`, or its equivalent on the client. */
  nodeEnv: string | undefined;
  /** The hostname the page is being served from. */
  hostname: string | undefined;
}): boolean {
  if (!input.demo) return false;
  // A developer running `npm run dev` on their own machine already knows.
  // Warning there would train them to ignore the banner that matters.
  if (input.nodeEnv !== 'production') return false;
  return !isLocalHost(input.hostname);
}

export function isLocalHost(hostname: string | undefined): boolean {
  if (!hostname) return true;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  );
}
