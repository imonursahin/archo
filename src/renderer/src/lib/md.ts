// Minimal, dependency-free markdown -> HTML renderer.
// Covers what skill/agent docs use: headings, lists, tables, code, quotes, hr,
// bold/italic/inline-code, links. Escapes HTML so it's injection-safe.

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(s: string): string {
  // Pull inline code spans OUT before escaping, so their contents get escaped
  // exactly once. Escaping the whole string first would turn a `>` inside code
  // into &gt;, then re-escape the & into &amp;gt; (visible double-escape).
  // The @@C<n>@@ sentinel survives esc() and won't collide with prose (numbers).
  const codes: string[] = []
  let t = s.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c)
    return `@@C${codes.length - 1}@@`
  })
  t = esc(t)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  t = t.replace(/@@C(\d+)@@/g, (_m, i) => `<code>${esc(codes[+i])}</code>`)
  return t
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let inCode = false
  let codeBuf: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let para: string[] = []
  let liBuf: string[] = [] // parts of the current list item (joins wrapped source lines)

  const flushPara = (): void => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`)
      para = []
    }
  }
  const flushLi = (): void => {
    if (liBuf.length) {
      out.push(`<li>${inline(liBuf.join(' '))}</li>`)
      liBuf = []
    }
  }
  const closeList = (): void => {
    flushLi()
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`)
        codeBuf = []
        inCode = false
      } else {
        flushPara()
        closeList()
        inCode = true
      }
      i++
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      i++
      continue
    }

    // table: header row with pipes, then a separator row like |---|:--:|
    const next = lines[i + 1]
    if (
      line.includes('|') &&
      next !== undefined &&
      /^[\s|:-]+$/.test(next) &&
      next.includes('-') &&
      next.includes('|')
    ) {
      flushPara()
      closeList()
      const cells = (r: string): string[] =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim())
      const header = cells(line)
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(cells(lines[i]))
        i++
      }
      let html = `<table><thead><tr>${header
        .map((c) => `<th>${inline(c)}</th>`)
        .join('')}</tr></thead>`
      if (rows.length) {
        html += `<tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>`
      }
      out.push(`${html}</table>`)
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      const lvl = h[1].length
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`)
      i++
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara()
      closeList()
      out.push('<hr/>')
      i++
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const want = ul ? 'ul' : 'ol'
      flushLi() // close the previous item
      if (listType !== want) {
        closeList()
        listType = want
        out.push(`<${want}>`)
      }
      liBuf.push((ul || ol)![1])
      i++
      continue
    }

    const q = line.match(/^>\s?(.*)$/)
    if (q) {
      flushPara()
      closeList()
      out.push(`<blockquote>${inline(q[1])}</blockquote>`)
      i++
      continue
    }

    if (line.trim() === '') {
      flushPara()
      closeList()
      i++
      continue
    }

    // inside a list: an indented, non-bullet, non-blank line is a wrapped
    // continuation of the current item — join it (prettier-style), don't break.
    if (listType && liBuf.length) {
      liBuf.push(line.trim())
      i++
      continue
    }

    para.push(line.trim())
    i++
  }
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`)
  flushPara()
  closeList()
  return out.join('\n')
}
