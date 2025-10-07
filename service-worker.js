const CACHE_NAME = 'task-manager-v2';

const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js',
    'https://esm.run/@material/web/',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// インストール時にキャッシュを作成
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// フェッチ時にキャッシュファーストで応答
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュにあればそれを返す
                if (response) {
                    return response;
                }

                // なければネットワークから取得
                return fetch(event.request).then((response) => {
                    // 有効なレスポンスでない場合はそのまま返す
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // レスポンスをキャッシュに追加
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return response;
                });
            })
            .catch(() => {
                // オフライン時のフォールバック
                return caches.match('/index.html');
            })
    );
});

// プッシュ通知を受信
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push received');
    
    let notificationData = {
        title: 'タスク管理',
        body: '新しい通知があります',
        icon: '/icons/android-launchericon-192-192.png',
        badge: '/icons/android-launchericon-192-192.png',
        tag: 'task-notification',
        requireInteraction: false
    };

    if (event.data) {
        try {
            notificationData = event.data.json();
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            tag: notificationData.tag,
            requireInteraction: notificationData.requireInteraction
        })
    );
});

// 通知のクリック処理
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked');
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync', event.tag);
    
    if (event.tag === 'sync-tasks') {
        event.waitUntil(syncTasks());
    }
});

/**
 * バックグラウンドでタスクを同期する
 */
async function syncTasks() {
    try {
        console.log('[Service Worker] Syncing tasks...');
        // ここでバックグラウンド同期のロジックを実装
        // 例: サーバーとの同期処理
    } catch (error) {
        console.error('[Service Worker] Task sync failed:', error);
    }
}