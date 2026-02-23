/**
 * app.js - Core Signal Application
 * Defines SignalApp class that ECGApp and EEGApp inherit from
 */

const API_BASE = 'http://127.0.0.1:5000';
const API_URL = API_BASE + '/api';

// ==================== SIGNAL APP BASE CLASS ====================
class SignalApp {
    constructor(signalType = 'medical') {
        this.signalType = signalType;
        this.signalData = null;
        this.displayData = null;

        // Channel state
        this.visibleChannels = [];
        this.channelColors = {};
        this.channelThicknesses = {};

        // Playback
        this.isPlaying = false;
        this.playbackInterval = null;
        this.currentPosition = 0;
        this.playbackSpeed = 1.0;
        this.viewportLength = 1000;

        // View / tab
        this.currentTab = 'channels';
        this.viewMode = 'combined';

        // Graph params
        this.xorChunkSize = 250;
        this.polarPeriod = 100;
        this.polarMode = 'cumulative';
        this.recurrenceThreshold = 0.5;

        // Color palette
        this.colors = [
            '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeead',
            '#ffcc5c', '#ff6f69', '#88d8b0', '#f9ca24', '#f0932b',
            '#eb4d4b', '#6ab04c', '#22a6b3', '#be2edd', '#4834d4'
        ];

        console.log(`✅ SignalApp (${signalType}) initialized`);
    }

    // ==================== UI HELPERS ====================
    showLoading(message = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.add('active');
            const span = overlay.querySelector('span');
            if (span) span.textContent = message;
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    notify(message, type = 'info') {
        const container = document.getElementById('notifContainer');
        if (!container) {
            console.log(`[${type}] ${message}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notif-item notif-${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    showError(message) {
        this.notify(message, 'error');
        console.error(message);
    }

    // ==================== BACKEND CHECK ====================
    async checkBackend() {
        try {
            const response = await fetch(`${API_URL}/health`);
            const data = await response.json();
            if (data.status === 'ok') {
                console.log('✅ Backend connected');
                return true;
            }
            return false;
        } catch (err) {
            console.warn('Backend offline:', err.message);
            return false;
        }
    }

    // ==================== FILE UPLOAD ====================
    setupFileUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        if (!uploadArea || !fileInput) return;

        uploadArea.addEventListener('click', () => fileInput.click());

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileUpload(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
        });
    }

    async handleFileUpload(file) {
        this.showLoading(`Uploading ${file.name}...`);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (result.status === 'success' && result.signal_data) {
                this.signalData = result.signal_data;
                this.displayData = JSON.parse(JSON.stringify(this.signalData));

                this.initializeChannels();
                this.showContent();
                this.updateChannelList();
                this.updateSelectors();
                this.renderCurrentTab();

                if (result.signal_data.sync_matrix) {
                    this.renderSyncMatrix();
                }

                this.notify(`Loaded: ${this.signalData.channels.length} channels`, 'success');
                return true;
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (err) {
            console.error('Upload error:', err);
            this.showError(err.message);
            return false;
        } finally {
            this.hideLoading();
        }
    }

    initializeChannels() {
        if (!this.signalData) return;

        this.visibleChannels = [];
        this.channelColors = {};
        this.channelThicknesses = {};

        this.signalData.channels.forEach((ch, idx) => {
            if (idx < 8) this.visibleChannels.push(idx);
            this.channelColors[idx] = this.colors[idx % this.colors.length];
            this.channelThicknesses[idx] = 1.5;
        });

        this.viewportLength = Math.min(1000, this.signalData.num_samples);
    }

    showContent() {
        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.classList.remove('hidden');

        const tabsContainer = document.getElementById('tabsContainer');
        if (tabsContainer) tabsContainer.style.display = 'flex';
    }

    // ==================== CHANNEL MANAGEMENT ====================
    updateChannelList() {
        const container = document.getElementById('channelList');
        if (!container || !this.signalData) return;

        container.innerHTML = this.signalData.channels.map((ch, idx) => {
            const visible = this.visibleChannels.includes(idx);
            const color = this.channelColors[idx];

            return `
                <div class="channel-item" style="border-left-color: ${color}">
                    <input type="checkbox" ${visible ? 'checked' : ''} 
                        onchange="window.app.toggleChannel(${idx}, this.checked)">
                    <span class="ch-label" title="${ch}">${ch.substring(0, 20)}${ch.length > 20 ? '...' : ''}</span>
                    <input type="color" value="${color}" 
                        onchange="window.app.setChannelColor(${idx}, this.value)" title="Color">
                    <input type="range" min="0.5" max="3" step="0.5" value="${this.channelThicknesses[idx]}" 
                        onchange="window.app.setChannelThickness(${idx}, parseFloat(this.value))" 
                        style="width:50px" title="Thickness">
                </div>
            `;
        }).join('');
    }

    updateSelectors() {
        if (!this.signalData) return;

        const channels = this.signalData.channels;
        const options = channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        const selectors = ['xorChannel', 'polarChannel', 'recChX', 'recChY', 'fftChannel'];

        selectors.forEach(id => {
            const selector = document.getElementById(id);
            if (selector) {
                selector.innerHTML = options;
                if (id === 'recChY' && channels.length > 1) selector.value = '1';
            }
        });
    }

    toggleChannel(idx, visible) {
        if (visible) {
            if (!this.visibleChannels.includes(idx)) this.visibleChannels.push(idx);
        } else {
            this.visibleChannels = this.visibleChannels.filter(i => i !== idx);
        }
        this.updateChannelList();
        if (this.currentTab === 'channels') this.renderMainPlot();
    }

    setChannelColor(idx, color) {
        this.channelColors[idx] = color;
        this.updateChannelList();
        if (this.currentTab === 'channels') this.renderMainPlot();
    }

    setChannelThickness(idx, thickness) {
        this.channelThicknesses[idx] = thickness;
        if (this.currentTab === 'channels') this.renderMainPlot();
    }

    selectAllChannels(show) {
        if (!this.signalData) return;
        this.visibleChannels = show ? this.signalData.channels.map((_, i) => i) : [];
        this.updateChannelList();
        if (this.currentTab === 'channels') this.renderMainPlot();
    }

    setViewMode(mode) {
        this.viewMode = mode;
        this.renderMainPlot();
    }

    // ==================== PLAYBACK ====================
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('playBtn');
        if (btn) btn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';

        if (this.isPlaying) {
            this.startPlayback();
        } else {
            this.stopPlayback();
        }
    }

    startPlayback() {
        if (this.playbackInterval) clearInterval(this.playbackInterval);

        const step = 20 * this.playbackSpeed;
        const maxPos = this.signalData.num_samples - this.viewportLength;

        this.playbackInterval = setInterval(() => {
            this.currentPosition += step;
            if (this.currentPosition >= maxPos) this.currentPosition = 0;

            if (this.currentTab === 'channels') {
                this.renderMainPlot();
            }
        }, 50);
    }

    stopPlayback() {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
    }

    resetPlayback() {
        this.isPlaying = false;
        this.currentPosition = 0;
        const btn = document.getElementById('playBtn');
        if (btn) btn.textContent = '▶ Play';
        this.stopPlayback();
        if (this.currentTab === 'channels') {
            this.renderMainPlot();
        }
    }

    // ==================== RENDERING (to be overridden) ====================
    renderCurrentTab() {
        console.warn('renderCurrentTab should be implemented by subclass');
    }

    renderMainPlot() {
        console.warn('renderMainPlot should be implemented by subclass');
    }

    renderSyncMatrix() {
        console.warn('renderSyncMatrix should be implemented by subclass');
    }

    async runAIAnalysis() {
        console.warn('runAIAnalysis should be implemented by subclass');
    }
}

// Make SignalApp globally available
window.SignalApp = SignalApp;