export function assertTestTarget() {
  const expected = process.env.CLIENTDESK_TEST_PROJECT_ID;
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid');
  if (process.env.CLIENTDESK_TEST_PROJECT !== 'true' || !expected ||
      expected === 'ycysxbipmjraofdhtzwj' || url.origin !== `https://${expected}.supabase.co`)
    throw Error('Tests require an explicitly identified non-production Supabase project.');
}
