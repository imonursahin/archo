import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { t, ti } from '../lib/i18n'
import { toast } from '../lib/toast'
import type { PrItem, JiraItem, JiraTransition, MeetingItem, JiraBinding } from '../global'

// Dashboard of the things you'd otherwise leave the app to check: your open
// PRs, the ones blocked on your review, and your open Jira issues laid out as
// the board columns they sit in.

function relTime(iso: string): string {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return t('relJustNow')
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// A PR that hasn't moved in a week is a different kind of item than a fresh
// one — surface that on the timestamp instead of adding another column.
function ageClass(iso: string): string {
  if (!iso) return ''
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (days >= 14) return 'rotten'
  if (days >= 7) return 'stale'
  return ''
}

// Jira dwells are shorter-lived than PRs — a ticket sitting 5 days in the same
// column during a two-week sprint is already worth seeing.
function dwellClass(iso: string): string {
  if (!iso) return ''
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (days >= 5) return 'rotten'
  if (days >= 3) return 'stale'
  if (days >= 1) return 'aging'
  return ''
}

function clock(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// countdown to a meeting; blank once it has already started
function startsIn(iso: string): string {
  if (!iso) return ''
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (mins <= 0) return t('tvNow')
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// an all-day entry is never "past" — it covers the whole day you're looking at
function isPast(m: MeetingItem): boolean {
  if (m.allDay || !m.end) return false
  return new Date(m.end).getTime() < Date.now()
}

// happening right now: started but not finished
function isLive(m: MeetingItem): boolean {
  if (m.allDay || !m.start || !m.end) return false
  const now = Date.now()
  return new Date(m.start).getTime() <= now && new Date(m.end).getTime() > now
}

// full date + time — "3m ago" hides whether the data is from today at all
function stamp(ms: number): string {
  return new Date(ms).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function copy(url: string, e: React.MouseEvent): void {
  e.stopPropagation() // the row itself opens the link; the button only copies
  navigator.clipboard.writeText(url)
  toast(t('tvCopied'), 'success')
}

function PrRow({
  pr,
  showAuthor,
  onOpen
}: {
  pr: PrItem
  showAuthor?: boolean
  onOpen?: () => void
}): JSX.Element {
  const open = (): void => {
    onOpen?.()
    window.api.openExternal(pr.url)
  }
  return (
    <div
      className="tv-row"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      title={pr.url}
    >
      <span className={`tv-dot ${pr.isDraft ? 'draft' : ''}`} />
      <span className="tv-row-main">
        <span className="tv-row-title">{pr.title}</span>
        <span className="tv-row-sub">
          {pr.repo} <span className="tv-num">#{pr.number}</span>
          {showAuthor && pr.author ? ` · ${pr.author}` : ''}
          {pr.isDraft ? ` · ${t('tvDraft')}` : ''}
        </span>
      </span>
      <span className={`tv-age ${ageClass(pr.updatedAt)}`} title={t('tvStaleHint')}>
        {relTime(pr.updatedAt)}
      </span>
      <button className="tv-copy" title={t('tvCopyLink')} onClick={(e) => copy(pr.url, e)}>
        <Icon name="copy" size={13} />
      </button>
    </div>
  )
}

function Card({
  icon,
  title,
  count,
  wide,
  board,
  action,
  children
}: {
  icon: string
  title: string
  count?: number
  wide?: boolean
  board?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className={`tv-card ${wide ? 'wide' : ''} ${board ? 'board' : ''}`}>
      <header className="tv-card-head">
        <span className="tv-card-icon">{icon}</span>
        <h3>{title}</h3>
        {count !== undefined && <span className="tv-count">{count}</span>}
        {action && <span className="tv-card-actions">{action}</span>}
      </header>
      <div className="tv-card-body">{children}</div>
    </section>
  )
}

const MENU_W = 250
const FOCUSED_MS = 60_000
const BLURRED_MS = 5 * 60_000
const MAX_BACKOFF_MS = 15 * 60_000

// datetime-local wants local wall-clock, so toISOString (UTC) is wrong here.
// Defaults to the next quarter hour — "now" is never actually when you want a
// meeting to start, and a blank field is one more thing to fill in.
function defaultStart(): string {
  const d = new Date()
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const SEEN_KEY = 'toolsSeenReviews'

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export default function ToolsView({
  visible,
  onAlert,
  onOpenSession
}: {
  visible: boolean
  onAlert?: (on: boolean) => void
  onOpenSession?: (b: JiraBinding) => void
}): JSX.Element {
  const [gh, setGh] = useState<{ mine: PrItem[]; reviews: PrItem[]; error?: string } | null>(null)
  const [jira, setJira] = useState<{ issues: JiraItem[]; error?: string } | null>(null)
  const [cal, setCal] = useState<{ meetings: MeetingItem[]; error?: string } | null>(null)
  const [bindings, setBindings] = useState<JiraBinding[]>([])
  const [loading, setLoading] = useState(false)
  // shown next to Refresh; set by every load, background ones included, so it
  // reflects the real data age rather than the last time you looked at the tab
  const [lastUpdated, setLastUpdated] = useState(0)
  const failuresRef = useRef(0)
  const lastLoadRef = useRef(0)
  // review requests already acknowledged, persisted so a restart doesn't
  // re-alert on everything that was already sitting there
  const seenRef = useRef(loadSeen())
  const [acked, setAcked] = useState(0) // bump to recompute the alert after ack

  // open transition menu: which issue, where to draw it, and its (lazily
  // fetched) transitions — Jira only tells you the legal moves per issue
  const [menu, setMenu] = useState<{
    key: string
    style: React.CSSProperties
  } | null>(null)
  const [moves, setMoves] = useState<JiraTransition[] | null>(null)
  const [moving, setMoving] = useState(false)

  async function openMenu(issueKey: string, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Anchor inside the viewport: a lane near the bottom used to push the menu
    // off-screen entirely, and a fixed-position element can't be scrolled to.
    // Flip above the button when there isn't room below, and cap the height to
    // whatever space is actually available so the list scrolls instead.
    const gap = 4
    const margin = 12
    const below = window.innerHeight - r.bottom - margin
    const above = r.top - margin
    const up = below < 200 && above > below
    setMoves(null)
    setMenu({
      key: issueKey,
      style: {
        left: Math.max(margin, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - margin)),
        width: MENU_W,
        ...(up
          ? { bottom: window.innerHeight - r.top + gap, maxHeight: above }
          : { top: r.bottom + gap, maxHeight: below })
      }
    })
    const res = await window.api.jiraTransitions(issueKey)
    if (res.error) toast(res.error, 'error')
    setMoves(res.transitions)
  }

  async function move(issueKey: string, tr: JiraTransition): Promise<void> {
    setMoving(true)
    const r = await window.api.jiraTransition(issueKey, tr.id)
    setMoving(false)
    setMenu(null)
    if (!r.ok) {
      toast(r.error || t('errNotSaved'), 'error')
      return
    }
    toast(ti('tvMoved', { key: issueKey, to: tr.to }), 'success')
    load()
  }

  // meeting creation: instant room, or a scheduled calendar event
  const [creating, setCreating] = useState(false)
  const [schedule, setSchedule] = useState(false)
  const [form, setForm] = useState({
    title: '',
    at: defaultStart(),
    minutes: 30,
    guests: '',
    kind: 'meeting' as 'meeting' | 'ooo'
  })

  async function instantMeet(): Promise<void> {
    setCreating(true)
    const r = await window.api.createMeetSpace()
    setCreating(false)
    if (!r.url) {
      toast(r.error || t('errNotSaved'), 'error')
      return
    }
    // the link is the deliverable — put it on the clipboard before opening, so
    // it's ready to paste wherever you were about to share it
    navigator.clipboard.writeText(r.url)
    toast(t('tvMeetCreated'), 'success')
    window.api.openExternal(r.url)
  }

  async function scheduleMeet(): Promise<void> {
    if (!form.at) {
      toast(t('tvNeedTime'), 'error')
      return
    }
    setCreating(true)
    const r = await window.api.createMeetingEvent({
      title: form.title.trim() || 'Meeting',
      // datetime-local has no zone; it's wall-clock in the user's own timezone,
      // which is exactly what new Date() reads it as
      startISO: new Date(form.at).toISOString(),
      minutes: Number(form.minutes) || 30,
      guests: form.guests
        .split(/[,\s]+/)
        .map((g) => g.trim())
        .filter(Boolean),
      kind: form.kind
    })
    setCreating(false)
    if (r.error) {
      toast(r.error, 'error')
      return
    }
    if (r.url) navigator.clipboard.writeText(r.url)
    setSchedule(false)
    setForm({ title: '', at: defaultStart(), minutes: 30, guests: '', kind: 'meeting' })
    toast(t(form.kind === 'ooo' ? 'tvOooCreated' : 'tvMeetScheduled'), 'success')
    load()
  }

  // Returns whether the round-trip actually succeeded, so the poller can back
  // off. A missing integration is a steady state, not a failure — backing off
  // for it would just slow down the sources that do work.
  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    const [g, j, m, b] = await Promise.all([
      window.api.githubTools(),
      window.api.jiraTools(),
      window.api.meetingsToday(),
      window.api.sessionJiraBindings()
    ])
    setGh(g)
    setJira(j)
    setCal(m)
    setBindings(b)
    setLoading(false)
    lastLoadRef.current = Date.now()
    setLastUpdated(lastLoadRef.current)
    const real = (e?: string): boolean => !!e && e !== 'not-configured'
    return !real(g.error) && !real(j.error) && !real(m.error)
  }, [])

  // Polls regardless of which tab is open: the point of the dashboard is that
  // it's already current the moment you switch to it, not that it starts
  // catching up then. ToolsView stays mounted for the whole session, so this
  // one loop covers the entire app lifetime.
  //
  // Self-scheduling rather than setInterval because the delay moves: a minute
  // while you're actually at the machine, five when the window is in the
  // background (nobody is reading a dashboard they can't see), and doubling
  // after each consecutive failure so a 429 or a dead network isn't answered
  // by hammering the same wall every 60 seconds.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const delay = (): number => {
      const base = document.hasFocus() ? FOCUSED_MS : BLURRED_MS
      const f = failuresRef.current
      return f ? Math.min(base * 2 ** f, MAX_BACKOFF_MS) : base
    }
    const schedule = (): void => {
      if (timer) clearTimeout(timer)
      if (!cancelled) timer = setTimeout(tick, delay())
    }
    async function tick(): Promise<void> {
      const ok = await load()
      if (cancelled) return
      failuresRef.current = ok ? 0 : failuresRef.current + 1
      schedule()
    }

    const onFocus = (): void => {
      // coming back to the app should feel current, but alt-tabbing repeatedly
      // must not turn into a request per switch
      if (Date.now() - lastLoadRef.current > FOCUSED_MS) void tick()
      else schedule()
    }
    const onBlur = (): void => schedule() // re-arm at the slower cadence

    void tick()
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [load])

  // opening the tab is an explicit "show me the current state" — refetch even
  // though the background poller keeps it warm
  useEffect(() => {
    if (visible) load()
  }, [visible, load])

  const ghUnset = gh?.error === 'not-configured'
  const jiraUnset = jira?.error === 'not-configured'
  const calUnset = cal?.error === 'not-configured'
  // the first meeting that hasn't ended yet — "next" is no longer just the top
  // row now that finished ones stay in the list
  // "next" is the first one that hasn't STARTED yet — a live meeting gets its
  // own, stronger treatment instead of competing for the same highlight
  const nextMeetingId = cal?.meetings.find((m) => !isPast(m) && !isLive(m))?.id

  // Attention signal on the tab: a review request you haven't looked at, or a
  // meeting about to start. Deliberately only these two — a dot that lights up
  // for everything is a dot you learn to ignore.
  const unseenReviews = (gh?.reviews || []).filter((p) => !seenRef.current.has(p.id))
  const imminentMeeting = (cal?.meetings || []).some((m) => {
    if (m.allDay || !m.start || seenRef.current.has(m.id)) return false
    const inMs = new Date(m.start).getTime() - Date.now()
    return inMs > 0 && inMs <= 5 * 60_000
  })
  const alert = unseenReviews.length > 0 || imminentMeeting
  void acked // the ack below mutates a ref, so this is what re-runs the check

  useEffect(() => {
    onAlert?.(alert)
  }, [alert, onAlert])

  // Clicking a review PR or a meeting is the acknowledgement — it means you
  // saw the thing the dot was about, so the dot goes away.
  function ack(): void {
    for (const p of gh?.reviews || []) seenRef.current.add(p.id)
    for (const m of cal?.meetings || []) seenRef.current.add(m.id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current]))
    setAcked((n) => n + 1)
    onAlert?.(false)
  }

  // group jira issues into board columns, keeping the workflow order
  const columns = (() => {
    const order = ['new', 'indeterminate', 'done']
    const map = new Map<string, JiraItem[]>()
    for (const i of jira?.issues || []) {
      const arr = map.get(i.status) || []
      arr.push(i)
      map.set(i.status, arr)
    }
    return [...map.entries()]
      .map(([status, items]) => ({ status, items, cat: items[0].statusCategory }))
      .sort(
        (a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.status.localeCompare(b.status)
      )
  })()

  return (
    <div className={`tools-view ${visible ? '' : 'hidden'}`}>
      <div className="tv-head">
        <h2>{t('tools')}</h2>
        <button className="btn sm" onClick={load} disabled={loading}>
          <Icon name="refresh" size={13} /> {loading ? t('tvLoading') : t('tvRefresh')}
        </button>
        {lastUpdated > 0 && (
          <span className="tv-updated">
            {t('tvLastUpdated')} {stamp(lastUpdated)}
          </span>
        )}
      </div>

      {/* today's calendar — the only card that's time-critical, so it leads */}
      <Card
        icon="▦"
        title={t('tvMeetings')}
        count={calUnset ? undefined : cal?.meetings.length}
        wide
        action={
          calUnset ? undefined : (
            <>
              <button className="btn sm" onClick={instantMeet} disabled={creating}>
                {creating ? t('tvLoading') : t('tvInstantMeet')}
              </button>
              <button className="btn sm" onClick={() => setSchedule((s) => !s)}>
                {t('tvSchedule')}
              </button>
            </>
          )
        }
      >
        {schedule && !calUnset && (
          <div className="tv-form">
            <div className="tv-kind">
              <button
                className={form.kind === 'meeting' ? 'on' : ''}
                onClick={() => setForm({ ...form, kind: 'meeting' })}
              >
                {t('tvKindMeeting')}
              </button>
              <button
                className={form.kind === 'ooo' ? 'on' : ''}
                onClick={() => setForm({ ...form, kind: 'ooo' })}
              >
                {t('tvKindOoo')}
              </button>
            </div>

            <div className="tv-fields">
              <label className="tv-f grow">
                <span>{t('tvMeetTitle')}</span>
                <input
                  className="tv-in"
                  placeholder={form.kind === 'ooo' ? t('tvKindOoo') : t('tvKindMeeting')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="tv-f">
                <span>{t('tvMeetStart')}</span>
                <input
                  className="tv-in"
                  type="datetime-local"
                  value={form.at}
                  onChange={(e) => setForm({ ...form, at: e.target.value })}
                />
              </label>
              <label className="tv-f mins">
                <span>{t('tvMeetMinutes')}</span>
                <input
                  className="tv-in"
                  type="number"
                  min={5}
                  step={5}
                  value={form.minutes}
                  onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
                />
              </label>
              {form.kind === 'meeting' && (
                <label className="tv-f grow">
                  <span>{t('tvMeetGuests')}</span>
                  <input
                    className="tv-in"
                    placeholder="a@x.com, b@x.com"
                    value={form.guests}
                    onChange={(e) => setForm({ ...form, guests: e.target.value })}
                  />
                </label>
              )}
            </div>

            <div className="tv-form-foot">
              <span className="tv-form-note">
                {form.kind === 'ooo' ? t('tvOooNote') : t('tvMeetNote')}
              </span>
              <button className="btn" onClick={() => setSchedule(false)}>
                {t('cancel')}
              </button>
              <button className="btn primary" onClick={scheduleMeet} disabled={creating}>
                {creating ? t('tvLoading') : t('create')}
              </button>
            </div>
          </div>
        )}
        {calUnset && <div className="tv-empty">{t('tvGcalNotConfigured')}</div>}
        {cal?.error && !calUnset && <div className="tv-err">{cal.error}</div>}
        {!cal?.error && cal?.meetings.length === 0 && (
          <div className="tv-empty">{t('tvNoMeetings')}</div>
        )}
        {cal?.meetings.map((m) => (
          <div
            key={m.id}
            className={`tv-row ${m.id === nextMeetingId ? 'next' : ''} ${
              isPast(m) ? 'past' : ''
            } ${isLive(m) ? 'live' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              ack()
              window.api.openExternal(m.meetUrl || m.htmlLink)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              ack()
              window.api.openExternal(m.meetUrl || m.htmlLink)
            }}
            title={m.htmlLink}
          >
            <span className="tv-time">
              {isLive(m) ? <span className="tv-live-dot" /> : null}
              {m.allDay ? t('tvAllDay') : clock(m.start)}
            </span>
            <span className="tv-row-main">
              <span className="tv-row-title">{m.title}</span>
              <span className="tv-row-sub">
                {m.allDay ? '' : `${clock(m.start)}–${clock(m.end)}`}
                {m.eventType === 'outOfOffice' ? ` · ${t('tvOoo')}` : ''}
                {m.meetUrl ? ' · Meet' : ''}
              </span>
            </span>
            <span className="tv-age">
              {m.allDay || isPast(m) ? '' : isLive(m) ? t('tvLive') : startsIn(m.start)}
            </span>
            {m.meetUrl && !isPast(m) && (
              <button
                className="tv-join"
                onClick={(e) => {
                  e.stopPropagation()
                  ack()
                  window.api.openExternal(m.meetUrl!)
                }}
              >
                {t('tvJoin')}
              </button>
            )}
          </div>
        ))}
      </Card>

      {/* GitHub: both cards share one row */}
      <div className="tv-gh-row">
        <Card icon="⑂" title={t('tvMyPrs')} count={ghUnset ? undefined : gh?.mine.length}>
          {ghUnset && <div className="tv-empty">{t('tvGhNotConfigured')}</div>}
          {gh?.error && !ghUnset && <div className="tv-err">{gh.error}</div>}
          {!gh?.error && gh?.mine.length === 0 && <div className="tv-empty">{t('tvNoPrs')}</div>}
          {gh?.mine.map((pr) => (
            <PrRow key={pr.id} pr={pr} />
          ))}
        </Card>

        <Card
          icon="👁"
          title={t('tvReviewRequested')}
          count={ghUnset ? undefined : gh?.reviews.length}
        >
          {ghUnset && <div className="tv-empty">{t('tvGhNotConfigured')}</div>}
          {gh?.error && !ghUnset && <div className="tv-err">{gh.error}</div>}
          {!gh?.error && gh?.reviews.length === 0 && (
            <div className="tv-empty">{t('tvNoReviews')}</div>
          )}
          {gh?.reviews.map((pr) => (
            <PrRow key={pr.id} pr={pr} showAuthor onOpen={ack} />
          ))}
        </Card>
      </div>

      {/* Jira: own row, full width, one lane per board column */}
      <Card
        icon="◫"
        title={t('tvMyIssues')}
        count={jiraUnset ? undefined : jira?.issues.length}
        wide
        board
      >
        {jiraUnset && <div className="tv-empty">{t('tvJiraNotConfigured')}</div>}
        {jira?.error && !jiraUnset && <div className="tv-err">{jira.error}</div>}
        {!jira?.error && jira?.issues.length === 0 && (
          <div className="tv-empty">{t('tvNoIssues')}</div>
        )}
        {columns.length > 0 && (
          <div className="tv-board">
            {columns.map((col) => (
              <div key={col.status} className="tv-lane">
                <div className={`tv-col-head cat-${col.cat}`}>
                  {col.status} <span className="tv-count">{col.items.length}</span>
                </div>
                {col.items.map((i) => (
                  <div
                    key={i.key}
                    className="tv-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => window.api.openExternal(i.url)}
                    onKeyDown={(e) => e.key === 'Enter' && window.api.openExternal(i.url)}
                    title={i.url}
                  >
                    <span className="tv-row-main">
                      <span className="tv-row-title">{i.summary}</span>
                      <span className="tv-row-sub">
                        <span className="tv-key">{i.key}</span> · {i.type}
                        {i.priority ? ` · ${i.priority}` : ''}
                      </span>
                    </span>
                    {bindings
                      .filter((b) => b.jiraKey === i.key)
                      .slice(0, 1)
                      .map((b) => (
                        <button
                          key={b.sessionId}
                          className="tv-sess"
                          title={ti('tvOpenSession', {
                            name: `${b.sessionName} · ${b.terminalName}`
                          })}
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenSession?.(b)
                          }}
                        >
                          ▤ {b.terminalName}
                        </button>
                      ))}
                    <span
                      className={`tv-age ${dwellClass(i.statusChanged)}`}
                      title={t('tvDwellHint')}
                    >
                      {relTime(i.statusChanged)}
                    </span>
                    <button
                      className="tv-copy"
                      title={t('tvCopyLink')}
                      onClick={(e) => copy(i.url, e)}
                    >
                      <Icon name="copy" size={13} />
                    </button>
                    <button
                      className="tv-copy tv-more"
                      title={t('tvMoveTo')}
                      onClick={(e) => openMenu(i.key, e)}
                    >
                      ⋯
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* transition menu — fixed so a lane's overflow can't clip it */}
      {menu && (
        <>
          <div className="tv-menu-scrim" onClick={() => setMenu(null)} />
          <div className="tv-menu" style={menu.style}>
            {!moves && <div className="tv-menu-empty">{t('tvLoading')}</div>}
            {moves?.length === 0 && <div className="tv-menu-empty">{t('tvNoMoves')}</div>}
            {moves?.map((tr) => (
              <button
                key={tr.id}
                className="tv-menu-item"
                disabled={moving}
                onClick={() => move(menu.key, tr)}
              >
                <span className="tv-menu-label">{tr.name}</span>
                <span className="tv-menu-arrow">→</span>
                <span className={`tv-menu-to cat-${tr.toCategory}`}>{tr.to}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
