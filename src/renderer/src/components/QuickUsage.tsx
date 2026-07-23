import { useEffect, useState } from 'react'
import type { UsageReport } from '../global'
import { getPrefs } from '../lib/prefs'
import { t, ti } from '../lib/i18n'

interface Props {
  onOpen: () => void
}

type Real = Awaited<ReturnType<typeof window.api.getRealUsage>>

function fmtCost(n: number): string {
  return '$' + n.toFixed(2)
}
function until(target: number): string {
  const diff = target - Date.now()
  if (diff <= 0) return t('relNow')
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}sa ${m}dk` : `${m}dk`
}
function barColor(pct: number): string {
  if (pct >= 90) return 'var(--red)'
  if (pct >= 70) return '#f59e0b'
  return '#60a5fa'
}

export default function QuickUsage({ onOpen }: Props): JSX.Element {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [real, setReal] = useState<Real | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const loadEstimate = (): void => {
      window.api.getUsage().then((r) => alive && setReport(r))
    }
    const loadReal = (): void => {
      window.api.getRealUsage().then((r) => alive && setReal(r))
    }
    loadEstimate()
    loadReal()
    const t1 = setInterval(loadEstimate, 60000)
    const t2 = setInterval(loadReal, 5 * 60000) // real usage pings less often
    const tick = setInterval(() => alive && setTick((x) => x + 1), 30000)
    return () => {
      alive = false
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(tick)
    }
  }, [])

  const sess = real?.ok ? real.fiveHour : undefined
  const sessPct = sess ? Math.round(sess.utilization) : null

  return (
    <button className="quick-usage" onClick={onOpen} title={t('quTitle')}>
      <div className="qu-head">
        <span>{t('quUsage')}</span>
        <span className="qu-more">{t('quDetail')}</span>
      </div>
      {sessPct != null && sessPct >= 85 && getPrefs().usageAlerts && (
        <div className="qu-alert">{ti('quSessionLimit', { pct: sessPct })}</div>
      )}
      <div className="qu-rows">
        {/* real session usage (5h) */}
        <div className="qu-session">
          <div className="qu-row">
            <span className="qu-lbl">
              {t('quSession')} <span className="qu-dim">5s</span>
            </span>
            <span className="qu-val accent">{sessPct != null ? `${sessPct}%` : '—'}</span>
            <span className="qu-tok">
              {sess?.resetsAt ? `⟳ ${until(sess.resetsAt)}` : ''}
            </span>
          </div>
          <div className="qu-track">
            <div
              className="qu-fill"
              style={{
                width: `${sessPct ?? 0}%`,
                background: barColor(sessPct ?? 0)
              }}
            />
          </div>
        </div>

        {/* daily (estimated cost) */}
        {report && (
          <>
            <div className="qu-row">
              <span className="qu-lbl">{t('quToday')}</span>
              <span className="qu-val">{fmtCost(report.today.cost)}</span>
              <span className="qu-tok">⟳ {until(report.todayResetsAt)}</span>
            </div>
            <div className="qu-row">
              <span className="qu-lbl">{t('quTotal')}</span>
              <span className="qu-val">{fmtCost(report.total.cost)}</span>
              <span className="qu-tok">{report.total.messages}m</span>
            </div>
          </>
        )}
      </div>
    </button>
  )
}
