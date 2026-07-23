import { useEffect, useRef, useState } from 'react'
import type { SearchHit, ResourceItem } from '../global'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

interface Props {
  assistantId: string
  onClose: () => void
  onOpenFile: (item: ResourceItem) => void
}

export default function FindReplace({ assistantId, onClose, onOpenFile }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  const totalMatches = hits.reduce((n, h) => n + h.matches.length, 0)

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim()) {
      setHits([])
      setSearched(false)
      return
    }
    debounce.current = setTimeout(async () => {
      setBusy(true)
      const r = await window.api.searchResources(assistantId, query, { regex, caseSensitive })
      setHits(r)
      setSearched(true)
      setBusy(false)
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [query, regex, caseSensitive, assistantId])

  async function doReplace(paths?: string[]): Promise<void> {
    if (!query.trim()) return
    setBusy(true)
    const r = await window.api.replaceInResources(assistantId, query, replacement, {
      regex,
      caseSensitive,
      paths
    })
    setBusy(false)
    if (r.count > 0) {
      toast(ti('toastReplaced', { count: r.count, files: r.files }), 'success')
      // refresh results
      const next = await window.api.searchResources(assistantId, query, { regex, caseSensitive })
      setHits(next)
    } else {
      toast(t('toastNothingToReplace'), 'info')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="fr-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fr-head">
          <span className="fr-title">{t('frTitle')}</span>
          <button className="fr-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="fr-inputs">
          <input
            className="fr-input"
            autoFocus
            placeholder={t('frFindPh')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            className="fr-input"
            placeholder={t('frReplacePh')}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
        </div>

        <div className="fr-opts">
          <label className={`fr-chip ${caseSensitive ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Aa
          </label>
          <label className={`fr-chip ${regex ? 'on' : ''}`}>
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
            .*
          </label>
          <span className="fr-count">
            {busy ? t('frSearching') : searched ? ti('frMatchesFiles', { matches: totalMatches, files: hits.length }) : ''}
          </span>
          <button
            className="btn primary sm"
            disabled={busy || totalMatches === 0}
            onClick={() => doReplace()}
          >
            {t('frReplaceAll')}
          </button>
        </div>

        <div className="fr-results">
          {searched && hits.length === 0 && !busy && (
            <div className="fr-empty">{t('frNoMatch')}</div>
          )}
          {hits.map((h) => (
            <div key={h.path} className="fr-file">
              <div className="fr-file-head">
                <span
                  className="fr-file-name"
                  onClick={() => onOpenFile({ kind: h.kind as ResourceItem['kind'], name: h.name, path: h.path })}
                  title={h.path}
                >
                  <span className="fr-kind">{h.kind}</span>
                  {h.name}
                  <span className="fr-file-count">{h.matches.length}</span>
                </span>
                <button
                  className="fr-file-replace"
                  disabled={busy}
                  onClick={() => doReplace([h.path])}
                  title={t('frReplaceInFile')}
                >
                  {t('frReplace')}
                </button>
              </div>
              <div className="fr-lines">
                {h.matches.slice(0, 8).map((m, i) => (
                  <div key={i} className="fr-line">
                    <span className="fr-ln">{m.line}</span>
                    <span className="fr-text">{m.text}</span>
                  </div>
                ))}
                {h.matches.length > 8 && (
                  <div className="fr-more">{ti('frMoreLines', { n: h.matches.length - 8 })}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
