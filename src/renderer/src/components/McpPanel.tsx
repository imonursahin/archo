import { useState } from 'react'
import type { ResourceItem } from '../global'
import { t as tr, ti } from '../lib/i18n'

interface Props {
  item: ResourceItem
  onClose: () => void
  onChanged?: () => void
  onStatus?: (name: string, status: string) => void
}

type Status = 'idle' | 'testing' | 'ok' | 'error'

export default function McpPanel({ item, onClose, onChanged, onStatus }: Props): JSX.Element {
  const [cfg, setCfg] = useState<any>(item.meta || {})
  const [status, setStatus] = useState<Status>('idle')
  const [tools, setTools] = useState<
    { name: string; description?: string; inputSchema?: any }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [serverInfo, setServerInfo] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  // per-tool playground
  const [openTool, setOpenTool] = useState<string | null>(null)
  const [argMode, setArgMode] = useState<'form' | 'json'>('form')
  const [form, setForm] = useState<Record<string, any>>({})
  const [toolArgs, setToolArgs] = useState('{}')
  const [toolBusy, setToolBusy] = useState(false)
  const [toolResult, setToolResult] = useState<{
    ok: boolean
    result?: unknown
    error?: string
    elapsedMs: number
  } | null>(null)

  function toggleTool(tool: { name: string; inputSchema?: any }): void {
    if (openTool === tool.name) {
      setOpenTool(null)
      return
    }
    setOpenTool(tool.name)
    setToolResult(null)
    setToolArgs('{}')
    setForm({})
    // form mode when the schema has properties, else raw JSON
    setArgMode(tool.inputSchema?.properties ? 'form' : 'json')
  }

  function buildArgs(schema: any): { args?: unknown; error?: string } {
    if (argMode === 'json') {
      try {
        return { args: toolArgs.trim() ? JSON.parse(toolArgs) : {} }
      } catch {
        return { error: tr('errInvalidJsonParam') }
      }
    }
    // build from form, coercing by schema type
    const props = schema?.properties || {}
    const out: Record<string, unknown> = {}
    for (const [key, def] of Object.entries<any>(props)) {
      const raw = form[key]
      if (raw === undefined || raw === '') continue
      const type = def?.type
      if (type === 'number' || type === 'integer') out[key] = Number(raw)
      else if (type === 'boolean') out[key] = !!raw
      else if (type === 'array' || type === 'object') {
        try {
          out[key] = JSON.parse(raw)
        } catch {
          return { error: ti('errInvalidJsonField', { key }) }
        }
      } else out[key] = raw
    }
    return { args: out }
  }

  async function runTool(name: string, schema: any): Promise<void> {
    const { args, error } = buildArgs(schema)
    if (error) {
      setToolResult({ ok: false, error, elapsedMs: 0 })
      return
    }
    setToolBusy(true)
    setToolResult(null)
    const r = await window.api.callMcpTool(cfg, name, args ?? {})
    setToolResult(r)
    setToolBusy(false)
  }

  // editing
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cmdLine = cfg.command
    ? `${cfg.command} ${(cfg.args || []).join(' ')}`.trim()
    : cfg.url || cfg.type || '—'
  const envKeys = cfg.env ? Object.keys(cfg.env) : []

  async function test(): Promise<void> {
    setStatus('testing')
    setError(null)
    setTools([])
    setServerInfo(null)
    const r = await window.api.testMcp(cfg)
    setElapsed(r.elapsedMs)
    if (r.ok) {
      setStatus('ok')
      setTools(r.tools || [])
      setServerInfo([r.serverName, r.serverVersion].filter(Boolean).join(' ') || null)
      onStatus?.(item.name, 'ok')
    } else {
      setStatus('error')
      setError(r.error || tr('errUnknown'))
      const authy = /auth|unauthor|token|login|oauth|credential|api key|permission/i.test(
        r.error || ''
      )
      onStatus?.(item.name, authy ? 'auth' : 'error')
    }
  }

  function startEdit(): void {
    setDraft(JSON.stringify(cfg, null, 2))
    setSaveErr(null)
    setEditing(true)
  }

  async function save(): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (e: any) {
      setSaveErr(tr('errInvalidJson') + (e?.message || ''))
      return
    }
    setSaving(true)
    try {
      await window.api.updateMcpServer(item.path!, item.name, parsed)
      setCfg(parsed)
      setEditing(false)
      setStatus('idle')
      onChanged?.()
    } catch (e: any) {
      setSaveErr(e?.message || tr('errNotSaved'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(ti('confirmDeleteMcp', { name: item.name }))) return
    await window.api.deleteMcpServer(item.path!, item.name)
    onChanged?.()
    onClose()
  }

  const shown = tools.filter(
    (t) =>
      !filter.trim() ||
      t.name.toLowerCase().includes(filter.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <>
      <div className="editor-head">
        <button className="editor-close" onClick={onClose} title={tr('close')}>
          ×
        </button>
        <span className="fname">🔌 {item.name}</span>
        <span className={`mcp-status-dot ${status}`} title={status} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!editing && (
            <>
              <button className="btn" onClick={startEdit}>
                {tr('mcpEdit')}
              </button>
              <button className="btn" onClick={remove}>
                {tr('mcpDelete')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mcp-body">
        {editing ? (
          <div className="mcp-edit">
            <div className="doc-field-label">{tr('serverConfigJson')}</div>
            <textarea
              className="raw-area mcp-edit-area"
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
            />
            {saveErr && <div className="mcp-error-box">⚠ {saveErr}</div>}
            <div className="mcp-edit-actions">
              <button className="btn primary" onClick={save} disabled={saving}>
                {tr('saveIconPlain')}
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                {tr('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mcp-meta">
              <div className="mcp-row">
                <label>{tr('command')}</label>
                <code>{cmdLine}</code>
              </div>
              {envKeys.length > 0 && (
                <div className="mcp-row">
                  <label>Env</label>
                  <div className="mcp-env">
                    {envKeys.map((k) => (
                      <span key={k} className="mcp-env-key">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mcp-row">
                <label>{tr('source')}</label>
                <code className="muted">{item.path?.split('/').slice(-2).join('/')}</code>
              </div>
            </div>

            <div className="mcp-actions">
              <button className="btn primary" onClick={test} disabled={status === 'testing'}>
                {status === 'testing'
                  ? tr('mcpConnecting')
                  : status === 'ok'
                    ? tr('mcpReconnect')
                    : tr('mcpTestConnect')}
              </button>
              {status === 'ok' && (
                <span className="mcp-ok">
                  {tr('mcpConnected')}{serverInfo ? ` · ${serverInfo}` : ''} · {tools.length} tool ·{' '}
                  {elapsed}ms
                </span>
              )}
              {status === 'error' && <span className="mcp-err">{tr('mcpErrorDot')} · {elapsed}ms</span>}
            </div>

            {status === 'error' && <div className="mcp-error-box">⚠ {error}</div>}

            {status === 'ok' && (
              <div className="mcp-tools">
                <div className="mcp-tools-head">
                  <span>TOOLS ({tools.length})</span>
                  <input
                    placeholder={tr('mcpFilterPh')}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                {shown.map((t) => (
                  <div key={t.name} className={`mcp-tool ${openTool === t.name ? 'open' : ''}`}>
                    <div className="mcp-tool-head" onClick={() => toggleTool(t)}>
                      <div>
                        <div className="mcp-tool-name">{t.name}</div>
                        {t.description && <div className="mcp-tool-desc">{t.description}</div>}
                      </div>
                      <span className="mcp-tool-run">{openTool === t.name ? '▾' : tr('mcpTestTool')}</span>
                    </div>
                    {openTool === t.name && (
                      <div className="mcp-play">
                        <div className="mcp-play-head">
                          <span className="doc-field-label" style={{ margin: 0 }}>
                            {tr('parameters')}
                          </span>
                          {t.inputSchema?.properties && (
                            <div className="mcp-argmode">
                              <button
                                className={argMode === 'form' ? 'active' : ''}
                                onClick={() => setArgMode('form')}
                              >
                                Form
                              </button>
                              <button
                                className={argMode === 'json' ? 'active' : ''}
                                onClick={() => setArgMode('json')}
                              >
                                JSON
                              </button>
                            </div>
                          )}
                        </div>

                        {argMode === 'form' && t.inputSchema?.properties ? (
                          <div className="mcp-form">
                            {Object.entries<any>(t.inputSchema.properties).map(([key, def]) => {
                              const required = (t.inputSchema.required || []).includes(key)
                              const type = def?.type
                              return (
                                <div className="mcp-field" key={key}>
                                  <label>
                                    {key}
                                    {required && <span className="req">*</span>}
                                    <span className="mcp-field-type">{type || 'any'}</span>
                                  </label>
                                  {def?.description && (
                                    <div className="mcp-field-desc">{def.description}</div>
                                  )}
                                  {type === 'boolean' ? (
                                    <input
                                      type="checkbox"
                                      checked={!!form[key]}
                                      onChange={(e) =>
                                        setForm((f) => ({ ...f, [key]: e.target.checked }))
                                      }
                                    />
                                  ) : Array.isArray(def?.enum) ? (
                                    <select
                                      className="mcp-input"
                                      value={form[key] ?? ''}
                                      onChange={(e) =>
                                        setForm((f) => ({ ...f, [key]: e.target.value }))
                                      }
                                    >
                                      <option value="">—</option>
                                      {def.enum.map((o: any) => (
                                        <option key={String(o)} value={String(o)}>
                                          {String(o)}
                                        </option>
                                      ))}
                                    </select>
                                  ) : type === 'array' || type === 'object' ? (
                                    <textarea
                                      className="mcp-input mono"
                                      rows={2}
                                      placeholder={type === 'array' ? '[]' : '{}'}
                                      value={form[key] ?? ''}
                                      onChange={(e) =>
                                        setForm((f) => ({ ...f, [key]: e.target.value }))
                                      }
                                    />
                                  ) : (
                                    <input
                                      className="mcp-input"
                                      type={type === 'number' || type === 'integer' ? 'number' : 'text'}
                                      placeholder={def?.default != null ? String(def.default) : ''}
                                      value={form[key] ?? ''}
                                      onChange={(e) =>
                                        setForm((f) => ({ ...f, [key]: e.target.value }))
                                      }
                                    />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <textarea
                            className="raw-area mcp-play-args"
                            value={toolArgs}
                            spellCheck={false}
                            onChange={(e) => setToolArgs(e.target.value)}
                          />
                        )}

                        <div className="mcp-play-actions">
                          <button
                            className="btn primary"
                            onClick={() => runTool(t.name, t.inputSchema)}
                            disabled={toolBusy}
                          >
                            {toolBusy ? tr('mcpRunning') : tr('mcpRun')}
                          </button>
                          {toolResult && (
                            <span className={toolResult.ok ? 'mcp-ok' : 'mcp-err'}>
                              {toolResult.ok ? tr('mcpSuccess') : tr('mcpFailure')} · {toolResult.elapsedMs}ms
                            </span>
                          )}
                        </div>
                        {toolResult && (
                          <pre className="mcp-play-result">
                            {toolResult.ok
                              ? JSON.stringify(toolResult.result, null, 2)
                              : toolResult.error}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {shown.length === 0 && <div className="mcp-empty">{tr('mcpNoMatchingTool')}</div>}
              </div>
            )}

            {status === 'idle' && (
              <div className="mcp-hint">{tr('mcpHint')}</div>
            )}
          </>
        )}
      </div>
    </>
  )
}
