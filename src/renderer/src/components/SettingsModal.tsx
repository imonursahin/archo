import { useState } from 'react'
import { getLang, setLang, t, type Lang } from '../lib/i18n'
import { getTheme, applyTheme, type Theme } from '../lib/theme'
import { getPrefs, setPref, type Prefs } from '../lib/prefs'
import { toast } from '../lib/toast'

interface Props {
  onClose: () => void
  onChange: () => void // re-render the app in place (no reload)
}

type Tab = 'general' | 'prefs'

export default function SettingsModal({ onClose, onChange }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const [lang, setLangState] = useState<Lang>(getLang())
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs())

  function chooseTheme(v: Theme): void {
    setThemeState(v)
    applyTheme(v) // instant
    onChange()
  }
  function chooseLang(v: Lang): void {
    setLangState(v)
    setLang(v)
    onChange() // live re-render, stays on the current page
  }
  function togglePref(key: keyof Prefs): void {
    const v = !prefs[key]
    setPref(key, v)
    setPrefsState({ ...prefs, [key]: v })
    if (key === 'notifications' && v) toast(t('notifOnToast'), 'success')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">⚙ {t('appSettings')}</div>

        <div className="settings-tabs">
          <button
            className={tab === 'general' ? 'active' : ''}
            onClick={() => setTab('general')}
          >
            {t('tabGeneral')}
          </button>
          <button className={tab === 'prefs' ? 'active' : ''} onClick={() => setTab('prefs')}>
            {t('tabCustomize')}
          </button>
        </div>

        {tab === 'general' && (
          <>
            <label className="modal-label">{t('language')}</label>
            <div className="seg">
              {/* language names always shown as their own endonym */}
              <button className={lang === 'en' ? 'active' : ''} onClick={() => chooseLang('en')}>
                English
              </button>
              <button className={lang === 'tr' ? 'active' : ''} onClick={() => chooseLang('tr')}>
                Türkçe
              </button>
            </div>

            <label className="modal-label">{t('theme')}</label>
            <div className="seg">
              <button
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => chooseTheme('dark')}
              >
                🌙 {t('dark')}
              </button>
              <button
                className={theme === 'light' ? 'active' : ''}
                onClick={() => chooseTheme('light')}
              >
                ☀ {t('light')}
              </button>
            </div>

            <label className="modal-label">{t('version')}</label>
            <UpdateRow />

            <label className="modal-label">{t('developer')}</label>
            <div className="settings-links">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.api.openExternal('https://github.com/imonursahin')
                }}
              >
                GitHub
              </a>
              <span className="dot">·</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.api.openExternal('https://www.linkedin.com/in/imonursahin')
                }}
              >
                LinkedIn
              </a>
              <span className="settings-links-handle">@imonursahin</span>
            </div>
          </>
        )}

        {tab === 'prefs' && (
          <div className="pref-list">
            <Toggle
              on={prefs.notifications}
              onClick={() => togglePref('notifications')}
              title={t('prefNotif')}
              hint={t('prefNotifHint')}
            />
            <Toggle
              on={prefs.usageAlerts}
              onClick={() => togglePref('usageAlerts')}
              title={t('prefUsageAlert')}
              hint={t('prefUsageAlertHint')}
            />
            <Toggle
              on={prefs.confirmDelete}
              onClick={() => togglePref('confirmDelete')}
              title={t('prefConfirmDelete')}
              hint={t('prefConfirmDeleteHint')}
            />
            <Toggle
              on={prefs.notifyOnDone}
              onClick={() => togglePref('notifyOnDone')}
              title={t('prefNotifyDone')}
              hint={t('prefNotifyDoneHint')}
            />
            <button
              className="pref-test"
              onClick={async () => {
                await window.api.notify(t('testNotifTitle'), t('testNotifBody'))
                toast(t('testNotifSent'), 'info')
              }}
            >
              🔔 {t('testNotifBtn')}
            </button>
          </div>
        )}

        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function UpdateRow(): JSX.Element {
  const [state, setState] = useState<{
    checking: boolean
    current?: string
    latest?: string
    url?: string
    hasUpdate?: boolean
    failed?: boolean
  }>({ checking: false })

  async function check(): Promise<void> {
    setState((s) => ({ ...s, checking: true, failed: false }))
    try {
      const r = await window.api.checkUpdate()
      setState({
        checking: false,
        current: r.current,
        latest: r.latest,
        url: r.url,
        hasUpdate: r.hasUpdate,
        failed: !!r.error && !r.latest
      })
    } catch {
      setState({ checking: false, failed: true })
    }
  }

  return (
    <div className="update-row">
      <button className="btn" onClick={check} disabled={state.checking}>
        {state.checking ? t('checkingUpdate') : `↻ ${t('checkUpdate')}`}
      </button>
      {state.current && !state.checking && (
        <span className="update-status">
          {state.hasUpdate ? (
            <>
              {t('updateAvailable')} — v{state.latest}{' '}
              {state.url && (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (state.url) window.api.openExternal(state.url)
                  }}
                >
                  {t('download')}
                </a>
              )}
            </>
          ) : state.failed ? (
            <span className="muted">
              {t('updateCheckFailed')} (v{state.current})
            </span>
          ) : (
            <span className="muted">
              {t('upToDate')} (v{state.current})
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function Toggle({
  on,
  onClick,
  title,
  hint
}: {
  on: boolean
  onClick: () => void
  title: string
  hint: string
}): JSX.Element {
  return (
    <button className="pref-row" onClick={onClick}>
      <span className="pref-txt">
        <span className="pref-title">{title}</span>
        <span className="pref-hint">{hint}</span>
      </span>
      <span className={`switch ${on ? 'on' : ''}`}>
        <span className="knob" />
      </span>
    </button>
  )
}
