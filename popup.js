class PomodoroTimer {
    constructor() {
        this.duration = 25 * 60; // 25分（秒単位）
        this.timeLeft = this.duration;
        this.isRunning = false;
        this.intervalId = null;
        
        this.timerDisplay = document.getElementById('timer-display');
        this.startBtn = document.getElementById('start-btn');
        this.stopBtn = document.getElementById('stop-btn');
        
        this.initializeEventListeners();
        this.loadState();
    }
    
    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startTimer());
        this.stopBtn.addEventListener('click', () => this.stopTimer());
    }
    
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['pomodoroState']);
            if (result.pomodoroState) {
                const state = result.pomodoroState;
                this.timeLeft = state.timeLeft;
                this.isRunning = state.isRunning;
                
                if (this.isRunning) {
                    // タイマーが実行中の場合、経過時間を計算
                    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
                    this.timeLeft = Math.max(0, state.timeLeft - elapsed);
                    
                    if (this.timeLeft > 0) {
                        this.startCountdown();
                    } else {
                        this.timerComplete();
                    }
                }
            }
            this.updateDisplay();
            this.updateButtons();
        } catch (error) {
            console.error('状態の読み込みエラー:', error);
        }
    }
    
    async saveState() {
        try {
            await chrome.storage.local.set({
                pomodoroState: {
                    timeLeft: this.timeLeft,
                    isRunning: this.isRunning,
                    startTime: Date.now()
                }
            });
        } catch (error) {
            console.error('状態の保存エラー:', error);
        }
    }
    
    startTimer() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.saveState();
            this.startCountdown();
            this.updateButtons();
            
            // バックグラウンドスクリプトにブロック開始を通知
            chrome.runtime.sendMessage({
                action: 'startBlocking',
                duration: this.timeLeft
            });
        }
    }
    
    stopTimer() {
        if (this.isRunning) {
            this.isRunning = false;
            this.timeLeft = this.duration;
            
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            
            this.saveState();
            this.updateDisplay();
            this.updateButtons();
            
            // バックグラウンドスクリプトにブロック停止を通知
            chrome.runtime.sendMessage({
                action: 'stopBlocking'
            });
        }
    }
    
    startCountdown() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();
            this.saveState();
            
            if (this.timeLeft <= 0) {
                this.timerComplete();
            }
        }, 1000);
    }
    
    timerComplete() {
        this.isRunning = false;
        this.timeLeft = this.duration;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.saveState();
        this.updateDisplay();
        this.updateButtons();
        
        // バックグラウンドスクリプトにタイマー完了を通知
        chrome.runtime.sendMessage({
            action: 'timerComplete'
        });
        
        // 完了通知
        alert('ポモドーロタイマーが完了しました！お疲れ様でした。');
    }
    
    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateButtons() {
        if (this.isRunning) {
            this.startBtn.disabled = true;
            this.startBtn.classList.add('disabled');
            this.stopBtn.disabled = false;
            this.stopBtn.classList.remove('disabled');
        } else {
            this.startBtn.disabled = false;
            this.startBtn.classList.remove('disabled');
            this.stopBtn.disabled = true;
            this.stopBtn.classList.add('disabled');
        }
    }
}

// ポップアップが開かれたときにタイマーを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PomodoroTimer();
});