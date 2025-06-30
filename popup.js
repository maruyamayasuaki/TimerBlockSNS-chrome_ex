class PomodoroTimer {
    constructor() {
        this.workDurationInput = document.getElementById('work-duration');
        this.breakDurationInput = document.getElementById('break-duration');
        this.timerDisplay = document.getElementById('timer-display');
        this.startBtn = document.getElementById('start-btn');
        this.statusDisplay = document.getElementById('status');

        this.loadSettings();
        this.timeLeft = this.workDuration * 60;
        this.isWorkTime = true;
        this.isRunning = false;
        this.intervalId = null;

        this.initializeEventListeners();
        this.updateDisplay();
        this.loadState();
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.toggleTimer());
        this.workDurationInput.addEventListener('change', () => this.updateSettings());
        this.breakDurationInput.addEventListener('change', () => this.updateSettings());
    }

    loadSettings() {
        this.workDuration = parseInt(localStorage.getItem('workDuration')) || 25;
        this.breakDuration = parseInt(localStorage.getItem('breakDuration')) || 5;
        this.workDurationInput.value = this.workDuration;
        this.breakDurationInput.value = this.breakDuration;
    }

    updateSettings() {
        this.workDuration = parseInt(this.workDurationInput.value) || 25;
        this.breakDuration = parseInt(this.breakDurationInput.value) || 5;
        localStorage.setItem('workDuration', this.workDuration);
        localStorage.setItem('breakDuration', this.breakDuration);

        if (!this.isRunning) {
            this.isWorkTime = true;
            this.timeLeft = this.workDuration * 60;
            this.updateDisplay();
        }
    }

    async loadState() {
        try {
            const state = await chrome.runtime.sendMessage({ action: 'getState' });
            if (state && state.isRunning) {
                this.isRunning = true;
                this.isWorkTime = state.isWorkTime;
                this.timeLeft = state.timeLeft;
                this.workDuration = state.workDuration;
                this.breakDuration = state.breakDuration;
                this.workDurationInput.value = this.workDuration;
                this.breakDurationInput.value = this.breakDuration;
                this.startCountdown();
            } else {
                this.updateDisplay();
            }
            this.updateUI();
        } catch (error) {
            console.error('状態の読み込みエラー:', error);
            this.updateDisplay();
            this.updateUI();
        }
    }

    toggleTimer() {
        this.isRunning = !this.isRunning;
        if (this.isRunning) {
            this.startCountdown();
            chrome.runtime.sendMessage({
                action: 'startTimer',
                workDuration: this.workDuration,
                breakDuration: this.breakDuration
            });
        } else {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            chrome.runtime.sendMessage({ action: 'pauseTimer' });
        }
        this.updateUI();
    }

    startCountdown() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.intervalId = setInterval(() => {
            this.timeLeft--;
            this.updateDisplay();

            if (this.timeLeft <= 0) {
                this.switchMode();
            }
        }, 1000);
    }

    switchMode() {
        this.isWorkTime = !this.isWorkTime;
        this.timeLeft = (this.isWorkTime ? this.workDuration : this.breakDuration) * 60;
        this.updateUI();
        // バックグラウンドにもモード切替を通知
        chrome.runtime.sendMessage({ action: 'switchMode' });
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateUI() {
        if (this.isRunning) {
            this.startBtn.textContent = '一時停止';
            this.startBtn.classList.add('disabled');
            this.workDurationInput.disabled = true;
            this.breakDurationInput.disabled = true;
        } else {
            this.startBtn.textContent = '開始';
            this.startBtn.classList.remove('disabled');
            this.workDurationInput.disabled = false;
            this.breakDurationInput.disabled = false;
        }

        if (this.isWorkTime) {
            this.statusDisplay.textContent = '集中モード';
            document.body.style.backgroundColor = '#f0f2f5';
        } else {
            this.statusDisplay.textContent = '休憩中';
            document.body.style.backgroundColor = '#e0f7fa'; // 休憩中は背景色を少し変える
        }
        this.updateDisplay();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PomodoroTimer();
});
