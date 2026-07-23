// Ready-made starter templates per resource kind. Each returns the full file
// content (frontmatter + body) given the resource name. Labels and human-readable
// content are localized via i18n (`label` is a translation key).
import { t, ti } from './i18n'

export type Kind = 'skill' | 'agent' | 'command'

export interface Template {
  id: string
  label: string // i18n key — render with t(label)
  body: (name: string) => string
}

export const TEMPLATES: Record<Kind, Template[]> = {
  skill: [
    {
      id: 'blank',
      label: 'tplBlank',
      body: (n) => `---\nname: ${n}\ndescription: \n---\n# ${n}\n\n`
    },
    {
      id: 'example',
      label: 'tplExample',
      body: (n) =>
        `---\nname: ${n}\ndescription: ${t('tplSkillExampleDesc')}\n---\n# ${n}\n\n${t('tplSkillExampleBody')}\n`
    },
    {
      id: 'research',
      label: 'tplResearch',
      body: (n) =>
        `---\nname: ${n}\ndescription: ${t('tplSkillResearchDesc')}\n---\n# ${n}\n\n${t('tplSkillResearchBody')}\n`
    }
  ],
  agent: [
    {
      id: 'blank',
      label: 'tplBlank',
      body: (n) => `---\nname: ${n}\ndescription: \ntools: \nmodel: inherit\n---\n`
    },
    {
      id: 'example',
      label: 'tplExample',
      body: (n) =>
        `---\nname: ${n}\ndescription: ${t('tplAgentExampleDesc')}\ntools: Read, Grep, Glob\nmodel: inherit\n---\n${ti('tplAgentExampleBody', { n })}\n`
    },
    {
      id: 'reviewer',
      label: 'tplReviewer',
      body: (n) =>
        `---\nname: ${n}\ndescription: ${t('tplAgentReviewerDesc')}\ntools: Read, Grep, Glob, Bash\nmodel: inherit\n---\n${t('tplAgentReviewerBody')}\n`
    },
    {
      id: 'explorer',
      label: 'tplExplorer',
      body: (n) =>
        `---\nname: ${n}\ndescription: ${t('tplAgentExplorerDesc')}\ntools: Read, Grep, Glob\nmodel: inherit\n---\n${t('tplAgentExplorerBody')}\n`
    }
  ],
  command: [
    {
      id: 'blank',
      label: 'tplBlank',
      body: (n) => `---\ndescription: \n---\n# /${n}\n\n`
    },
    {
      id: 'example',
      label: 'tplExample',
      body: (n) =>
        `---\ndescription: ${t('tplCmdExampleDesc')}\n---\n# /${n}\n\n${t('tplCmdExampleBody')}\n`
    }
  ]
}
