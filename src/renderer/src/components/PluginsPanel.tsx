import { useEffect, useState } from 'react'
import type { Assistant, PluginEntry, Marketplace } from '../global'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

interface Props {
  assistant: Assistant
  onClose: () => void
  onChanged?: () => void
}

type Tab = 'installed' | 'available' | 'marketplaces'

export default function PluginsPanel({ assistant, onClose, onChanged }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('installed')
  const [installed, setInstalled] = useState<PluginEntry[]>([])
  const [available, setAvailable] = useState<PluginEntry[]>([])
  const [markets, setMarkets] = useState<Marketplace[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [newMarket, setNewMarket] = useState('')

  async function refresh(): Promise<void> {
    setLoading(true)
    const [r, m] = await Promise.all([
      window.api.listPlugins(assistant.id),
      window.api.listMarketplaces(assistant.id)
    ])
    setInstalled(r.installed)
    setAvailable(r.available)
    setMarkets(m)
    setErr(r.ok ? '' : r.error || '')
    setLoading(false)
  }
  useEffect(() => {
    refresh()
  }, [assistant.id])

  // every mutation is a `claude plugin` call, so it can take seconds — the row
  // that triggered it is the one that shows as busy
  async function act(key: string, action: string, arg: string, okMsg: string): Promise<void> {
    setBusy(key)
    setErr('')
    const r = await window.api.pluginAction(assistant.id, action, arg)
    setBusy('')
    if (!r.ok) {
      setErr(r.error || 'failed')
      return
    }
    toast(okMsg, 'success')
    await refresh()
    onChanged?.()
  }

  const list = (tab === 'installed' ? installed : available).filter((p) =>
    query ? p.id.toLowerCase().includes(query.toLowerCase()) : true
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal plugins-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">🧩 {ti('pluginsTitle', { name: assistant.name })}</div>

        <div className="settings-tabs">
          <button className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>
            {ti('pluginsInstalled', { n: installed.length })}
          </button>
          <button className={tab === 'available' ? 'active' : ''} onClick={() => setTab('available')}>
            {ti('pluginsAvailable', { n: available.length })}
          </button>
          <button
            className={tab === 'marketplaces' ? 'active' : ''}
            onClick={() => setTab('marketplaces')}
          >
            {ti('pluginsMarkets', { n: markets.length })}
          </button>
        </div>

        {err && <div className="modal-error">{err}</div>}
        {loading && <div className="muted">{t('pluginsLoading')}</div>}

        {tab !== 'marketplaces' && !loading && (
          <>
            <input
              className="modal-input"
              placeholder={t('pluginsSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="plugin-list">
              {list.length === 0 && <div className="st-empty">{t('pluginsNone')}</div>}
              {list.map((p) => (
                <div key={p.id} className="plugin-row">
                  <span className="plugin-id">{p.id}</span>
                  {p.version && <span className="plugin-ver">{p.version.slice(0, 12)}</span>}
                  {p.scope && <span className="plugin-scope">{p.scope}</span>}
                  <div className="plugin-actions">
                    {p.installed ? (
                      <>
                        <button
                          className="st-mini"
                          disabled={!!busy}
                          onClick={() =>
                            act(
                              p.id,
                              p.enabled ? 'disable' : 'enable',
                              p.id,
                              p.enabled ? t('pluginDisabled') : t('pluginEnabled')
                            )
                          }
                        >
                          {busy === p.id ? '…' : p.enabled ? t('pluginDisable') : t('pluginEnable')}
                        </button>
                        <button
                          className="st-mini"
                          disabled={!!busy}
                          onClick={() => act(p.id, 'update', p.id, t('pluginUpdated'))}
                        >
                          {t('pluginUpdate')}
                        </button>
                        <button
                          className="st-mini danger"
                          disabled={!!busy}
                          onClick={() => {
                            if (confirm(ti('confirmUninstallPlugin', { name: p.id })))
                              act(p.id, 'uninstall', p.id, t('pluginUninstalled'))
                          }}
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <button
                        className="st-mini primary"
                        disabled={!!busy}
                        onClick={() => act(p.id, 'install', p.id, t('pluginInstalled'))}
                      >
                        {busy === p.id ? '…' : t('pluginInstall')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'marketplaces' && !loading && (
          <>
            <div className="plugin-list">
              {markets.map((m) => (
                <div key={m.name} className="plugin-row">
                  <span className="plugin-id">{m.name}</span>
                  <span className="plugin-ver">{m.repo || m.source || ''}</span>
                  <div className="plugin-actions">
                    <button
                      className="st-mini"
                      disabled={!!busy}
                      onClick={() => act(m.name, 'marketplaceUpdate', m.name, t('marketUpdated'))}
                    >
                      {busy === m.name ? '…' : t('pluginUpdate')}
                    </button>
                    <button
                      className="st-mini danger"
                      disabled={!!busy}
                      onClick={() => {
                        if (confirm(ti('confirmRemoveMarket', { name: m.name })))
                          act(m.name, 'marketplaceRemove', m.name, t('marketRemoved'))
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label className="modal-label">{t('marketAdd')}</label>
            <div className="plugin-add">
              <input
                className="modal-input"
                placeholder="owner/repo or https://…"
                value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)}
              />
              <button
                className="btn primary"
                disabled={!newMarket.trim() || !!busy}
                onClick={() => {
                  act('add', 'marketplaceAdd', newMarket.trim(), t('marketAdded')).then(() =>
                    setNewMarket('')
                  )
                }}
              >
                {busy === 'add' ? '…' : t('add')}
              </button>
            </div>
          </>
        )}

        <div className="modal-foot">
          <button className="btn" onClick={refresh} disabled={!!busy}>
            ↻ {t('refresh')}
          </button>
          <button className="btn primary" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
