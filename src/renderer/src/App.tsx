import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import McpPanel from './components/McpPanel'
import SessionsView from './components/SessionsView'
import Home from './components/Home'
import AssistantModal from './components/AssistantModal'
import CreateModal from './components/CreateModal'
import UsagePanel from './components/UsagePanel'
import SettingsModal from './components/SettingsModal'
import CommandPalette, { type Command } from './components/CommandPalette'
import FindReplace from './components/FindReplace'
import Icon from './components/Icon'
import ToastHost from './components/ToastHost'
import { bus } from './lib/bus'
import { t, ti, getLang, setLang } from './lib/i18n'
import { getTheme, applyTheme } from './lib/theme'
import { getPrefs, exportAppState, importAppState } from './lib/prefs'
import { toast } from './lib/toast'
import type { Assistant, EngineDef, ResourceGroups, ResourceItem } from './global'

export default function App(): JSX.Element {
  const [engines, setEngines] = useState<EngineDef[]>([])
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [active, setActive] = useState<Assistant | null>(null)
  const [groups, setGroups] = useState<ResourceGroups | null>(null)
  const [selected, setSelected] = useState<ResourceItem | null>(null)
  const [dirtyPath, setDirtyPath] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createKind, setCreateKind] = useState<'skill' | 'agent' | 'command'>('skill')
  const [showAssistantModal, setShowAssistantModal] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [caffeine, setCaffeine] = useState(false)
  const [, forceRender] = useState(0)
  const [dropped, setDropped] = useState<{ name: string; content: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<{
    sessionId: string
    terminalId?: string
  } | null>(null)
  const activeTermRef = useRef<string | null>(null)
  const [mcpStatus, setMcpStatus] = useState<Record<string, string>>({})
  const testedSig = useRef('')

  useEffect(() => {
    window.api.listEngines().then(setEngines)
    window.api.listAssistants().then(setAssistants)
  }, [])

  const refresh = useCallback(() => {
    if (active) window.api.listResources(active.id).then(setGroups)
  }, [active])

  useEffect(() => {
    setGroups(null)
    setSelected(null)
    refresh()
    if (!active) return
    window.api.watchResources(active.id)
    return window.api.onResourcesChanged(() => refresh())
  }, [active, refresh])

  const onDirtyChange = useCallback((p: string | null) => setDirtyPath(p), [])

  // ⌘K / Ctrl+K command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowFind((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // clicking a desktop notification → jump to that assistant + session
  useEffect(() => {
    return window.api.onNotifClick(({ assistantId, sessionId, terminalId }) => {
      const a = assistants.find((x) => x.id === assistantId)
      if (a) {
        setActive(a)
        setPendingOpen({ sessionId, terminalId })
      }
    })
  }, [assistants])

  // main-side task-done notification (works for ALL terminals, even ones whose
  // view is unmounted / in another session)
  useEffect(() => {
    const offDone = window.api.onPtyDone(async ({ id, lastLine, durationSec }) => {
      if (!getPrefs().notifyOnDone) return
      // don't notify for the terminal you're actively watching
      if (document.hasFocus() && activeTermRef.current === id) return
      const info = await window.api.findTerminal(id)
      if (!info) return
      window.api.notify(
        `${info.sessionName} · ${info.terminalName}`,
        lastLine || ti('taskDoneBody', { name: info.terminalName, sec: Math.round(durationSec) }),
        {
          subtitle: ti('taskDoneSubtitle', { sec: Math.round(durationSec) }),
          assistantId: info.assistantId,
          sessionId: info.sessionId,
          terminalId: id
        }
      )
    })
    return () => {
      offDone()
    }
  }, [])

  // build command list from current context
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = []
    if (active) {
      const g = groups
      const all = g
        ? [
            ...g.skills.map((i) => ['Skill', i] as const),
            ...g.agents.map((i) => ['Agent', i] as const),
            ...g.commands.map((i) => ['Command', i] as const),
            ...g.mcp.map((i) => ['MCP', i] as const),
            ...g.instructions.map((i) => ['Instruction', i] as const),
            ...g.settings.map((i) => ['Settings', i] as const)
          ]
        : []
      for (const [grp, item] of all) {
        cmds.push({
          id: `${item.kind}:${item.path}:${item.name}`,
          group: grp,
          label: item.name,
          hint: item.description,
          run: () => setSelected(item)
        })
      }
      cmds.push(
        { id: 'new-skill', group: t('cmdGroupAction'), label: t('cmdNewSkill'), run: () => openCreate('skill') },
        { id: 'new-agent', group: t('cmdGroupAction'), label: t('cmdNewAgent'), run: () => openCreate('agent') },
        { id: 'new-command', group: t('cmdGroupAction'), label: t('cmdNewCommand'), run: () => openCreate('command') },
        { id: 'find', group: t('cmdGroupAction'), label: t('cmdFindReplace'), run: () => setShowFind(true) },
        { id: 'back', group: t('cmdGroupAction'), label: t('cmdBackAssistants'), run: () => setActive(null) }
      )
    } else {
      for (const a of assistants) {
        cmds.push({
          id: `asst:${a.id}`,
          group: t('cmdGroupAssistant'),
          label: a.name,
          hint: a.baseDir.replace(/^.*\/AgentStudio/, '~/AgentStudio'),
          run: () => setActive(a)
        })
      }
      cmds.push({
        id: 'new-assistant',
        group: t('cmdGroupAction'),
        label: t('cmdNewAssistant'),
        run: () => setShowAssistantModal(true)
      })
    }
    cmds.push(
      { id: 'usage', group: t('cmdGroupAction'), label: t('cmdUsage'), run: () => setShowUsage(true) },
      { id: 'settings', group: t('cmdGroupAction'), label: t('cmdSettings'), run: () => setShowSettings(true) },
      {
        id: 'theme',
        group: t('cmdGroupAction'),
        label: t('cmdToggleTheme'),
        run: () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark')
      }
    )
    return cmds
  }, [active, groups, assistants])

  const setStatus = useCallback((name: string, status: string) => {
    setMcpStatus((s) => ({ ...s, [name]: status }))
  }, [])

  // auto-test MCP servers in the background so the sidebar dots reflect real
  // connection / auth status (green ok · red error · orange auth · yellow testing)
  useEffect(() => {
    const mcps = groups?.mcp || []
    const sig = mcps.map((m) => m.name + JSON.stringify(m.meta)).join('|')
    if (!mcps.length || sig === testedSig.current) return
    testedSig.current = sig
    mcps.forEach(async (m) => {
      setStatus(m.name, 'testing')
      try {
        const r = await window.api.testMcp(m.meta || {})
        const authy = /auth|unauthor|token|login|oauth|credential|api key|permission/i.test(
          r.error || ''
        )
        setStatus(m.name, r.ok ? 'ok' : authy ? 'auth' : 'error')
      } catch {
        setStatus(m.name, 'error')
      }
    })
  }, [groups?.mcp, setStatus])

  function run(a: Assistant): void {
    window.api.runAssistant(a.id).then((info) => {
      if (info) bus.emit('openTerm', { name: a.name, cwd: info.cwd, command: info.command })
    })
  }

  function openCreate(kind?: 'skill' | 'agent' | 'command'): void {
    setDropped(null)
    setCreateKind(kind || 'skill')
    setShowCreate(true)
  }

  async function onDropFiles(e: DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault()
    setDragging(false)
    if (!active) return
    const file = Array.from(e.dataTransfer.files).find((f) => /\.(md|mdc|json)$/i.test(f.name))
    if (!file) return
    const content = await file.text()
    setDropped({ name: file.name.replace(/\.(md|mdc|json)$/i, ''), content })
    setShowCreate(true)
  }

  async function deleteResource(item: ResourceItem): Promise<void> {
    if (getPrefs().confirmDelete && !confirm(ti('confirmDeleteResource', { name: item.name }))) return
    if (item.kind === 'mcp' && item.path) await window.api.deleteMcpServer(item.path, item.name)
    else if (item.path) await window.api.deleteResource(item.path)
    if (selected?.path === item.path) setSelected(null)
    refresh()
    toast(ti('toastDeleted', { name: item.name }), 'success')
  }

  async function togglePlugin(item: ResourceItem, enabled: boolean): Promise<void> {
    const key = item.meta?.key as string | undefined
    if (!active || !key) return
    await window.api.setPluginEnabled(active.id, key, enabled)
    refresh()
    toast(ti(enabled ? 'toastPluginEnabled' : 'toastPluginDisabled', { name: item.name }), 'success')
  }

  async function toggleMcp(item: ResourceItem, enabled: boolean): Promise<void> {
    if (!active) return
    await window.api.setMcpEnabled(active.id, item.name, enabled)
    refresh()
    const scope = item.meta?.mcpScope === 'global' ? t('scopeGlobal') : t('scopeProject')
    toast(
      ti(enabled ? 'toastMcpEnabled' : 'toastMcpDisabled', { name: item.name, scope }),
      'success'
    )
  }

  async function duplicateResource(item: ResourceItem): Promise<void> {
    if (!item.path) return
    const { path } = await window.api.duplicateResource(item.path)
    refresh()
    setSelected({ kind: item.kind, name: path.split('/').pop() || path, path })
    toast(ti('toastDuplicated', { name: item.name }), 'success')
  }

  // ---------- Home screen ----------
  if (!active) {
    return (
      <div className="app home-mode">
        <Home
          assistants={assistants}
          engines={engines}
          onOpen={setActive}
          onRun={run}
          onUsage={() => setShowUsage(true)}
          onCreate={() => setShowAssistantModal(true)}
          onSettings={() => setShowSettings(true)}
          onImport={async () => {
            const r = await window.api.importAssistant()
            if (r.ok && r.assistant) {
              importAppState(r.assistant.baseDir, r.assistant.id, r.appState as never)
              // apply imported global settings (theme/lang) immediately
              applyTheme(getTheme())
              setLang(getLang())
              setAssistants((l) => [...l, r.assistant!])
              forceRender((x) => x + 1)
              toast(ti('toastImported', { name: r.assistant.name }), 'success')
            }
          }}
          onExport={async (a) => {
            const appState = exportAppState(a.baseDir, a.id)
            const r = await window.api.exportAssistant(a.id, appState)
            if (r.ok) toast(ti('toastExported', { name: a.name }), 'success')
          }}
          onDelete={(a) => {
            if (
              confirm(
                ti('confirmDeleteAssistant', {
                  name: a.name,
                  dir: a.baseDir.replace(/^.*\/AgentStudio/, '~/AgentStudio')
                })
              )
            ) {
              window.api.deleteAssistant(a.id, true).then(() => {
                setAssistants((l) => l.filter((x) => x.id !== a.id))
                toast(ti('toastAssistantDeleted', { name: a.name }), 'success')
              })
            }
          }}
        />
        {showAssistantModal && (
          <AssistantModal
            onClose={() => setShowAssistantModal(false)}
            onCreated={(a) => {
              setShowAssistantModal(false)
              setAssistants((l) => [...l, a])
              setActive(a)
            }}
          />
        )}
        {showUsage && <UsagePanel onClose={() => setShowUsage(false)} />}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onChange={() => forceRender((x) => x + 1)} />}
        {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />}
        <ToastHost />
      </div>
    )
  }

  // ---------- Workbench ----------
  return (
    <div
      className="app"
      onDragOver={(e) => {
        // only react to files dragged in from OUTSIDE the app; internal
        // item reordering drags carry no "Files" type and must be ignored
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        if (!dragging) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.clientX === 0 && e.clientY === 0) setDragging(false)
      }}
      onDrop={onDropFiles}
    >
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-box">{t('dropHint')}</div>
        </div>
      )}
      <div className="titlebar">
        <button className="back-btn" onClick={() => setActive(null)}>
          ← {t('assistants')}
        </button>
        <span className="workspace">
          {active.icon} <b>{active.name}</b>
          <span className="engine-chip">
            {engines.find((e) => e.id === active.engineId)?.name}
          </span>
        </span>
        <div className="right">
          <button
            className={`btn icon-btn caffeine-btn ${caffeine ? 'on' : ''}`}
            onClick={async () => setCaffeine(await window.api.setCaffeine(!caffeine))}
            data-tip={t('keepAwakeHint')}
            aria-label={t('keepAwakeHint')}
          >
            ☕ {t('keepAwake')}
          </button>
          <button className="btn icon-btn" onClick={() => setShowUsage(true)} title={t('usageAndCost')}>
            <Icon name="usage" /> {t('usage')}
          </button>
          <button className="btn icon-btn" onClick={() => setShowSettings(true)} title={t('settings')}>
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <div className="body">
        <Sidebar
          assistantId={active.id}
          groups={groups}
          dirtyPath={dirtyPath}
          mcpStatus={mcpStatus}
          activeKey={selected ? `${selected.path}:${selected.name}` : null}
          onSelect={(item) => setSelected(item)}
          onNew={openCreate}
          onUsage={() => setShowUsage(true)}
          onDelete={deleteResource}
          onDuplicate={duplicateResource}
          onTogglePlugin={togglePlugin}
          onToggleMcp={toggleMcp}
        />

        <div className="main-col">
          <div className="center">
            <SessionsView
              assistant={active}
              openTarget={pendingOpen}
              onSessionOpened={() => setPendingOpen(null)}
              onActiveTerminal={(id) => (activeTermRef.current = id)}
            />
            {selected && (
              <div className="editor-overlay">
                {selected.kind === 'mcp' ? (
                  <McpPanel
                    key={`${selected.path}:${selected.name}`}
                    item={selected}
                    onClose={() => setSelected(null)}
                    onChanged={refresh}
                    onStatus={setStatus}
                  />
                ) : (
                  <Editor
                    key={`${selected.path}:${selected.name}`}
                    item={selected}
                    onDirtyChange={onDirtyChange}
                    onClose={() => setSelected(null)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateModal
          assistantId={active.id}
          defaultKind={dropped ? undefined : createKind}
          presetName={dropped?.name}
          presetContent={dropped?.content}
          onClose={() => {
            setShowCreate(false)
            setDropped(null)
          }}
          onCreated={(p) => {
            setShowCreate(false)
            setDropped(null)
            refresh()
            setSelected({ kind: 'skill', name: p.split('/').pop() || p, path: p })
          }}
        />
      )}
      {showUsage && <UsagePanel onClose={() => setShowUsage(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onChange={() => forceRender((x) => x + 1)} />}
      {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />}
      {showFind && (
        <FindReplace
          assistantId={active.id}
          onClose={() => setShowFind(false)}
          onOpenFile={(item) => {
            setSelected(item)
            setShowFind(false)
          }}
        />
      )}
      <ToastHost />
    </div>
  )
}
