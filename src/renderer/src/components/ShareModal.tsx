import { useEffect, useState } from 'react'
import type { Assistant } from '../global'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

interface Props {
  assistant: Assistant
  onClose: () => void
}

// An assistant folder is a plain project folder, so sharing it is plain git.
// Everything here is init / commit / remote / push — no Archo-specific format.
export default function ShareModal({ assistant, onClose }: Props): JSX.Element {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.api.shareInfo>> | null>(null)
  const [remote, setRemoteUrl] = useState('')
  const [message, setMessage] = useState('Update assistant')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function refresh(): Promise<void> {
    const r = await window.api.shareInfo(assistant.id)
    setInfo(r)
    if (r.remote) setRemoteUrl(r.remote)
  }
  useEffect(() => {
    refresh()
  }, [assistant.id])

  async function step<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    okMsg: string
  ): Promise<T | null> {
    setBusy(true)
    setErr('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) {
      setErr(r.error || 'failed')
      return null
    }
    toast(okMsg, 'success')
    refresh()
    return r
  }

  async function publish(): Promise<void> {
    const r = await step(
      () => window.api.sharePublish(assistant.id, message.trim() || 'Update assistant'),
      t('toastPublished')
    )
    if (r && !r.committed) toast(t('toastNothingToCommit'), 'warn')
  }

  async function push(): Promise<void> {
    if (remote.trim() && remote.trim() !== info?.remote) {
      const r = await step(
        () => window.api.shareSetRemote(assistant.id, remote.trim()),
        t('toastRemoteSet')
      )
      if (!r) return
    }
    await step(() => window.api.sharePush(assistant.id), t('toastPushed'))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">⎇ {ti('shareTitle', { name: assistant.name })}</div>
        <div className="modal-sub">{t('shareSub')}</div>

        <div className="share-state">
          {!info ? (
            <span className="muted">…</span>
          ) : info.isRepo ? (
            <>
              <span className="app-version">{info.branch}</span>
              <span className="muted">
                {info.dirty ? t('shareDirty') : t('shareClean')}
                {info.ahead ? ` · ${ti('shareAhead', { n: info.ahead })}` : ''}
              </span>
            </>
          ) : (
            <span className="muted">{t('shareNotRepo')}</span>
          )}
        </div>

        <label className="modal-label">{t('shareCommitMsg')}</label>
        <input
          className="modal-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <label className="modal-label">{t('shareRemote')}</label>
        <input
          className="modal-input"
          placeholder="git@github.com:me/my-assistant.git"
          value={remote}
          onChange={(e) => setRemoteUrl(e.target.value)}
        />

        {err && <div className="modal-error">{err}</div>}

        <div className="modal-foot">
          <button className="btn" onClick={() => step(() => window.api.sharePull(assistant.id), t('toastPulled'))} disabled={busy || !info?.remote}>
            ↓ {t('sharePull')}
          </button>
          <button className="btn" onClick={publish} disabled={busy}>
            {t('sharePublish')}
          </button>
          <button className="btn primary" onClick={push} disabled={busy || !remote.trim()}>
            ↑ {t('sharePush')}
          </button>
        </div>
      </div>
    </div>
  )
}
