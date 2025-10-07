/**
 * Task Management PWA - Refactored Application
 * 
 * セキュリティ修正版 - XSS脆弱性とevalの使用を修正
 * モジュラー構造に改善
 */

// ユーティリティ関数群 - セキュア版
const SecurityUtils = {
    /**
     * HTMLエスケープ処理
     */
    escapeHtml: (str) => {
        if (typeof str !== 'string') return str;
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * 安全な電卓評価関数 - eval()を使わない
     */
    safeCalculate: (expression) => {
        try {
            // 危険な文字を除去
            const sanitized = expression
                .replace(/[^0-9+\-*/.() ]/g, '')
                .replace(/\s+/g, '');
            
            // 基本的な四則演算のみ許可
            if (!/^[0-9+\-*/.() ]+$/.test(sanitized)) {
                throw new Error('Invalid expression');
            }

            // Function constructorを使った安全な評価
            const result = new Function(`return (${sanitized})`)();
            
            if (!isFinite(result)) {
                throw new Error('Invalid calculation result');
            }
            
            return Number(result).toString();
        } catch (error) {
            console.warn('Calculation error:', error);
            return null;
        }
    },

    /**
     * 入力の正規化
     */
    normalizeCalculatorInput: (input) => {
        if (!input) return '';
        
        return input
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/[０-９]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0xFEE0))
            .replace(/＋/g, '+')
            .replace(/－/g, '-')
            .replace(/・/g, '*');
    }
};

// ストレージマネージャー
const StorageManager = {
    /**
     * データの安全な保存
     */
    save: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error(`Storage save error for ${key}:`, error);
            return false;
        }
    },

    /**
     * データの安全な読み込み
     */
    load: (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Storage load error for ${key}:`, error);
            return defaultValue;
        }
    },

    /**
     * データの削除
     */
    remove: (key) => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Storage remove error for ${key}:`, error);
            return false;
        }
    }
};

// タスクマネージャー
class TaskManager {
    constructor() {
        this.tasks = [];
        this.load();
    }

    /**
     * タスクの追加
     */
    add(text, dueDate = null, priority = 'normal') {
        const task = {
            id: Date.now(),
            text: SecurityUtils.escapeHtml(text.trim()),
            completed: false,
            dueDate,
            priority,
            createdAt: new Date().toISOString()
        };
        
        this.tasks.unshift(task);
        this.save();
        return task;
    }

    /**
     * タスクの更新
     */
    update(id, updates) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            Object.assign(task, updates);
            this.save();
            return true;
        }
        return false;
    }

    /**
     * タスクの削除
     */
    delete(id) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index > -1) {
            this.tasks.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    /**
     * タスクの検索
     */
    search(query) {
        if (!query) return this.tasks;
        
        const lowerQuery = query.toLowerCase();
        return this.tasks.filter(task =>
            task.text.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * 期限切れタスクの取得
     */
    getOverdue() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return this.tasks.filter(task => {
            if (task.completed || !task.dueDate) return false;
            
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            dueDate.setHours(0, 0, 0, 0);
            
            return dueDate < today;
        });
    }

    /**
     * もうすぐ期限のタスクを取得
     */
    getDueSoon(days = 3) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return this.tasks.filter(task => {
            if (task.completed || !task.dueDate) return false;
            
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            dueDate.setHours(0, 0, 0, 0);
            
            const diffDays = Math.floor((dueDate - today) / 86400000);
            return diffDays >= 0 && diffDays <= days;
        });
    }

    save() {
        StorageManager.save('tasks', this.tasks);
    }

    load() {
        this.tasks = StorageManager.load('tasks', []);
    }
}

// メモマネージャー
class MemoManager {
    constructor() {
        this.memos = [];
        this.load();
    }

    /**
     * メモの追加
     */
    add(title, content, attachments = []) {
        const memo = {
            id: Date.now(),
            title: SecurityUtils.escapeHtml(title.trim()),
            content: SecurityUtils.escapeHtml(content.trim()),
            attachments: this.sanitizeAttachments(attachments),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.memos.unshift(memo);
        this.save();
        return memo;
    }

    /**
     * メモの更新
     */
    update(id, updates) {
        const memo = this.memos.find(m => m.id === id);
        if (memo) {
            if (updates.title) updates.title = SecurityUtils.escapeHtml(updates.title.trim());
            if (updates.content) updates.content = SecurityUtils.escapeHtml(updates.content.trim());
            if (updates.attachments) updates.attachments = this.sanitizeAttachments(updates.attachments);
            
            Object.assign(memo, updates);
            memo.updatedAt = new Date().toISOString();
            this.save();
            return true;
        }
        return false;
    }

    /**
     * メモの削除
     */
    delete(id) {
        const index = this.memos.findIndex(m => m.id === id);
        if (index > -1) {
            const memo = this.memos[index];
            this.cleanupAttachments(memo.attachments);
            this.memos.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    /**
     * メモの検索
     */
    search(query) {
        if (!query) return this.memos;
        
        const lowerQuery = query.toLowerCase();
        return this.memos.filter(memo =>
            memo.title.toLowerCase().includes(lowerQuery) ||
            memo.content.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * 添付ファイルの安全性チェック
     */
    sanitizeAttachments(attachments) {
        if (!Array.isArray(attachments)) return [];
        
        return attachments.map(att => ({
            id: att.id || Date.now() + Math.random(),
            name: SecurityUtils.escapeHtml(att.name || 'file'),
            size: Number(att.size) || 0,
            mime: att.mime || 'application/octet-stream',
            kind: this.getFileKind(att.mime),
            url: att.url || ''
        }));
    }

    /**
     * ファイルタイプの判定
     */
    getFileKind(mime) {
        if (!mime) return 'file';
        
        const type = mime.split('/')[0].toLowerCase();
        return ['image', 'video', 'audio'].includes(type) ? type : 'file';
    }

    /**
     * 添付ファイルのクリーンアップ
     */
    cleanupAttachments(attachments) {
        if (!Array.isArray(attachments)) return;
        
        attachments.forEach(att => {
            if (att?.url && typeof att.url === 'string' && att.url.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(att.url);
                } catch (error) {
                    console.warn('Failed to revoke blob URL:', error);
                }
            }
        });
    }

    save() {
        StorageManager.save('memos', this.memos);
    }

    load() {
        this.memos = StorageManager.load('memos', []);
    }
}

// PWAアプリケーション本体
(function initializeApp() {
    function startApp() {
        const { createApp } = window.Vue;

        // マネージャーインスタンスの作成
        const taskManager = new TaskManager();
        const memoManager = new MemoManager();

        const App = {
            data() {
                return {
                    // アプリケーション状態
                    currentMode: 'tasks',
                    loading: false,
                    
                    // UI状態
                    drawerOpen: false,
                    menuOpen: false,
                    searchActive: false,
                    searchQuery: '',
                    
                    // ダイアログ状態
                    showAddTaskDialog: false,
                    showAddMemoDialog: false,
                    showEditMemoDialog: false,
                    showSettingsDialog: false,
                    showConfirmDialog: false,
                    
                    // 確認ダイアログ
                    confirmTitle: '',
                    confirmMessage: '',
                    confirmCallback: null,
                    
                    // フォーム入力
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
                    
                    // カレンダー
                    currentYear: new Date().getFullYear(),
                    currentMonth: new Date().getMonth(),
                    selectedDate: null,
                    
                    // 設定
                    settings: {
                        theme: 'auto',
                        notifications: false,
                        clockMode: 'digital',
                        reminderDays: 3
                    },
                    
                    // 電卓
                    calculatorValue: '',
                    
                    // システム状態
                    snackbarText: '',
                    snackbarVisible: false,
                    isOnline: navigator.onLine,
                    swRegistration: null,
                    dialogStack: [],
                    hideDueAlertDate: '',
                    now: new Date()
                };
            },

            computed: {
                appBarTitle() {
                    const titles = {
                        'tasks': 'タスク',
                        'memos': 'メモ',
                        'calendar': 'カレンダー',
                        'calc': '電卓'
                    };
                    return titles[this.currentMode] || 'アプリ';
                },

                tasks() {
                    return taskManager.tasks;
                },

                memos() {
                    return memoManager.memos;
                },

                activeTasks() {
                    return this.filterTasks(this.tasks.filter(t => !t.completed));
                },

                completedTasks() {
                    return this.filterTasks(this.tasks.filter(t => t.completed));
                },

                filteredMemos() {
                    return memoManager.search(this.searchQuery);
                },

                totalCount() {
                    return this.tasks.length;
                },

                activeCount() {
                    return this.activeTasks.length;
                },

                completedCount() {
                    return this.completedTasks.length;
                },

                canClearCompleted() {
                    return this.completedCount > 0;
                },

                canClearAll() {
                    return this.totalCount > 0;
                },

                canSearch() {
                    if (this.currentMode === 'tasks') return this.totalCount > 0;
                    if (this.currentMode === 'memos') return this.memos.length > 0;
                    if (this.currentMode === 'calc') return true;
                    return false;
                },

                overdueTasks() {
                    return taskManager.getOverdue();
                },

                dueSoonTasks() {
                    return taskManager.getDueSoon(this.settings.reminderDays);
                },

                dueAlertVisible() {
                    if (this.currentMode !== 'tasks') return false;
                    
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    
                    if (this.hideDueAlertDate === todayStr) return false;
                    
                    return this.dueSoonTasks.length > 0 || this.overdueTasks.length > 0;
                }
            },

            watch: {
                searchQuery(newQuery) {
                    if (this.currentMode === 'calc') {
                        this.handleCalculatorSearch(newQuery);
                    }
                }
            },

            methods: {
                // タスク関連メソッド
                addTask() {
                    const text = (this.taskInput || '').trim();
                    if (!text) {
                        this.showSnackbar('タスク名は必須です');
                        return;
                    }

                    taskManager.add(text, this.taskDateInput, this.taskPriorityInput);
                    this.taskInput = '';
                    this.taskDateInput = '';
                    this.taskPriorityInput = 'normal';
                    this.showSnackbar('タスクを追加しました');
                },

                toggleTask(id) {
                    const task = this.tasks.find(t => t.id === id);
                    if (task) {
                        taskManager.update(id, { completed: !task.completed });
                        this.showSnackbar(task.completed ? '未完了に戻しました' : 'タスクを完了にしました');
                    }
                },

                deleteTask(id) {
                    if (taskManager.delete(id)) {
                        this.showSnackbar('タスクを削除しました');
                    }
                },

                filterTasks(list) {
                    return taskManager.search(this.searchQuery).filter(task =>
                        list.some(t => t.id === task.id)
                    );
                },

                // メモ関連メソッド
                addMemo() {
                    const title = (this.memoTitleInput || '').trim();
                    const content = (this.memoContentInput || '').trim();
                    
                    if (!title || !content) {
                        this.showSnackbar('タイトルと内容は必須です');
                        return;
                    }

                    memoManager.add(title, content, this.memoAttachments);
                    this.memoTitleInput = '';
                    this.memoContentInput = '';
                    this.memoAttachments = [];
                    this.showSnackbar('メモを追加しました');
                },

                editMemo(memo) {
                    this.currentMemoId = memo.id;
                    this.editMemoTitleInput = memo.title;
                    this.editMemoContentInput = memo.content;
                    this.editMemoAttachments = JSON.parse(JSON.stringify(memo.attachments || []));
                    this.showEditMemoDialog = true;
                    this.dialogStack.push('editMemo');
                },

                updateMemo() {
                    const title = (this.editMemoTitleInput || '').trim();
                    const content = (this.editMemoContentInput || '').trim();
                    
                    if (!title || !content) {
                        this.showSnackbar('タイトルと内容は必須です');
                        return;
                    }

                    if (memoManager.update(this.currentMemoId, {
                        title,
                        content,
                        attachments: this.editMemoAttachments
                    })) {
                        this.showSnackbar('メモを更新しました');
                        this.cancelEditMemoDialog();
                    }
                },

                deleteMemo(id) {
                    this.showConfirm('メモを削除', 'このメモを削除しますか？')
                        .then(confirmed => {
                            if (confirmed && memoManager.delete(id)) {
                                this.showSnackbar('メモを削除しました');
                            }
                        });
                },

                // 電卓関連メソッド
                handleCalculatorSearch(query) {
                    if (!query) {
                        this.calculatorValue = '';
                        return;
                    }

                    // 「=」で終わる場合は計算実行
                    if (/[=＝]\s*$/.test(query)) {
                        const expression = query.replace(/[=＝]\s*$/, '');
                        const normalized = SecurityUtils.normalizeCalculatorInput(expression);
                        const result = SecurityUtils.safeCalculate(normalized);
                        this.calculatorValue = result || this.calculatorValue;
                        return;
                    }

                    // リアルタイム計算
                    const normalized = SecurityUtils.normalizeCalculatorInput(query);
                    const result = SecurityUtils.safeCalculate(normalized);
                    this.calculatorValue = (result || query).toString();
                },

                // ダイアログ管理
                showConfirm(title, message) {
                    return new Promise(resolve => {
                        this.confirmTitle = title;
                        this.confirmMessage = message;
                        this.confirmCallback = resolve;
                        this.showConfirmDialog = true;
                        this.dialogStack.push('confirm');
                    });
                },

                confirmDialog() {
                    if (this.confirmCallback) {
                        this.confirmCallback(true);
                        this.confirmCallback = null;
                    }
                    this.showConfirmDialog = false;
                    this.dialogStack = this.dialogStack.filter(d => d !== 'confirm');
                },

                cancelConfirmDialog() {
                    if (this.confirmCallback) {
                        this.confirmCallback(false);
                        this.confirmCallback = null;
                    }
                    this.showConfirmDialog = false;
                    this.dialogStack = this.dialogStack.filter(d => d !== 'confirm');
                },

                cancelEditMemoDialog() {
                    memoManager.cleanupAttachments(this.editMemoAttachments);
                    this.editMemoAttachments = [];
                    this.currentMemoId = null;
                    this.showEditMemoDialog = false;
                    this.dialogStack = this.dialogStack.filter(d => d !== 'editMemo');
                },

                // UI状態管理
                switchMode(mode) {
                    this.currentMode = mode;
                    this.drawerOpen = false;
                    this.menuOpen = false;
                    this.searchActive = false;
                    this.searchQuery = '';
                },

                toggleDrawer() {
                    this.drawerOpen = !this.drawerOpen;
                    this.menuOpen = false;
                },

                toggleMenu() {
                    this.menuOpen = !this.menuOpen;
                    this.drawerOpen = false;
                },

                toggleSearch() {
                    if (this.canSearch) {
                        this.searchActive = !this.searchActive;
                    }
                },

                // ユーティリティ
                showSnackbar(text, duration = 2500) {
                    this.snackbarText = text;
                    this.snackbarVisible = true;
                    setTimeout(() => {
                        this.snackbarVisible = false;
                    }, duration);
                },

                formatDate(dateString) {
                    if (!dateString) return '';
                    
                    const date = new Date(dateString + 'T00:00:00');
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const targetDate = new Date(date);
                    targetDate.setHours(0, 0, 0, 0);
                    
                    const diffDays = Math.floor((targetDate - today) / 86400000);
                    
                    if (diffDays === 0) return '今日';
                    if (diffDays === 1) return '明日';
                    if (diffDays === -1) return '昨日';
                    
                    return `${date.getMonth() + 1}月${date.getDate()}日`;
                },

                // 初期化処理
                loadData() {
                    this.settings = Object.assign(this.settings, StorageManager.load('settings', {}));
                    this.hideDueAlertDate = StorageManager.load('hideDueAlertDate', '');
                    this.applyTheme();
                },

                saveSettings() {
                    StorageManager.save('settings', this.settings);
                    this.applyTheme();
                },

                applyTheme() {
                    const theme = this.settings.theme;
                    const isDark = theme === 'dark' || 
                        (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    
                    document.body.classList.toggle('dark-theme', isDark);
                }
            },

            async mounted() {
                this.loadData();
                
                // Service Worker登録
                if ('serviceWorker' in navigator) {
                    try {
                        const registration = await navigator.serviceWorker.register('/service-worker.js');
                        this.swRegistration = registration;
                        console.log('Service Worker registered successfully');
                    } catch (error) {
                        console.error('Service Worker registration failed:', error);
                    }
                }

                // 時計更新
                setInterval(() => {
                    this.now = new Date();
                }, 1000);

                // オンライン状態監視
                window.addEventListener('online', () => { this.isOnline = true; });
                window.addEventListener('offline', () => { this.isOnline = false; });
            }
        };

        const app = createApp(App);
        app.mount('#app');
    }

    // DOM読み込み完了後に実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();