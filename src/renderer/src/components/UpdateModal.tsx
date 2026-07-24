import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

export interface UpdateInfo {
  current: string
  latest?: string
  url?: string
  notes?: string
}

export default function UpdateModal({
  info,
  onClose
}: {
  info: UpdateInfo
  onClose: () => void
}): JSX.Element {
  const [canBrew, setCanBrew] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [result, setResult] = useState<'ok' | 'fail' | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    window.api.canBrewUpdate().then(setCanBrew)
  }, [])
  useEffect(() => {
    return window.api.onUpdateOutput((p) => {
      if (p.line) setOutput((o) => o + p.line)
      if (p.done) {
        setRunning(false)
        setResult(p.ok ? 'ok' : 'fail')
      }
    })
  }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [output])

  function startUpdate(): void {
    setOutput('')
    setResult(null)
    setRunning(true)
    window.api.runUpdate()
  }

  const showLog = running || result !== null

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">↑ {t('updateAvailable')}</div>
        <div className="update-ver">
          v{info.current} → <b>v{info.latest}</b>
        </div>

        {info.notes && !showLog && <pre className="update-notes">{info.notes.trim()}</pre>}
        {showLog && (
          <pre className="update-log" ref={logRef}>
            {output || '…'}
          </pre>
        )}

        <div className="modal-foot">
          {result === 'ok' ? (
            <button className="btn primary" onClick={() => window.api.relaunch()}>
              ↻ {t('restartApp')}
            </button>
          ) : result === 'fail' ? (
            <>
              <span className="muted">{t('updateFailed')}</span>
              {info.url && (
                <button className="btn" onClick={() => window.api.openExternal(info.url!)}>
                  {t('download')}
                </button>
              )}
            </>
          ) : canBrew ? (
            <button className="btn primary" onClick={startUpdate} disabled={running}>
              {running ? t('updating') : t('updateNow')}
            </button>
          ) : canBrew === false ? (
            <>
              <span className="muted">{t('brewNotFound')}</span>
              {info.url && (
                <button className="btn primary" onClick={() => window.api.openExternal(info.url!)}>
                  {t('download')}
                </button>
              )}
            </>
          ) : (
            <span className="muted">…</span>
          )}
          {!running && (
            <button className="btn" onClick={onClose}>
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
