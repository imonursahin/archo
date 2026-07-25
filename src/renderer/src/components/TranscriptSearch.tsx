import { useEffect, useRef, useState } from 'react'
import { t, getLang } from '../lib/i18n'
import type { TranscriptHit, SessionMessage } from '../global'

function highlight(text: string, q: string): (string | JSX.Element)[] {
  if (!q) return [text]
  const out: (string | JSX.Element)[] = []
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  let k = 0
  for (;;) {
    const at = lower.indexOf(ql, i)
    if (at < 0) {
      out.push(text.slice(i))
      break
    }
    if (at > i) out.push(text.slice(i, at))
    out.push(<mark key={k++}>{text.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  return out
}

function when(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(getLang() === 'tr' ? 'tr-TR' : 'en-US')
}

export default function TranscriptSearch({
  onClose,
  assistant,
  onResume
}: {
  onClose: () => void
  assistant?: { id: string; baseDir: string }
  onResume?: (cwd: string, sessionId: string) => void
}): JSX.Element {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<TranscriptHit[]>([])
  const [loading, setLoading] = useState(false)
  const [openHit, setOpenHit] = useState<TranscriptHit | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [allScope, setAllScope] = useState(true) // default: all projects
  const [scopeCwds, setScopeCwds] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readerRef = useRef<HTMLDivElement>(null)

  // gather the current assistant's directories (baseDir + its sessions' cwds)
  useEffect(() => {
    if (!assistant) return
    window.api.listTermSessions(assistant.id).then((sessions) => {
      const cwds = sessions.map((s) => s.cwd).filter(Boolean) as string[]
      setScopeCwds([assistant.baseDir, ...cwds])
    })
  }, [assistant])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    setLoading(true)
    const scope = !allScope && assistant ? scopeCwds : undefined
    timer.current = setTimeout(async () => {
      setHits(await window.api.searchTranscripts(q, scope))
      setLoading(false)
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, allScope, scopeCwds])

  async function openTranscript(hit: TranscriptHit): Promise<void> {
    setOpenHit(hit)
    setMessages(await window.api.readSession(hit.file))
  }

  function resume(hit: TranscriptHit): void {
    onResume?.(hit.project, hit.sessionId)
    onClose()
  }

  // scroll the reader to the first highlighted match
  useEffect(() => {
    if (!openHit) return
    const el = readerRef.current?.querySelector('mark')
    el?.scrollIntoView({ block: 'center' })
  }, [messages, openHit])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-search">
          <input
            autoFocus
            placeholder={t('searchTranscriptsPh')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpenFile(null)
            }}
          />
          {assistant && (
            <div className="ts-scope">
              <button
                className={!allScope ? 'on' : ''}
                onClick={() => setAllScope(false)}
              >
                {t('thisAssistant')}
              </button>
              <button className={allScope ? 'on' : ''} onClick={() => setAllScope(true)}>
                {t('allProjects')}
              </button>
            </div>
          )}
          <button className="btn" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        {openHit ? (
          <>
            <div className="ts-reader-head">
              <button className="ts-back" onClick={() => setOpenHit(null)}>
                ← {t('backToResults')}
              </button>
              <span className="ts-sid" title={openHit.sessionId}>
                {openHit.sessionId.slice(0, 8)}
              </span>
              {onResume && (
                <button className="btn sm ts-resume" onClick={() => resume(openHit)}>
                  ↪ {t('resumeSession')}
                </button>
              )}
            </div>
            <div className="ts-reader" ref={readerRef}>
              {messages.map((m, i) => (
                <div key={i} className={`ts-msg ${m.role}`}>
                  <span className="ts-role">{m.role === 'user' ? t('you') : 'Claude'}</span>
                  <div className="ts-text">{highlight(m.text, q)}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="ts-results">
            {loading && <div className="ts-empty">{t('searching')}</div>}
            {!loading && q.trim().length >= 2 && hits.length === 0 && (
              <div className="ts-empty">{t('noResults')}</div>
            )}
            {hits.map((h, i) => (
              <div key={i} className="ts-hit" onClick={() => openTranscript(h)}>
                <div className="ts-hit-top">
                  <span className={`ts-role ${h.role}`}>
                    {h.role === 'user' ? t('you') : 'Claude'}
                  </span>
                  <span className="ts-proj">{h.project.replace(/^.*\//, '')}</span>
                  <span className="ts-sid" title={h.sessionId}>
                    {h.sessionId.slice(0, 8)}
                  </span>
                  <span className="ts-date">{when(h.timestamp)}</span>
                  {onResume && (
                    <button
                      className="ts-resume"
                      title={t('resumeSession')}
                      onClick={(e) => {
                        e.stopPropagation()
                        resume(h)
                      }}
                    >
                      ↪
                    </button>
                  )}
                </div>
                <div className="ts-snippet">{highlight(h.snippet, q)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
