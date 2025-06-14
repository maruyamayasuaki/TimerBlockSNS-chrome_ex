class PomodoroBlocker {
    constructor() {
        this.blockedSites = [
            // SNS
            'facebook.com',
            'twitter.com',
            'x.com',
            'instagram.com',
            'tiktok.com',
            'snapchat.com',
            'linkedin.com',
            
            // 動画・エンタメ
            'youtube.com',
            'netflix.com',
            'twitch.tv',
            'niconico.jp',
            
            // ニュース・情報
            'reddit.com',
            '2ch.net',
            '5ch.net',
            'yahoo.co.jp',
            
            // ショッピング
            'amazon.co.jp',
            'amazon.com',
            'rakuten.co.jp',
            'mercari.com'
        ];
        
        this.isBlocking = false;
        // バッジ表示更新用タイマー
        this.badgeTimer = null;
        this.startTime = null;
        this.totalDuration = 0;
        // declarativeNetRequest ルール保存用
        this.blockingRules = [];
        
        this.initializeEventListeners();
        this.loadBlockingState();
    }
    
    initializeEventListeners() {
        // ポップアップからのメッセージを受信
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'startBlocking':
                    this.startBlocking(message.duration);
                    break;
                case 'stopBlocking':
                    this.stopBlocking();
                    break;
                case 'timerComplete':
                    this.stopBlocking();
                    this.showCompletionNotification(); // 完了通知を追加
                    break;
                case 'getBadgeStatus':
                    // ポップアップが開かれた時にバッジ状態を同期
                    sendResponse({
                        isRunning: this.isBlocking,
                        timeLeft: this.isBlocking ? this.getTimeLeft() : 0
                    });
                    break;
            }
        });
        
        // タブの更新時にブロックをチェック
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (this.isBlocking && changeInfo.status === 'loading' && tab.url) {
                this.checkAndBlockTab(tabId, tab.url);
            }
        });
        
        // 新しいタブが作成されたときにブロックをチェック
        chrome.tabs.onCreated.addListener((tab) => {
            if (this.isBlocking && tab.url) {
                this.checkAndBlockTab(tab.id, tab.url);
            }
        });

        // SPAなどのURL変更を検知
        chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
            if (this.isBlocking) {
                chrome.tabs.get(details.tabId).then(tab => {
                    if (tab.url) {
                        this.checkAndBlockTab(tab.id, tab.url);
                    }
                }).catch(() => {});
            }
        });

        // ナビゲーション開始時もチェック
        chrome.webNavigation.onBeforeNavigate.addListener((details) => {
            if (this.isBlocking && details.frameId === 0) { // メインフレームのみ
                this.checkAndBlockTab(details.tabId, details.url);
            }
        });
    }
    
    async loadBlockingState() {
        try {
            const result = await chrome.storage.local.get(['pomodoroState']);
            if (result.pomodoroState && result.pomodoroState.isRunning) {
                const state = result.pomodoroState;
                const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
                const timeLeft = Math.max(0, state.timeLeft - elapsed);

                if (timeLeft > 0) {
                    this.startTime = state.startTime;
                    this.totalDuration = state.timeLeft;
                    this.startBlocking(timeLeft);
                }
            }
        } catch (error) {
            console.error('ブロック状態の読み込みエラー:', error);
        }
    }

    getTimeLeft() {
        if (!this.isBlocking || !this.startTime) return 0;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        return Math.max(0, this.totalDuration - elapsed);
    }

    startBadgeTimer(duration) {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
        }

        this.startTime = Date.now();
        this.totalDuration = duration;
        
        // 初期状態の設定
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
        chrome.action.setBadgeTextColor({ color: '#ffffff' });
        
        const updateBadge = () => {
            const timeLeft = this.getTimeLeft();
            
            if (timeLeft <= 0) {
                // タイマー完了（修正②：自動完了通知を追加）
                clearInterval(this.badgeTimer);
                this.badgeTimer = null;
                chrome.action.setBadgeText({ text: '' });
                this.showCompletionNotification();
                return;
            }
            
            // 残り時間を分:秒形式で表示（バッジの文字数制限を考慮）
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            let badgeText;
            if (minutes > 0) {
                // 1分以上の場合は分数のみ表示
                badgeText = `${minutes}m`;
            } else {
                // 1分未満の場合は秒数表示
                badgeText = `${seconds}s`;
            }
            
            // 残り時間に応じてバッジの色を変更
            if (timeLeft <= 60) {
                // 残り1分以下は赤色
                chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
            } else if (timeLeft <= 300) {
                // 残り5分以下はオレンジ色
                chrome.action.setBadgeBackgroundColor({ color: '#ff9500' });
            } else {
                // それ以外は通常の赤色
                chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
            }
            
            chrome.action.setBadgeText({ text: badgeText });
        };
        
        // 即座に更新
        updateBadge();
        
        // 1秒ごとに更新
        this.badgeTimer = setInterval(updateBadge, 1000);
    }

    clearBadgeTimer() {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
        chrome.action.setBadgeText({ text: '' });
        this.startTime = null;
        this.totalDuration = 0;
    }
    
    async startBlocking(duration) {
        this.isBlocking = true;
        this.startBadgeTimer(duration);
        console.log(`ブロック開始: ${duration}秒間`);

        // declarativeNetRequest用のルールを作成
        this.blockingRules = this.blockedSites.map((site, index) => ({
            id: index + 1,
            priority: 1,
            action: { type: 'redirect', redirect: { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(this.createBlockPageContent(site)) } },
            condition: { 
                urlFilter: `||${site}^`,
                resourceTypes: ['main_frame', 'sub_frame']
            }
        }));

        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: this.blockingRules,
                removeRuleIds: this.blockingRules.map(r => r.id)
            });
        } catch (error) {
            console.error('DNRルール追加エラー:', error);
        }
        
        // 現在開いているタブをチェック
        try {
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                if (tab.url) {
                    this.checkAndBlockTab(tab.id, tab.url);
                }
            });
        } catch (error) {
            console.error('タブチェックエラー:', error);
        }
        
        // 指定時間後に自動停止
        setTimeout(() => {
            this.stopBlocking();
            this.showCompletionNotification(); // 修正②：自動完了時の通知
        }, duration * 1000);
    }
    
    stopBlocking() {
        this.isBlocking = false;
        this.clearBadgeTimer();
        console.log('ブロック停止');

        // 動的ルールを削除
        if (this.blockingRules.length > 0) {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: this.blockingRules.map(r => r.id)
            }).catch(error => {
                console.error('DNRルール削除エラー:', error);
            });
            this.blockingRules = [];
        }
    }

    // 完了通知を表示する関数
    async showCompletionNotification() {
        try {
            // 通知を表示
            await chrome.notifications.create('pomodoro-complete', {
                type: 'basic',
                iconUrl: 'icons/icon.png',
                title: 'ポモドーロタイマー完了！',
                message: 'お疲れ様でした！25分間の集中時間が完了しました。'
            });

            // 3秒後に通知を自動で閉じる
            setTimeout(() => {
                chrome.notifications.clear('pomodoro-complete');
            }, 3000);
        } catch (error) {
            console.error('通知表示エラー:', error);
        }
    }
    
    checkAndBlockTab(tabId, url) {
        if (!this.isBlocking) return;
        
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            
            // ブロック対象サイトかチェック
            const isBlocked = this.blockedSites.some(site => {
                return hostname.includes(site) || hostname.endsWith('.' + site);
            });
            
            if (isBlocked) {
                this.blockTab(tabId, hostname);
            }
        } catch (error) {
            // URLの解析エラーは無視
        }
    }
    
    blockTab(tabId, hostname) {
        // ブロックページにリダイレクト（修正①：確実にブロックページを表示）
        const blockPageContent = this.createBlockPageContent(hostname);
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(blockPageContent);
        
        chrome.tabs.update(tabId, { url: dataUrl }).catch(error => {
            console.error('タブブロックエラー:', error);
        });
    }
    
    createBlockPageContent(blockedSite) {
        const timeLeft = this.getTimeLeft();
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>サイトがブロックされています</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .icon {
            font-size: 72px;
            margin-bottom: 20px;
        }
        
        h1 {
            margin: 0 0 20px 0;
            font-size: 28px;
        }
        
        .timer-display {
            font-size: 48px;
            font-weight: bold;
            color: #ffeb3b;
            margin: 20px 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        p {
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 30px;
        }
        
        .site-name {
            color: #ffeb3b;
            font-weight: bold;
        }
        
        .motivational {
            font-style: italic;
            font-size: 16px;
            color: #e1f5fe;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🍅</div>
        <h1>サイトがブロックされています</h1>
        <div class="timer-display">${timeDisplay}</div>
        <p>
            <span class="site-name">${blockedSite}</span> は現在ブロックされています。<br>
            ポモドーロタイマーが終了するまでお待ちください。
        </p>
        <p class="motivational">
            集中して作業を続けましょう！<br>
            あなたならきっとできます 💪
        </p>
    </div>
    
    <script>
        // ページ表示時に最新の残り時間を取得して表示（修正①：より頻繁に更新）
        setInterval(() => {
            location.reload();
        }, 10000); // 10秒ごとにページを更新
    </script>
</body>
</html>`;
    }
}

// サービスワーカーが開始されたときにブロッカーを初期化
new PomodoroBlocker();