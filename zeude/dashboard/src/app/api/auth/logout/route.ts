import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOperationalDb } from '@/lib/db'

export async function POST() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (sessionToken) {
    const db = getOperationalDb()
    db.sessions.deleteByToken(sessionToken)
    cookieStore.delete('session')
  }

  redirect('/auth?error=not_authenticated')
}

export async function GET() {
  return POST()
}
