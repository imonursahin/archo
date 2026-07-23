// An "engine" is the runtime an assistant runs on (Claude Code, Cursor, ...).
// It defines, RELATIVE to the assistant's own folder, where each resource kind
// lives and how the assistant is launched.

export type SkillStyle = 'dir-skillmd' | 'flat-md'

export interface EngineDef {
  id: string
  name: string
  icon: string
  // subdirs/files relative to the assistant base folder
  skillsDir?: string
  skillStyle: SkillStyle
  agentsDir?: string
  commandsDir?: string
  commandExt: string
  mcpFile?: string
  instructionFile?: string
  settingsFile?: string
  // command to launch the assistant in its folder
  runCommand: string
}

export const ENGINES: EngineDef[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: '✳',
    skillsDir: '.claude/skills',
    skillStyle: 'dir-skillmd',
    agentsDir: '.claude/agents',
    commandsDir: '.claude/commands',
    commandExt: '.md',
    mcpFile: '.mcp.json',
    instructionFile: 'CLAUDE.md',
    settingsFile: '.claude/settings.json',
    runCommand: 'claude'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '⌘',
    skillsDir: '.cursor/rules',
    skillStyle: 'flat-md',
    agentsDir: '.cursor/agents',
    commandsDir: '.cursor/commands',
    commandExt: '.md',
    mcpFile: '.cursor/mcp.json',
    instructionFile: 'AGENTS.md',
    runCommand: 'cursor .'
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    icon: '✦',
    skillStyle: 'flat-md',
    commandsDir: '.gemini/commands',
    commandExt: '.toml',
    mcpFile: '.gemini/settings.json',
    instructionFile: 'GEMINI.md',
    runCommand: 'gemini'
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: '◇',
    skillStyle: 'flat-md',
    commandsDir: '.codex/prompts',
    commandExt: '.md',
    instructionFile: 'AGENTS.md',
    runCommand: 'codex'
  }
]

export function getEngine(id: string): EngineDef {
  return ENGINES.find((e) => e.id === id) || ENGINES[0]
}
