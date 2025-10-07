/* ============================================================
   app.js - Complete (QR removed, calc+search, attachments viewer/video, strong blur)
   ============================================================ */
(function bootstrap(){
  function start(){
    const { createApp } = window.Vue;

    const App = {
      data(){
        return {
          // modes
          currentMode: 'tasks', // tasks | memos | calendar | calc

          // data
          todos: [],
          memos: [],
          settings: { theme: 'auto', notifications: false, clockMode: 'digital' },

          // ui states
          drawerOpen: false,
          menuOpen: false,
          searchActive: false,
          searchQuery: '',
          loading: false,

          // dialogs
          showAddTaskDialog: false,
          showAddMemoDialog: false,
          showEditMemoDialog: false,
          showConfirmDialog: false,
          showSettingsDialog: false,
          confirmTitle: '',
          confirmMessage: '',
          confirmCallback: null,

          // forms
          taskInput: '',
          taskDateInput: '',
          taskPriorityInput: 'normal',
          memoTitleInput: '',
          memoContentInput: '',
          memoAttachments: [],
          editMemoTitleInput: '',
          editMemoContentInput: '',
          editMemoAttachments: [],
          currentMemoId: null,

          // calendar
          currentYear: new Date().getFullYear(),
          currentMonth: new Date().getMonth(),
          selectedDate: null,

          // snackbar/network
          snackbarText: '',
          snackbarVisible: false,
          isOnline: navigator.onLine,
          swRegistration: null,

          // drawer gesture
          touchStartX: 0, touchStartY: 0,
          touchCurrentX: 0, touchCurrentY: 0,
          isSwiping: false, swipeProgress: 0,
          edgeZoneRatio: 0.05, swipeMinDx: 40, swipeMinVel: 0.7,
          gestureStartTime: 0, gestureActive: false,

          // clock
          now: new Date(),

          // calculator
          calculatorValue: '',

          // calendar swipe
          calMinDx: 50, calMinVel: 0.6,
          calTouchStartX: 0, calTouchStartY: 0,
          calTouchCurX: 0, calTouchCurY: 0,
          calTouchStartAt: 0, calSwipeActive: false,

          // dialog stack for strong blur
          dialogStack: [],
          // data() 内
          hideDueAlertDate: '', // 'YYYY-MM-DD' を保存（当日一致なら非表示）

          // viewers
          _viewers: [],
          _vjsPlayers: []
        };
      },

      computed:{
        appBarTitle(){
          return this.currentMode==='tasks'?'タスク':
                 this.currentMode==='memos'?'メモ':
                 this.currentMode==='calendar'?'カレンダー':
                 this.currentMode==='calc'?'電卓':'アプリ';
        },
        totalCount(){ return this.todos.length; },
        activeCount(){ return this.todos.filter(t=>!t.completed).length; },
        completedCount(){ return this.todos.filter(t=>t.completed).length; },
        canClearCompleted(){ return this.completedCount>0; },
        canClearAll(){ return this.totalCount>0; },
        canSearch(){
          if (this.currentMode==='tasks') return this.totalCount>0;
          if (this.currentMode==='memos') return this.memos.length>0;
          if (this.currentMode==='calc') return true;
          return false;
        },
        activeTodos(){ return this.filterTodos(this.todos.filter(t=>!t.completed)); },
        completedTodos(){ return this.filterTodos(this.todos.filter(t=>t.completed)); },
        filteredMemos(){
          if (!this.searchQuery || this.currentMode!=='memos') return this.memos;
          const q=this.searchQuery.toLowerCase();
          return this.memos.filter(m => (m.title||'').toLowerCase().includes(q) || (m.content||'').toLowerCase().includes(q));
        },
        // computed に追加
dueThresholdDays(){
  // 設定に将来hook、未設定は 3 日
  return Number(this.settings?.reminderDays ?? 3);
},
dueSoonTodos(){
  const today = new Date(); today.setHours(0,0,0,0);
  return this.todos.filter(t=>{
    if (t.completed || !t.dueDate) return false;
    const d = new Date(t.dueDate+'T00:00:00'); d.setHours(0,0,0,0);
    const diff = Math.floor((d - today)/86400000);
    return diff >= 0 && diff <= this.dueThresholdDays;
  });
},
overdueTodos(){
  const today = new Date(); today.setHours(0,0,0,0);
  return this.todos.filter(t=>{
    if (t.completed || !t.dueDate) return false;
    const d = new Date(t.dueDate+'T00:00:00'); d.setHours(0,0,0,0);
    const diff = Math.floor((d - today)/86400000);
    return diff < 0;
  });
},
snoozeDueAlertToday(){
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  this.hideDueAlertDate = todayStr;
  try{ localStorage.setItem('hideDueAlertDate', todayStr); }catch(_){}
  this.showSnackbar('本日中はお知らせを非表示にします');
},
// 任意: 設定から解除できるメソッド
clearDueAlertSnooze(){
  this.hideDueAlertDate = '';
  try{ localStorage.removeItem('hideDueAlertDate'); }catch(_){}
  this.showSnackbar('お知らせの非表示を解除しました');
},
dueAlertVisible(){
  if (this.currentMode!=='tasks') return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if ((this.hideDueAlertDate||'') === todayStr) return false;
  return (this.dueSoonTodos.length>0 || this.overdueTodos.length>0);
},
nextDueLabel(){
  // 表示用に最短期限のラベル（今日/明日/N日後/期限切れ）を返す
  const all = [...this.overdueTodos, ...this.dueSoonTodos];
  if (all.length===0) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const sorted = all.slice().sort((a,b)=>{
    const da=new Date(a.dueDate+'T00:00:00')-today;
    const db=new Date(b.dueDate+'T00:00:00')-today;
    return da-db;
  });
  const first = sorted[0];
  const diff = Math.floor((new Date(first.dueDate+'T00:00:00') - today)/86400000);
  if (diff===0) return '今日';
  if (diff===1) return '明日';
  if (diff<0) return `期限切れ（${Math.abs(diff)}日前）`;
  return `${diff}日後`;
},
        calendarDays(){
          const y=this.currentYear, m=this.currentMonth;
          const first=new Date(y,m,1), last=new Date(y,m+1,0), prevLast=new Date(y,m,0);
          const firstD=first.getDay(), lastDate=last.getDate(), prevLastDate=prevLast.getDate();
          const days=[];
          for(let i=firstD-1;i>=0;i--) days.push({date:prevLastDate-i,isOtherMonth:true,dateString:null});
          const today=new Date();
          for(let d=1; d<=lastDate; d++){
            const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            days.push({
              date:d,isOtherMonth:false,
              isToday:y===today.getFullYear() && m===today.getMonth() && d===today.getDate(),
              isSelected:this.selectedDate===ds,
              hasTasks:this.todos.some(t=>t.dueDate===ds),
              dateString:ds
            });
          }
          const remain=42-days.length;
          for(let i=1;i<=remain;i++) days.push({date:i,isOtherMonth:true,dateString:null});
          return days;
        },
        selectedDateTasks(){ if(!this.selectedDate) return []; return this.todos.filter(t=>t.dueDate===this.selectedDate); },
        selectedDateFormatted(){ if(!this.selectedDate) return ''; const d=new Date(this.selectedDate+'T00:00:00'); return `${d.getMonth()+1}月${d.getDate()}日`; },
        calendarMonthYear(){ return `${this.currentYear}年${this.currentMonth+1}月`; }
      },

      watch:{
        showSettingsDialog(){ this.updateBackdropBlur(); },
        dialogStack: { deep:true, handler(){ this.updateBackdropBlur(); } },
        menuOpen(){ this.updateBackdropBlur(); },
        drawerOpen(){ this.updateBackdropBlur(); },
        // 検索→電卓連携
        searchQuery(newQ){
          if (this.currentMode!=='calc') return;
          const q = (newQ || '').trim();
          if (!q){ this.calculatorValue=''; return; }
          if (/[=＝]\s*$/.test(q)){
            const expr = q.replace(/[=＝]\s*$/,'');
            const norm = this.normalizeCalcInput(expr);
            const out = this.safeEval(norm);
            this.calculatorValue = out ?? this.calculatorValue;
            return;
          }
          const norm = this.normalizeCalcInput(q);
          const out = this.safeEval(norm, /*silent*/true);
          this.calculatorValue = (out ?? q).toString();
        }
      },

      methods:{
        /* ---------- storage ---------- */
        loadData(){
          this.todos = JSON.parse(localStorage.getItem('todos')||'[]');
          this.memos = JSON.parse(localStorage.getItem('memos')||'[]');
          const s = JSON.parse(localStorage.getItem('settings')||'{"theme":"auto","notifications":false,"clockMode":"digital"}');
          this.settings = Object.assign({theme:'auto',notifications:false,clockMode:'digital'}, s);
          this.hideDueAlertDate = localStorage.getItem('hideDueAlertDate') || '';
          this.applyTheme();
          this.updateAppBadge();
          this.applyTheme();
          this.updateAppBadge();
        },
        saveTodos(){ localStorage.setItem('todos', JSON.stringify(this.todos)); this.updateAppBadge(); },
        saveMemos(){ localStorage.setItem('memos', JSON.stringify(this.memos)); },
        saveSettings(){ localStorage.setItem('settings', JSON.stringify(this.settings)); this.applyTheme(); },

        /* ---------- theme ---------- */
        applyTheme(){
          const t=this.settings.theme;
          if (t==='dark') document.body.classList.add('dark-theme');
          else if (t==='light') document.body.classList.remove('dark-theme');
          else {
            const prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) document.body.classList.add('dark-theme'); else document.body.classList.remove('dark-theme');
          }
        },
        _popDialog(name){
  try{
    this.dialogStack = (this.dialogStack || []).filter(d => d !== name);
  }catch(_){}
},
daysLeft(ds){
  if (!ds) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const d=new Date(ds+'T00:00:00'); d.setHours(0,0,0,0);
  return Math.floor((d - today)/86400000);
},
goTodayInCalendar(){
  // カレンダーへ遷移し当日を選択
  const today = new Date();
  const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  this.switchMode('calendar');
  this.selectedDate = ds;
},
openAddMemoDialog(){
  if (this.dialogStack.length>0) return;
  this.memoTitleInput = '';
  this.memoContentInput = '';
  this.memoAttachments = [];
  this.showAddMemoDialog = true;
  this.dialogStack.push('addMemo');
  this.menuOpen = false;
  this.updateBackdropBlur();
},
confirmAddMemoDialogFromAdd(){
  const t=(this.memoTitleInput||'').trim();
  const c=(this.memoContentInput||'').trim();
  if (!t || !c){ this.showSnackbar('タイトルと内容は必須です'); return; }
  this.addMemo(t, c, this.memoAttachments||[]);
  this.memoAttachments = [];                 // 一時をクリア
  this.showAddMemoDialog = false;            // ダイアログを閉じる
  this.dialogStack = (this.dialogStack || []).filter(d => d !== 'addMemo');               // スタックから除去
  this.updateBackdropBlur();                 // ブラー更新
},
cancelAddMemoDialog(){
  // 追加ダイアログのキャンセル: 一時blob:URLは存在しないが安全にクリア
  this.memoAttachments = [];
  this.showAddMemoDialog = false;
  this.dialogStack = (this.dialogStack || []).filter(d => d !== 'addMemo');
  this.updateBackdropBlur();
},
/* Edit Memo: 既存のcancel/confirmを冪等に */
cancelEditMemoDialog(){
  this.revokeBlobUrlsIfAny(this.editMemoAttachments); // 一時blobを解放
  this.editMemoAttachments = [];
  this.currentMemoId = null;
  this.showEditMemoDialog = false;
  this._popDialog('editMemo');
  this.updateBackdropBlur();
},
        /* ---------- navigation ---------- */
        toggleSearch(){ if (!this.canSearch) return; this.searchActive=!this.searchActive; },
        switchMode(mode){
          this.currentMode=mode;
          this.drawerOpen=false;
          this.menuOpen=false;
          this.searchActive=false;
          this.searchQuery='';
          this.updateBackdropBlur();
          this.updateLayoutVars(); // 画面別の下端余白・FAB位置
          this.$nextTick(this.initAttachmentViewers);
        },
        toggleDrawer(){
          this.menuOpen=false;
          if (this.showSettingsDialog) return;
          this.drawerOpen=!this.drawerOpen;
          this.updateBackdropBlur();
          this.updateLayoutVars();
        },
        toggleMenu(){
          if (this.showSettingsDialog) return;
          if (this.dialogStack.length>0) return;
          this.drawerOpen=false;
          this.menuOpen=!this.menuOpen;
          this.updateBackdropBlur();
          this.updateLayoutVars();
        },
        handleClickOutside(e){
          if (this.showSettingsDialog) return;
          const menu=document.querySelector('.menu-popup');
          const moreBtn=document.getElementById('moreBtn');
          if (this.menuOpen && menu && !menu.contains(e.target) && !moreBtn?.contains(e.target)){
            this.menuOpen=false; this.updateBackdropBlur();
          }
        },

        /* ---------- snackbar/loading ---------- */
        showSnackbar(text,ms=2500){ this.snackbarText=text; this.snackbarVisible=true; setTimeout(()=>this.snackbarVisible=false,ms); },
        setLoading(on){ this.loading=!!on; const bar=document.querySelector('.loading-bar'); if (bar) bar.classList.toggle('show', this.loading); },

        /* ---------- tasks ---------- */
        filterTodos(list){ if(!this.searchQuery) return list; const q=this.searchQuery.toLowerCase(); return list.filter(t=>(t.text||'').toLowerCase().includes(q)); },
        formatDate(ds){
          if (!ds) return '';
          const d=new Date(ds+'T00:00:00');
          const today=new Date(); today.setHours(0,0,0,0);
          const dd=new Date(d); dd.setHours(0,0,0,0);
          const diff=Math.floor((dd-today)/86400000);
          if (diff===0) return '今日'; if (diff===1) return '明日'; if (diff===-1) return '昨日';
          return `${d.getMonth()+1}月${d.getDate()}日`;
        },
        openAddTaskDialog(){
          if (this.dialogStack.length>0) return;
          this.taskInput=''; this.taskDateInput=''; this.taskPriorityInput='normal';
          if (this.currentMode==='calendar' && this.selectedDate) this.taskDateInput=this.selectedDate;
          this.showAddTaskDialog=true; this.dialogStack.push('addTask'); this.menuOpen=false; this.updateBackdropBlur();
        },
        cancelAddTaskDialog(){
          this.showAddTaskDialog=false;
          this.dialogStack=this.dialogStack.filter(d=>d!=='addTask');
          this.updateBackdropBlur();
        },
        confirmAddTaskDialog(){
          const text=(this.taskInput||'').trim();
          if (!text){ this.showSnackbar('タスク名は必須です'); return; }
          this.addTodo(text, this.taskDateInput, this.taskPriorityInput);
          this.showAddTaskDialog=false;
          this.dialogStack=this.dialogStack.filter(d=>d!=='addTask');
          this.updateBackdropBlur();
        },
        addTodo(text,dueDate,priority='normal'){
          this.todos.unshift({ id:Date.now(), text:text.trim(), completed:false, dueDate: dueDate||null, createdAt:new Date().toISOString(), priority });
          this.saveTodos(); this.showSnackbar('タスクを追加しました');
        },
        toggleTodo(id){ const t=this.todos.find(x=>x.id===id); if(!t) return; t.completed=!t.completed; this.saveTodos(); this.showSnackbar(t.completed?'タスクを完了にしました':'未完了に戻しました'); },
        deleteTodo(id){ this.todos=this.todos.filter(x=>x.id!==id); this.saveTodos(); this.showSnackbar('タスクを削除しました'); },
        async clearCompleted(){ if(!this.canClearCompleted) return; const ok=await this.showConfirm('完了済みタスクを削除','完了済みのタスクをすべて削除しますか？'); if(ok){ this.todos=this.todos.filter(t=>!t.completed); this.saveTodos(); this.showSnackbar('完了済みを削除しました'); } },
        async clearAll(){ if(!this.canClearAll) return; const ok=await this.showConfirm('すべてのタスクを削除','すべてのタスクを削除しますか？この操作は取り消せません。'); if(ok){ this.todos=[]; this.saveTodos(); this.showSnackbar('すべて削除しました'); } },

        /* ---------- memo helpers ---------- */
        normalizeAttachments(list){
          const arr = Array.isArray(list) ? list : [];
          return arr.map(a=>{
            const mime = a?.mime || a?.type || 'application/octet-stream';
            const kind0 = (mime.split('/')[0] || (a?.kind || 'file')).toLowerCase();
            const kind = ['image','video','audio'].includes(kind0) ? kind0
                        : (mime.startsWith('image/')?'image': mime.startsWith('video/')?'video': mime.startsWith('audio/')?'audio':'file');
            const url  = a?.url || a?.data || '';
            return {
              id: a?.id || Date.now()+Math.random(),
              name: a?.name || 'file',
              size: a?.size || 0,
              mime, kind, url
            };
          });
        },
        revokeBlobUrlsIfAny(atts){
          try{
            (atts||[]).forEach(x=>{
              if (x?.url && typeof x.url==='string' && x.url.startsWith('blob:')){
                URL.revokeObjectURL(x.url);
              }
            });
          }catch(_){}
        },

        /* ---------- memos ---------- */
        addMemo(title,content,attachments=[]){
          const t=(title||'').trim(), c=(content||'').trim();
          if (!t || !c){ this.showSnackbar('タイトルと内容は必須です'); return; }
          const atts=this.normalizeAttachments(attachments);
          this.memos.unshift({ id:Date.now(), title:t, content:c, attachments:atts, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
          this.saveMemos(); this.showSnackbar('メモを追加しました'); this.updateAppBadge();
          this.$nextTick(this.initAttachmentViewers);
        },
        openEditMemoDialog(m){
          if (this.dialogStack.length>0) return;
          this.currentMemoId=m.id; this.editMemoTitleInput=m.title; this.editMemoContentInput=m.content;
          this.editMemoAttachments=JSON.parse(JSON.stringify(m.attachments||[]));
          this.showEditMemoDialog=true; this.dialogStack.push('editMemo'); this.menuOpen=false; this.updateBackdropBlur();
        },
        /* Edit Memo: 既存のcancel/confirmを冪等に */
cancelEditMemoDialog(){
  this.revokeBlobUrlsIfAny(this.editMemoAttachments); // 一時blobを解放
  this.editMemoAttachments = [];
  this.currentMemoId = null;
  this.showEditMemoDialog = false;
  this._popDialog('editMemo');
  this.updateBackdropBlur();
},
confirmEditMemoDialog(){  // 既存定義を残しつつ末尾は同じ閉じルート
  const id=this.currentMemoId;
  const m=this.memos.find(x=>x.id===id);
  if (m){
    const before=Array.isArray(m.attachments)? m.attachments : [];
    const after = this.normalizeAttachments(this.editMemoAttachments||[]);
    m.title=(this.editMemoTitleInput||'').trim();
    m.content=(this.editMemoContentInput||'').trim();
    m.attachments=after;
    m.updatedAt=new Date().toISOString();
    const afterUrls=new Set(after.map(a=>a.url));
    const removed=before.filter(a=>a?.url && !afterUrls.has(a.url));
    this.revokeBlobUrlsIfAny(removed);
    this.saveMemos(); this.showSnackbar('メモを更新しました');
    this.$nextTick(this.initAttachmentViewers);
  }
  this.currentMemoId=null; this.editMemoAttachments=[];
  this.showEditMemoDialog=false;
  this._popDialog('editMemo');
  this.updateBackdropBlur();
},
        async deleteMemo(id){
          const ok=await this.showConfirm('メモを削除','このメモを削除しますか？');
          if (!ok) return;
          const target=this.memos.find(x=>x.id===id);
          if (target) this.revokeBlobUrlsIfAny(target.attachments);
          this.memos=this.memos.filter(x=>x.id!==id); this.saveMemos(); this.showSnackbar('メモを削除しました'); this.updateAppBadge();
          this.$nextTick(this.initAttachmentViewers);
        },
        handleFileUpload(ev,isEdit=false){
          const files=Array.from(ev.target.files||[]); const MAX_INLINE=10*1024*1024;
          files.forEach(file=>{
            const att={ id:Date.now()+Math.random(), name:file.name, size:file.size, mime:file.type||'application/octet-stream', kind:(file.type||'').split('/')[0]||'file', url:'' };
            if (file.size>MAX_INLINE){
              att.url=URL.createObjectURL(file);
              if (isEdit) this.editMemoAttachments.push(att); else this.memoAttachments.push(att);
            }else{
              const reader=new FileReader();
              reader.onload=(e)=>{ att.url=e.target.result; if (isEdit) this.editMemoAttachments.push(att); else this.memoAttachments.push(att); };
              reader.readAsDataURL(file);
            }
          });
        },
        removeAttachment(id,isEdit=false){ if (isEdit) this.editMemoAttachments=this.editMemoAttachments.filter(a=>a.id!==id); else this.memoAttachments=this.memoAttachments.filter(a=>a.id!==id); },

        // 本文: URLリンク＋YouTube自動埋め込み
        // 置換: aでラップされない安全なYouTube埋め込み
extractYouTubeEmbeds(text){
  if (!text) return '';
  const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let html = esc(text);

  // 1) YouTube URLだけ事前に捕捉→プレースホルダ化
  const embeds = [];
  const urlRe = /(https?:\/\/[^\s<]+)/g;
  html = html.replace(urlRe, (u) => {
    // YouTubeかどうかを判定してID抽出
    let id = null;
    try{
      const uu = new URL(u);
      const host = uu.hostname.replace(/^www\./,'');
      if (host === 'youtu.be'){
        id = uu.pathname.split('/').filter(Boolean)[0] || null;
      } else if (host === 'youtube.com'){
        if (uu.pathname === '/watch') id = uu.searchParams.get('v');
        else {
          const m = uu.pathname.match(/\/(shorts|live|embed)\/([A-Za-z0-9_-]{6,})/);
          if (m) id = m[2];
        }
      }
    }catch(_){/* 無視 */}

    if (id){
      const markup = `<div class="yt-embed"><iframe width="560" height="315" src="https://www.youtube.com/embed/${id}?rel=0&modestbranding=1" title="YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`;
      const idx = embeds.push(markup) - 1;
      return `%%YT_EMBED_${idx}%%`; // プレースホルダに退避
    }
    return u; // 非YouTubeはそのまま
  });

  // 2) 汎用リンク化（プレースホルダは対象外）
  html = html.replace(/(https?:\/\/(?!%)[^\s<]+)/g, `<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>`);

  // 3) 改行
  html = html.replace(/\n/g,'<br>');

  // 4) プレースホルダ復元（実体のiframeを差し戻し）
  html = html.replace(/%%YT_EMBED_(\d+)%%/g, (_, n) => embeds[Number(n)] || '');

  // 5) 保険: 既存データで a タグに包まれた yt-embed をアンラップ
  html = html.replace(/<a[^>]*>(\s*<div class="yt-embed">[\s\S]*?<\/div>\s*)<\/a>/g, '$1');

  return html;
},


        // viewer.js / video.js 初期化
        initAttachmentViewers(){
          try{ this._viewers.forEach(v=>v?.destroy?.()); }catch(_){}
          this._viewers=[];
          try{ this._vjsPlayers.forEach(p=>p?.dispose?.()); }catch(_){}
          this._vjsPlayers=[];
          this.$nextTick(()=>{
            document.querySelectorAll('.memo-images').forEach(el=>{
              try{ if (window.Viewer){ const v=new window.Viewer(el,{toolbar:false,navbar:false,movable:true,zoomable:true}); this._viewers.push(v);} }catch(_){}
            });
            document.querySelectorAll('video.video-js').forEach(v=>{
              try{ if (window.videojs){ const p=window.videojs(v,{fluid:true,preload:'metadata',controls:true}); this._vjsPlayers.push(p);} }catch(_){}
            });
          });
        },
        /* ---------- calendar ---------- */
        prevMonth(){ this.currentMonth--; if (this.currentMonth<0){ this.currentMonth=11; this.currentYear--; } this.applyCalendarEnterAnim('right'); },
        nextMonth(){ this.currentMonth++; if (this.currentMonth>11){ this.currentMonth=0; this.currentYear++; } this.applyCalendarEnterAnim('left'); },
        selectDate(ds,ev){
          if (ds) this.selectedDate=ds;
          const cell=ev?.currentTarget; if (cell){ cell.classList.remove('cal-pulse'); cell.offsetWidth; cell.classList.add('cal-pulse'); }
          this.$nextTick(this.updateLayoutVars);
        },
        applyCalendarEnterAnim(dir='left'){
          this.$nextTick(()=>{
            const grid=document.querySelector('.calendar-grid'); if(!grid) return;
            grid.classList.remove('cal-anim-left','cal-anim-right'); grid.offsetWidth;
            grid.classList.add(dir==='left'?'cal-anim-left':'cal-anim-right','cal-stagger');
            setTimeout(()=>grid.classList.remove('cal-stagger'),420);
          });
        },
        onCalTouchStart(e){
          this.calTouchStartX=e.touches[0].clientX; this.calTouchStartY=e.touches[0].clientY;
          this.calTouchCurX=this.calTouchStartX; this.calTouchCurY=this.calTouchStartY;
          this.calTouchStartAt=performance.now(); this.calSwipeActive=false;
        },
        onCalTouchMove(e){
          this.calTouchCurX=e.touches[0].clientX; this.calTouchCurY=e.touches[0].clientY;
          const dx=this.calTouchCurX-this.calTouchStartX; const dy=this.calTouchCurY-this.calTouchStartY;
          if (!this.calSwipeActive && Math.abs(dx)>10 && Math.abs(dx)>Math.abs(dy)) this.calSwipeActive=true;
        },
        onCalTouchEnd(){
          if (!this.calSwipeActive) return;
          const dx=this.calTouchCurX-this.calTouchStartX; const dt=Math.max(1, performance.now()-this.calTouchStartAt);
          const vel=Math.abs(dx)/dt; const pass=Math.abs(dx)>=this.calMinDx || vel>=this.calMinVel;
          if (pass){ if (dx<0) this.nextMonth(); else this.prevMonth(); }
          this.calSwipeActive=false;
        },

        /* ---------- confirm ---------- */
        showConfirm(title,message){
          return new Promise(resolve=>{
            this.confirmTitle=title; this.confirmMessage=message; this.confirmCallback=resolve;
            this.showConfirmDialog=true; this.dialogStack.push('confirm'); this.updateBackdropBlur();
          });
        },
        handleConfirmDialogClose(e){
          const rv=e?.target?.returnValue;
          if (this.showConfirmDialog){
            this.showConfirmDialog=false; this.dialogStack=this.dialogStack.filter(d=>d!=='confirm'); this.updateBackdropBlur();
            if (this.confirmCallback){ this.confirmCallback(rv==='confirm'); this.confirmCallback=null; }
          }
        },

        /* ---------- settings ---------- */
        openSettings(){
          if (this.dialogStack.length>0) return;
          this.showSettingsDialog=true; this.dialogStack.push('settings'); this.menuOpen=false; this.updateBackdropBlur();
          this.$nextTick(()=>{
            const dlg=document.querySelector('md-dialog[open]');
            const scroller=dlg?.querySelector('[slot="content"]');
            if (scroller){
              scroller.style.maxHeight='75vh';
              scroller.style.overflowY='auto';
              scroller.style.overscrollBehaviorY='auto';
            }
          });
        },
        handleSettingsDialogClose(){
          this.showSettingsDialog=false; this.dialogStack=this.dialogStack.filter(d=>d!=='settings'); this.updateBackdropBlur();
        },
        changeTheme(e){ this.settings.theme=e.target.value; this.saveSettings(); this.applyTheme(); },
        setClockMode(v){ this.settings.clockMode=v; this.saveSettings(); },

        /* ---------- blur control (strong only) ---------- */
        updateBackdropBlur(){
          const strong = !!this.showSettingsDialog || (Array.isArray(this.dialogStack) && this.dialogStack.length>=2);
          document.body.classList.remove('blur-strong','blur-on');
          if (strong) document.body.classList.add('blur-strong');
        },

        /* ---------- FAB / content bottom layout ---------- */
        updateLayoutVars(){
          try{
            const hasBottomBar = (this.currentMode === 'tasks');
            const isCalc = (this.currentMode === 'calc');
            const gap=12, fab=56, bottomBar=64, safe=0;

            // FABの下端位置
            const fabBottom = isCalc ? (safe + gap) : ((hasBottomBar? bottomBar: 0) + safe + gap);
            const fc=document.querySelector('.fab-container'); if (fc) fc.style.bottom = `${fabBottom}px`;

            // 下端余白（calcは0、安全領域分のみ）
            const content=document.querySelector('.content');
            if (content){
              if (isCalc){
                content.style.paddingBottom = `0px`;
                document.documentElement.style.setProperty('--content-bottom-clear', `0px`);
              }else{
                const ui = hasBottomBar ? (bottomBar + 24) : (fab + gap*2);
                const reserve = Math.max(ui + 40, 180);
                content.style.paddingBottom = `${reserve}px`;
                document.documentElement.style.setProperty('--content-bottom-clear', `${reserve}px`);
              }
            }
          }catch(_){}
        },

        /* ---------- notifications/badging ---------- */
        async toggleNotifications(){
          if (!('Notification' in window)){ this.showSnackbar('通知に未対応の環境です'); return; }
          if (Notification.permission==='granted'){ this.settings.notifications=!this.settings.notifications; this.saveSettings(); this.showSnackbar(this.settings.notifications?'通知を有効化':'通知を無効化'); return; }
          const perm=await Notification.requestPermission(); if (perm==='granted'){ this.settings.notifications=true; this.saveSettings(); this.showSnackbar('通知を有効化しました'); } else { this.showSnackbar('通知の許可が必要です'); }
        },
        updateAppBadge(){
          if (!('setAppBadge' in navigator)) return;
          const n=this.todos.filter(t=>!t.completed).length + this.memos.length;
          if (n>0) navigator.setAppBadge(Math.min(n,99)).catch(()=>{}); else navigator.clearAppBadge?.().catch(()=>{});
        },

        /* ---------- Web Share / Share Target ---------- */
        async shareData({title,text,url,files}){ if(!navigator.share){ this.showSnackbar('Web Shareに未対応の環境です'); return; } try{ await navigator.share({title,text,url,files}); this.showSnackbar('共有しました'); }catch(_){ this.showSnackbar('共有をキャンセルまたは失敗しました'); } },
        ingestShareTargetIfAny(){
          if (this.shareIngested) return;
          const sp=new URLSearchParams(location.search);
          const stTitle=sp.get('title')||sp.get('share-title');
          const stText=sp.get('text')||sp.get('share-text');
          const stUrl=sp.get('url')||sp.get('share-url');
          if (stTitle||stText||stUrl){
            const title=stTitle||'共有項目';
            const content=[stText,stUrl].filter(Boolean).join('\n');
            this.addMemo(title,content,[]);
            this.shareIngested=true;
            history.replaceState({},document.title,location.pathname);
          }
        },

        /* ---------- Periodic Sync / Background Fetch ---------- */
        async registerPeriodicSync(){
          try{
            if (!('serviceWorker' in navigator)) return;
            const reg=await navigator.serviceWorker.ready;
            try{ const st=await navigator.permissions.query({name:'periodic-background-sync'}); if (st.state==='denied') return; }catch(_){}
            await reg.periodicSync?.register?.('sync-tasks-memos',{minInterval:6*60*60*1000});
            this.showSnackbar('定期同期を登録しました');
          }catch(_){ this.showSnackbar('定期同期に失敗'); }
        },
        async startBackgroundFetch(urls){
          try{
            const reg=await navigator.serviceWorker.ready;
            const id='bg-'+Date.now();
            const opts={ title:'大きなダウンロード', icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'}], downloadTotal:0 };
            const bg=await reg.backgroundFetch.fetch(id, urls, opts);
            this.bgFetchIds?.push?.(bg.id); this.showSnackbar('バックグラウンドでダウンロード開始');
          }catch(_){ this.showSnackbar('バックグラウンドフェッチに失敗'); }
        },

        /* ---------- calculator ---------- */
        calcAppend(v){
          this.calculatorValue = String(this.calculatorValue || '') + String(v);
          this.searchQuery=''; // 検索欄と競合しないように
        },
        calcClear(){ this.calculatorValue=''; this.searchQuery=''; },
        calcDel(){ this.calculatorValue=String(this.calculatorValue||'').slice(0,-1); },
        calcEval(){
          const expr=String(this.calculatorValue||'').trim(); if(!expr) return;
          const norm=this.normalizeCalcInput? this.normalizeCalcInput(expr) : expr;
          const out=this.safeEval? this.safeEval(norm) : null;
          if (out!==null && out!==undefined) this.calculatorValue=String(out);
        },
        normalizeCalcInput(raw){
          if (!raw) return '';
          let s=raw;
          s=s.replace(/[０-９．，＋－＊／％]/g,ch=>{ const map={'＋':'+','－':'-','＊':'*','／':'/','％':'%','．':'.','，':','}; return map[ch]??String.fromCharCode(ch.charCodeAt(0)-0xFEE0); });
          s=s.replace(/[×✕✖︎＊]/g,'*').replace(/[÷／]/g,'/').replace(/[−–―ー]/g,'-').replace(/\^/g,'**')
             .replace(/π/gi,'Math.PI').replace(/(?:^|[^a-zA-Z])e(?![a-zA-Z])/g,m=>m.replace(/e/,'Math.E'));
          s=s.replace(/(\d+(?:\.\d+)?)\s*%/g,'($1/100)');
          s=s.replace(/√\s*\(/g,'Math.sqrt(').replace(/√\s*([\d.]+)/g,'Math.sqrt($1)').replace(/\bsqrt\s*\(/gi,'Math.sqrt(');
          s=s.replace(/\b(sin|cos|tan|log)\s*\(/gi,(m,p)=>`Math.${p.toLowerCase()}(`).replace(/\bln\s*\(/gi,'Math.log(');
          s=s.replace(/,/g,'').replace(/[+\-*/**]\s*$/,'');
          return s;
        },
        safeEval(expr, silent=false){
          try{
            if (!/^[-+*/().,\s\d%^a-zA-Z]*$/.test(expr) || /[_$`'"\\;]/.test(expr)) throw new Error('bad');
            const f=new Function('Math', `return (${expr})`);
            const v=f(Math);
            if (typeof v==='number' && isFinite(v)){
              return (Math.round((v + Number.EPSILON)*1e12)/1e12);
            }
            throw new Error('nan');
          }catch(e){
            if (!silent) this.showSnackbar('数式が不正です');
            return null;
          }
        },

        /* ---------- drawer swipe ---------- */
        handleTouchStart(e){
          this.touchStartX=e.touches[0].clientX; this.touchStartY=e.touches[0].clientY;
          this.touchCurrentX=this.touchStartX; this.touchCurrentY=this.touchStartY;
          this.isSwiping=false; this.swipeProgress=0;
          const vw=window.innerWidth||document.documentElement.clientWidth;
          const edgeZone=vw*this.edgeZoneRatio;
          this.gestureStartTime=performance.now();
          this.gestureActive = this.drawerOpen || (this.touchStartX<=edgeZone);
        },
        handleTouchMove(e){
          if (!this.gestureActive) return;
          this.touchCurrentX=e.touches[0].clientX; this.touchCurrentY=e.touches[0].clientY;
          const dx=this.touchCurrentX-this.touchStartX; const dy=Math.abs(this.touchCurrentY-this.touchStartY);
          if (!this.isSwiping && Math.abs(dx)>10 && Math.abs(dx)>dy) this.isSwiping=true;
          if (this.isSwiping){
            if (dx>0 && !this.drawerOpen){ this.swipeProgress=Math.min(dx/280,1); this.updateDrawerPosition(); }
            else if (dx<0 && this.drawerOpen){ this.swipeProgress=Math.max((280+dx)/280,0); this.updateDrawerPosition(); }
          }
        },
        handleTouchEnd(){
          if (!this.gestureActive) return;
          const dx=this.touchCurrentX-this.touchStartX; const dt=Math.max(1, performance.now()-this.gestureStartTime);
          const vel=Math.abs(dx)/dt; const pass=Math.abs(dx)>=this.swipeMinDx || vel>=this.swipeMinVel;
          if (!this.drawerOpen && dx>0 && pass) this.drawerOpen=true;
          else if (this.drawerOpen && dx<0 && pass) this.drawerOpen=false;
          this.isSwiping=false; this.gestureActive=false; this.swipeProgress=0; this.updateDrawerPosition(); this.updateBackdropBlur(); this.updateLayoutVars();
        },
        updateDrawerPosition(){
          const drawer=document.querySelector('.navigation-drawer');
          if (!drawer) return;
          if (this.isSwiping){ drawer.classList.add('opening'); drawer.style.transform=`translateX(calc(-100% + ${this.swipeProgress*100}%))`; }
          else { drawer.classList.remove('opening'); drawer.style.transform=''; }
        },

        /* ---------- overscroll (top only visual) ---------- */
        initOverscroll(){
          const el=document.querySelector('.content'); if (!el) return;
          let startY=0;
          el.addEventListener('touchstart',ev=>{ startY=ev.touches[0].clientY; },{passive:true});
          el.addEventListener('touchmove',ev=>{
            const dy=ev.touches[0].clientY-startY; const top=el.scrollTop;
            if (top===0 && dy>0){
              const os=Math.min(dy*0.3,100);
              el.style.setProperty('--overscroll-amount',`${os}px`);
              el.classList.add('overscroll-top');
            }else{
              el.classList.remove('overscroll-top');
              el.style.setProperty('--overscroll-amount','0px');
            }
          },{passive:true});
          el.addEventListener('touchend',()=>{
            let start=null; const dur=300; const startAmt=parseFloat(el.style.getPropertyValue('--overscroll-amount')||'0');
            const anim=(ts)=>{ if(!start) start=ts; const p=Math.min((ts-start)/dur,1); const ease=1-Math.pow(1-p,3); const cur=startAmt*(1-ease);
              el.style.setProperty('--overscroll-amount',`${cur}px`);
              if (p<1) requestAnimationFrame(anim); else { el.classList.remove('overscroll-top'); el.style.setProperty('--overscroll-amount','0px'); }
            }; requestAnimationFrame(anim);
          },{passive:true});
        },

        /* ---------- SW ---------- */
        async registerServiceWorker(){
          if (!('serviceWorker' in navigator)) return;
          try{
            const reg=await navigator.serviceWorker.register('/service-worker.js');
            this.swRegistration=reg;
            reg.addEventListener('updatefound',()=>{
              const nw=reg.installing;
              nw.addEventListener('statechange',()=>{
                if (nw.state==='installed' && navigator.serviceWorker.controller) this.showSnackbar('新しいバージョンが利用可能です');
              });
            });
          }catch(e){ console.warn('SW reg failed',e); }
        }
      }, // end methods

      mounted(){
        this.loadData();
        this.registerServiceWorker();
        window.addEventListener('online',()=>{ this.isOnline=true; this.showSnackbar('オンライン'); });
        window.addEventListener('offline',()=>{ this.isOnline=false; this.showSnackbar('オフライン'); });
        document.addEventListener('click', this.handleClickOutside);

        const appContainer=document.querySelector('.app-container');
        if (appContainer){
          appContainer.addEventListener('touchstart', this.handleTouchStart, {passive:true});
          appContainer.addEventListener('touchmove', this.handleTouchMove, {passive:true});
          appContainer.addEventListener('touchend', this.handleTouchEnd, {passive:true});
        }

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{ if (this.settings.theme==='auto') this.applyTheme(); });
        setInterval(()=>{ this.now=new Date(); },1000);

        this.$nextTick(()=>{ this.initOverscroll(); this.updateLayoutVars(); this.initAttachmentViewers(); });

        this.$nextTick(()=>{
          const box=document.querySelector('.calendar-container');
          if (box && !box.dataset.calSwipeInit){
            box.dataset.calSwipeInit='1';
            box.addEventListener('touchstart', this.onCalTouchStart, {passive:true});
            box.addEventListener('touchmove', this.onCalTouchMove, {passive:true});
            box.addEventListener('touchend', this.onCalTouchEnd, {passive:true});
          }
        });

        this.registerPeriodicSync();
        this.ingestShareTargetIfAny();

        document.body.classList.remove('blur-strong','blur-on');
      },

      beforeUnmount(){
        document.removeEventListener('click', this.handleClickOutside);
      },
      template: `
      <div class="app-container">
        <div class="drawer-scrim" :class="{ open: drawerOpen }" @click="toggleDrawer"></div>

        <div class="navigation-drawer" :class="{ open: drawerOpen }">
          <div class="drawer-header">
            <h2 class="drawer-title">タスク管理</h2>
            <p class="drawer-subtitle">すべてを整理</p>
          </div>
          <div class="drawer-content">
            <div class="drawer-item" :class="{ active: currentMode==='tasks' }" @click="switchMode('tasks')">
              <span class="material-symbols-rounded">task_alt</span><span class="drawer-item-label">タスク</span>
            </div>
            <div class="drawer-item" :class="{ active: currentMode==='memos' }" @click="switchMode('memos')">
              <span class="material-symbols-rounded">note</span><span class="drawer-item-label">メモ</span>
            </div>
            <div class="drawer-item" :class="{ active: currentMode==='calendar' }" @click="switchMode('calendar')">
              <span class="material-symbols-rounded">calendar_month</span><span class="drawer-item-label">カレンダー</span>
            </div>

            <div class="drawer-divider"></div>
            <div class="drawer-item" :class="{ active: currentMode==='calc' }" @click="switchMode('calc')">
              <span class="material-symbols-rounded">calculate</span><span class="drawer-item-label">電卓</span>
            </div>

            <div class="drawer-divider"></div>
            <div class="drawer-item" @click="openSettings">
              <span class="material-symbols-rounded">settings</span><span class="drawer-item-label">設定</span>
            </div>
          </div>
        </div>

        <div class="top-app-bar">
          <md-icon-button @click="toggleDrawer"><span class="material-symbols-rounded">menu</span></md-icon-button>
          <div class="top-app-bar-title">{{ appBarTitle }}</div>
          <md-icon-button @click="toggleSearch" :class="{ disabled: !canSearch }"><span class="material-symbols-rounded">search</span></md-icon-button>
          <div class="menu-container">
            <md-icon-button id="moreBtn" @click="toggleMenu"><span class="material-symbols-rounded">more_vert</span></md-icon-button>
            <div class="menu-popup" :class="{ open: menuOpen }">
              <div class="menu-item" @click="openSettings"><span class="material-symbols-rounded">settings</span><span class="menu-item-label">設定</span></div>
              <div class="menu-item" @click="exportData"><span class="material-symbols-rounded">download</span><span class="menu-item-label">エクスポート</span></div>
              <div class="menu-item" @click="importData"><span class="material-symbols-rounded">upload</span><span class="menu-item-label">インポート</span></div>
              <div class="menu-item" @click="installApp"><span class="material-symbols-rounded">install_desktop</span><span class="menu-item-label">アプリをインストール</span></div>
            </div>
          </div>
        </div>

        <div class="loading-bar" :class="{show: loading}"></div>

        <div class="search-bar" :class="{active: searchActive}">
          <md-outlined-text-field v-model="searchQuery" label="検索" type="search" placeholder="タスク・メモ・数式を検索/入力">
            <span class="material-symbols-rounded" slot="leading-icon">search</span>
          </md-outlined-text-field>
        </div>

        <div class="content">

          <!-- TASKS -->
          <div v-show="currentMode==='tasks'">
          <!-- Due alert banner -->
<div v-if="dueAlertVisible" class="due-alert">
  <div class="due-alert-left">
    <span class="material-symbols-rounded">warning</span>
    <div class="due-alert-text">
      <div class="due-alert-title">
        期限が近いタスクが{{ dueSoonTodos.length }}件、期限切れが{{ overdueTodos.length }}件あります（最短: {{ nextDueLabel }}）。
      </div>
      <div class="due-alert-sub">
        今日から{{ dueThresholdDays }}日以内の期限を対象に表示しています。
      </div>
    </div>
  </div>
<div class="due-alert-actions">
  <md-text-button @click="goTodayInCalendar"><span class="material-symbols-rounded" slot="icon">today</span>今日を表示</md-text-button>
  <md-text-button @click="snoozeDueAlertToday"><span class="material-symbols-rounded" slot="icon">do_not_disturb_on</span>今日は表示しない</md-text-button>
</div>
</div>
            <div class="stats-card">
              <div class="stat-item"><div class="stat-value">{{ totalCount }}</div><div class="stat-label">すべて</div></div>
              <div class="stat-item"><div class="stat-value">{{ activeCount }}</div><div class="stat-label">未完了</div></div>
              <div class="stat-item"><div class="stat-value">{{ completedCount }}</div><div class="stat-label">完了</div></div>
            </div>
            <div v-if="activeTodos.length===0 && completedTodos.length===0" class="empty-state">
              <span class="material-symbols-rounded">task_alt</span>
              <div class="empty-state-title">タスクがありません</div>
              <div class="empty-state-description">右下の <span class="material-symbols-rounded inline-icon">add</span> ボタンから最初のタスクを追加しましょう</div>
            </div>

            <div v-if="activeTodos.length>0">
              <div class="section-header">未完了</div>
              <div class="todo-list">
                <div v-for="t in activeTodos" :key="t.id" class="todo-item"
                     :class="[{ 'task-status-high': t.priority==='high' }, { 'task-status-overdue': !t.completed && t.dueDate && (new Date(t.dueDate) < new Date(new Date().toDateString())) }]">
                  <md-checkbox :checked="t.completed" @change="toggleTodo(t.id)"></md-checkbox>
                  <div class="todo-content">
                    <div class="todo-text" v-html="extractYouTubeEmbeds(t.text)"></div>
                    <div v-if="t.dueDate" class="todo-meta"><div class="todo-date"><span class="material-symbols-rounded">event</span>{{ formatDate(t.dueDate) }}</div></div>
                  </div>
                  <div class="todo-actions"><md-icon-button @click="deleteTodo(t.id)"><span class="material-symbols-rounded">delete</span></md-icon-button></div>
                </div>
              </div>
            </div>

            <div v-if="completedTodos.length>0">
              <div class="section-header">完了</div>
              <div class="todo-list">
                <div v-for="t in completedTodos" :key="t.id" class="todo-item completed">
                  <md-checkbox :checked="t.completed" @change="toggleTodo(t.id)"></md-checkbox>
                  <div class="todo-content">
                    <div class="todo-text" v-html="extractYouTubeEmbeds(t.text)"></div>
                    <div v-if="t.dueDate" class="todo-meta"><div class="todo-date"><span class="material-symbols-rounded">event</span>{{ formatDate(t.dueDate) }}</div></div>
                  </div>
                  <div class="todo-actions"><md-icon-button @click="deleteTodo(t.id)"><span class="material-symbols-rounded">delete</span></md-icon-button></div>
                </div>
              </div>
            </div>
          </div>

          <!-- MEMOS -->
          <div v-show="currentMode==='memos'">
            <div v-if="filteredMemos.length===0" class="empty-state">
              <span class="material-symbols-rounded">note</span>
              <div class="empty-state-title">メモがありません</div>
              <div class="empty-state-description">右下の <span class="material-symbols-rounded inline-icon">add</span> ボタンから最初のメモを作成しましょう</div>
            </div>

            <div v-for="m in filteredMemos" :key="m.id" class="card" style="margin-bottom:10px">
              <div class="task-title" style="margin-bottom:4px">{{ m.title }}</div>
              <div class="task-date"><span class="material-symbols-rounded" style="font-size:16px">schedule</span>{{ new Date(m.updatedAt||m.createdAt).toLocaleString() }}</div>
              <div class="task-body" style="white-space:pre-wrap" v-html="extractYouTubeEmbeds(m.content)"></div>

              <div v-if="m.attachments && m.attachments.length" class="attachments" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
                <!-- 画像: viewer.js -->
                <div class="memo-images" v-if="m.attachments.some(a=>a.kind==='image')" style="display:flex;flex-wrap:wrap;gap:8px">
                  <img v-for="a in m.attachments.filter(a=>a.kind==='image')" :key="a.id" :src="a.url" :alt="a.name" style="width:120px;height:120px;object-fit:cover;border-radius:8px;cursor:zoom-in">
                </div>

                <!-- 動画: video.js -->
                <div v-for="a in m.attachments.filter(a=>a.kind==='video')" :key="a.id" style="width:min(100%,420px)">
                  <video class="video-js vjs-default-skin" controls preload="metadata" playsinline webkit-playsinline style="border-radius:8px;overflow:hidden">
                    <source :src="a.url" :type="a.mime">
                  </video>
                  <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:4px">{{ a.name }}</div>
                </div>

                <!-- 音声 -->
                <div v-for="a in m.attachments.filter(a=>a.kind==='audio')" :key="a.id" style="width:min(100%,420px)">
                  <audio :src="a.url" controls style="width:100%"></audio>
                  <div style="font-size:12px;color:var(--md-sys-color-on
                  <div style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">{{ a.name }}</div>
                </div>

                <!-- PDF/その他（ダウンロード/外部表示） -->
                <div v-for="a in m.attachments.filter(a=>a.kind!=='image' && a.kind!=='video' && a.kind!=='audio')" :key="a.id"
                     style="display:flex;align-items:center;gap:8px;background:var(--md-sys-color-surface-container-low);padding:8px 12px;border-radius:8px">
                  <span class="material-symbols-rounded">attach_file</span>
                  <a :href="a.url" :download="a.name" target="_blank" rel="noopener noreferrer" style="word-break:break-all">{{ a.name }}</a>
                  <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant)">({{ Math.ceil((a.size||0)/1024) }} KB)</span>
                </div>
              </div>

              <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
                <md-text-button @click="shareData({title:m.title,text:m.content})"><span class="material-symbols-rounded" slot="icon">share</span>共有</md-text-button>
                <md-text-button @click="openEditMemoDialog(m)"><span class="material-symbols-rounded" slot="icon">edit</span>編集</md-text-button>
                <md-text-button @click="deleteMemo(m.id)"><span class="material-symbols-rounded" slot="icon">delete</span>削除</md-text-button>
              </div>
            </div>
          </div>

          <!-- CALENDAR -->
          <div v-show="currentMode==='calendar'">
            <div class="calendar-container">
              <div class="calendar-header">
                <md-icon-button @click="prevMonth"><span class="material-symbols-rounded">chevron_left</span></md-icon-button>
                <div class="calendar-title">{{ calendarMonthYear }}</div>
                <md-icon-button @click="nextMonth"><span class="material-symbols-rounded">chevron_right</span></md-icon-button>
              </div>
              <div class="calendar-grid">
                <div class="calendar-day-header">日</div><div class="calendar-day-header">月</div><div class="calendar-day-header">火</div><div class="calendar-day-header">水</div><div class="calendar-day-header">木</div><div class="calendar-day-header">金</div><div class="calendar-day-header">土</div>
                <div v-for="(day,idx) in calendarDays" :key="idx" class="calendar-day"
                     :class="{ 'other-month': day.isOtherMonth, 'today': day.isToday, 'selected': day.isSelected, 'has-tasks': day.hasTasks }"
                     @click="selectDate(day.dateString, $event)">{{ day.date }}</div>
              </div>
            </div>

            <div v-if="selectedDate">
              <div class="section-header">{{ selectedDateFormatted }}のタスク</div>
              <div v-if="selectedDateTasks.length===0" class="empty-state empty-state-compact">
                <span class="material-symbols-rounded">task_alt</span><div class="empty-state-title">この日のタスクはありません</div>
              </div>
              <div v-else class="todo-list">
                <div v-for="t in selectedDateTasks" :key="t.id" class="todo-item" :class="{ completed:t.completed }">
                  <md-checkbox :checked="t.completed" @change="toggleTodo(t.id)"></md-checkbox>
                  <div class="todo-content"><div class="todo-text" v-html="extractYouTubeEmbeds(t.text)"></div></div>
                  <div class="todo-actions"><md-icon-button @click="deleteTodo(t.id)"><span class="material-symbols-rounded">delete</span></md-icon-button></div>
                </div>
              </div>
            </div>
          </div>

          <!-- CALCULATOR -->
          <div v-show="currentMode==='calc'" class="utilities-container">
            <div class="utilities-card calc-inpage">
              <div class="task-title" style="margin-bottom:8px">電卓</div>
              <div class="calc-display">{{ calculatorValue || '0' }}</div>
              <div class="calc-keys">
                <button @click="calcClear" class="oper">AC</button>
                <button @click="calcAppend('(')" class="oper">(</button>
                <button @click="calcAppend(')')" class="oper">)</button>
                <button @click="calcAppend('/')" class="oper">÷</button>

                <button @click="calcAppend('7')">7</button>
                <button @click="calcAppend('8')">8</button>
                <button @click="calcAppend('9')">9</button>
                <button @click="calcAppend('*')" class="oper">×</button>

                <button @click="calcAppend('4')">4</button>
                <button @click="calcAppend('5')">5</button>
                <button @click="calcAppend('6')">6</button>
                <button @click="calcAppend('-')" class="oper">−</button>

                <button @click="calcAppend('1')">1</button>
                <button @click="calcAppend('2')">2</button>
                <button @click="calcAppend('3')">3</button>
                <button @click="calcAppend('+')" class="oper">＋</button>

                <button @click="calcAppend('0')">0</button>
                <button @click="calcAppend('.')">.</button>
                <button @click="calcDel" class="oper">⌫</button>

                <button @click="calcEval" class="equals">=</button>
              </div>
            </div>
          </div>

        </div>

        <!-- FAB -->
        <div class="fab-container">
          <md-fab size="medium"
            @click="currentMode==='memos' ? openAddMemoDialog()
                    : (currentMode==='calc' ? null : openAddTaskDialog())">
            <span class="material-symbols-rounded" slot="icon">add</span>
          </md-fab>
        </div>

        <!-- Bottom bar (tasks only) -->
        <div v-show="currentMode==='tasks'" class="bottom-app-bar">
          <md-text-button @click="clearCompleted" :disabled="!canClearCompleted"><span class="material-symbols-rounded" slot="icon">delete_sweep</span>完了済みを削除</md-text-button>
          <md-text-button @click="clearAll" :disabled="!canClearAll"><span class="material-symbols-rounded" slot="icon">delete</span>すべて削除</md-text-button>
        </div>

        <!-- Add Task Dialog -->
        <md-dialog :open="showAddTaskDialog" @close="cancelAddTaskDialog">
          <div slot="headline">新しいタスク</div>
          <form slot="content" method="dialog" @submit.prevent>
            <md-outlined-text-field v-model="taskInput" label="タスク名" required></md-outlined-text-field>
            <md-outlined-text-field v-model="taskDateInput" label="期限（オプション）" type="date"></md-outlined-text-field>
            <md-outlined-select label="重要度" :value="taskPriorityInput" @change="taskPriorityInput=$event.target.value">
              <md-select-option value="normal"><div slot="headline">通常</div></md-select-option>
              <md-select-option value="high"><div slot="headline">高</div></md-select-option>
            </md-outlined-select>
          </form>
          <div slot="actions">
            <md-text-button @click="cancelAddTaskDialog">キャンセル</md-text-button>
            <md-filled-button @click="confirmAddTaskDialog">追加</md-filled-button>
          </div>
        </md-dialog>

        <!-- Add Memo Dialog -->
        <md-dialog :open="showAddMemoDialog" @close="cancelAddMemoDialog">
          <div slot="headline">新しいメモ</div>
          <form slot="content" method="dialog" @submit.prevent>
            <md-outlined-text-field v-model="memoTitleInput" label="タイトル" required></md-outlined-text-field>
            <md-filled-text-field v-model="memoContentInput" label="内容" type="textarea" rows="5" required></md-filled-text-field>
            <div class="file-upload-area" @click="$refs.fileInput.click()"><span class="material-symbols-rounded">attach_file_add</span><div class="file-upload-label">ファイルを添付</div></div>
            <input ref="fileInput" type="file" accept="*/*" multiple style="display:none" @change="handleFileUpload($event,false)">
            <div v-if="memoAttachments.length" class="file-preview">
              <div v-for="a in memoAttachments" :key="a.id" class="file-preview-item">
                <template v-if="a.kind==='image'"><img :src="a.url" :alt="a.name"></template>
                <template v-else-if="a.kind==='video'"><video :src="a.url" controls></video></template>
                <template v-else-if="a.kind==='audio'"><audio :src="a.url" controls></audio></template>
                <template v-else><span class="material-symbols-rounded">insert_drive_file</span>{{ a.name }}</template>
                <div class="file-preview-remove" @click="removeAttachment(a.id,false)"><span class="material-symbols-rounded">close</span></div>
              </div>
            </div>
          </form>
          <div slot="actions">
            <md-text-button @click="cancelAddMemoDialog">キャンセル</md-text-button>
            <md-filled-button @click="()=>{ addMemo(memoTitleInput,memoContentInput,memoAttachments); memoAttachments=[]; showAddMemoDialog=false; dialogStack=dialogStack.filter(d=>d!=='addMemo'); updateBackdropBlur(); }">追加</md-filled-button>
          </div>
        </md-dialog>

        <!-- Edit Memo Dialog -->
        <md-dialog :open="showEditMemoDialog" @close="cancelEditMemoDialog">
          <div slot="headline">メモを編集</div>
          <form slot="content" method="dialog" @submit.prevent>
            <md-outlined-text-field v-model="editMemoTitleInput" label="タイトル" required></md-outlined-text-field>
            <md-filled-text-field v-model="editMemoContentInput" label="内容" type="textarea" rows="5" required></md-filled-text-field>
            <div class="file-upload-area" @click="$refs.editFileInput.click()"><span class="material-symbols-rounded">attach_file_add</span><div class="file-upload-label">ファイルを添付</div></div>
            <input ref="editFileInput" type="file" accept="*/*" multiple style="display:none" @change="handleFileUpload($event,true)">
            <div v-if="editMemoAttachments.length" class="file-preview">
              <div v-for="a in editMemoAttachments" :key="a.id" class="file-preview-item">
                <template v-if="a.kind==='image'"><img :src="a.url" :alt="a.name"></template>
                <template v-else-if="a.kind==='video'"><video :src="a.url" controls></video></template>
                <template v-else-if="a.kind==='audio'"><audio :src="a.url" controls></audio></template>
                <template v-else><span class="material-symbols-rounded">insert_drive_file</span>{{ a.name }}</template>
                <div class="file-preview-remove" @click="removeAttachment(a.id,true)"><span class="material-symbols-rounded">close</span></div>
              </div>
            </div>
          </form>
          <div slot="actions">
            <md-text-button @click="deleteMemo(currentMemoId)" style="margin-right:auto"><span class="material-symbols-rounded" slot="icon">delete</span>削除</md-text-button>
            <md-text-button @click="cancelEditMemoDialog">キャンセル</md-text-button>
            <md-filled-button @click="confirmEditMemoDialog">保存</md-filled-button>
          </div>
        </md-dialog>

        <!-- Confirm Dialog -->
        <md-dialog :open="showConfirmDialog" @close="handleConfirmDialogClose">
          <div slot="headline">{{ confirmTitle }}</div>
          <div slot="content">{{ confirmMessage }}</div>
          <div slot="actions">
            <md-text-button @click="handleConfirmDialogClose">キャンセル</md-text-button>
            <md-filled-button @click="()=>{ if(confirmCallback){confirmCallback(true);} handleConfirmDialogClose({target:{returnValue:'confirm'}}); }">OK</md-filled-button>
          </div>
        </md-dialog>

        <!-- Settings Dialog -->
        <md-dialog :open="showSettingsDialog" @close="handleSettingsDialogClose">
          <div slot="headline">設定</div>
          <div slot="content" style="max-height:75vh;overflow-y:auto;overscroll-behavior-y:auto">
            <div class="settings-group">
              <div class="settings-group-title">外観</div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">テーマ</div>
                  <div class="settings-item-description">
                    <md-outlined-select :value="settings.theme" @change="changeTheme">
                      <md-select-option value="auto"><div slot="headline">自動</div></md-select-option>
                      <md-select-option value="light"><div slot="headline">ライト</div></md-select-option>
                      <md-select-option value="dark"><div slot="headline">ダーク</div></md-select-option>
                    </md-outlined-select>
                  </div>
                </div>
              </div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">時計モード</div>
                  <div class="settings-item-description">
                    <md-outlined-select :value="settings.clockMode" @change="setClockMode($event.target.value)">
                      <md-select-option value="digital"><div slot="headline">デジタル</div></md-select-option>
                      <md-select-option value="analog"><div slot="headline">アナログ</div></md-select-option>
                    </md-outlined-select>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-title">通知</div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">通知を有効化</div>
                  <div class="settings-item-description">タスクの期限をお知らせします</div>
                </div>
                <md-switch :selected="settings.notifications" @change="toggleNotifications"></md-switch>
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-group-title">バックグラウンド</div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">定期バックグラウンド同期</div>
                  <div class="settings-item-description">サービスワーカーで定期実行</div>
                </div>
                <md-text-button @click="registerPeriodicSync"><span class="material-symbols-rounded" slot="icon">sync</span>登録</md-text-button>
              </div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">バックグラウンドフェッチ</div>
                  <div class="settings-item-description">長時間DLを継続</div>
                </div>
                <md-text-button @click="startBackgroundFetch(['/large-file.bin'])"><span class="material-symbols-rounded" slot="icon">cloud_download</span>開始</md-text-button>
              </div>
              <div class="settings-item">
                <div class="settings-item-content">
                  <div class="settings-item-label">バッジ更新</div>
                  <div class="settings-item-description">未読/未完了件数を表示</div>
                </div>
                <md-text-button @click="updateAppBadge"><span class="material-symbols-rounded" slot="icon">verified</span>反映</md-text-button>
              </div>
            </div>
          </div>
          <div slot="actions"><md-text-button @click="handleSettingsDialogClose">閉じる</md-text-button></div>
        </md-dialog>

        <div class="snackbar" :class="{ show: snackbarVisible }"><div class="snackbar-text">{{ snackbarText }}</div></div>
      </div>
      `
    };

    createApp(App).mount('#app');
  }

  if (!(window.Vue && window.Vue.createApp)){
    const s=document.createElement('script');
    s.src='https://unpkg.com/vue@3/dist/vue.global.prod.js';
    s.onload=()=>start();
    document.head.appendChild(s);
  } else {
    start();
  }
})();
