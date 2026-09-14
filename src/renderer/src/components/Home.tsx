import type { Assistant, EngineDef } from '../global'
import { t, ti } from '../lib/i18n'
import Icon from './Icon'
import { type UpdateInfo } from './UpdateModal'

interface Props {
  assistants: Assistant[]
  engines: EngineDef[]
  onOpen: (a: Assistant) => void
  onRun: (a: Assistant) => void
  onCreate: () => void
  onUsage: () => void
  onSettings: () => void
  onDelete: (a: Assistant) => void
  onImport: () => void
  onExport: (a: Assistant) => void
  onShare: (a: Assistant) => void
  onClone: () => void
  update?: UpdateInfo | null
  onShowUpdate?: () => void
  onSearchTranscripts?: () => void
}

export default function Home({
  assistants,
  engines,
  onOpen,
  onRun,
  onCreate,
  onUsage,
  onSettings,
  onDelete,
  onImport,
  onExport,
  onShare,
  onClone,
  update,
  onShowUpdate,
  onSearchTranscripts
}: Props): JSX.Element {
  const engineName = (id: string): string => engines.find((e) => e.id === id)?.name || id

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <div className="home-brand">ARCHO</div>
          <h1 className="home-title">{t('yourAssistants')}</h1>
          <p className="home-sub">{t('homeSub')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {update && (
            <button className="btn big update-badge" onClick={onShowUpdate}>
              ↑ {ti('updateReadyBadge', { v: update.latest || '' })}
            </button>
          )}
          <button className="btn big icon-btn" onClick={onUsage}>
            <Icon name="usage" /> {t('usage')}
          </button>
          <button className="btn big icon-btn" onClick={onSettings} title={t('settings')}>
            <Icon name="settings" />
          </button>
          <button className="btn big" onClick={onImport} title={t('importAssistant')}>
            ⤒ {t('import')}
          </button>
          <button className="btn big" onClick={onClone} title={t('cloneAssistant')}>
            ⎇ {t('clone')}
          </button>
          <button className="btn primary big icon-btn" onClick={onCreate}>
            <Icon name="plus" /> {t('newAssistant')}
          </button>
        </div>
      </div>

      {assistants.length === 0 ? (
        <div className="home-empty">
          <div className="home-empty-icon">✳</div>
          <div className="big">{t('noAssistants')}</div>
          <div>{t('noAssistantsSub')}</div>
        </div>
      ) : (
        <div className="assistant-grid">
          {assistants.map((a) => (
            <div key={a.id} className="assistant-card" onClick={() => onOpen(a)}>
              <div className="ac-top">
                <span className="ac-icon">{a.icon}</span>
                <span className="ac-engine">{engineName(a.engineId)}</span>
                <button
                  className="ac-export"
                  title={t('shareAssistant')}
                  onClick={(e) => {
                    e.stopPropagation()
                    onShare(a)
                  }}
                >
                  ⎇
                </button>
                <button
                  className="ac-export"
                  title={t('exportAssistant')}
                  onClick={(e) => {
                    e.stopPropagation()
                    onExport(a)
                  }}
                >
                  ⤓
                </button>
                <button
                  className="ac-del"
                  title={t('delete')}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(a)
                  }}
                >
                  ×
                </button>
              </div>
              <div className="ac-name">{a.name}</div>
              <div className="ac-path">
                {a.baseDir.replace(/^.*\/AgentStudio/, '~/AgentStudio')}
              </div>
              <div className="ac-open-row">
                <button
                  className="ac-open"
                  title={a.name}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(a)
                  }}
                >
                  <Icon name="arrow-right" size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
