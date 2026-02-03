'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, Loader2, AlertCircle, FileJson, Grid3X3, PenLine, Zap } from 'lucide-react'
import { MCP_PRESETS, parseClaudeJson, type MCPPreset } from '@/lib/mcp-presets'
import type { MCPFormData, RegistrationMode, TestResult } from './types'

interface MCPDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  step: number
  setStep: (step: number) => void
  registrationMode: RegistrationMode
  setRegistrationMode: (mode: RegistrationMode) => void
  formData: MCPFormData
  setFormData: (data: MCPFormData) => void
  selectedPreset: MCPPreset | null
  setSelectedPreset: (preset: MCPPreset | null) => void
  teams: string[]
  onSave: () => Promise<void>
  saving: boolean
  onTest: () => Promise<void>
  testing: boolean
  testResult: TestResult | null
  jsonInput: string
  setJsonInput: (input: string) => void
  jsonError: string | null
  setJsonError: (error: string | null) => void
  parsedServers: { name: string; config: { command: string; args?: string[]; env?: Record<string, string> } }[]
  setParsedServers: (servers: { name: string; config: { command: string; args?: string[]; env?: Record<string, string> } }[]) => void
}

export function MCPDialog({
  open,
  onOpenChange,
  mode,
  step,
  setStep,
  registrationMode,
  setRegistrationMode,
  formData,
  setFormData,
  selectedPreset,
  setSelectedPreset,
  teams,
  onSave,
  saving,
  onTest,
  testing,
  testResult,
  jsonInput,
  setJsonInput,
  jsonError,
  setJsonError,
  parsedServers,
  setParsedServers,
}: MCPDialogProps) {
  const [newArg, setNewArg] = useState('')
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')

  function selectPreset(preset: MCPPreset) {
    setSelectedPreset(preset)
    setFormData({
      name: preset.name,
      command: preset.command,
      args: [...preset.args],
      env: { ...preset.env },
      teams: [],
      isGlobal: false,
    })
    setStep(2)
  }

  function handleJsonImport() {
    setJsonError(null)
    const result = parseClaudeJson(jsonInput)

    if (result.error) {
      setJsonError(result.error)
      return
    }

    if (result.servers.length === 0) {
      setJsonError('No MCP servers found in the JSON')
      return
    }

    setParsedServers(result.servers)

    if (result.servers.length === 1) {
      const server = result.servers[0]
      setFormData({
        name: server.name,
        command: server.config.command,
        args: server.config.args || [],
        env: server.config.env || {},
        teams: [],
        isGlobal: false,
      })
      setStep(2)
    }
  }

  function selectParsedServer(server: { name: string; config: { command: string; args?: string[]; env?: Record<string, string> } }) {
    setFormData({
      name: server.name,
      command: server.config.command,
      args: server.config.args || [],
      env: server.config.env || {},
      teams: [],
      isGlobal: false,
    })
    setStep(2)
  }

  function addArg() {
    if (newArg.trim()) {
      setFormData({ ...formData, args: [...formData.args, newArg.trim()] })
      setNewArg('')
    }
  }

  function removeArg(index: number) {
    setFormData({ ...formData, args: formData.args.filter((_, i) => i !== index) })
  }

  function addEnv() {
    if (newEnvKey.trim() && newEnvValue.trim()) {
      setFormData({
        ...formData,
        env: { ...formData.env, [newEnvKey.trim()]: newEnvValue.trim() },
      })
      setNewEnvKey('')
      setNewEnvValue('')
    }
  }

  function removeEnv(key: string) {
    const newEnv = { ...formData.env }
    delete newEnv[key]
    setFormData({ ...formData, env: newEnv })
  }

  function toggleTeam(team: string) {
    if (formData.teams.includes(team)) {
      setFormData({ ...formData, teams: formData.teams.filter(t => t !== team) })
    } else {
      setFormData({ ...formData, teams: [...formData.teams, team] })
    }
  }

  function renderStep1() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setRegistrationMode('preset')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${registrationMode === 'preset' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
          >
            <Grid3X3 className="h-5 w-5 mb-2" />
            <div className="font-medium text-sm">Presets</div>
            <div className="text-xs text-muted-foreground">Popular servers</div>
          </button>
          <button
            onClick={() => setRegistrationMode('json')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${registrationMode === 'json' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
          >
            <FileJson className="h-5 w-5 mb-2" />
            <div className="font-medium text-sm">Import JSON</div>
            <div className="text-xs text-muted-foreground">Paste claude.json</div>
          </button>
          <button
            onClick={() => { setRegistrationMode('manual'); setStep(2) }}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${registrationMode === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
          >
            <PenLine className="h-5 w-5 mb-2" />
            <div className="font-medium text-sm">Manual</div>
            <div className="text-xs text-muted-foreground">Enter details</div>
          </button>
        </div>

        {registrationMode === 'preset' && (
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
            {MCP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset)}
                className="p-3 rounded-lg border text-left hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{preset.icon}</span>
                  <span className="font-medium text-sm">{preset.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{preset.description}</div>
              </button>
            ))}
          </div>
        )}

        {registrationMode === 'json' && (
          <div className="space-y-3">
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={`Paste your claude.json content or MCP server config...`}
              className="w-full h-40 p-3 font-mono text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {jsonError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {jsonError}
              </div>
            )}
            {parsedServers.length > 1 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Select a server to import:</div>
                {parsedServers.map((server) => (
                  <button
                    key={server.name}
                    onClick={() => selectParsedServer(server)}
                    className="w-full p-2 text-left border rounded-lg hover:bg-muted"
                  >
                    <div className="font-medium text-sm">{server.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{server.config.command}</div>
                  </button>
                ))}
              </div>
            )}
            <Button onClick={handleJsonImport} disabled={!jsonInput.trim()}>
              Parse JSON
            </Button>
          </div>
        )}
      </div>
    )
  }

  function renderStep2() {
    return (
      <div className="space-y-4">
        {selectedPreset && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
            <span className="text-lg">{selectedPreset.icon}</span>
            <span className="font-medium text-sm">{selectedPreset.name}</span>
            <Badge variant="secondary" className="ml-auto">Preset</Badge>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Name</label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Postgres DB"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Command</label>
          <Input
            value={formData.command}
            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
            placeholder="e.g., npx"
            className="font-mono"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Arguments</label>
          <div className="flex gap-2 mb-2">
            <Input
              value={newArg}
              onChange={(e) => setNewArg(e.target.value)}
              placeholder="Add argument..."
              className="font-mono"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addArg())}
            />
            <Button type="button" variant="outline" onClick={addArg}>Add</Button>
          </div>
          {formData.args.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.args.map((arg, i) => (
                <Badge key={i} variant="secondary" className="font-mono">
                  {arg}
                  <button onClick={() => removeArg(i)} className="ml-1 hover:text-destructive">x</button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Environment Variables</label>
          {selectedPreset?.envPlaceholders && Object.keys(selectedPreset.envPlaceholders).length > 0 && (
            <div className="text-xs text-muted-foreground mb-2">
              Required: {Object.keys(selectedPreset.envPlaceholders).join(', ')}
            </div>
          )}
          <div className="flex gap-2 mb-2">
            <Input
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              placeholder="KEY"
              className="font-mono flex-1"
            />
            <Input
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              placeholder={selectedPreset?.envPlaceholders?.[newEnvKey] || 'value'}
              className="font-mono flex-1"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEnv())}
            />
            <Button type="button" variant="outline" onClick={addEnv}>Add</Button>
          </div>
          {Object.keys(formData.env).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(formData.env).map(([key, value]) => (
                <Badge key={key} variant="secondary" className="font-mono">
                  {key}={value.substring(0, 10)}{value.length > 10 && '...'}
                  <button onClick={() => removeEnv(key)} className="ml-1 hover:text-destructive">x</button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderStep3() {
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Teams</label>
          <div className="space-y-2 mt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isGlobal}
                onChange={(e) => setFormData({ ...formData, isGlobal: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">All Teams (Global)</span>
            </label>
            {!formData.isGlobal && teams.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {teams.map((team) => (
                  <label key={team} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.teams.includes(team)}
                      onChange={() => toggleTeam(team)}
                      className="rounded"
                    />
                    <span className="text-sm">{team}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">Test Connection</label>
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing || !formData.command}
            >
              {testing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Test</>
              )}
            </Button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                {testResult.success ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-sm font-medium ${testResult.success ? 'text-green-500' : 'text-destructive'}`}>
                  {testResult.message}
                </span>
              </div>
              {testResult.details && (
                <div className="text-xs text-muted-foreground font-mono mt-2 max-h-24 overflow-auto">
                  {testResult.details}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? (
              step === 1 ? 'Add MCP Server' : step === 2 ? 'Configure Server' : 'Teams & Test'
            ) : 'Edit MCP Server'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' && step === 1 && 'Choose how to add your MCP server'}
            {mode === 'create' && step === 2 && 'Configure the server details'}
            {mode === 'create' && step === 3 && 'Assign teams and test the connection'}
            {mode === 'edit' && 'Update the MCP server configuration'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'create' && (
          <div className="flex items-center gap-2 mb-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
        )}

        {mode === 'create' ? (
          <>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </>
        ) : (
          <>
            {renderStep2()}
            {renderStep3()}
          </>
        )}

        <DialogFooter>
          {mode === 'create' && step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {mode === 'create' && step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && (!formData.name || !formData.command)}
            >
              Next
            </Button>
          ) : (
            <Button onClick={onSave} disabled={!formData.name || !formData.command || saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
