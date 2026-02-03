'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success' | 'error'

interface InviteInfo {
  team: string
  role: string
  expiresAt: string
}

interface AcceptResult {
  agentKey: string
  team: string
  role: string
}

export default function InvitePage() {
  const params = useParams()
  const token = params.token as string

  const [status, setStatus] = useState<InviteStatus>('loading')
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [invalidReason, setInvalidReason] = useState<string>('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<AcceptResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function validateInvite() {
      try {
        const res = await fetch(`/api/invite/${token}`)
        const data = await res.json()

        if (data.valid) {
          setInviteInfo({
            team: data.team,
            role: data.role,
            expiresAt: data.expiresAt,
          })
          setStatus('valid')
        } else {
          setInvalidReason(data.reason)
          setStatus('invalid')
        }
      } catch {
        setStatus('error')
      }
    }

    if (token) {
      validateInvite()
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('submitting')

    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite')
        setStatus('valid')
        return
      }

      setResult({
        agentKey: data.agentKey,
        team: data.team,
        role: data.role,
      })
      setStatus('success')
    } catch {
      setError('Network error. Please try again.')
      setStatus('valid')
    }
  }

  async function copyKey() {
    if (result?.agentKey) {
      await navigator.clipboard.writeText(result.agentKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const reasonMessages: Record<string, string> = {
    not_found: 'This invite link is invalid or does not exist.',
    used: 'This invite link has already been used.',
    expired: 'This invite link has expired.',
    invalid_format: 'Invalid invite link format.',
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">Validating invite...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'invalid' || status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Invite</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {reasonMessages[invalidReason] || 'This invite link is not valid.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'success' && result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-green-600">Welcome to Zeude!</CardTitle>
            <CardDescription>
              You&apos;ve joined the <Badge variant="outline">{result.team}</Badge> team as {result.role}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Your Agent Key</label>
              <p className="text-xs text-muted-foreground mb-2">
                Save this key securely - it will not be shown again
              </p>
              <div className="flex gap-2">
                <Input
                  value={result.agentKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button onClick={copyKey} variant="outline">
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Next Steps</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Copy the agent key above</li>
                <li>Run <code className="bg-muted px-1 rounded">zeude login</code> in your terminal</li>
                <li>Paste your agent key when prompted</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join Zeude</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join the <Badge variant="outline">{inviteInfo?.team}</Badge> team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                minLength={2}
                disabled={status === 'submitting'}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={status === 'submitting'}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Creating account...' : 'Get Agent Key'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
