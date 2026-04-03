'use client'

import dynamic from 'next/dynamic'

const ChatWidget = dynamic(
  () => import('./chat-widget').then(m => ({ default: m.ChatWidget })),
  { ssr: false, loading: () => null }
)

export function ChatWidgetWrapper() {
  return <ChatWidget />
}
