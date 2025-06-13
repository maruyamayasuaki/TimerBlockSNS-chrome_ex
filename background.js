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
    }
    
    async loadBlockingState() {
        try {
            const result = await chrome.storage.local.get(['pomodoroState']);
            if (result.pomodoroState && result.pomodoroState.isRunning) {
                const state = result.pomodoroState;
                const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
                const timeLeft = Math.max(0, state.timeLeft - elapsed);

                if (timeLeft > 0) {
                    this.startBlocking(timeLeft);
                }
            }
        } catch (error) {
            console.error('ブロック状態の読み込みエラー:', error);
        }
    }

    startBadgeTimer(duration) {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
        }

        const start = Date.now();
        chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
        this.badgeTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const timeLeft = Math.max(0, duration - elapsed);
            const minutes = Math.ceil(timeLeft / 60);
            chrome.action.setBadgeText({ text: minutes.toString() });

            if (timeLeft <= 0) {
                clearInterval(this.badgeTimer);
                this.badgeTimer = null;
                chrome.action.setBadgeText({ text: '' });
            }
        }, 1000);
    }

    clearBadgeTimer() {
        if (this.badgeTimer) {
            clearInterval(this.badgeTimer);
            this.badgeTimer = null;
        }
        chrome.action.setBadgeText({ text: '' });
    }
    
    async startBlocking(duration) {
        this.isBlocking = true;
        this.startBadgeTimer(duration);
        console.log(`ブロック開始: ${duration}秒間`);

        // declarativeNetRequest用のルールを作成
        this.blockingRules = this.blockedSites.map((site, index) => ({
            id: index + 1,
            priority: 1,
            action: { type: 'block' },
            condition: { urlFilter: `||${site}^` }
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
        // ブロックページにリダイレクト
        const blockPageContent = this.createBlockPageContent(hostname);
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(blockPageContent);
        
        chrome.tabs.update(tabId, { url: dataUrl }).catch(error => {
            console.error('タブブロックエラー:', error);
        });
    }
    
    createBlockPageContent(blockedSite) {
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
        <p>
            <span class="site-name">${blockedSite}</span> は現在ブロックされています。<br>
            ポモドーロタイマーが終了するまでお待ちください。
        </p>
        <p class="motivational">
            集中して作業を続けましょう！<br>
            あなたならきっとできます 💪
        </p>
    </div>
</body>
</html>`;
    }
}

// サービスワーカーが開始されたときにブロッカーを初期化
new PomodoroBlocker();