import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { capabilityGroups } from '@/lib/agents/catalogue';

export const dynamic = 'force-dynamic';

/**
 * The capabilities the engine can actually execute, grouped for display.
 *
 * Derived from the handler registry, so the picker in the browser and the
 * validation on write are reading the same list — a capability cannot be
 * offered by one and rejected by the other.
 */
export async function GET() {
  // Behind the session check like everything else; there is nothing sensitive
  // here, but an unauthenticated caller has no business enumerating the system.
  await getSession();
  return NextResponse.json({ groups: capabilityGroups() });
}
