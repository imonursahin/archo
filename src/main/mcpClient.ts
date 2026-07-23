import { spawn } from 'child_process'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: any
}

export interface McpTestResult {
  ok: boolean
  serverName?: string
  serverVersion?: string
  tools?: McpTool[]
  error?: string
  elapsedMs: number
}

function cleanEnv(extra?: Record<string, string>): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_EFFORT') delete env[k]
  }
  return { ...env, ...(extra || {}) }
}

const isHttpCfg = (cfg: any): boolean =>
  !!cfg && (!!cfg.url || cfg.type === 'http' || cfg.type === 'sse') && !cfg.command

// ---- HTTP (Streamable HTTP) transport ------------------------------------
// One JSON-RPC POST; the server answers with either application/json or an
// SSE stream (text/event-stream) carrying the message. Keeps the Mcp-Session-Id
// header across calls and forwards any custom auth headers from the config.
function makeHttpRpc(cfg: any, timeoutMs: number): (msg: unknown) => Promise<any> {
  const url: string = cfg.url
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(cfg.headers || {})
  }
  let sessionId: string | undefined
  return async (msg: unknown): Promise<any> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...base, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(timeoutMs)
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid) sessionId = sid
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 160)}` : ''}`)
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream')) {
      const text = await res.text()
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n')
        if (!data) continue
        try {
          const obj = JSON.parse(data)
          if (obj && (obj.id !== undefined || obj.result || obj.error)) return obj
        } catch {
          /* keep scanning */
        }
      }
      return null // notifications / empty stream
    }
    if (ct.includes('application/json')) return await res.json()
    return null // 202 Accepted with no body (notifications)
  }
}

const INIT_PARAMS = {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'Archo', version: '0.1.0' }
}

async function testMcpHttp(cfg: any, timeoutMs: number): Promise<McpTestResult> {
  const start = Date.now()
  const elapsed = (): number => Date.now() - start
  if (!cfg.url) return { ok: false, error: 'MCP url eksik', elapsedMs: elapsed() }
  const rpc = makeHttpRpc(cfg, timeoutMs)
  try {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS })
    if (init?.error) return { ok: false, error: init.error.message || 'initialize hatası', elapsedMs: elapsed() }
    const serverName = init?.result?.serverInfo?.name
    const serverVersion = init?.result?.serverInfo?.version
    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => {})
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    if (list?.error) return { ok: false, error: list.error.message || 'tools/list hatası', elapsedMs: elapsed() }
    const tools: McpTool[] = (list?.result?.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
    return { ok: true, serverName, serverVersion, tools, elapsedMs: elapsed() }
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'zaman aşımı (bağlanamadı)' : e?.message || String(e)
    return { ok: false, error: msg, elapsedMs: elapsed() }
  }
}

async function callMcpToolHttp(
  cfg: any,
  toolName: string,
  args: unknown,
  timeoutMs: number
): Promise<McpCallResult> {
  const start = Date.now()
  const elapsed = (): number => Date.now() - start
  if (!cfg.url) return { ok: false, error: 'MCP url eksik', elapsedMs: elapsed() }
  const rpc = makeHttpRpc(cfg, timeoutMs)
  try {
    await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS })
    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => {})
    const r = await rpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args ?? {} }
    })
    if (r?.error) return { ok: false, error: r.error.message || 'tool hatası', elapsedMs: elapsed() }
    return { ok: true, result: r?.result, elapsedMs: elapsed() }
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'zaman aşımı' : e?.message || String(e)
    return { ok: false, error: msg, elapsedMs: elapsed() }
  }
}

// Connect to a stdio MCP server, run the initialize + tools/list handshake,
// and return the advertised tools. Newline-delimited JSON-RPC over stdio.
export async function testMcp(cfg: any, timeoutMs = 15000): Promise<McpTestResult> {
  const start = Date.now()
  const elapsed = (): number => Date.now() - start

  if (isHttpCfg(cfg)) return testMcpHttp(cfg, timeoutMs)
  if (!cfg?.command) {
    return { ok: false, error: 'Geçersiz MCP config (command yok).', elapsedMs: elapsed() }
  }

  return new Promise<McpTestResult>((resolve) => {
    let done = false
    const finish = (r: McpTestResult): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      resolve(r)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cfg.command, cfg.args || [], {
        env: cleanEnv(cfg.env),
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (e: any) {
      return finish({ ok: false, error: e?.message || 'spawn hatası', elapsedMs: elapsed() })
    }

    const timer = setTimeout(
      () => finish({ ok: false, error: 'zaman aşımı (bağlanamadı)', elapsedMs: elapsed() }),
      timeoutMs
    )

    let serverName: string | undefined
    let serverVersion: string | undefined
    let buf = ''
    let stderr = ''

    const send = (obj: unknown): void => {
      try {
        child.stdin!.write(JSON.stringify(obj) + '\n')
      } catch {
        /* ignore */
      }
    }

    child.stdout!.on('data', (d: Buffer) => {
      buf += d.toString()
      let idx: number
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let msg: any
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.id === 1 && msg.result) {
          serverName = msg.result.serverInfo?.name
          serverVersion = msg.result.serverInfo?.version
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (msg.id === 2) {
          if (msg.error) {
            finish({ ok: false, error: msg.error.message || 'tools/list hatası', elapsedMs: elapsed() })
          } else {
            const tools: McpTool[] = (msg.result?.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema
            }))
            finish({ ok: true, serverName, serverVersion, tools, elapsedMs: elapsed() })
          }
        }
      }
    })

    child.stderr!.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', (e) =>
      finish({ ok: false, error: e.message, elapsedMs: elapsed() })
    )
    child.on('exit', (code) => {
      if (!done)
        finish({
          ok: false,
          error: `süreç beklenmedik şekilde kapandı (kod ${code})${stderr ? ': ' + stderr.slice(-200) : ''}`,
          elapsedMs: elapsed()
        })
    })

    // kick off the handshake
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Archo', version: '0.1.0' }
      }
    })
  })
}

export interface McpCallResult {
  ok: boolean
  result?: unknown
  error?: string
  elapsedMs: number
}

// Invoke a single MCP tool (spawn → initialize → tools/call) and return its result.
export async function callMcpTool(
  cfg: any,
  toolName: string,
  args: unknown,
  timeoutMs = 30000
): Promise<McpCallResult> {
  const start = Date.now()
  const elapsed = (): number => Date.now() - start
  if (isHttpCfg(cfg)) return callMcpToolHttp(cfg, toolName, args, timeoutMs)
  if (!cfg?.command) {
    return { ok: false, error: 'Geçersiz MCP config (command yok).', elapsedMs: elapsed() }
  }
  return new Promise<McpCallResult>((resolve) => {
    let done = false
    const finish = (r: McpCallResult): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      resolve(r)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cfg.command, cfg.args || [], {
        env: cleanEnv(cfg.env),
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (e: any) {
      return finish({ ok: false, error: e?.message || 'spawn hatası', elapsedMs: elapsed() })
    }
    const timer = setTimeout(
      () => finish({ ok: false, error: 'zaman aşımı', elapsedMs: elapsed() }),
      timeoutMs
    )
    let buf = ''
    let stderr = ''
    const send = (o: unknown): void => {
      try {
        child.stdin!.write(JSON.stringify(o) + '\n')
      } catch {
        /* ignore */
      }
    }
    child.stdout!.on('data', (d: Buffer) => {
      buf += d.toString()
      let idx: number
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line) continue
        let msg: any
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.id === 1 && msg.result) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: toolName, arguments: args ?? {} }
          })
        } else if (msg.id === 2) {
          if (msg.error)
            finish({ ok: false, error: msg.error.message || 'tool hatası', elapsedMs: elapsed() })
          else finish({ ok: true, result: msg.result, elapsedMs: elapsed() })
        }
      }
    })
    child.stderr!.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', (e) => finish({ ok: false, error: e.message, elapsedMs: elapsed() }))
    child.on('exit', (code) => {
      if (!done)
        finish({
          ok: false,
          error: `süreç kapandı (kod ${code})${stderr ? ': ' + stderr.slice(-200) : ''}`,
          elapsedMs: elapsed()
        })
    })
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Archo', version: '0.1.0' }
      }
    })
  })
}
