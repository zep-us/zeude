'use client'

import { File, FolderInput, Info, Plus, Trash2, Upload } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SkillFormData } from './types'
import { Textarea } from '@/components/ui/textarea'

interface SkillFileEditorProps {
  formData: SkillFormData
  setFormData: React.Dispatch<React.SetStateAction<SkillFormData>>
}

export function SkillFileEditor({ formData, setFormData }: SkillFileEditorProps) {
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [pendingImport, setPendingImport] = useState<Record<string, string> | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const refFileInputRef = useRef<HTMLInputElement>(null)
  const refFolderInputRef = useRef<HTMLInputElement>(null)

  // Apply imported files to form data (full skill folder)
  const applyImport = useCallback((files: Record<string, string>) => {
    const mainContent = files['SKILL.md'] || ''
    const additionalFiles: Record<string, string> = {}

    for (const [path, content] of Object.entries(files)) {
      if (path !== 'SKILL.md') {
        additionalFiles[path] = content
      }
    }

    setFormData(prev => ({
      ...prev,
      content: mainContent,
      additionalFiles,
    }))
    setConfirmReplace(false)
    setPendingImport(null)
  }, [setFormData])

  // Full skill folder import via native file picker (webkitdirectory)
  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    if (fileList.length === 0) return

    const allFiles: Record<string, string> = {}

    for (const file of fileList) {
      const parts = file.webkitRelativePath.split('/')
      const relativePath = parts.slice(1).join('/')
      if (relativePath) {
        allFiles[relativePath] = await file.text()
      }
    }

    if (Object.keys(allFiles).length === 0) return

    e.target.value = ''

    if (formData.content || Object.keys(formData.additionalFiles).length > 0) {
      setPendingImport(allFiles)
      setConfirmReplace(true)
    } else {
      applyImport(allFiles)
    }
  }, [formData.content, formData.additionalFiles, applyImport])

  // Import individual reference files via file picker
  const handleRefFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    if (fileList.length === 0) return

    const newFiles: Record<string, string> = {}
    for (const file of fileList) {
      if (file.name !== 'SKILL.md') {
        newFiles[file.name] = await file.text()
      }
    }

    e.target.value = ''

    if (Object.keys(newFiles).length > 0) {
      setFormData(prev => ({
        ...prev,
        additionalFiles: { ...prev.additionalFiles, ...newFiles },
      }))
    }
  }, [setFormData])

  // Import reference folder via native file picker (webkitdirectory)
  // Keeps the folder name as prefix (e.g., docs/livekit-core.md)
  const handleRefFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    if (fileList.length === 0) return

    const newFiles: Record<string, string> = {}
    for (const file of fileList) {
      const relativePath = file.webkitRelativePath
      if (relativePath && !relativePath.endsWith('/SKILL.md')) {
        newFiles[relativePath] = await file.text()
      }
    }

    e.target.value = ''

    if (Object.keys(newFiles).length > 0) {
      setFormData(prev => ({
        ...prev,
        additionalFiles: { ...prev.additionalFiles, ...newFiles },
      }))
    }
  }, [setFormData])

  function addFile() {
    const newPath = `file-${Object.keys(formData.additionalFiles).length + 1}.md`
    setFormData(prev => ({
      ...prev,
      additionalFiles: { ...prev.additionalFiles, [newPath]: '' },
    }))
  }

  function removeFile(path: string) {
    setFormData(prev => {
      const newFiles = { ...prev.additionalFiles }
      delete newFiles[path]
      return { ...prev, additionalFiles: newFiles }
    })
  }

  function renameFile(oldPath: string, newPath: string) {
    if (newPath === oldPath) return
    setFormData(prev => {
      // Prevent overwriting an existing file with different content
      if (newPath in prev.additionalFiles && newPath !== oldPath) {
        return prev
      }
      const newFiles = { ...prev.additionalFiles }
      const content = newFiles[oldPath]
      delete newFiles[oldPath]
      newFiles[newPath] = content
      return { ...prev, additionalFiles: newFiles }
    })
  }

  function updateFileContent(path: string, content: string) {
    setFormData(prev => ({
      ...prev,
      additionalFiles: { ...prev.additionalFiles, [path]: content },
    }))
  }

  const additionalFileEntries = Object.entries(formData.additionalFiles)

  // Build file tree preview as structured data for CSS-aligned rendering
  type TreeLine = { guides: boolean[]; isLast: boolean; name: string; isDir: boolean }
  const fileTreeLines = useMemo((): TreeLine[] => {
    const allPaths = ['SKILL.md', ...Object.keys(formData.additionalFiles).sort()]

    type Node = { children: Map<string, Node> }
    const root: Node = { children: new Map() }

    for (const path of allPaths) {
      const parts = path.split('/')
      let node = root
      for (const part of parts) {
        if (!node.children.has(part)) {
          node.children.set(part, { children: new Map() })
        }
        node = node.children.get(part)!
      }
    }

    const lines: TreeLine[] = []
    function walk(node: Node, guides: boolean[]) {
      const entries = [...node.children.entries()]
      entries.forEach(([name, child], i) => {
        const isLast = i === entries.length - 1
        const isDir = child.children.size > 0
        lines.push({ guides: [...guides], isLast, name, isDir })
        if (isDir) {
          walk(child, [...guides, !isLast])
        }
      })
    }

    walk(root, [])
    return lines
  }, [formData.additionalFiles])

  return (
    <div className="space-y-3">
      {/* Hidden file inputs */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error -- webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        onChange={handleFolderSelect}
      />
      <input
        ref={refFileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleRefFileSelect}
      />
      <input
        ref={refFolderInputRef}
        type="file"
        className="hidden"
        // @ts-expect-error -- webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        onChange={handleRefFolderSelect}
      />

      {/* Import confirmation banner */}
      {confirmReplace && pendingImport && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between">
          <span className="text-sm">
            Replace existing content with imported files? ({Object.keys(pendingImport).length} files)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setConfirmReplace(false); setPendingImport(null) }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => applyImport(pendingImport)}>
              Replace
            </Button>
          </div>
        </div>
      )}

      {/* Skill format info — always visible */}
      <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex gap-2 text-xs">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-1 text-muted-foreground">
          <p>
            A skill folder must contain <strong className="text-foreground">SKILL.md</strong> (required) as the main prompt.
            Reference files (docs, examples, data) are <strong className="text-foreground">optional</strong>.
          </p>
          <p>
            Use <strong className="text-foreground">Import Skill Folder</strong> to load your <code className="text-foreground bg-muted px-1 rounded">{formData.slug || '[slug]'}/</code> folder at once, or write directly below.
          </p>
        </div>
      </div>

      {/* File Editor */}
      <div className="border rounded-lg p-4 space-y-3">
        {/* Import skill folder button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
          title={`Select your ${formData.slug || '[slug]'} folder containing SKILL.md and reference files`}
        >
          <FolderInput className="h-3.5 w-3.5 mr-1.5" />
          Import Skill Folder
        </Button>

        {/* File tree preview */}
        {(formData.content || additionalFileEntries.length > 0) && (
          <div className="bg-muted/30 rounded border px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Structure Preview</span>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Preview of final structure</span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              <div className="text-foreground leading-5">{formData.slug || '[slug]'}/</div>
              {fileTreeLines.map((line, i) => (
                <div key={i} className="flex h-5 items-center">
                  {line.guides.map((hasPipe, j) => (
                    <div key={j} className="w-4 h-full shrink-0 relative">
                      {hasPipe && <div className="absolute left-1.5 inset-y-0 border-l border-muted-foreground/60" />}
                    </div>
                  ))}
                  <div className="w-4 h-full shrink-0 relative">
                    <div className="absolute left-1.5 top-0 h-1/2 border-l border-muted-foreground/60" />
                    {!line.isLast && <div className="absolute left-1.5 top-1/2 h-1/2 border-l border-muted-foreground/60" />}
                    <div className="absolute left-1.5 top-1/2 w-2.5 border-t border-muted-foreground/60" />
                  </div>
                  <span>{line.name}{line.isDir ? '/' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SKILL.md — always present, not deletable */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <File className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-mono font-medium">SKILL.md</span>
            <span className="text-xs text-red-500 font-medium">required</span>
          </div>
          <Textarea
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            placeholder={`---
name: my-skill
description: What this skill does and when to use it
---

Your skill instructions here...

## Guidelines
- Focus on...
- Always...`}
            className="min-h-[200px] font-mono text-sm"
          />
        </div>

        {/* Reference Files section header */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Reference Files</span>
            <span className="text-xs text-muted-foreground">optional — extra docs, examples, or data</span>
          </div>
        </div>

        {/* Additional reference file entries */}
        {additionalFileEntries.map(([path, fileContent]) => (
          <div key={path} className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <File className="h-3 w-3 text-muted-foreground" />
              <Input
                value={path}
                onChange={(e) => renameFile(path, e.target.value)}
                placeholder="e.g., docs/reference.md"
                className="font-mono text-sm h-8 flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeFile(path)}
                title="Remove file"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <Textarea
              value={fileContent}
              onChange={(e) => updateFileContent(path, e.target.value)}
              placeholder="File content..."
              className="min-h-[80px] font-mono text-sm"
            />
          </div>
        ))}

        {/* Reference file actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={addFile}>
            <Plus className="h-3 w-3 mr-1" />
            Add Reference File
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refFolderInputRef.current?.click()}
          >
            <FolderInput className="h-3 w-3 mr-1" />
            Import Reference Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refFileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3 mr-1" />
            Import Reference Files
          </Button>
        </div>
      </div>
    </div>
  )
}
