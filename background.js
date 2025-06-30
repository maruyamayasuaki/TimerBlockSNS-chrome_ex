class PomodoroBlocker {
    constructor() {
        this.blockedSites = [
            'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
            'snapchat.com', 'linkedin.com', 'youtube.com', 'netflix.com', 'twitch.tv',
            'niconico.jp', 'reddit.com', '2ch.net', '5ch.net', 'yahoo.co.jp',
            'amazon.co.jp', 'amazon.com', 'rakuten.co.jp', 'mercari.com'
        ];

        this.state = {
            isRunning: false,
            isWorkTime: true,
            workDuration: 25,
            breakDuration: 5,
            timeLeft: 25 * 60,
            timerId: null
        };

        this.blockingRules = [];
        this.loadState();
        this.initializeEventListeners();
    }

    async loadState() {
        const { pomodoroState } = await chrome.storage.local.get('pomodoroState');
        if (pomodoroState && pomodoroState.isRunning) {
            const elapsed = Math.floor((Date.now() - pomodoroState.startTime) / 1000);
            const timeLeft = pomodoroState.timeLeft - elapsed;

            if (timeLeft > 0) {
                this.state = { ...this.state, ...pomodoroState, timeLeft };
                this.startTimerInterval();
            } else {
                // 保存されたタイマーが既に終了している場合
                this.switchMode(); 
            }
        }
    }

    async saveState() {
        await chrome.storage.local.set({ 
            pomodoroState: { ...this.state, startTime: Date.now() } 
        });
    }

    initializeEventListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'startTimer':
                    this.state.workDuration = message.workDuration;
                    this.state.breakDuration = message.breakDuration;
                    if (!this.state.isRunning) {
                        this.state.isRunning = true;
                        this.state.isWorkTime = true;
                        this.state.timeLeft = this.state.workDuration * 60;
                        this.startTimerInterval();
                    }
                    break;
                case 'pauseTimer':
                    this.pauseTimer();
                    break;
                case 'getState':
                    sendResponse(this.state);
                    break;
                case 'switchMode': // popup.jsからの手動切替（デバッグ用など）
                    this.switchMode();
                    break;
            }
            this.saveState();
            return true; // 非同期レスポンスのために必要
        });
    }

    startTimerInterval() {
        if (this.state.timerId) clearInterval(this.state.timerId);

        this.updateBlocking(this.state.isWorkTime);
        this.updateBadge();

        this.state.timerId = setInterval(() => {
            this.state.timeLeft--;
            if (this.state.timeLeft < 0) {
                this.switchMode();
            } else {
                this.updateBadge();
                this.saveState();
            }
        }, 1000);
    }

    pauseTimer() {
        this.state.isRunning = false;
        if (this.state.timerId) {
            clearInterval(this.state.timerId);
            this.state.timerId = null;
        }
        this.updateBadge();
        this.updateBlocking(false); // 一時停止中はブロック解除
        this.saveState();
    }

    switchMode() {
        this.state.isWorkTime = !this.state.isWorkTime;
        this.state.timeLeft = (this.state.isWorkTime ? this.state.workDuration : this.state.breakDuration) * 60;
        
        this.showNotification();
        
        if (this.state.isRunning) {
            this.startTimerInterval();
        } else {
            this.updateBadge();
            this.updateBlocking(false);
        }
        this.saveState();
    }

    updateBadge() {
        if (!this.state.isRunning) {
            chrome.action.setBadgeText({ text: '' });
            return;
        }

        const minutes = Math.floor(this.state.timeLeft / 60);
        const seconds = this.state.timeLeft % 60;
        const badgeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        chrome.action.setBadgeText({ text: badgeText });
        if (this.state.isWorkTime) {
            chrome.action.setBadgeBackgroundColor({ color: '#d93025' }); // 赤
        } else {
            chrome.action.setBadgeBackgroundColor({ color: '#1e8e3e' }); // 緑
        }
    }

    async updateBlocking(shouldBlock) {
        if (shouldBlock) {
            const rules = this.blockedSites.map((site, index) => ({
                id: index + 1,
                priority: 1,
                action: { type: 'block' },
                condition: { urlFilter: `||${site}/`, resourceTypes: ['main_frame'] }
            }));
            await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules, removeRuleIds: rules.map(r => r.id) });
        } else {
            const ruleIds = this.blockedSites.map((site, index) => index + 1);
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        }
    }

    showNotification() {
        const title = this.state.isWorkTime ? '休憩終了！' : '集中時間終了！';
        const message = this.state.isWorkTime ? `さあ、${this.state.workDuration}分間の集中を始めましょう！` : `お疲れ様でした！${this.state.breakDuration}分間の休憩です。`;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon.png',
            title: title,
            message: message
        });
    }
}

new PomodoroBlocker();
