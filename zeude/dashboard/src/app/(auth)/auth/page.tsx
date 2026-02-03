import { redirect } from 'next/navigation'

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ ott?: string; error?: string }>
}) {
  const { ott, error } = await searchParams

  // If OTT provided, redirect to callback handler
  if (ott) {
    redirect(`/api/auth/callback?ott=${ott}`)
  }

  // Show error page
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-destructive">Authentication Failed</h1>
        <p className="text-muted-foreground">
          {error === 'missing_token' && 'No authentication token provided.'}
          {error === 'invalid_token' && 'Invalid or expired authentication token.'}
          {error === 'session_expired' && 'Your session has expired.'}
          {error === 'session_error' && 'Failed to create session. Please try again.'}
          {error === 'not_authenticated' && 'Please authenticate first.'}
          {!error && 'Please authenticate first.'}
        </p>
        <p className="text-sm text-muted-foreground">
          Run <code className="bg-muted px-2 py-1 rounded">/zeude</code> in Claude Code to authenticate.
        </p>
      </div>
    </div>
  )
}
