import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export async function POST() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('session')?.value

  if (sessionToken) {
    const supabase = createServerClient()
    await supabase.from('zeude_sessions').delete().eq('token', sessionToken)
    cookieStore.delete('session')
  }

  redirect('/auth?error=not_authenticated')
}

export async function GET() {
  return POST()
}
