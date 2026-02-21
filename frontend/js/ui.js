// UI Manager

const UIManager = {

    // Colors for channels
    colors: ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#ff8787',
             '#69db7e', '#4dabf7', '#ffa94d', '#9775fa', '#ff8c8c',
             '#74c0fc', '#b197fc'],

    // Create channel controls
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

    // Create controls bar
    createControlsBar: function(state, callbacks) {
        const bar = document.createElement('div');
        bar.className = 'controls';

        // Play/Pause button
        const playBtn = document.createElement('button');
        playBtn.id = 'playPauseBtn';
        playBtn.textContent = state.isPlaying ? '⏸ Pause' : '▶ Play';
        playBtn.onclick = (e) => {
            e.preventDefault();
            console.log('Play button clicked');
            callbacks.onPlayPause();
        };
        bar.appendChild(playBtn);

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.id = 'resetBtn';
        resetBtn.textContent = '⏮ Reset';
        resetBtn.onclick = (e) => {
            e.preventDefault();
            console.log('Reset button clicked');
            callbacks.onReset();
        };
        bar.appendChild(resetBtn);

        // Select All button
        const allBtn = document.createElement('button');
        allBtn.textContent = 'All';
        allBtn.onclick = callbacks.onSelectAll;
        bar.appendChild(allBtn);

        // Clear All button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'None';
        clearBtn.onclick = callbacks.onClearAll;
        bar.appendChild(clearBtn);

        // Speed control
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

        // Time display
        const timeLabel = document.createElement('span');
        timeLabel.style.color = '#8a9ab0';
        timeLabel.style.marginLeft = '10px';
        timeLabel.textContent = `Time: ${(state.currentPosition / 250).toFixed(1)}s`;
        timeLabel.id = 'timeDisplay';
        bar.appendChild(timeLabel);

        return bar;
    },

    // Show loading
    showLoading: function() {
        document.getElementById('loadingIndicator').style.display = 'flex';
        document.getElementById('errorMessage').style.display = 'none';
    },

    // Hide loading
    hideLoading: function() {
        document.getElementById('loadingIndicator').style.display = 'none';
    },

    // Show error
    showError: function(message) {
        const errorEl = document.getElementById('errorMessage');
        errorEl.textContent = `❌ ${message}`;
        errorEl.style.display = 'block';
        this.hideLoading();
    },

    // Update speed display
    updateSpeedValue: function(speed) {
        const el = document.getElementById('speedValue');
        if (el) el.textContent = `${speed}x`;
    },

    // Update time display
    updateTimeDisplay: function(time) {
        const el = document.getElementById('timeDisplay');
        if (el) el.textContent = `Time: ${time.toFixed(1)}s`;
    },

    // Show notification
    showNotification: function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4a9eff'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
};