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
        this.badgeTimer = null;
        this.startTime = null;
        this.totalDuration = 0;
        this.blockingRules = [];
        
        this.initializeEventListeners();
        this.loadBlockingState();
    }
    
    initializeEventListeners() {
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
                    this.showCompletionNotification();
                    break;
                case 'getBadgeStatus':
                    sendResponse({
                        isRunning: this.isBlocking,
                        timeLeft: this.isBlocking ? this.getTimeLeft() : 0
                    });
                    break;
            }
        });
        
        // declarativeNetRequestのみを使用してブロック
        // タブ監視は削除（activeTab権限では全タブアクセス不可）
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
        
        chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
        chrome.action.setBadgeTextColor({ color: '#ffffff' });
        
        const updateBadge = () => {
            const timeLeft = this.getTimeLeft();
            
            if (timeLeft <= 0) {
                clearInterval(this.badgeTimer);
                this.badgeTimer = null;
                chrome.action.setBadgeText({ text: '' });
                this.showCompletionNotification();
                return;
            }
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            let badgeText;
            if (minutes > 0) {
                badgeText = `${minutes}m`;
            } else {
                badgeText = `${seconds}s`;
            }
            
            if (timeLeft <= 60) {
                chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
            } else if (timeLeft <= 300) {
                chrome.action.setBadgeBackgroundColor({ color: '#ff9500' });
            } else {
                chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });
            }
            
            chrome.action.setBadgeText({ text: badgeText });
        };
        
        updateBadge();
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
        this.blockingRules = this.blockedSites.flatMap((site, index) => [
            // メインドメイン
            {
                id: index * 2 + 1,
                priority: 1,
                action: { 
                    type: 'redirect', 
                    redirect: { 
                        url: 'data:text/html;charset=utf-8,' + encodeURIComponent(this.createBlockPageContent(site)) 
                    } 
                },
                condition: { 
                    urlFilter: `||${site}^`,
                    resourceTypes: ['main_frame']
                }
            },
            // wwwサブドメイン
            {
                id: index * 2 + 2,
                priority: 1,
                action: { 
                    type: 'redirect', 
                    redirect: { 
                        url: 'data:text/html;charset=utf-8,' + encodeURIComponent(this.createBlockPageContent(site)) 
                    } 
                },
                condition: { 
                    urlFilter: `||www.${site}^`,
                    resourceTypes: ['main_frame']
                }
            }
        ]);

        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: this.blockingRules,
                removeRuleIds: this.blockingRules.map(r => r.id)
            });
        } catch (error) {
            console.error('DNRルール追加エラー:', error);
        }
        
        // 指定時間後に自動停止
        setTimeout(() => {
            this.stopBlocking();
            this.showCompletionNotification();
        }, duration * 1000);
    }
    
    stopBlocking() {
        this.isBlocking = false;
        this.clearBadgeTimer();
        console.log('ブロック停止');

        if (this.blockingRules.length > 0) {
            chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: this.blockingRules.map(r => r.id)
            }).catch(error => {
                console.error('DNRルール削除エラー:', error);
            });
            this.blockingRules = [];
        }
    }

    async showCompletionNotification() {
        try {
            await chrome.notifications.create('pomodoro-complete', {
                type: 'basic',
                iconUrl: 'icons/icon.png',
                title: 'ポモドーロタイマー完了！',
                message: 'お疲れ様でした！25分間の集中時間が完了しました。'
            });

            setTimeout(() => {
                chrome.notifications.clear('pomodoro-complete');
            }, 3000);
        } catch (error) {
            console.error('通知表示エラー:', error);
        }
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
        setInterval(() => {
            location.reload();
        }, 10000);
    </script>
</body>
</html>`;
    }
}

new PomodoroBlocker();