// UI Manager - Professional Version

const UIManager = {
    colors: ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#ff8787',
             '#69db7e', '#4dabf7', '#ffa94d', '#9775fa', '#ff8c8c',
             '#74c0fc', '#b197fc'],

    createChannelControls: function(channels, visibleChannels, onToggle) {
        const container = document.createElement('div');
        container.className = 'channel-controls';

        channels.forEach((ch, idx) => {
            const item = document.createElement('div');
            item.className = `channel-item color-${idx % 12}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = visibleChannels[ch] || false;
            checkbox.onchange = () => onToggle(ch);

            const label = document.createElement('span');
            label.textContent = ch;
            label.style.color = visibleChannels[ch] ? this.colors[idx % 12] : '#666';
            label.style.fontWeight = visibleChannels[ch] ? '600' : 'normal';

            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        });

        return container;
    },

    createControlsBar: function(state, callbacks) {
        const bar = document.createElement('div');
        bar.className = 'controls';

        const playBtn = document.createElement('button');
        playBtn.id = 'playPauseBtn';
        playBtn.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play';
        playBtn.onclick = (e) => {
            e.preventDefault();
            callbacks.onPlayPause();
        };
        bar.appendChild(playBtn);

        const resetBtn = document.createElement('button');
        resetBtn.id = 'resetBtn';
        resetBtn.textContent = '⏮ Reset';
        resetBtn.onclick = (e) => {
            e.preventDefault();
            callbacks.onReset();
        };
        bar.appendChild(resetBtn);

        const allBtn = document.createElement('button');
        allBtn.textContent = 'All';
        allBtn.onclick = callbacks.onSelectAll;
        bar.appendChild(allBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'None';
        clearBtn.onclick = callbacks.onClearAll;
        bar.appendChild(clearBtn);

        const speedLabel = document.createElement('span');
        speedLabel.style.color = '#8a9ab0';
        speedLabel.textContent = 'Speed:';
        bar.appendChild(speedLabel);

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = '0.5';
        speedSlider.max = '3';
        speedSlider.step = '0.1';
        speedSlider.value = state.speed;
        speedSlider.className = 'slider';
        speedSlider.oninput = (e) => callbacks.onSpeedChange(parseFloat(e.target.value));
        bar.appendChild(speedSlider);

        const speedValue = document.createElement('span');
        speedValue.style.color = '#4a9eff';
        speedValue.textContent = `${state.speed}x`;
        speedValue.id = 'speedValue';
        bar.appendChild(speedValue);

        const timeLabel = document.createElement('span');
        timeLabel.style.color = '#8a9ab0';
        timeLabel.style.marginLeft = '10px';
        timeLabel.textContent = `Time: ${(state.currentPosition / 250).toFixed(1)}s`;
        timeLabel.id = 'timeDisplay';
        bar.appendChild(timeLabel);

        return bar;
    },

    showLoading: function() {
        const loadingEl = document.getElementById('loadingIndicator');
        if (loadingEl) {
            loadingEl.style.display = 'flex';
        }
        const overlayEl = document.getElementById('loadingOverlay');
        if (overlayEl) {
            overlayEl.classList.add('active');
        }
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    },

    hideLoading: function() {
        const loadingEl = document.getElementById('loadingIndicator');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        const overlayEl = document.getElementById('loadingOverlay');
        if (overlayEl) {
            overlayEl.classList.remove('active');
        }
    },

    showError: function(message) {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.textContent = `❌ ${message}`;
            errorEl.style.display = 'block';
            setTimeout(() => {
                if (errorEl) errorEl.style.display = 'none';
            }, 5000);
        } else {
            alert('Error: ' + message);
        }
        this.hideLoading();
    },

    updateSpeedValue: function(speed) {
        const el = document.getElementById('speedValue');
        if (el) el.textContent = `${speed}x`;
    },

    updateTimeDisplay: function(time) {
        const el = document.getElementById('timeDisplay');
        if (el) el.textContent = `Time: ${time.toFixed(1)}s`;
    },

    showNotification: function(message, type = 'info') {
        const container = document.getElementById('notifContainer');
        if (!container) {
            console.log(`[${type}] ${message}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notif-item notif-${type}`;

        let bgColor;
        switch(type) {
            case 'success': bgColor = '#10b981'; break;
            case 'error': bgColor = '#ef4444'; break;
            default: bgColor = '#3b82f6';
        }

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        container.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }, 3000);
    },

    updateModelStatus: function(loaded, type = 'ECG') {
        const statusEl = document.getElementById('modelStatus');
        if (statusEl) {
            if (loaded) {
                statusEl.textContent = `✅ Real ${type} Model Loaded`;
                statusEl.style.background = 'rgba(16, 185, 129, 0.2)';
                statusEl.style.color = '#10b981';
                statusEl.style.border = '1px solid #10b981';
            } else {
                statusEl.textContent = '⚠️ Using Fallback Mode';
                statusEl.style.background = 'rgba(245, 158, 11, 0.2)';
                statusEl.style.color = '#f59e0b';
                statusEl.style.border = '1px solid #f59e0b';
            }
        }
    },

    updateChannelCount: function(visible, total) {
        const titleSpan = document.querySelector('.plot-title span');
        if (titleSpan) {
            titleSpan.innerHTML = `<span class="color-dot" style="background: #4a9eff"></span> MULTI-CHANNEL DISPLAY (${visible}/${total})`;
        }
    }
};