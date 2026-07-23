// Ready-made starter templates per resource kind. Each returns the full file
// content (frontmatter + body) given the resource name.
export type Kind = 'skill' | 'agent' | 'command'

export interface Template {
  id: string
  label: string
  body: (name: string) => string
}

export const TEMPLATES: Record<Kind, Template[]> = {
  skill: [
    {
      id: 'blank',
      label: 'Boş',
      body: (n) => `---\nname: ${n}\ndescription: \n---\n# ${n}\n\n`
    },
    {
      id: 'example',
      label: 'Örnek',
      body: (n) =>
        `---\nname: ${n}\ndescription: TODO — bu skill ne zaman kullanılır\n---\n# ${n}\n\nBu skill şunu yapar…\n\n## Adımlar\n1. …\n2. …\n`
    },
    {
      id: 'research',
      label: 'Araştırma',
      body: (n) =>
        `---\nname: ${n}\ndescription: Bir konuyu çok kaynaktan araştırıp özet çıkarır\n---\n# ${n}\n\nVerilen konuyu araştır:\n- Web'de ara, kaynakları oku\n- Bulguları doğrula\n- Kısa, kaynaklı bir özet yaz\n`
    }
  ],
  agent: [
    {
      id: 'blank',
      label: 'Boş',
      body: (n) => `---\nname: ${n}\ndescription: \ntools: \nmodel: inherit\n---\n`
    },
    {
      id: 'example',
      label: 'Örnek',
      body: (n) =>
        `---\nname: ${n}\ndescription: TODO — bu agent ne yapar\ntools: Read, Grep, Glob\nmodel: inherit\n---\nSen bir ${n} agent'ısın. Görevin…\n`
    },
    {
      id: 'reviewer',
      label: 'Kod İnceleyici',
      body: (n) =>
        `---\nname: ${n}\ndescription: Diff'i inceleyip bug ve iyileştirme önerir\ntools: Read, Grep, Glob, Bash\nmodel: inherit\n---\nSen kıdemli bir kod inceleyicisin. Verilen değişiklikleri incele:\n- Doğruluk/bug riskleri\n- Güvenlik açıkları\n- Sadeleştirme fırsatları\nHer bulgu için dosya:satır ver ve önem derecesi belirt.\n`
    },
    {
      id: 'explorer',
      label: 'Kâşif (read-only)',
      body: (n) =>
        `---\nname: ${n}\ndescription: Kod tabanında arama yapıp ilgili yerleri bulur\ntools: Read, Grep, Glob\nmodel: inherit\n---\nSen salt-okunur bir keşif agent'ısın. Sorulan şeyi kod tabanında bul,\nilgili dosya:satır referanslarını ve kısa bir özet döndür. Kod düzenleme yapma.\n`
    }
  ],
  command: [
    {
      id: 'blank',
      label: 'Boş',
      body: (n) => `---\ndescription: \n---\n# /${n}\n\n`
    },
    {
      id: 'example',
      label: 'Örnek',
      body: (n) =>
        `---\ndescription: TODO — bu komut ne yapar\n---\n# /${n}\n\n$ARGUMENTS ile verilen girdiyi kullanarak şunu yap…\n`
    }
  ]
}
