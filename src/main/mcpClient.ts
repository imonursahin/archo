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

// Connect to a stdio MCP server, run the initialize + tools/list handshake,
// and return the advertised tools. Newline-delimited JSON-RPC over stdio.
export async function testMcp(cfg: any, timeoutMs = 15000): Promise<McpTestResult> {
  const start = Date.now()
  const elapsed = (): number => Date.now() - start

  if (!cfg || (!cfg.command && (cfg.url || cfg.type === 'http' || cfg.type === 'sse'))) {
    return {
      ok: false,
      error: 'HTTP/SSE tabanlı MCP testi henüz desteklenmiyor (yalnızca stdio).',
      elapsedMs: elapsed()
    }
  }
  if (!cfg.command) {
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
  if (!cfg?.command) {
    return { ok: false, error: 'stdio olmayan MCP çağrısı desteklenmiyor', elapsedMs: elapsed() }
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
