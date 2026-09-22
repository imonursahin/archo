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

  // tools dashboard
  tools: { en: 'Dashboard', tr: 'Dashboard' },
  tvRefresh: { en: 'Refresh', tr: 'Yenile' },
  tvLoading: { en: 'Loading…', tr: 'Yükleniyor…' },
  tvLastUpdated: { en: 'updated', tr: 'güncellendi' },
  tvMyPrs: { en: 'My open PRs', tr: 'Açık PR’larım' },
  tvReviewRequested: { en: 'Waiting for my review', tr: 'Review bekleyenler' },
  tvMyIssues: { en: 'My Jira issues', tr: 'Jira işlerim' },
  tvNoPrs: { en: 'No open pull requests.', tr: 'Açık pull request yok.' },
  tvNoReviews: { en: 'Nothing waiting on you.', tr: 'Seni bekleyen review yok.' },
  tvNoIssues: {
    en: 'Nothing assigned to you in the active sprint.',
    tr: 'Aktif sprint’te sana atanmış iş yok.'
  },
  tvMyIssuesSub: { en: 'active sprint', tr: 'aktif sprint' },
  tvJiraNotConfigured: {
    en: 'Jira is not connected — add your credentials in Settings › Integrations.',
    tr: 'Jira bağlı değil — Ayarlar › Entegrasyonlar’dan bilgilerini gir.'
  },
  tvDraft: { en: 'draft', tr: 'draft' },
  tvCopyLink: { en: 'Copy link', tr: 'Linki kopyala' },
  tvMoveTo: { en: 'Move to…', tr: 'Taşı…' },
  tvNoMoves: { en: 'No transitions available', tr: 'Uygun geçiş yok' },
  tvMoved: { en: '{key} → {to}', tr: '{key} → {to}' },
  tvDwellHint: {
    en: 'Time in this column — grey after 1 day, amber after 3, red after 5',
    tr: 'Bu kolonda geçen süre — 1 günden sonra gri, 3 günden sonra sarı, 5 günden sonra kırmızı'
  },
  tvStaleHint: {
    en: 'Time since the last update — amber after 7 days, red after 14',
    tr: 'Son güncellemeden bu yana geçen süre — 7 günden sonra sarı, 14 günden sonra kırmızı'
  },
  tvCopied: { en: 'Link copied', tr: 'Link kopyalandı' },

  // integrations settings
  tabIntegrations: { en: 'Integrations', tr: 'Entegrasyonlar' },
  tabGithub: { en: 'GitHub', tr: 'GitHub' },
  tabJira: { en: 'Jira', tr: 'Jira' },
  tabGcal: { en: 'Google Calendar', tr: 'Google Takvim' },
  githubTitle: { en: 'GitHub', tr: 'GitHub' },
  jiraTitle: { en: 'Jira', tr: 'Jira' },
  ghHint: {
    en: 'Used by the Dashboard to list your open PRs and the ones waiting on your review. Needs a token with the `repo` scope. It is encrypted with your OS keychain and never leaves this machine.',
    tr: 'Dashboard’da açık PR’larını ve review beklediğin PR’ları listelemek için kullanılır. `repo` scope’lu bir token gerekir. İşletim sisteminin keychain’iyle şifrelenir, bu makineden çıkmaz.'
  },
  ghToken: { en: 'Personal access token', tr: 'Personal access token' },
  ghTokenLink: { en: 'Create a token on GitHub', tr: 'GitHub’da token oluştur' },
  ghConnected: { en: 'GitHub connected as {login}', tr: 'GitHub bağlandı: {login}' },
  ghCleared: { en: 'GitHub token removed', tr: 'GitHub token’ı kaldırıldı' },
  ghMissing: { en: 'A token is required', tr: 'Token gerekli' },
  tvGhNotConfigured: {
    en: 'GitHub is not connected — add a token in Settings › Integrations.',
    tr: 'GitHub bağlı değil — Ayarlar › Entegrasyonlar’dan token ekle.'
  },
  jiraHint: {
    en: 'Used by the Dashboard to list the issues assigned to you. The API token is encrypted with your OS keychain and never leaves this machine.',
    tr: 'Dashboard’da sana atanmış işleri listelemek için kullanılır. API token işletim sisteminin keychain’iyle şifrelenir, bu makineden çıkmaz.'
  },
  jiraUrl: { en: 'Jira URL', tr: 'Jira URL' },
  jiraEmail: { en: 'Email', tr: 'E-posta' },
  jiraToken: { en: 'API token', tr: 'API token' },
  jiraTokenPh: { en: 'paste your API token', tr: 'API token’ı yapıştır' },
  jiraTokenStored: { en: '•••••••• (stored — leave blank to keep)', tr: '•••••••• (kayıtlı — boş bırakırsan korunur)' },
  jiraTokenLink: { en: 'Create an API token', tr: 'API token oluştur' },
  jiraSaveTest: { en: 'Save & test', tr: 'Kaydet & test et' },
  jiraClear: { en: 'Remove', tr: 'Kaldır' },
  jiraConnected: { en: 'Jira connected', tr: 'Jira bağlandı' },
  jiraCleared: { en: 'Jira credentials removed', tr: 'Jira bilgileri kaldırıldı' },
  jiraMissing: { en: 'URL, email and token are required', tr: 'URL, e-posta ve token gerekli' },
  gcalTitle: { en: 'Google Calendar', tr: 'Google Calendar' },
  gcalHint: {
    en: 'Shows today’s meetings with a one-click Meet join. Needs an OAuth client (Desktop app) from your own Google Cloud project — read-only calendar access. The refresh token is encrypted with your OS keychain.',
    tr: 'Bugünkü toplantılarını tek tıkla Meet’e katılma ile gösterir. Kendi Google Cloud projenden bir OAuth client (Desktop app) gerekir — takvime salt-okunur erişim. Refresh token işletim sisteminin keychain’iyle şifrelenir.'
  },
  gcalClientId: { en: 'Client ID', tr: 'Client ID' },
  gcalClientSecret: { en: 'Client secret', tr: 'Client secret' },
  gcalCredLink: { en: 'Create OAuth credentials', tr: 'OAuth bilgilerini oluştur' },
  gcalConnect: { en: 'Connect Google', tr: 'Google’a bağlan' },
  gcalWaiting: { en: 'Waiting for Google…', tr: 'Google bekleniyor…' },
  gcalDisconnect: { en: 'Disconnect', tr: 'Bağlantıyı kes' },
  gcalConnected: { en: 'Connected as {email}', tr: 'Bağlandı: {email}' },
  gcalCleared: { en: 'Google disconnected', tr: 'Google bağlantısı kesildi' },
  gcalMissing: { en: 'Client ID and secret are required', tr: 'Client ID ve secret gerekli' },
  prefMeetingAlerts: { en: 'Meeting reminders', tr: 'Toplantı hatırlatması' },
  prefMeetingAlertsHint: {
    en: 'Desktop notification 5 minutes before a meeting starts, click to join.',
    tr: 'Toplantı başlamadan 5 dakika önce masaüstü bildirimi, tıklayınca katıl.'
  },
  tvMeetings: { en: 'Today’s meetings', tr: 'Bugünkü toplantılar' },
  tvNoMeetings: { en: 'Nothing left on the calendar today.', tr: 'Bugün takvimde kalan bir şey yok.' },
  tvGcalNotConfigured: {
    en: 'Google Calendar is not connected — set it up in Settings › Integrations.',
    tr: 'Google Calendar bağlı değil — Ayarlar › Entegrasyonlar’dan kur.'
  },
  tvJoin: { en: 'Join', tr: 'Katıl' },
  tvOpenSession: { en: 'Open session “{name}”', tr: '“{name}” session’ını aç' },
  sessTicketPh: { en: '◫ Jira Task Id', tr: '◫ Jira Task Id' },
  sessTicketEdit: { en: 'Click to change the linked ticket', tr: 'Bağlı ticket’ı değiştirmek için tıkla' },
  sessBadKey: { en: 'Not a valid issue key (e.g. MB-1234)', tr: 'Geçerli bir issue key değil (ör. MB-1234)' },
  tvInstantMeet: { en: '+ Instant Meet', tr: '+ Anlık Meet' },
  tvSchedule: { en: 'Schedule', tr: 'Planla' },
  tvMeetCreated: { en: 'Meet link created and copied', tr: 'Meet linki oluşturuldu ve kopyalandı' },
  tvMeetScheduled: { en: 'Meeting created', tr: 'Toplantı oluşturuldu' },
  tvMeetTitle: { en: 'Title', tr: 'Başlık' },
  tvMeetGuests: { en: 'guests (comma separated)', tr: 'katılımcılar (virgülle)' },
  tvNeedTime: { en: 'Pick a start time', tr: 'Başlangıç saati seç' },
  tvKindMeeting: { en: 'Meeting', tr: 'Toplantı' },
  tvMeetStart: { en: 'Start', tr: 'Başlangıç' },
  tvMeetMinutes: { en: 'Minutes', tr: 'Dakika' },
  tvMeetNote: {
    en: 'Creates a calendar event with a Meet link and invites the guests.',
    tr: 'Meet linkli bir takvim etkinliği oluşturur ve katılımcılara davet gönderir.'
  },
  tvOooNote: {
    en: 'Blocks the time as out of office. Existing invitations are not auto-declined.',
    tr: 'Bu aralığı ofis dışı olarak bloklar. Mevcut davetler otomatik reddedilmez.'
  },
  tvKindOoo: { en: 'Out of office', tr: 'Ofis dışı' },
  tvOoo: { en: 'out of office', tr: 'ofis dışı' },
  tvOooCreated: { en: 'Out-of-office block created', tr: 'Ofis dışı bloğu oluşturuldu' },
  tvNow: { en: 'now', tr: 'şimdi' },
  tvLive: { en: 'in progress', tr: 'devam ediyor' },
  tvAllDay: { en: 'all day', tr: 'tüm gün' },

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
    en: 'Ask for confirmation before deleting a resource or a session.',
    tr: 'Bir kaynağı veya session’ı silmeden önce onay iste.'
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
  color: { en: 'Color', tr: 'Renk' },
  showSidebar: { en: 'Show sidebar', tr: 'Sidebar\'ı göster' },
  hideSidebar: { en: 'Hide sidebar', tr: 'Sidebar\'ı gizle' },
  searchTranscripts: { en: 'Search transcripts', tr: 'Transcript\'lerde ara' },
  searchTranscriptsPh: {
    en: 'Search all Claude conversations…',
    tr: 'Tüm Claude konuşmalarında ara…'
  },
  backToResults: { en: 'Back to results', tr: 'Sonuçlara dön' },
  you: { en: 'You', tr: 'Sen' },
  searching: { en: 'Searching…', tr: 'Aranıyor…' },
  noResults: { en: 'No matches', tr: 'Eşleşme yok' },
  thisAssistant: { en: 'This assistant', tr: 'Bu assistant' },
  allProjects: { en: 'All', tr: 'Tümü' },
  resumeSession: { en: 'Resume in new terminal', tr: 'Yeni terminalde devam et' },
  assistantNamePh: { en: 'my-assistant', tr: 'asistanım' },
  minUnit: { en: 'm', tr: 'dk' },
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
  updateNow: { en: 'Update now', tr: 'Şimdi güncelle' },
  updating: { en: 'Updating…', tr: 'Güncelleniyor…' },
  updateFailed: { en: 'Update failed', tr: 'Güncelleme başarısız' },
  brewNotFound: { en: 'Not a Homebrew install — download the update instead', tr: 'Homebrew kurulumu değil — güncellemeyi indir' },
  updateReadyBadge: { en: 'Update to v{v}', tr: 'v{v}\'e güncelle' },
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
  toastExported: { en: '"{name}" exported — {n} files', tr: '"{name}" dışa aktarıldı — {n} dosya' },
  toastExportDropped: {
    en: '{n} file(s) left out (binary or over 512KB), e.g. {first}',
    tr: '{n} dosya pakete girmedi (binary ya da 512KB üstü), örn. {first}'
  },
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
  searchSessionPh: { en: 'search session…', tr: 'session ara…' },
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
  splitPickHint: { en: 'Pick the two terminals to show', tr: 'Yan yana görünecek iki terminali seç' },
  splitApply: { en: 'Split', tr: 'Böl' },
  emptySession: { en: 'This session is empty', tr: 'Bu session boş' },
  emptySessionSub: { en: 'Open a terminal with "＋" — its output is saved automatically.', tr: '“＋” ile bir terminal aç — çıktısı otomatik kaydedilir.' },
  terminalEnded: { en: '[terminal ended]', tr: '[terminal sonlandı]' },
  taskDoneTitle: { en: 'Task complete', tr: 'Görev tamamlandı' },
  taskDoneBody: { en: 'Finished · {sec}s · tap to open', tr: 'Bitti · {sec} sn · açmak için tıkla' },
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
  startClaude: { en: 'Start', tr: 'Başlat' },
  files: { en: 'Files', tr: 'Dosyalar' },
  filesTitle: {
    en: 'Pick files or folders — their full paths go to the terminal',
    tr: 'Dosya ya da klasör seç — tam yolları terminale gider'
  },
  prompts: { en: 'Prompts', tr: 'Promptlar' },
  bridgeTitle: {
    en: "Use the assistant's whole config (skill/agent/command/mcp/CLAUDE.md/settings) in this repo",
    tr: "Asistanın tüm config'ini (skill/agent/command/mcp/CLAUDE.md/settings) bu repoda kullan"
  },
  bridgeLinked: { en: 'Linked ({count})', tr: 'Bağlı ({count})' },
  bridgeLink: { en: 'Link assistant', tr: 'Asistanı bağla' },
  savedPrompts: { en: 'Saved prompts — send to the active terminal', tr: 'Kaydedilmiş promptlar — aktif terminale gönder' },
  newPlus: { en: '＋ New', tr: '＋ Yeni' },
  titlePlaceholder: { en: 'Title', tr: 'Başlık' },
  promptTextPlaceholder: { en: 'Prompt text… use {{name}} for a variable', tr: 'Prompt metni… değişken için {{ad}} yaz' },
  fillVarsFor: { en: 'Fill in "{name}"', tr: '"{name}" için değerleri gir' },
  discard: { en: 'Discard', tr: 'Vazgeç' },
  send: { en: 'send', tr: 'gönder' },
  toastOpenTerminalFirst: { en: 'Open a terminal first', tr: 'Önce bir terminal aç' },
  toastCwdSet: { en: 'Working directory set', tr: 'Çalışma dizini ayarlandı' },
  toastBridgeRemoved: { en: 'Skill bridge removed', tr: 'Skill köprüsü kaldırıldı' },
  toastBridgeLinked: { en: 'Assistant linked to this repo ({n} items)', tr: 'Asistan bu repoya bağlandı ({n} öğe)' },
  toastBridgeFailed: { en: 'Could not create bridge', tr: 'Köprü kurulamadı' },
  toastPromptSent: { en: '"{name}" sent', tr: '"{name}" gönderildi' },

  pluginsManage: { en: 'manage plugins', tr: 'pluginleri yönet' },
  pluginsTitle: { en: 'Plugins — {name}', tr: 'Pluginler — {name}' },
  pluginsInstalled: { en: 'Installed ({n})', tr: 'Kurulu ({n})' },
  pluginsAvailable: { en: 'Available ({n})', tr: 'Kurulabilir ({n})' },
  pluginsMarkets: { en: 'Marketplaces ({n})', tr: 'Marketplaceler ({n})' },
  pluginsLoading: { en: 'Asking the claude CLI…', tr: 'claude CLI sorgulanıyor…' },
  pluginsSearch: { en: 'Filter by name…', tr: 'İsme göre süz…' },
  pluginsNone: { en: 'Nothing here', tr: 'Burada bir şey yok' },
  pluginInstall: { en: 'install', tr: 'kur' },
  pluginEnable: { en: 'enable', tr: 'aç' },
  pluginDisable: { en: 'disable', tr: 'kapat' },
  pluginUpdate: { en: 'update', tr: 'güncelle' },
  pluginInstalled: { en: 'Plugin installed — restart Claude to load it', tr: 'Plugin kuruldu — yüklenmesi için Claude yeniden başlamalı' },
  pluginUninstalled: { en: 'Plugin removed', tr: 'Plugin kaldırıldı' },
  pluginEnabled: { en: 'Plugin enabled', tr: 'Plugin açıldı' },
  pluginDisabled: { en: 'Plugin disabled', tr: 'Plugin kapatıldı' },
  pluginUpdated: { en: 'Plugin updated — restart Claude to apply', tr: 'Plugin güncellendi — uygulanması için Claude yeniden başlamalı' },
  confirmUninstallPlugin: { en: 'Uninstall "{name}"?', tr: '"{name}" kaldırılsın mı?' },
  confirmRemoveMarket: { en: 'Remove marketplace "{name}"?', tr: '"{name}" marketplace\'i kaldırılsın mı?' },
  marketAdd: { en: 'Add a marketplace', tr: 'Marketplace ekle' },
  marketAdded: { en: 'Marketplace added', tr: 'Marketplace eklendi' },
  marketRemoved: { en: 'Marketplace removed', tr: 'Marketplace kaldırıldı' },
  marketUpdated: { en: 'Marketplace updated', tr: 'Marketplace güncellendi' },
  add: { en: 'Add', tr: 'Ekle' },
  newFolder: { en: 'New folder', tr: 'Yeni klasör' },
  newFolderPrompt: { en: 'Folder name:', tr: 'Klasör adı:' },
  removeFolder: { en: 'Remove folder', tr: 'Klasörü kaldır' },
  confirmRemoveFolder: {
    en: 'Remove the folder "{name}"? Nothing is deleted — what is in it goes back to the top level.',
    tr: '"{name}" klasörü kaldırılsın mı? Hiçbir şey silinmez, içindekiler üst seviyeye döner.'
  },
  outsideFolders: { en: 'not in a folder', tr: 'klasör dışında' },
  clearMemories: { en: 'clear all memories', tr: 'tüm hafızayı temizle' },
  confirmClearMemories: {
    en: 'Delete everything this assistant remembers? The memory files are removed from Claude\'s store for good.',
    tr: 'Bu asistanın hatırladığı her şey silinsin mi? Memory dosyaları Claude\'un deposundan kalıcı olarak kaldırılır.'
  },
  toastMemoriesPartial: {
    en: '{n} memory files deleted, {failed} could not be removed',
    tr: '{n} memory dosyası silindi, {failed} tanesi kaldırılamadı'
  },
  toastMemoriesCleared: {
    en: '{n} memory files deleted — {size} freed',
    tr: '{n} memory dosyası silindi — {size} boşaldı'
  },
  closeTermTitle: { en: 'Closing "{name}"', tr: '"{name}" kapatılıyor' },
  closeTermSub: {
    en: 'The Claude conversation in this terminal stays on disk unless you delete it. Deleting removes the conversation and its messages for good — /resume will not find it again.',
    tr: 'Bu terminaldeki Claude konuşması, silmedikçe diskte kalır. Silersen konuşma ve mesajları tamamen gider, /resume bir daha bulamaz.'
  },
  closeTermKeep: { en: 'Close terminal', tr: 'Terminali kapat' },
  closeTermDelete: { en: 'Delete conversation', tr: 'Konuşmayı sil' },
  toastConversationDeleted: { en: 'Conversation deleted', tr: 'Konuşma silindi' },
  toastConversationDeleteFailed: {
    en: 'The conversation could not be deleted — the file is locked or read-only',
    tr: 'Konuşma silinemedi — dosya kilitli ya da salt okunur'
  },
  toastConversationNotFound: {
    en: 'Terminal closed — no stored conversation to delete',
    tr: 'Terminal kapandı — silinecek kayıtlı konuşma yok'
  },
  shareAssistant: { en: 'Share with git', tr: "Git ile paylaş" },
  cloneAssistant: { en: 'Clone an assistant from git', tr: "Git'ten assistant klonla" },
  clone: { en: 'Clone', tr: 'Klonla' },
  clonePrompt: {
    en: 'Repository URL of the assistant to clone:',
    tr: 'Klonlanacak assistant repo adresi:'
  },
  shareTitle: { en: 'Share "{name}"', tr: '"{name}" paylaşımı' },
  shareSub: {
    en: 'The assistant folder becomes a git repo. Local permissions, logs and the MCP config (it can hold API keys) stay out.',
    tr: 'Assistant klasörü bir git repo olur. Lokal izinler, loglar ve MCP config (API key tutabiliyor) dışarıda kalır.'
  },
  shareNotRepo: { en: 'not a git repo yet', tr: 'henüz git repo değil' },
  shareClean: { en: 'nothing to commit', tr: "commit'lenecek bir şey yok" },
  shareDirty: { en: 'uncommitted changes', tr: "commit'lenmemiş değişiklik var" },
  shareAhead: { en: '{n} commits not pushed', tr: '{n} commit push edilmemiş' },
  shareCommitMsg: { en: 'Commit message', tr: 'Commit mesajı' },
  shareRemote: { en: 'Remote (origin)', tr: 'Remote (origin)' },
  sharePublish: { en: 'Commit', tr: "Commit'le" },
  sharePush: { en: 'Push', tr: 'Push' },
  sharePull: { en: 'Pull', tr: 'Pull' },
  toastPublished: { en: 'Committed', tr: "Commit'lendi" },
  toastNothingToCommit: { en: 'Nothing changed', tr: 'Değişen bir şey yok' },
  toastRemoteSet: { en: 'Remote set', tr: 'Remote ayarlandı' },
  toastPushed: { en: 'Pushed', tr: 'Push edildi' },
  toastPulled: { en: 'Pulled', tr: 'Pull edildi' },
  toastCloned: { en: '"{name}" cloned', tr: '"{name}" klonlandı' },
  toastCloneFailed: { en: 'Clone failed', tr: 'Klonlama başarısız' },
  hookEmpty: { en: 'No matchers yet for this event', tr: 'Bu event için henüz matcher yok' },
  hookMatcherPh: {
    en: 'matcher — e.g. Bash, Edit|Write, * for all',
    tr: 'matcher — ör. Bash, Edit|Write, hepsi için *'
  },
  hookCommandPh: { en: 'shell command to run', tr: 'çalıştırılacak shell komutu' },
  hookTimeoutPh: { en: 'timeout (s)', tr: 'timeout (sn)' },
  hookRemoveCommand: { en: 'remove', tr: 'sil' },
  hookAddCommand: { en: '＋ command', tr: '＋ komut' },
  hookAddMatcher: { en: '＋ matcher', tr: '＋ matcher' },
  hookDeleteEvent: { en: 'Delete event', tr: "Event'i sil" },
  hookMustBeArray: {
    en: 'a hook event must be a list of matchers',
    tr: 'bir hook event matcher listesi olmalı'
  },
  hookLocalNote: {
    en: 'This event lives in settings.local.json — your machine only, not shared',
    tr: 'Bu event settings.local.json içinde — sadece bu makinede, paylaşılmaz'
  },
  hookUnknownEvent: {
    en: '"{name}" is not an event Archo knows — check the spelling',
    tr: '"{name}" Archo\'nun bildiği bir event değil — yazımını kontrol et'
  },
  confirmDeleteHook: {
    en: 'Delete the "{name}" hook event from this settings file?',
    tr: '"{name}" hook event\'i bu settings dosyasından silinsin mi?'
  },
  tabDoctor: { en: 'Doctor', tr: 'Doctor' },
  doctorHint: {
    en: 'What Archo needs on this machine, and whether it is there',
    tr: "Archo'nun bu makinede ihtiyaç duyduğu şeyler ve durumları"
  },
  doctorRun: { en: 'Re-check', tr: 'Yeniden kontrol et' },
  doctorRunning: { en: 'Checking…', tr: 'Kontrol ediliyor…' },
  diskUsage: { en: 'Terminal recordings', tr: 'Terminal kayıtları' },
  logsSummary: { en: '{n} files, up to {days} days old', tr: '{n} dosya, en eskisi {days} günlük' },
  logsOrphan: { en: '{size} belongs to deleted sessions', tr: '{size} silinmiş oturumlara ait' },
  pruneOlder30: { en: 'Clear older than 30 days', tr: "30 günden eskiyi sil" },
  pruneOlder7: { en: 'Clear older than 7 days', tr: '7 günden eskiyi sil' },
  pruneAll: { en: 'Clear all', tr: 'Hepsini sil' },
  confirmPruneAll: {
    en: 'Delete every terminal recording? Open terminals lose their scrollback.',
    tr: 'Bütün terminal kayıtları silinsin mi? Açık terminaller scrollback geçmişini kaybeder.'
  },
  toastLogsPruned: { en: '{n} files deleted — {size} freed', tr: '{n} dosya silindi — {size} boşaldı' },

  lintNoFrontmatter: {
    en: 'No frontmatter — Claude Code will never load this {kind}',
    tr: 'Frontmatter yok — Claude Code bu {kind} kaydını hiç yüklemez'
  },
  lintNoName: {
    en: 'name is missing — this resource cannot be referenced',
    tr: 'name alanı yok — bu kayıt hiçbir yerden çağrılamaz'
  },
  lintNameShape: {
    en: '"{name}" should be lowercase kebab-case (letters, digits, dashes)',
    tr: '"{name}" küçük harf kebab-case olmalı (harf, rakam, tire)'
  },
  lintNameMismatch: {
    en: 'name "{name}" does not match its folder/file "{expected}"',
    tr: 'name "{name}", klasör/dosya adı "{expected}" ile uyuşmuyor'
  },
  lintNoDesc: {
    en: 'description is missing — nothing tells Claude when to use this',
    tr: 'description yok — Claude bunu ne zaman kullanacağını bilemez'
  },
  lintDescShort: {
    en: 'description is very short — say when to use this, not just what it is',
    tr: 'description çok kısa — ne olduğunu değil, ne zaman kullanılacağını yaz'
  },

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
  confirmDeletePrompt: { en: 'Delete the prompt "{name}"?', tr: '"{name}" prompt\'u silinsin mi?' },
  confirmDeleteMcp: { en: 'Delete MCP server "{name}" from .mcp.json?', tr: '"{name}" MCP server\'ı .mcp.json\'dan silinsin mi?' },
  mcpReconnect: { en: 'Reconnect', tr: 'Yeniden bağlan' },
  confirmDeleteMcpGlobal: {
    en: 'Delete global MCP server "{name}"? This removes it from ~/.claude.json for ALL projects.',
    tr: '"{name}" global MCP server\'ı silinsin mi? ~/.claude.json\'dan TÜM projeler için kaldırılır.'
  },

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

// Localized, magnitude-aware duration: seconds → minutes → hours(+min) → days(+h).
export function fmtDuration(ms: number): string {
  const tr = current === 'tr'
  const U = tr ? { s: 'sn', m: 'dk', h: 'sa', d: 'g' } : { s: 's', m: 'm', h: 'h', d: 'd' }
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}${U.s}`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}${U.m}`
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    const rm = min % 60
    return rm ? `${hr}${U.h} ${rm}${U.m}` : `${hr}${U.h}`
  }
  const d = Math.floor(hr / 24)
  const rh = hr % 24
  return rh ? `${d}${U.d} ${rh}${U.h}` : `${d}${U.d}`
}
