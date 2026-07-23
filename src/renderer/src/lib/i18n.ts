export type Lang = 'en' | 'tr'

const DICT: Record<string, { en: string; tr: string }> = {
  // titlebar / common
  assistants: { en: 'Assistants', tr: 'Asistanlar' },
  usage: { en: 'Usage', tr: 'Kullanım' },
  settings: { en: 'Settings', tr: 'Ayarlar' },
  run: { en: 'Run', tr: 'Çalıştır' },
  cancel: { en: 'Cancel', tr: 'İptal' },
  create: { en: 'Create', tr: 'Oluştur' },
  save: { en: 'Save', tr: 'Kaydet' },
  delete: { en: 'Delete', tr: 'Sil' },
  edit: { en: 'Edit', tr: 'Düzenle' },
  duplicate: { en: 'Duplicate', tr: 'Çoğalt' },
  revealInFolder: { en: 'Reveal in folder', tr: 'Dosyada göster' },
  back: { en: 'Back', tr: 'Geri' },
  name: { en: 'Name', tr: 'İsim' },

  // home
  yourAssistants: { en: 'Your assistants', tr: 'Asistanların' },
  homeSub: {
    en: 'Create your own AI assistants — each with its own skills, agents and MCP, running on the engine you pick.',
    tr: 'Kendi AI asistanlarını oluştur — her biri kendi skill, agent ve MCP’siyle, seçtiğin motor üzerinde çalışır.'
  },
  newAssistant: { en: 'New assistant', tr: 'Yeni asistan' },
  noAssistants: { en: 'No assistants yet', tr: 'Henüz asistan yok' },
  noAssistantsSub: {
    en: 'Create your first one with “New assistant” (e.g. onur-ai).',
    tr: '“Yeni asistan” ile ilkini oluştur (ör. onur-ai).'
  },

  // sidebar
  search: { en: 'Search…', tr: 'Ara…' },
  addResource: { en: 'Add resource', tr: 'Kaynak ekle' },
  skills: { en: 'Skills', tr: 'Skills' },
  agents: { en: 'Agents', tr: 'Agents' },
  commands: { en: 'Commands', tr: 'Commands' },
  mcpServers: { en: 'MCP Servers', tr: 'MCP Servers' },
  plugins: { en: 'Plugins', tr: 'Plugins' },
  instructions: { en: 'Instructions', tr: 'Instructions' },
  newX: { en: 'New', tr: 'Yeni' },

  // sessions
  sessions: { en: 'Sessions', tr: 'Session’lar' },
  newSession: { en: 'New session', tr: 'Yeni session' },
  searchSession: { en: 'search session…', tr: 'session ara…' },
  pickSession: { en: 'Pick a session', tr: 'Bir session seç' },
  pickSessionSub: {
    en: 'Click a session on the left or create a new one.',
    tr: 'Soldan bir session’a tıkla ya da yeni oluştur.'
  },
  newTerminal: { en: 'New terminal', tr: 'Yeni terminal' },
  continue: { en: 'Continue', tr: 'Devam et' },

  // settings modal
  language: { en: 'Language', tr: 'Dil' },
  theme: { en: 'Theme', tr: 'Tema' },
  dark: { en: 'Dark', tr: 'Koyu' },
  light: { en: 'Light', tr: 'Açık' },
  english: { en: 'English', tr: 'İngilizce' },
  turkish: { en: 'Turkish', tr: 'Türkçe' },
  appSettings: { en: 'App settings', tr: 'Uygulama ayarları' },

  // settings tabs + preferences
  tabGeneral: { en: 'General', tr: 'Genel' },
  tabCustomize: { en: 'Customize', tr: 'Tercihler' },
  prefNotif: { en: 'Notifications', tr: 'Bildirimler' },
  prefNotifHint: {
    en: 'Show toast messages for saves, deletes and actions.',
    tr: 'Kaydetme, silme ve aksiyonlar için toast mesajları göster.'
  },
  prefUsageAlert: { en: 'Usage alerts', tr: 'Kullanım uyarıları' },
  prefUsageAlertHint: {
    en: 'Warn when the session limit is nearly full.',
    tr: 'Oturum limiti dolmak üzereyken uyar.'
  },
  prefConfirmDelete: { en: 'Confirm before delete', tr: 'Silmeden önce onay' },
  prefConfirmDeleteHint: {
    en: 'Ask for confirmation before deleting a resource.',
    tr: 'Bir kaynağı silmeden önce onay iste.'
  },
  notifOnToast: { en: 'Notifications on', tr: 'Bildirimler açık' },
  favorites: { en: 'Favorites', tr: 'Favoriler' },
  import: { en: 'Import', tr: 'İçe aktar' },
  importAssistant: { en: 'Import an assistant (.json)', tr: 'Asistan içe aktar (.json)' },
  exportAssistant: { en: 'Export this assistant', tr: 'Bu asistanı dışa aktar' },
  prefNotifyDone: { en: 'Task-done notifications', tr: 'Görev bitti bildirimi' },
  prefNotifyDoneHint: {
    en: 'Desktop notification when a terminal task finishes (Claude done / waiting / stopped).',
    tr: 'Bir terminal görevi bitince masaüstü bildirimi (Claude bitti / bekliyor / durdu).'
  },
  prefNotifyThreshold: { en: 'Notify after (seconds)', tr: 'Kaç saniyeden sonra' },
  prefNotifyThresholdHint: {
    en: 'Only notify for tasks running longer than this.',
    tr: 'Sadece bundan uzun süren görevler için bildir.'
  },
  testNotifBtn: { en: 'Send test notification', tr: 'Test bildirimi gönder' },
  version: { en: 'Version', tr: 'Sürüm' },
  developer: { en: 'Developer', tr: 'Geliştirici' },
  keepAwake: { en: 'Keep awake', tr: 'Uyanık tut' },
  keepAwakeHint: {
    en: 'Keeps your computer awake — screen stays on, no sleep',
    tr: 'Bilgisayarı açık tutar — ekran kapanmaz, uykuya geçmez'
  },
  checkUpdate: { en: 'Check for updates', tr: 'Güncellemeleri denetle' },
  checkingUpdate: { en: 'Checking…', tr: 'Denetleniyor…' },
  updateAvailable: { en: 'Update available', tr: 'Güncelleme var' },
  upToDate: { en: 'You have the latest version', tr: 'En güncel sürümdesin' },
  updateCheckFailed: { en: 'Could not check for updates', tr: 'Güncelleme denetlenemedi' },
  download: { en: 'Download', tr: 'İndir' },
  orViaBrew: { en: 'or via Homebrew:', tr: 'veya Homebrew ile:' },
  copy: { en: 'Copy', tr: 'Kopyala' },
  copied: { en: 'Copied ✓', tr: 'Kopyalandı ✓' },
  restartApp: { en: 'Restart', tr: 'Yeniden başlat' },
  restartHint: {
    en: 'After upgrading, restart to apply',
    tr: 'Yükselttikten sonra uygulamak için yeniden başlat'
  },
  testNotifTitle: { en: 'Archo', tr: 'Archo' },
  testNotifBody: {
    en: 'Test notification — desktop notifications work ✓',
    tr: 'Test bildirimi — masaüstü bildirimleri çalışıyor ✓'
  },
  testNotifSent: {
    en: 'Test notification sent (check macOS Notifications permission if nothing appears)',
    tr: 'Test bildirimi gönderildi (bir şey çıkmazsa macOS Bildirim iznini kontrol et)'
  },

  // App.tsx — command palette groups / labels
  cmdGroupAction: { en: 'Action', tr: 'Aksiyon' },
  cmdGroupAssistant: { en: 'Assistant', tr: 'Asistan' },
  cmdNewSkill: { en: 'New skill', tr: 'Yeni skill' },
  cmdNewAgent: { en: 'New agent', tr: 'Yeni agent' },
  cmdNewCommand: { en: 'New command', tr: 'Yeni command' },
  cmdFindReplace: { en: '🔎 Find & replace (⌘⇧F)', tr: '🔎 Ara & değiştir (⌘⇧F)' },
  cmdBackAssistants: { en: '← Assistants', tr: '← Asistanlar' },
  cmdNewAssistant: { en: 'New assistant', tr: 'Yeni asistan' },
  cmdUsage: { en: '📊 Usage', tr: '📊 Kullanım' },
  cmdSettings: { en: '⚙ Settings', tr: '⚙ Ayarlar' },
  cmdToggleTheme: { en: 'Toggle theme (dark/light)', tr: 'Tema değiştir (koyu/açık)' },
  // App.tsx — confirms / toasts
  confirmDeleteResource: { en: 'Delete "{name}"?', tr: '"{name}" silinsin mi?' },
  toastDeleted: { en: '"{name}" deleted', tr: '"{name}" silindi' },
  toastPluginEnabled: { en: '"{name}" enabled', tr: '"{name}" etkinleştirildi' },
  toastPluginDisabled: { en: '"{name}" disabled', tr: '"{name}" devre dışı' },
  toastMcpEnabled: { en: '"{name}" ({scope}) enabled for this assistant', tr: '"{name}" ({scope}) bu asistanda etkin' },
  toastMcpDisabled: { en: '"{name}" ({scope}) disabled for this assistant', tr: '"{name}" ({scope}) bu asistanda kapalı' },
  scopeGlobal: { en: 'global', tr: 'global' },
  scopeProject: { en: 'project', tr: 'proje' },
  toastDuplicated: { en: '"{name}" duplicated', tr: '"{name}" çoğaltıldı' },
  toastImported: { en: '"{name}" imported with all settings', tr: '"{name}" tüm ayarlarıyla içe aktarıldı' },
  toastExported: { en: '"{name}" exported with all settings', tr: '"{name}" tüm ayarlarıyla dışa aktarıldı' },
  confirmDeleteAssistant: {
    en: 'Delete "{name}"?\n\nAll of the assistant\'s files ({dir}) will be permanently removed from disk. This cannot be undone.',
    tr: '"{name}" silinsin mi?\n\nAsistanın tüm dosyaları ({dir}) kalıcı olarak diskten silinecek. Bu geri alınamaz.'
  },
  toastAssistantDeleted: { en: '"{name}" and all its files deleted', tr: '"{name}" ve tüm dosyaları silindi' },
  dropHint: {
    en: '⬇ Drop a .md / .json file → save it as skill / agent / command',
    tr: '⬇ .md / .json dosyasını bırak → skill / agent / command olarak kaydet'
  },
  usageAndCost: { en: 'Usage & cost', tr: 'Kullanım & maliyet' },

  // Sidebar
  collapseAll: { en: 'Expand / collapse all', tr: 'Tümünü aç/kapat' },
  newX2: { en: 'New', tr: 'Yeni' },
  mcpGlobalUser: { en: 'Global (user) MCP', tr: 'Global (kullanıcı) MCP' },
  mcpProject: { en: 'Project MCP', tr: 'Proje MCP' },
  enabledForAssistant: { en: 'Enabled for this assistant — click to disable', tr: 'Bu asistanda etkin — kapatmak için tıkla' },
  disabledForAssistant: { en: 'Disabled for this assistant — click to enable', tr: 'Bu asistanda kapalı — açmak için tıkla' },
  removeFromFavorites: { en: 'Remove from favorites', tr: 'Favorilerden çıkar' },
  addToFavorites: { en: 'Add to favorites', tr: 'Favorilere ekle' },
  removeFromFavoritesStar: { en: '★ Remove from favorites', tr: '★ Favoriden çıkar' },
  addToFavoritesStar: { en: '☆ Add to favorites', tr: '☆ Favorilere ekle' },

  // SessionsView
  relJustNow: { en: 'just now', tr: 'az önce' },
  relMinAgo: { en: '{n} min ago', tr: '{n} dk önce' },
  relHourAgo: { en: '{n}h ago', tr: '{n} sa önce' },
  claudeSession: { en: 'Claude session', tr: 'Claude oturumu' },
  resumeConversation: { en: 'The conversation will resume where you left off.', tr: 'Konuşma kaldığı yerden açılacak.' },
  resumeLast: { en: 'The last conversation will be resumed.', tr: 'Son konuşma sürdürülecek.' },
  resume: { en: '▶ Resume', tr: '▶ Devam et' },
  restart: { en: '▶ Restart', tr: '▶ Yeniden başlat' },
  start: { en: '▶ Start', tr: '▶ Başlat' },
  bucketToday: { en: 'Today', tr: 'Bugün' },
  bucketYesterday: { en: 'Yesterday', tr: 'Dün' },
  bucketThisWeek: { en: 'This week', tr: 'Bu hafta' },
  bucketThisMonth: { en: 'This month', tr: 'Bu ay' },
  bucketOlder: { en: 'Older', tr: 'Daha eski' },
  bucketPinned: { en: '📌 Pinned', tr: '📌 Sabitler' },
  confirmDeleteSession: { en: 'Delete session? (terminal logs are deleted too)', tr: 'Session silinsin mi? (terminal kayıtları da silinir)' },
  searchSessionPh: { en: '🔍  search session…', tr: '🔍  session ara…' },
  newSessionPlus: { en: '＋ New session', tr: '＋ Yeni session' },
  noSessionsYet: { en: 'No sessions yet', tr: 'Henüz session yok' },
  noMatchingSession: { en: 'no matching session', tr: 'eşleşen session yok' },
  unpin: { en: 'Unpin', tr: 'Sabitlemeyi kaldır' },
  pin: { en: 'Pin', tr: 'Sabitle' },
  nTerminal: { en: '{n} terminal', tr: '{n} terminal' },
  pickSessionBig: { en: 'Pick a session', tr: 'Bir session seç' },
  doubleClickRename: { en: 'Double-click to rename', tr: 'Çift tıkla: yeniden adlandır' },
  removeTag: { en: 'Remove tag', tr: 'Etiketi kaldır' },
  tagPlaceholder: { en: '+ tag', tr: '+ etiket' },
  closeSplit: { en: 'Close split', tr: 'Bölmeyi kapat' },
  splitSideBySide: { en: 'Split side by side', tr: 'Yan yana böl' },
  emptySession: { en: 'This session is empty', tr: 'Bu session boş' },
  emptySessionSub: { en: 'Open a terminal with "＋" — its output is saved automatically.', tr: '“＋” ile bir terminal aç — çıktısı otomatik kaydedilir.' },
  terminalEnded: { en: '[terminal ended]', tr: '[terminal sonlandı]' },
  taskDoneTitle: { en: 'Task complete', tr: 'Görev tamamlandı' },
  taskDoneBody: { en: '{name}: task finished after {sec}s', tr: '{name}: {sec} sn süren iş bitti' },
  taskDoneSubtitle: { en: 'Finished in {sec}s — click to open', tr: '{sec} sn sürdü — açmak için tıkla' },
  running: { en: 'Running…', tr: 'Çalışıyor…' },

  // SessionTools
  workingDir: { en: 'working directory', tr: 'çalışma dizini' },
  pickWorkingDir: { en: 'select working directory', tr: 'çalışma dizini seç' },
  recentDirs: { en: 'Recent directories', tr: 'Son dizinler' },
  noRecentDirs: { en: 'no recent directories', tr: 'geçmiş dizin yok' },
  removeFromHistory: { en: 'Remove from history', tr: 'Geçmişten kaldır' },
  activeGitBranch: { en: 'Active git branch', tr: 'Aktif git branch’i' },
  hasChanges: { en: 'has changes', tr: 'değişiklik var' },
  nMessages: { en: '{n} messages', tr: '{n} mesaj' },
  modelAuto: { en: 'model: auto', tr: 'model: oto' },
  effortAuto: { en: 'effort: auto', tr: 'effort: oto' },
  reasoningEffort: { en: 'Reasoning effort', tr: 'Reasoning effort' },
  startClaudeTitle: { en: 'Start Claude with the selected model/effort', tr: 'Seçili model/effort ile Claude başlat' },
  files: { en: 'Files', tr: 'Dosyalar' },
  prompts: { en: 'Prompts', tr: 'Promptlar' },
  bridgeTitle: {
    en: "Use the assistant's whole config (skill/agent/command/mcp/CLAUDE.md/settings) in this repo",
    tr: "Asistanın tüm config'ini (skill/agent/command/mcp/CLAUDE.md/settings) bu repoda kullan"
  },
  bridgeLinked: { en: 'Linked ({count})', tr: 'Bağlı ({count})' },
  bridgeLink: { en: 'Link assistant', tr: 'Asistanı bağla' },
  fileSearchPh: { en: 'search file… (click → adds @path to terminal)', tr: 'dosya ara… (tıkla → terminale @path ekler)' },
  addDirTitle: { en: 'Add another directory to the list', tr: 'Listeye başka bir dizin ekle' },
  addDir: { en: '＋ directory', tr: '＋ dizin' },
  loading: { en: 'loading…', tr: 'yükleniyor…' },
  noFilesFound: { en: 'no files found', tr: 'dosya bulunamadı' },
  moreFiles: { en: '+{n} more files — narrow the search', tr: '+{n} dosya daha — aramayı daralt' },
  savedPrompts: { en: 'Saved prompts — send to the active terminal', tr: 'Kaydedilmiş promptlar — aktif terminale gönder' },
  newPlus: { en: '＋ New', tr: '＋ Yeni' },
  titlePlaceholder: { en: 'Title', tr: 'Başlık' },
  promptTextPlaceholder: { en: 'Prompt text…', tr: 'Prompt metni…' },
  discard: { en: 'Discard', tr: 'Vazgeç' },
  send: { en: 'send', tr: 'gönder' },
  toastOpenTerminalFirst: { en: 'Open a terminal first', tr: 'Önce bir terminal aç' },
  toastCwdSet: { en: 'Working directory set', tr: 'Çalışma dizini ayarlandı' },
  toastBridgeRemoved: { en: 'Skill bridge removed', tr: 'Skill köprüsü kaldırıldı' },
  toastBridgeLinked: { en: 'Assistant linked to this repo ({n} items)', tr: 'Asistan bu repoya bağlandı ({n} öğe)' },
  toastBridgeFailed: { en: 'Could not create bridge', tr: 'Köprü kurulamadı' },
  toastPromptSent: { en: '"{name}" sent', tr: '"{name}" gönderildi' },

  // Editor
  pickResource: { en: 'Pick a resource', tr: 'Bir kaynak seç' },
  pickResourceSub: { en: 'Open a skill, agent, command or instruction from the left bar.', tr: 'Sol bardan bir skill, agent, komut veya talimat aç.' },
  close: { en: 'Close', tr: 'Kapat' },
  modeEdit: { en: 'Edit', tr: 'Düzenle' },
  modePreview: { en: 'Preview', tr: 'Önizleme' },
  modeRaw: { en: 'Raw text', tr: 'Ham metin' },
  fieldTitle: { en: 'Title', tr: 'Başlık' },
  fieldTitleName: { en: 'Title (name)', tr: 'Başlık (name)' },
  fieldDetail: { en: 'Detail', tr: 'Detay' },
  descPlaceholder: { en: 'When / why this resource is used', tr: 'Bu kaynak ne zaman / niçin kullanılır' },
  removeField: { en: 'Remove field', tr: 'Alanı kaldır' },
  customFieldPh: { en: 'custom field… (Enter)', tr: 'özel alan… (Enter)' },
  addField: { en: '＋ Add field', tr: '＋ Alan ekle' },
  content: { en: 'Content', tr: 'İçerik' },
  contentPlaceholder: { en: 'Content…', tr: 'İçerik…' },
  fileContentPlaceholder: { en: 'File content…', tr: 'Dosya içeriği…' },
  saveIcon: { en: '💾 Save', tr: '💾 Kaydet' },
  undo: { en: 'Undo', tr: 'Geri Al' },
  unsavedChanges: { en: 'unsaved changes · ⌘S', tr: 'kaydedilmemiş değişiklik · ⌘S' },
  savedCheck: { en: 'saved ✓', tr: 'kaydedildi ✓' },
  selectOpt: { en: '(select)', tr: '(seç)' },
  toastSaved: { en: '"{name}" saved', tr: '"{name}" kaydedildi' },

  // McpPanel
  mcpEdit: { en: '✎ Edit', tr: '✎ Düzenle' },
  mcpDelete: { en: '🗑 Delete', tr: '🗑 Sil' },
  serverConfigJson: { en: 'Server config (JSON)', tr: 'Server config (JSON)' },
  saveIconPlain: { en: '💾 Save', tr: '💾 Kaydet' },
  command: { en: 'Command', tr: 'Komut' },
  source: { en: 'Source', tr: 'Kaynak' },
  mcpConnecting: { en: '⏳ Connecting…', tr: '⏳ Bağlanıyor…' },
  mcpReconnect: { en: '↻ Reconnect', tr: '↻ Yeniden bağlan' },
  mcpTestConnect: { en: '▶ Test / Connect', tr: '▶ Test et / Bağlan' },
  mcpConnected: { en: '● Connected', tr: '● Bağlı' },
  mcpErrorDot: { en: '● Error', tr: '● Hata' },
  mcpFilterPh: { en: '🔍 filter', tr: '🔍 filtrele' },
  mcpTestTool: { en: '▶ test', tr: '▶ test et' },
  parameters: { en: 'Parameters', tr: 'Parametreler' },
  mcpRunning: { en: '⏳ running…', tr: '⏳ çalışıyor…' },
  mcpRun: { en: '▶ Run', tr: '▶ Çalıştır' },
  mcpSuccess: { en: '● success', tr: '● başarılı' },
  mcpFailure: { en: '● error', tr: '● hata' },
  mcpNoMatchingTool: { en: 'no matching tool', tr: 'eşleşen tool yok' },
  mcpHint: {
    en: '"Test / Connect" runs the server and lists its tools. "Edit" lets you change the config (command / args / env) and save it here.',
    tr: '“Test et / Bağlan” ile server’ı çalıştırıp tool’larını listeler. “Düzenle” ile config’i (command / args / env) buradan değiştirip kaydedebilirsin.'
  },
  errInvalidJsonParam: { en: 'invalid JSON parameter', tr: 'geçersiz JSON parametre' },
  errInvalidJsonField: { en: '{key}: invalid JSON', tr: '{key}: geçersiz JSON' },
  errUnknown: { en: 'unknown error', tr: 'bilinmeyen hata' },
  errInvalidJson: { en: 'invalid JSON: ', tr: 'geçersiz JSON: ' },
  errNotSaved: { en: 'could not save', tr: 'kaydedilemedi' },
  confirmDeleteMcp: { en: 'Delete MCP server "{name}" from .mcp.json?', tr: '"{name}" MCP server\'ı .mcp.json\'dan silinsin mi?' },

  // CreateModal
  newResource: { en: 'New Resource', tr: 'Yeni Kaynak' },
  newResourceSub: { en: 'What do you want to create for this assistant?', tr: 'Bu asistan için ne oluşturmak istiyorsun?' },
  fieldName: { en: 'Name', tr: 'İsim' },
  templateLabel: { en: 'Template', tr: 'Şablon' },
  droppedFile: { en: 'Dropped file', tr: 'Sürüklenen dosya' },
  // starter template labels
  tplBlank: { en: 'Blank', tr: 'Boş' },
  tplExample: { en: 'Example', tr: 'Örnek' },
  tplResearch: { en: 'Research', tr: 'Araştırma' },
  tplReviewer: { en: 'Code reviewer', tr: 'Kod İnceleyici' },
  tplExplorer: { en: 'Explorer (read-only)', tr: 'Kâşif (read-only)' },
  // starter template descriptions + bodies
  tplSkillExampleDesc: {
    en: 'TODO — when to use this skill',
    tr: 'TODO — bu skill ne zaman kullanılır'
  },
  tplSkillExampleBody: {
    en: 'This skill does…\n\n## Steps\n1. …\n2. …',
    tr: 'Bu skill şunu yapar…\n\n## Adımlar\n1. …\n2. …'
  },
  tplSkillResearchDesc: {
    en: 'Researches a topic across multiple sources and writes a summary',
    tr: 'Bir konuyu çok kaynaktan araştırıp özet çıkarır'
  },
  tplSkillResearchBody: {
    en: "Research the given topic:\n- Search the web, read the sources\n- Verify the findings\n- Write a short, sourced summary",
    tr: "Verilen konuyu araştır:\n- Web'de ara, kaynakları oku\n- Bulguları doğrula\n- Kısa, kaynaklı bir özet yaz"
  },
  tplAgentExampleDesc: { en: 'TODO — what this agent does', tr: 'TODO — bu agent ne yapar' },
  tplAgentExampleBody: {
    en: 'You are a {n} agent. Your task is…',
    tr: "Sen bir {n} agent'ısın. Görevin…"
  },
  tplAgentReviewerDesc: {
    en: 'Reviews a diff and suggests bugs and improvements',
    tr: "Diff'i inceleyip bug ve iyileştirme önerir"
  },
  tplAgentReviewerBody: {
    en: 'You are a senior code reviewer. Review the given changes:\n- Correctness / bug risks\n- Security issues\n- Simplification opportunities\nGive file:line for each finding and note its severity.',
    tr: 'Sen kıdemli bir kod inceleyicisin. Verilen değişiklikleri incele:\n- Doğruluk/bug riskleri\n- Güvenlik açıkları\n- Sadeleştirme fırsatları\nHer bulgu için dosya:satır ver ve önem derecesi belirt.'
  },
  tplAgentExplorerDesc: {
    en: 'Searches the codebase and finds the relevant places',
    tr: 'Kod tabanında arama yapıp ilgili yerleri bulur'
  },
  tplAgentExplorerBody: {
    en: "You are a read-only exploration agent. Find what's asked in the codebase,\nreturn the relevant file:line references and a short summary. Don't edit code.",
    tr: 'Sen salt-okunur bir keşif agent\'ısın. Sorulan şeyi kod tabanında bul,\nilgili dosya:satır referanslarını ve kısa bir özet döndür. Kod düzenleme yapma.'
  },
  tplCmdExampleDesc: { en: 'TODO — what this command does', tr: 'TODO — bu komut ne yapar' },
  tplCmdExampleBody: {
    en: 'Using the input given via $ARGUMENTS, do the following…',
    tr: '$ARGUMENTS ile verilen girdiyi kullanarak şunu yap…'
  },
  namePlaceholder: { en: '{kind}-name…', tr: '{kind}-adı…' },
  errNotCreated: { en: 'could not create', tr: 'oluşturulamadı' },

  // AssistantModal
  newAssistantTitle: { en: 'New Assistant', tr: 'Yeni Asistan' },
  newAssistantSub: {
    en: "Give it a name. You'll set up its skills / agents / MCP inside the assistant later.",
    tr: 'İsim ver. Skill / agent / MCP’sini sonra bu asistanın içinde kuracaksın.'
  },
  fieldIcon: { en: 'Icon', tr: 'İkon' },

  // UsagePanel
  usageTitle: { en: '📊 Usage', tr: '📊 Kullanım' },
  usageSub: {
    en: 'At the top, your <b>real plan usage</b> (from Claude, session & weekly %). Below, token and API-equivalent cost breakdown computed from local sessions.',
    tr: 'Üstte <b>gerçek plan kullanımın</b> (Claude’dan, session & haftalık %). Altta yerel oturumlardan hesaplanan token ve API-eşdeğeri maliyet kırılımı.'
  },
  calculating: { en: 'Calculating…', tr: 'Hesaplanıyor…' },
  realPlanUsage: { en: 'Real plan usage', tr: 'Gerçek plan kullanımı' },
  refresh: { en: '↻ refresh', tr: '↻ yenile' },
  ubarSession: { en: '⏱ Session', tr: '⏱ Oturum' },
  ubarSessionSub: { en: '5-hour window', tr: '5 saatlik pencere' },
  ubarWeekly: { en: '🗓 Weekly', tr: '🗓 Haftalık' },
  ubarWeeklySub: { en: 'all models', tr: 'tüm modeller' },
  ubarWeeklyOpus: { en: '◆ Weekly Opus', tr: '◆ Haftalık Opus' },
  ubarWeeklyOpusSub: { en: 'opus limit', tr: 'opus limiti' },
  keychainHint: {
    en: 'The token is read from the macOS Keychain; you may need to click "allow" the first time.',
    tr: 'Token macOS Keychain’den okunur; ilk seferde “izin ver” demen gerekebilir.'
  },
  periodToday: { en: 'Today', tr: 'Bugün' },
  periodThisWeek: { en: 'This week', tr: 'Bu hafta' },
  periodThisMonth: { en: 'This month', tr: 'Bu ay' },
  periodAllTime: { en: 'All time', tr: 'Tüm zamanlar' },
  msgSuffix: { en: 'msg', tr: 'mesaj' },
  tokSuffix: { en: 'tok', tr: 'tok' },
  usageInput: { en: 'Input', tr: 'Giriş' },
  usageOutput: { en: 'Output', tr: 'Çıkış' },
  usageCacheRead: { en: 'Cache Read', tr: 'Cache Okuma' },
  usageCacheWrite: { en: 'Cache Write', tr: 'Cache Yazma' },
  dailyCost: { en: 'Daily cost (last {n} days)', tr: 'Günlük maliyet (son {n} gün)' },
  noData: { en: 'no data', tr: 'veri yok' },
  byModel: { en: 'By model', tr: 'Modele göre' },
  colModel: { en: 'Model', tr: 'Model' },
  colMessage: { en: 'Msg', tr: 'Mesaj' },
  colInput: { en: 'Input', tr: 'Giriş' },
  colOutput: { en: 'Output', tr: 'Çıkış' },
  colCost: { en: 'Cost', tr: 'Maliyet' },
  byProject: { en: 'By project (most expensive)', tr: 'Projeye göre (en pahalı)' },
  usageFoot: {
    en: '{n} session files scanned · prices approximate (Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 per 1M tokens)',
    tr: '{n} oturum dosyası tarandı · fiyatlar yaklaşık (Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 / 1M token)'
  },
  planQuotaReal: { en: 'plan quota (real)', tr: 'plan kotası (gerçek)' },
  resetsIn: { en: '⟳ in {rel} ({time})', tr: '⟳ {rel} sonra ({time})' },
  relNow: { en: 'now', tr: 'şimdi' },
  hoursMins: { en: '{h}h {m}m', tr: '{h} saat {m} dk' },
  mins: { en: '{m}m', tr: '{m} dk' },

  // QuickUsage
  quDetail: { en: 'detail →', tr: 'detay →' },
  quTitle: { en: 'Detailed usage — click', tr: 'Detaylı kullanım için tıkla' },
  quSessionLimit: { en: '⚠ Session limit nearly full ({pct}%)', tr: '⚠ Oturum limiti dolmak üzere (%{pct})' },
  quSession: { en: 'Session', tr: 'Oturum' },
  quToday: { en: 'Today', tr: 'Bugün' },
  quTotal: { en: 'Total', tr: 'Toplam' },
  quUsage: { en: '📊 Usage', tr: '📊 Kullanım' },

  // CommandPalette
  cmdSearchPh: { en: 'Search command, resource, action…', tr: 'Komut, kaynak, aksiyon ara…' },
  cmdNoResult: { en: 'No result', tr: 'Sonuç yok' },
  cmdFoot: { en: '↑↓ move · ⏎ select · esc close', tr: '↑↓ gez · ⏎ seç · esc kapat' },

  // FindReplace
  frTitle: { en: '🔎 Find & replace in resources', tr: '🔎 Kaynaklarda ara & değiştir' },
  frFindPh: { en: 'Find…', tr: 'Ara…' },
  frReplacePh: { en: 'Replace…', tr: 'Değiştir…' },
  frSearching: { en: 'searching…', tr: 'aranıyor…' },
  frMatchesFiles: { en: '{matches} matches · {files} files', tr: '{matches} eşleşme · {files} dosya' },
  frReplaceAll: { en: 'Replace all', tr: 'Tümünü değiştir' },
  frNoMatch: { en: 'No match found', tr: 'Eşleşme bulunamadı' },
  frReplaceInFile: { en: 'Replace in this file', tr: 'Bu dosyada değiştir' },
  frReplace: { en: 'replace', tr: 'değiştir' },
  frMoreLines: { en: '+{n} more lines', tr: '+{n} satır daha' },
  toastReplaced: { en: '{count} matches replaced in {files} files', tr: '{count} eşleşme {files} dosyada değiştirildi' },
  toastNothingToReplace: { en: 'No match to replace', tr: 'Değiştirilecek eşleşme yok' }
}

// Default UI language is English; only an explicit stored 'tr' switches to Turkish.
let current: Lang = localStorage.getItem('lang') === 'tr' ? 'tr' : 'en'

export function getLang(): Lang {
  return current
}
export function setLang(l: Lang): void {
  current = l
  localStorage.setItem('lang', l)
}
export function t(key: keyof typeof DICT | string): string {
  const e = DICT[key]
  if (!e) return String(key)
  return e[current] || e.en
}
// t() with {token} interpolation, e.g. ti('toastDeleted', { name })
export function ti(key: keyof typeof DICT | string, vars: Record<string, string | number>): string {
  let s = t(key)
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}
