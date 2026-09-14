import { useEffect, useState } from 'react'
import { getLang, setLang, t, ti, type Lang } from '../lib/i18n'
import { getTheme, applyTheme, type Theme } from '../lib/theme'
import { getPrefs, setPref, type Prefs } from '../lib/prefs'
import { toast } from '../lib/toast'

interface Props {
  onClose: () => void
  onChange: () => void // re-render the app in place (no reload)
}

type Tab = 'general' | 'prefs' | 'integrations' | 'doctor'

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
          <button
            className={tab === 'integrations' ? 'active' : ''}
            onClick={() => setTab('integrations')}
          >
            {t('tabIntegrations')}
          </button>
          <button className={tab === 'doctor' ? 'active' : ''} onClick={() => setTab('doctor')}>
            {t('tabDoctor')}
          </button>
        </div>

        {tab === 'doctor' && <DoctorPanel />}

        {tab === 'integrations' && (
          <div className="integrations">
            <GithubSettings />
            <JiraSettings />
            <GoogleSettings />
          </div>
        )}

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

            <label className="modal-label">{t('diskUsage')}</label>
            <LogsRow />

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
            <Toggle
              on={prefs.meetingAlerts}
              onClick={() => {
                togglePref('meetingAlerts')
                // main owns the timer, so it has to hear about the change
                window.api.setMeetingAlerts(!prefs.meetingAlerts)
              }}
              title={t('prefMeetingAlerts')}
              hint={t('prefMeetingAlertsHint')}
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

        {/* integrations save themselves via "Save & test" — a second Save
            button there would only be a disguised close */}
        {tab !== 'integrations' && (
          <div className="modal-foot">
            <button className="btn primary" onClick={onClose}>
              {t('save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// GitHub credentials for the Tools tab. A personal access token rather than the
// `gh` CLI — Archo can't assume gh is installed and logged in on every machine.
// Same write-only handling as Jira: the token goes out, never comes back.
function GithubSettings(): JSX.Element {
  const [token, setToken] = useState('')
  const [login, setLogin] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.getGithubConfig().then((c) => {
      setHasToken(c.hasToken)
      setLogin(c.login)
    })
  }, [])

  async function save(): Promise<void> {
    if (!token.trim()) {
      toast(t('ghMissing'), 'error')
      return
    }
    setBusy(true)
    const r = await window.api.setGithubConfig({ token: token.trim() })
    setBusy(false)
    if (!r.ok) {
      toast(r.error || t('errNotSaved'), 'error')
      return
    }
    setToken('')
    setHasToken(true)
    setLogin(r.login || '')
    toast(ti('ghConnected', { login: r.login || '' }), 'success')
  }

  async function clear(): Promise<void> {
    await window.api.clearGithubConfig()
    setToken('')
    setLogin('')
    setHasToken(false)
    toast(t('ghCleared'), 'info')
  }

  return (
    <div className="jira-settings">
      <div className="int-title">
        ⑂ {t('githubTitle')}
        {hasToken && login && <span className="int-badge">@{login}</span>}
      </div>
      <p className="jira-hint">{t('ghHint')}</p>
      <label className="jira-field">
        <span>{t('ghToken')}</span>
        <input
          type="password"
          placeholder={hasToken ? t('jiraTokenStored') : 'ghp_…'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <a
        className="jira-link"
        onClick={() => window.api.openExternal('https://github.com/settings/tokens')}
      >
        {t('ghTokenLink')} ↗
      </a>
      <div className="jira-actions">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? t('tvLoading') : t('jiraSaveTest')}
        </button>
        {hasToken && (
          <button className="btn" onClick={clear}>
            {t('jiraClear')}
          </button>
        )}
      </div>
    </div>
  )
}

// Jira credentials for the Tools tab. The API token is write-only from here:
// it goes to the main process, gets encrypted with the OS keychain and is never
// read back — the UI only ever learns whether one is stored.
function JiraSettings(): JSX.Element {
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.getJiraConfig().then((c) => {
      setBaseUrl(c.baseUrl)
      setEmail(c.email)
      setHasToken(c.hasToken)
    })
  }, [])

  async function save(): Promise<void> {
    if (!baseUrl.trim() || !email.trim() || (!hasToken && !token.trim())) {
      toast(t('jiraMissing'), 'error')
      return
    }
    setBusy(true)
    const r = await window.api.setJiraConfig({
      baseUrl,
      email,
      token: token.trim() || undefined
    })
    if (!r.ok) {
      setBusy(false)
      toast(r.error || t('errNotSaved'), 'error')
      return
    }
    setToken('')
    setHasToken(true)
    // prove the credentials actually work instead of just claiming "saved"
    const check = await window.api.jiraTools()
    setBusy(false)
    if (check.error && check.error !== 'not-configured') toast(check.error, 'error')
    else toast(t('jiraConnected'), 'success')
  }

  async function clear(): Promise<void> {
    await window.api.clearJiraConfig()
    setBaseUrl('')
    setEmail('')
    setToken('')
    setHasToken(false)
    toast(t('jiraCleared'), 'info')
  }

  return (
    <div className="jira-settings">
      <div className="int-title">
        ◫ {t('jiraTitle')}
        {hasToken && baseUrl && (
          <span className="int-badge">{baseUrl.replace(/^https?:\/\//, '')}</span>
        )}
      </div>
      <p className="jira-hint">{t('jiraHint')}</p>
      <label className="jira-field">
        <span>{t('jiraUrl')}</span>
        <input
          placeholder="https://your-company.atlassian.net"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label className="jira-field">
        <span>{t('jiraEmail')}</span>
        <input
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="jira-field">
        <span>{t('jiraToken')}</span>
        <input
          type="password"
          placeholder={hasToken ? t('jiraTokenStored') : t('jiraTokenPh')}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <a
        className="jira-link"
        onClick={() =>
          window.api.openExternal('https://id.atlassian.com/manage-profile/security/api-tokens')
        }
      >
        {t('jiraTokenLink')} ↗
      </a>
      <div className="jira-actions">
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? t('tvLoading') : t('jiraSaveTest')}
        </button>
        {hasToken && (
          <button className="btn" onClick={clear}>
            {t('jiraClear')}
          </button>
        )}
      </div>
    </div>
  )
}

// Google Calendar. Unlike GitHub/Jira there is no paste-a-token path — this
// runs a real OAuth consent flow in the browser, so the button blocks until
// Google redirects back and we can report what actually happened.
function GoogleSettings(): JSX.Element {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.getGoogleConfig().then((c) => {
      setConnected(c.connected)
      setEmail(c.email)
    })
  }, [])

  async function connect(): Promise<void> {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast(t('gcalMissing'), 'error')
      return
    }
    setBusy(true)
    const r = await window.api.connectGoogle({ clientId, clientSecret })
    setBusy(false)
    if (!r.ok) {
      toast(r.error || t('errNotSaved'), 'error')
      return
    }
    setClientId('')
    setClientSecret('')
    setConnected(true)
    setEmail(r.email || '')
    // the alert watcher can only start once there are credentials to poll with
    window.api.setMeetingAlerts(getPrefs().meetingAlerts)
    toast(ti('gcalConnected', { email: r.email || '' }), 'success')
  }

  async function disconnect(): Promise<void> {
    await window.api.clearGoogleConfig()
    window.api.setMeetingAlerts(false)
    setConnected(false)
    setEmail('')
    toast(t('gcalCleared'), 'info')
  }

  return (
    <div className="jira-settings">
      <div className="int-title">
        ▦ {t('gcalTitle')}
        {connected && email && <span className="int-badge">{email}</span>}
      </div>
      <p className="jira-hint">{t('gcalHint')}</p>
      {!connected && (
        <>
          <label className="jira-field">
            <span>{t('gcalClientId')}</span>
            <input
              placeholder="…apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </label>
          <label className="jira-field">
            <span>{t('gcalClientSecret')}</span>
            <input
              type="password"
              placeholder="GOCSPX-…"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </label>
          <a
            className="jira-link"
            onClick={() =>
              window.api.openExternal('https://console.cloud.google.com/apis/credentials')
            }
          >
            {t('gcalCredLink')} ↗
          </a>
        </>
      )}
      <div className="jira-actions">
        {!connected ? (
          <button className="btn primary" onClick={connect} disabled={busy}>
            {busy ? t('gcalWaiting') : t('gcalConnect')}
          </button>
        ) : (
          <button className="btn" onClick={disconnect}>
            {t('gcalDisconnect')}
          </button>
        )}
      </div>
    </div>
  )
}

function DoctorPanel(): JSX.Element {
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof window.api.runDoctor>> | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    setBusy(true)
    try {
      setChecks(await window.api.runDoctor())
    } catch {
      setChecks([])
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    run()
  }, [])

  return (
    <div className="doctor">
      <div className="doctor-head">
        <span className="muted">{t('doctorHint')}</span>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? t('doctorRunning') : `↻ ${t('doctorRun')}`}
        </button>
      </div>
      {(checks || []).map((c) => (
        <div key={c.id} className={`doctor-row ${c.status}`}>
          <span className="doctor-dot">{c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '✕'}</span>
          <span className="doctor-label">{c.label}</span>
          <span className="doctor-detail">{c.detail}</span>
          {c.hint && <code className="doctor-hint">{c.hint}</code>}
        </div>
      ))}
      {!checks && <div className="muted">{t('doctorRunning')}</div>}
    </div>
  )
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function LogsRow(): JSX.Element {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof window.api.logStats>> | null>(null)
  const [busy, setBusy] = useState(false)

  function refresh(): void {
    window.api.logStats().then(setStats).catch(() => setStats(null))
  }
  useEffect(refresh, [])

  async function prune(days: number): Promise<void> {
    if (days === 0 && !confirm(t('confirmPruneAll'))) return
    setBusy(true)
    const r = await window.api.pruneLogs(days)
    setBusy(false)
    refresh()
    toast(ti('toastLogsPruned', { n: r.files, size: fmtSize(r.freed) }), 'success')
  }

  const days = stats ? Math.floor(stats.oldestMs / 86400000) : 0
  return (
    <div className="update-col">
      <div className="update-row">
        <span className="app-version">{stats ? fmtSize(stats.bytes) : '…'}</span>
        <span className="muted">
          {stats ? ti('logsSummary', { n: stats.files, days }) : ''}
          {stats && stats.orphanBytes > 0
            ? ` · ${ti('logsOrphan', { size: fmtSize(stats.orphanBytes) })}`
            : ''}
        </span>
      </div>
      <div className="update-row">
        <button className="btn" onClick={() => prune(30)} disabled={busy}>
          {t('pruneOlder30')}
        </button>
        <button className="btn" onClick={() => prune(7)} disabled={busy}>
          {t('pruneOlder7')}
        </button>
        <button className="btn" onClick={() => prune(0)} disabled={busy}>
          {t('pruneAll')}
        </button>
      </div>
    </div>
  )
}

function UpdateRow(): JSX.Element {
  const [version, setVersion] = useState('')
  const [state, setState] = useState<{
    checking: boolean
    checked: boolean
    latest?: string
    url?: string
    hasUpdate?: boolean
    failed?: boolean
  }>({ checking: false, checked: false })

  useEffect(() => {
    window.api.getVersion().then(setVersion)
  }, [])

  async function check(): Promise<void> {
    setState((s) => ({ ...s, checking: true, failed: false }))
    try {
      const r = await window.api.checkUpdate()
      setVersion(r.current)
      setState({
        checking: false,
        checked: true,
        latest: r.latest,
        url: r.url,
        hasUpdate: r.hasUpdate,
        failed: !!r.error && !r.latest
      })
    } catch {
      setState({ checking: false, checked: true, failed: true })
    }
  }

  // `brew update` first — otherwise the local tap is stale and upgrade reports
  // "already installed". Restart is needed to run the newly installed binary.
  const BREW_CMD = 'brew update && brew upgrade --cask archo'
  const [copied, setCopied] = useState(false)
  function copyBrew(): void {
    navigator.clipboard.writeText(BREW_CMD).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="update-col">
      <div className="update-row">
        {version && <span className="app-version">v{version}</span>}
        <button className="btn" onClick={check} disabled={state.checking}>
          {state.checking ? t('checkingUpdate') : `↻ ${t('checkUpdate')}`}
        </button>
        {state.checked && !state.checking && (
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
              <span className="muted">{t('updateCheckFailed')}</span>
            ) : (
              <span className="muted">{t('upToDate')}</span>
            )}
          </span>
        )}
      </div>
      {state.hasUpdate && !state.checking && (
        <div className="update-brew">
          <span className="muted">{t('orViaBrew')}</span>
          <code>{BREW_CMD}</code>
          <button className="brew-copy" onClick={copyBrew}>
            {copied ? t('copied') : t('copy')}
          </button>
          <button
            className="brew-copy"
            onClick={() => window.api.relaunch()}
            title={t('restartHint')}
          >
            ↻ {t('restartApp')}
          </button>
        </div>
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
