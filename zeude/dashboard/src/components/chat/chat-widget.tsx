'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { MessageCircle, X, Trash2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatState } from './use-chat-state'
import { ChatMessage } from './chat-message'
import { ChatInput } from './chat-input'

const QUICK_ACTIONS = [
  { label: '내 프롬프트 분석', prompt: '내 최근 프롬프트를 분석해줘' },
  { label: '팀 트렌드', prompt: '팀 프롬프트 트렌드 보여줘' },
  { label: '프롬프트 개선', prompt: '내 프롬프트 개선 방법을 알려줘' },
]

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    input,
    setInput,
    loading,
    error,
    sendMessage,
    clearMessages,
  } = useChatState()

  // Client-side only mounting for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleQuickAction = (prompt: string) => {
    sendMessage(prompt)
  }

  if (!mounted) return null

  const widget = (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Panel */}
      <div
        className={cn(
          'bg-background border rounded-lg shadow-lg overflow-hidden transition-all duration-300 ease-in-out flex flex-col',
          isOpen
            ? 'w-[380px] h-[500px] opacity-100 scale-100'
            : 'w-0 h-0 opacity-0 scale-95 pointer-events-none'
        )}
      >
        {/* Header - fixed at top */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/30 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">AI 프롬프트 코치</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearMessages}
              title="대화 초기화"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages - scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                프롬프트 분석 및 개선 제안을 받아보세요
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {loading && (
                <div className="flex justify-start mb-3">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>생각 중...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}

          {error && (
            <div className="p-2 mb-3 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage(input)}
          loading={loading}
        />
      </div>

      {/* Toggle Button */}
      <Button
        size="icon"
        className={cn(
          'h-12 w-12 rounded-full shadow-lg transition-transform hover:scale-105',
          isOpen && 'bg-muted text-muted-foreground hover:bg-muted'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </Button>
    </div>
  )

  return createPortal(widget, document.body)
}
