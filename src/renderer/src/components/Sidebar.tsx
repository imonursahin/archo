import { useMemo, useState, type MouseEvent } from 'react'
import type { ResourceGroups, ResourceItem } from '../global'
import QuickUsage from './QuickUsage'
import { t } from '../lib/i18n'
import { getFavorites, toggleFavorite, applyOrder, setOrder } from '../lib/prefs'
import Icon from './Icon'

interface Props {
  assistantId: string
  groups: ResourceGroups | null
  activeKey: string | null
  dirtyPath: string | null
  mcpStatus?: Record<string, string>
  onSelect: (item: ResourceItem) => void
  onNew: (kind?: 'skill' | 'agent' | 'command') => void
  onUsage: () => void
  onDelete: (item: ResourceItem) => void
  onDuplicate: (item: ResourceItem) => void
  onTogglePlugin: (item: ResourceItem, enabled: boolean) => void
  onToggleMcp: (item: ResourceItem, enabled: boolean) => void
}

// which kinds can be deleted from the sidebar
const DELETABLE = new Set(['skill', 'agent', 'command', 'mcp'])

const GROUP_DEFS: { key: keyof ResourceGroups; label: string; tag: string }[] = [
  { key: 'instructions', label: 'Instructions', tag: 'md' },
  { key: 'skills', label: 'Skills', tag: 'md' },
  { key: 'agents', label: 'Agents', tag: 'md' },
  { key: 'commands', label: 'Commands', tag: 'md' },
  { key: 'mcp', label: 'MCP Servers', tag: '⚡' },
  { key: 'plugins', label: 'Plugins', tag: '🧩' },
  { key: 'hooks', label: 'Hooks', tag: '⚓' },
  { key: 'settings', label: 'Settings', tag: '⚙' }
]

const NEW_KIND: Partial<Record<keyof ResourceGroups, 'skill' | 'agent' | 'command'>> = {
  skills: 'skill',
  agents: 'agent',
  commands: 'command'
}

export default function Sidebar({
  assistantId,
  groups,
  activeKey,
  dirtyPath,
  mcpStatus,
  onSelect,
  onNew,
  onUsage,
  onDelete,
  onDuplicate,
  onTogglePlugin,
  onToggleMcp
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ item: ResourceItem; x: number; y: number } | null>(null)
  const [favTick, setFavTick] = useState(0)
  // MCP + Plugins collapsed by default
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    mcp: true,
    plugins: true
  })
  const [drag, setDrag] = useState<{ path: string; group: string } | null>(null)
  const [, setOrderTick] = useState(0)
  const favs = getFavorites()
  void favTick // re-render trigger when favorites change
  function star(item: ResourceItem, e: MouseEvent): void {
    e.stopPropagation()
    if (!item.path) return
    toggleFavorite(item.path)
    setFavTick((x) => x + 1)
  }

  // reorder within a group and persist the new order
  function dropOnItem(targetPath: string, group: string, items: ResourceItem[]): void {
    if (!drag || drag.group !== group || drag.path === targetPath) {
      setDrag(null)
      return
    }
    const paths = items.map((i) => i.path || '').filter(Boolean)
    const from = paths.indexOf(drag.path)
    const to = paths.indexOf(targetPath)
    if (from === -1 || to === -1) {
      setDrag(null)
      return
    }
    paths.splice(to, 0, paths.splice(from, 1)[0])
    setOrder(assistantId, group, paths)
    setDrag(null)
    setOrderTick((x) => x + 1)
  }

  function openMenu(e: MouseEvent, item: ResourceItem): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ item, x: e.clientX, y: e.clientY })
  }

  // Instructions stays open and is excluded from collapse-all
  const collapsible = GROUP_DEFS.filter((d) => d.key !== 'instructions')
  const allCollapsed = collapsible.every((d) => collapsed[d.key])
  function toggleAll(): void {
    if (allCollapsed) setCollapsed({})
    else setCollapsed(Object.fromEntries(collapsible.map((d) => [d.key, true])))
  }
  const searching = query.trim().length > 0

  const filtered = useMemo(() => {
    if (!groups) return null
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    const out = {} as ResourceGroups
    for (const def of GROUP_DEFS) {
      out[def.key] = groups[def.key].filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q)
      )
    }
    return out
  }, [groups, query])

  const TAG_BY_KIND: Record<string, string> = {
    skill: 'md',
    agent: 'md',
    command: 'md',
    instruction: 'md',
    mcp: '⚡',
    plugin: '🧩',
    hook: '⚓',
    settings: '⚙'
  }
  // favorites, aggregated across every group (hidden while searching)
  const favItems: ResourceItem[] = []
  if (!searching && groups) {
    for (const def of GROUP_DEFS)
      for (const it of groups[def.key]) if (it.path && favs.has(it.path)) favItems.push(it)
  }

  const renderItem = (
    item: ResourceItem,
    tag: string,
    dragCtx?: { group: string; items: ResourceItem[] }
  ): JSX.Element => {
    const key = item.path || `${item.kind}:${item.name}`
    const itemKey = `${item.path}:${item.name}`
    const fav = !!item.path && favs.has(item.path)
    const canDrag = !!dragCtx && !!item.path
    return (
      <div
        key={key}
        className={`item ${activeKey === itemKey ? 'active' : ''} ${
          drag?.path === item.path ? 'dragging' : ''
        } ${canDrag ? 'draggable' : ''}`}
        draggable={canDrag}
        onDragStart={
          canDrag
            ? (e) => {
                setDrag({ path: item.path!, group: dragCtx!.group })
                e.dataTransfer.effectAllowed = 'move'
              }
            : undefined
        }
        onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
        onDrop={
          canDrag
            ? (e) => {
                e.preventDefault()
                dropOnItem(item.path!, dragCtx!.group, dragCtx!.items)
              }
            : undefined
        }
        onDragEnd={() => setDrag(null)}
        onClick={() => onSelect(item)}
        onContextMenu={(e) => openMenu(e, item)}
        title={item.description}
      >
        <span className="tag">{tag}</span>
        <span className="name">{item.name}</span>
        {item.kind === 'mcp' && (
          <span
            className={`mcp-scope ${item.meta?.mcpScope === 'global' ? 'global' : 'project'}`}
            title={item.meta?.mcpScope === 'global' ? t('mcpGlobalUser') : t('mcpProject')}
          >
            {item.meta?.mcpScope === 'global' ? '🌐' : '📁'}
          </span>
        )}
        {item.kind === 'mcp' && (
          <span className={`dot ${mcpStatus?.[item.name] || 'neutral'}`} />
        )}
        {dirtyPath && dirtyPath === item.path && <span className="dot dirty" />}
        {(item.kind === 'plugin' || item.kind === 'mcp') && (
          <span
            className={`switch sm ${item.meta?.[item.kind === 'mcp' ? 'mcpEnabled' : 'enabled'] !== false ? 'on' : ''}`}
            title={
              item.meta?.[item.kind === 'mcp' ? 'mcpEnabled' : 'enabled'] !== false
                ? t('enabledForAssistant')
                : t('disabledForAssistant')
            }
            onClick={(e) => {
              e.stopPropagation()
              if (item.kind === 'mcp')
                onToggleMcp(item, item.meta?.mcpEnabled === false)
              else onTogglePlugin(item, item.meta?.enabled === false)
            }}
          >
            <span className="knob" />
          </span>
        )}
        {item.path && item.kind !== 'plugin' && item.kind !== 'mcp' && (
          <span
            className={`item-fav ${fav ? 'on' : ''}`}
            title={fav ? t('removeFromFavorites') : t('addToFavorites')}
            onClick={(e) => star(item, e)}
          >
            {fav ? '★' : '☆'}
          </span>
        )}
        {/* only project-scope MCP / other deletables can be removed here;
            global MCPs live in ~/.claude.json and must not be deleted from an assistant */}
        {DELETABLE.has(item.kind) &&
          !(item.kind === 'mcp' && item.meta?.mcpScope === 'global') && (
            <span
              className="item-del"
              title={t('delete')}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item)
              }}
            >
              ×
            </span>
          )}
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="search">
        <span className="search-ic">
          <Icon name="search" size={14} />
        </span>
        <input
          placeholder={t('search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="collapse-all" onClick={toggleAll} title={t('collapseAll')}>
          {allCollapsed ? '⊞' : '⊟'}
        </button>
      </div>
      <button className="add-resource" onClick={() => onNew()}>
        <Icon name="plus" size={14} /> {t('addResource')}
      </button>
      <div className="tree">
        {favItems.length > 0 && (
          <div>
            <div className="group-header fav-header">
              <span className="chevron">★</span>
              {t('favorites')}
              <span className="count">{favItems.length}</span>
            </div>
            {favItems.map((item) => renderItem(item, TAG_BY_KIND[item.kind] || 'md'))}
          </div>
        )}
        {GROUP_DEFS.map((def) => {
          const raw = filtered?.[def.key] || []
          // during search: force-expand and hide groups with no matches
          if (searching && raw.length === 0) return null
          const items = searching ? raw : applyOrder(raw, assistantId, def.key)
          const isCollapsed = searching ? false : collapsed[def.key]
          // drag-reorder only when not searching and the group has >1 item
          const dragCtx = !searching && items.length > 1 ? { group: def.key, items } : undefined
          return (
            <div key={def.key}>
              <div
                className="group-header"
                onClick={() => setCollapsed((c) => ({ ...c, [def.key]: !c[def.key] }))}
              >
                <span className="chevron">{isCollapsed ? '▸' : '▾'}</span>
                {def.label}
                <span className="count">{items.length}</span>
              </div>
              {!isCollapsed && items.map((item) => renderItem(item, def.tag, dragCtx))}
              {!isCollapsed && NEW_KIND[def.key] && (
                <div className="new-btn" onClick={() => onNew(NEW_KIND[def.key])}>
                  + {t('newX')} {def.label.toLowerCase().replace(/s$/, '')}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <QuickUsage onOpen={onUsage} />

      {menu && (
        <>
          <div className="ctx-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <div
              className="ctx-item"
              onClick={() => {
                onSelect(menu.item)
                setMenu(null)
              }}
            >
              {t('edit')}
            </div>
            {menu.item.path && menu.item.kind !== 'plugin' && (
              <div
                className="ctx-item"
                onClick={() => {
                  toggleFavorite(menu.item.path!)
                  setFavTick((x) => x + 1)
                  setMenu(null)
                }}
              >
                {favs.has(menu.item.path) ? t('removeFromFavoritesStar') : t('addToFavoritesStar')}
              </div>
            )}
            {['skill', 'agent', 'command'].includes(menu.item.kind) && (
              <div
                className="ctx-item"
                onClick={() => {
                  onDuplicate(menu.item)
                  setMenu(null)
                }}
              >
                {t('duplicate')}
              </div>
            )}
            {menu.item.path && (
              <div
                className="ctx-item"
                onClick={() => {
                  window.api.revealResource(menu.item.path!)
                  setMenu(null)
                }}
              >
                {t('revealInFolder')}
              </div>
            )}
            {DELETABLE.has(menu.item.kind) && (
              <>
                <div className="ctx-sep" />
                <div
                  className="ctx-item danger"
                  onClick={() => {
                    onDelete(menu.item)
                    setMenu(null)
                  }}
                >
                  {t('delete')}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
