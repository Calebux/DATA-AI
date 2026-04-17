'use client'

import { useState, useCallback } from 'react'
import { UploadCloud, FileText, Link as LinkIcon, Trash2, CheckCircle2 } from 'lucide-react'

interface KnowledgeSource {
  id: string
  name: string
  type: 'file' | 'url'
  status: 'processing' | 'ready' | 'failed'
  size?: number
  url?: string
  addedAt: Date
}

export default function KnowledgeBasePage() {
  const router = useRouter()
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true)
    else if (e.type === 'dragleave') setIsDragging(false)
  }, [])

  const simulateProcessing = (id: string) => {
    setTimeout(() => {
      setSources(prev => prev.map(s => s.id === id ? { ...s, status: 'ready' } : s))
    }, 2000)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).map(file => {
        const id = crypto.randomUUID()
        simulateProcessing(id)
        return {
          id,
          name: file.name,
          type: 'file' as const,
          status: 'processing' as const,
          size: file.size,
          addedAt: new Date()
        }
      })
      setSources(prev => [...newFiles, ...prev])
    }
  }, [])

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    
    const id = crypto.randomUUID()
    simulateProcessing(id)
    setSources(prev => [{
      id,
      name: urlInput.replace(/^https?:\/\//, '').split('/')[0],
      url: urlInput,
      type: 'url',
      status: 'processing',
      addedAt: new Date()
    }, ...prev])
    setUrlInput('')
  }

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id))
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        
        {/* Header content */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-black">Data Sources</h2>
          <p className="text-sm text-black/50 mt-1">
            Upload PDFs, CSVs, or connect URLs. Swarm agents will automatically index and retrieve this context when executing tasks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* File Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`apple-card p-10 flex flex-col items-center justify-center text-center transition-all ${
              isDragging ? 'ring-2 ring-apple-blue' : 'hover:-translate-y-1'
            }`}
            style={{ borderStyle: 'dashed', borderWidth: '2px', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            <div className="w-12 h-12 bg-black/[0.03] rounded-full flex items-center justify-center mb-4">
              <UploadCloud className={`h-6 w-6 ${isDragging ? 'text-apple-blue' : 'text-black/40'}`} />
            </div>
            <h3 className="font-bold text-sm text-black">Upload Files</h3>
            <p className="text-xs text-black/40 mt-2 max-w-[200px] leading-relaxed">
              Drag and drop your PDFs, TXT, or CSV files here, or click to browse.
            </p>
          </div>

          {/* URL Input */}
          <div className="apple-card p-6 flex flex-col justify-center">
            <h3 className="font-bold text-sm text-black mb-1">Add Web Source</h3>
            <p className="text-xs text-black/40 mb-4 leading-relaxed">
              Provide a documentation URL for agents to scrape and index.
            </p>
            <form onSubmit={handleAddUrl} className="flex gap-2">
              <input
                type="url"
                required
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://docs.example.com"
                className="flex-1 border border-black/10 rounded-lg px-3 py-2 text-sm bg-black/[0.02] focus:bg-white focus:outline-none focus:ring-1 focus:ring-apple-blue transition-all"
              />
              <button 
                type="submit"
                className="apple-btn-primary"
              >
                Sync
              </button>
            </form>
          </div>
        </div>

        {/* Source List */}
        <div className="mt-8">
          <h3 className="text-xs font-bold uppercase tracking-widest text-black/40 flex items-center gap-2 mb-4">
            Indexed Sources
            <span className="bg-black/5 text-black px-2 py-0.5 rounded-full text-[10px]">
              {sources.length}
            </span>
          </h3>

          {sources.length === 0 ? (
            <div className="border-t border-black/5 py-12 text-center">
              <p className="text-sm text-black/30 italic">No sources added yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map(source => (
                <div key={source.id} className="apple-card p-5 flex items-center justify-between group hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-black/[0.02] border border-black/5 rounded flex items-center justify-center flex-shrink-0">
                      {source.type === 'file' ? (
                        <FileText className="h-5 w-5 text-black/40" />
                      ) : (
                        <LinkIcon className="h-4 w-4 text-black/40" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-black">{source.name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-black/40 uppercase tracking-widest mt-1">
                        <span>{source.type.toUpperCase()}</span>
                        {source.size && (
                          <>
                            <span>&bull;</span>
                            <span>{formatBytes(source.size)}</span>
                          </>
                        )}
                        <span>&bull;</span>
                        <span className="flex items-center gap-1">
                          {source.status === 'processing' ? (
                            <>
                              <span className="animate-spin inline-block w-2- h-2 border-[1px] border-black/40 border-t-transparent rounded-full" />
                              Indexing...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              Ready
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => removeSource(source.id)}
                    className="p-2 text-black/30 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove source"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  )
}
