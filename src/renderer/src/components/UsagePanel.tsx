import { useEffect, useState } from 'react'
import type { UsageReport } from '../global'
import { t, ti, getLang } from '../lib/i18n'

interface Props {
  onClose: () => void
}

function fmtNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}
function fmtCost(n: number): string {
  return '$' + n.toFixed(2)
}
function shortProject(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.slice(-2).join('/') || p
}
function until(target: number): string {
  const diff = target - Date.now()
  if (diff <= 0) return t('relNow')
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? ti('hoursMins', { h, m }) : ti('mins', { m })
}
function clockTime(ms: number): string {
  return new Date(ms).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-US', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

interface RealUsage {
  ok: boolean
  error?: string
  fiveHour?: { utilization: number; resetsAt: number }
  sevenDay?: { utilization: number; resetsAt: number }
  sevenDayOpus?: { utilization: number; resetsAt: number }
  fetchedAt: number
}

function RealBar({
  name,
  sub,
  win
}: {
  name: string
  sub: string
  win?: { utilization: number; resetsAt: number }
}): JSX.Element {
  const pct = win ? Math.round(win.utilization) : 0
  const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? '#f59e0b' : '#60a5fa'
  return (
    <div className="ubar">
      <div className="ubar-head">
        <div>
          <span className="ubar-name">{name}</span>
          <span className="ubar-sub">{sub}</span>
        </div>
        <span className="ubar-pct" style={{ color }}>
          {win ? `${pct}%` : '—'}
        </span>
      </div>
      <div className="ubar-track">
        <div className="ubar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="ubar-foot">
        <span className="ubar-dim">{t('planQuotaReal')}</span>
        <span className="ubar-dim">
          {win && win.resetsAt ? ti('resetsIn', { rel: until(win.resetsAt), time: clockTime(win.resetsAt) }) : ''}
        </span>
      </div>
    </div>
  )
}

export default function UsagePanel({ onClose }: Props): JSX.Element {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [real, setReal] = useState<RealUsage | null>(null)
  const loadReal = (): void => {
    setReal(null)
    window.api.getRealUsage().then(setReal)
  }
  useEffect(loadReal, [])

  useEffect(() => {
    window.api.getUsage().then(setReport)
  }, [])

  const maxDay = report ? Math.max(...report.byDay.map((d) => d.cost), 0.0001) : 1

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal usage-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usage-head">
          <div>
            <div className="modal-title">{t('usageTitle')}</div>
            <div className="modal-sub" dangerouslySetInnerHTML={{ __html: t('usageSub') }} />
          </div>
          <button className="editor-close" onClick={onClose}>
            ×
          </button>
        </div>

        {!report ? (
          <div className="usage-loading">{t('calculating')}</div>
        ) : (
          <div className="usage-body">
            {/* REAL plan usage from Claude (rate-limit headers) */}
            <div className="usage-section-head">
              <div className="usage-section-title" style={{ marginTop: 0 }}>
                {t('realPlanUsage')} <span className="real-badge">Claude</span>
              </div>
              <button className="budget-gear" onClick={loadReal}>
                {t('refresh')}
              </button>
            </div>
            {!real ? (
              <div className="usage-bars">
                <div className="ubar skeleton" />
                <div className="ubar skeleton" />
              </div>
            ) : real.ok ? (
              <div className="usage-bars">
                <RealBar name={t('ubarSession')} sub={t('ubarSessionSub')} win={real.fiveHour} />
                <RealBar name={t('ubarWeekly')} sub={t('ubarWeeklySub')} win={real.sevenDay} />
                {real.sevenDayOpus && (
                  <RealBar name={t('ubarWeeklyOpus')} sub={t('ubarWeeklyOpusSub')} win={real.sevenDayOpus} />
                )}
              </div>
            ) : (
              <div className="real-error">
                ⚠ {real.error}
                <div className="real-error-sub">{t('keychainHint')}</div>
              </div>
            )}

            {/* period summary */}
            <div className="usage-periods">
              <div className="uperiod">
                <div className="up-label">{t('periodToday')}</div>
                <div className="up-cost">{fmtCost(report.today.cost)}</div>
                <div className="up-sub">{report.today.messages} {t('msgSuffix')} · {fmtNum(report.today.tokens)} {t('tokSuffix')}</div>
              </div>
              <div className="uperiod">
                <div className="up-label">{t('periodThisWeek')}</div>
                <div className="up-cost">{fmtCost(report.week.cost)}</div>
                <div className="up-sub">{report.week.messages} {t('msgSuffix')} · {fmtNum(report.week.tokens)} {t('tokSuffix')}</div>
              </div>
              <div className="uperiod">
                <div className="up-label">{t('periodThisMonth')}</div>
                <div className="up-cost">{fmtCost(report.month.cost)}</div>
                <div className="up-sub">{report.month.messages} {t('msgSuffix')} · {fmtNum(report.month.tokens)} {t('tokSuffix')}</div>
              </div>
              <div className="uperiod all">
                <div className="up-label">{t('periodAllTime')}</div>
                <div className="up-cost">{fmtCost(report.total.cost)}</div>
                <div className="up-sub">{report.total.messages} {t('msgSuffix')}</div>
              </div>
            </div>

            {/* token breakdown cards */}
            <div className="usage-cards four">
              <div className="usage-card">
                <div className="uc-label">{t('usageInput')}</div>
                <div className="uc-value">{fmtNum(report.total.input)}</div>
              </div>
              <div className="usage-card">
                <div className="uc-label">{t('usageOutput')}</div>
                <div className="uc-value">{fmtNum(report.total.output)}</div>
              </div>
              <div className="usage-card">
                <div className="uc-label">{t('usageCacheRead')}</div>
                <div className="uc-value">{fmtNum(report.total.cacheRead)}</div>
              </div>
              <div className="usage-card">
                <div className="uc-label">{t('usageCacheWrite')}</div>
                <div className="uc-value">{fmtNum(report.total.cacheWrite)}</div>
              </div>
            </div>

            {/* daily chart */}
            <div className="usage-section-title">{ti('dailyCost', { n: report.byDay.length })}</div>
            <div className="usage-chart">
              {report.byDay.map((d) => (
                <div className="uchart-col" key={d.date} title={`${d.date} · ${fmtCost(d.cost)}`}>
                  <div
                    className="uchart-bar"
                    style={{ height: `${Math.max(2, (d.cost / maxDay) * 100)}%` }}
                  />
                  <div className="uchart-label">{d.date.slice(5)}</div>
                </div>
              ))}
              {report.byDay.length === 0 && <div className="usage-loading">{t('noData')}</div>}
            </div>

            {/* by model */}
            <div className="usage-section-title">{t('byModel')}</div>
            <div className="usage-table">
              <div className="ut-head">
                <span>{t('colModel')}</span>
                <span>{t('colMessage')}</span>
                <span>{t('colInput')}</span>
                <span>{t('colOutput')}</span>
                <span>{t('colCost')}</span>
              </div>
              {Object.entries(report.byModel)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([model, b]) => (
                  <div className="ut-row" key={model}>
                    <span className="ut-model">{model}</span>
                    <span>{b.messages}</span>
                    <span>{fmtNum(b.input)}</span>
                    <span>{fmtNum(b.output)}</span>
                    <span className="accent">{fmtCost(b.cost)}</span>
                  </div>
                ))}
            </div>

            {/* by project */}
            {report.byProject.length > 0 && (
              <>
                <div className="usage-section-title">{t('byProject')}</div>
                <div className="usage-table">
                  {report.byProject.map((p) => (
                    <div className="ut-row proj" key={p.project}>
                      <span className="ut-model">{shortProject(p.project)}</span>
                      <span>{p.messages} {t('msgSuffix')}</span>
                      <span className="accent">{fmtCost(p.cost)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="usage-foot">{ti('usageFoot', { n: report.scannedFiles })}</div>
          </div>
        )}
      </div>
    </div>
  )
}
