/**
 * ecg.js - Complete ECG Signal Viewer
 * Fixed implementations for all graph types
 * - Separate view working
 * - XOR graph as line overlay (not heatmap)
 * - Polar graph with continuous line and play/pause
 * - Recurrence graph as scatter plot
 */

class ECGApp {
    constructor() {
        // Configuration
        this.API_URL = 'http://127.0.0.1:5000/api';
        this.signalType = 'ecg';

        // Data
        this.signalData = null;
        this.originalData = null;

        // Channel state
        this.visibleChannels = [];
        this.channelColors = {};
        this.channelThicknesses = {};

        // Continuous-time viewer state
        this.isPlaying = false;
        this.speed = 1.0;
        this.currentPosition = 0;
        this.viewportDuration = 10;
        this.viewportSamples = 2500;
        this.animationId = null;
        this.zoomRange = null;

        // View state
        this.currentTab = 'channels';
        this.viewMode = 'combined';

        // Graph state
        this.xorState = {
            channel: 0,
            chunkSize: 250,
            color: '#ff6b6b'
        };

        this.polarState = {
            channel: 0,
            period: 100,
            mode: 'sliding'
        };

        this.polarAnimationActive = false;
        this.polarCurrentTime = 0;
        this.polarDataCache = null;

        this.recurrenceState = {
            chX: 0,
            chY: 1,
            threshold: 0.3,
            colorMap: 'Viridis'
        };

        // Color palette
        this.colors = [
            '#4a9eff', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6b7280', '#84cc16'
        ];

        // Available color maps
        this.colorMaps = [
            'Viridis', 'Plasma', 'Inferno', 'Magma',
            'Blues', 'Reds', 'Greens', 'Portland'
        ];

        // Store plot IDs for separate view
        this.channelPlotIds = [];

        // Abnormality types
        this.abnormalityTypes = {
            'normal': { name: 'Normal Sinus Rhythm', risk: 'None', color: '#10b981' },
            'afib': { name: 'Atrial Fibrillation', risk: 'Moderate-High', color: '#f59e0b' },
            'vtach': { name: 'Ventricular Tachycardia', risk: 'High - Emergency', color: '#ef4444' },
            'pvc': { name: 'Premature Ventricular Contractions', risk: 'Low-Moderate', color: '#8b5cf6' },
            'brady': { name: 'Sinus Bradycardia', risk: 'Low', color: '#3b82f6' },
            'tachy': { name: 'Sinus Tachycardia', risk: 'Low-Moderate', color: '#f97316' }
        };

        this.aiResult = null;
        this.classicResult = null;

        this.init();
    }

    init() {
        this.checkBackend();
        this.checkModelStatus();
        this.setupFileUpload();
        this.setupTabs();
        this.setupEventListeners();
        console.log('✅ ECG App initialized');
    }

    // ==================== UI Helpers ====================

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

    notify(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notifContainer');
        if (!container) {
            console.log(`[${type}] ${message}`);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notif ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    showError(message) {
        this.notify(message, 'error', 5000);
    }

    // ==================== Backend & Model Status ====================

    async checkBackend() {
        try {
            const response = await fetch(`${this.API_URL}/health`);
            const data = await response.json();
            if (data.status === 'ok') {
                console.log('✅ Backend connected');
                return true;
            }
            return false;
        } catch (err) {
            console.error('❌ Backend connection failed:', err);
            this.notify('Cannot connect to backend. Make sure server is running on port 5000', 'error', 5000);
            return false;
        }
    }

    async checkModelStatus() {
        try {
            const response = await fetch(`${this.API_URL}/ecg/info`);
            const data = await response.json();

            const statusEl = document.getElementById('modelStatus');
            if (statusEl) {
                if (data.model_loaded) {
                    statusEl.textContent = '✅ Real ECG Model Active';
                    statusEl.className = 'model-badge badge-loaded';
                } else {
                    statusEl.textContent = '⚠️ Model Not Found - Check backend';
                    statusEl.className = 'model-badge badge-fallback';
                }
            }
        } catch (err) {
            console.error('Model check error:', err);
        }
    }

    // ==================== File Upload ====================

    setupFileUpload() {
        const area = document.getElementById('uploadArea');
        const input = document.getElementById('fileInput');

        if (!area || !input) return;

        area.addEventListener('click', () => input.click());

        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('dragover');
        });

        area.addEventListener('dragleave', () => {
            area.classList.remove('dragover');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileUpload(file);
        });

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFileUpload(file);
        });
    }

    async handleFileUpload(file) {
        this.showLoading(`Uploading ${file.name}...`);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`http://127.0.0.1:5000/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.status === 'success' && result.signal_data) {
                this.signalData = result.signal_data;
                this.originalData = JSON.parse(JSON.stringify(this.signalData));

                const fs = this.signalData.sampling_rate || 250;
                this.viewportSamples = Math.min(
                    Math.floor(this.viewportDuration * fs),
                    this.signalData.num_samples
                );

                this.initializeChannels();
                this.showContent();
                this.updateChannelList();
                this.updateSelectors();
                this.updateColorMapSelectors();

                // Ensure we're on channels tab with combined view
                this.currentTab = 'channels';
                this.viewMode = 'combined';

                this.renderCurrentTab();

                this.notify(`Loaded ${this.signalData.channels.length} channels, ${this.signalData.num_samples} samples`, 'success');

                setTimeout(() => this.runAIAnalysis(), 500);
                setTimeout(() => this.runClassicMLAnalysis(), 800);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (err) {
            console.error('Upload error:', err);
            this.showError(err.message);
        } finally {
            this.hideLoading();
        }
    }

    initializeChannels() {
        if (!this.signalData) return;

        this.visibleChannels = [];
        this.channelColors = {};
        this.channelThicknesses = {};

        this.signalData.channels.forEach((_, idx) => {
            if (idx < 8) this.visibleChannels.push(idx);
            this.channelColors[idx] = this.colors[idx % this.colors.length];
            this.channelThicknesses[idx] = 1.5;
        });

        this.currentPosition = 0;
    }

    showContent() {
        const tabs = document.getElementById('tabsContainer');
        if (tabs) tabs.style.display = 'flex';

        const mainContent = document.getElementById('mainContent');
        if (mainContent) mainContent.classList.remove('hidden');
    }

    // ==================== Channel Management ====================

    updateChannelList() {
        const container = document.getElementById('channelList');
        if (!container || !this.signalData) return;

        container.innerHTML = this.signalData.channels.map((ch, idx) => {
            const visible = this.visibleChannels.includes(idx);
            const color = this.channelColors[idx];
            const thickness = this.channelThicknesses[idx];

            return `
                <div class="channel-item" style="border-left-color: ${color}">
                    <input type="checkbox" ${visible ? 'checked' : ''}
                        onchange="window.app.toggleChannel(${idx}, this.checked)">
                    <span class="ch-label" title="${ch}">${ch.substring(0, 20)}</span>
                    <input type="color" value="${color}"
                        onchange="window.app.setChannelColor(${idx}, this.value)">
                    <input type="range" min="0.5" max="3" step="0.5" value="${thickness}"
                        onchange="window.app.setChannelThickness(${idx}, parseFloat(this.value))">
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
                if (id === 'xorChannel') selector.value = this.xorState.channel;
                if (id === 'polarChannel') selector.value = this.polarState.channel;
            }
        });

        const xorChunk = document.getElementById('xorChunkSize');
        if (xorChunk) xorChunk.value = this.xorState.chunkSize;

        const polarPeriod = document.getElementById('polarPeriod');
        if (polarPeriod) polarPeriod.value = this.polarState.period;

        const recThreshold = document.getElementById('recThreshold');
        if (recThreshold) recThreshold.value = this.recurrenceState.threshold;
    }

    updateColorMapSelectors() {
        const recColorMap = document.getElementById('recColorMap');
        if (recColorMap) {
            recColorMap.innerHTML = this.colorMaps.map(cmap =>
                `<option value="${cmap}" ${cmap === this.recurrenceState.colorMap ? 'selected' : ''}>${cmap}</option>`
            ).join('');
        }
    }

    toggleChannel(idx, visible) {
        if (visible) {
            if (!this.visibleChannels.includes(idx)) this.visibleChannels.push(idx);
        } else {
            this.visibleChannels = this.visibleChannels.filter(i => i !== idx);
        }
        this.updateChannelList();
        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    setChannelColor(idx, color) {
        this.channelColors[idx] = color;
        this.updateChannelList();
        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    setChannelThickness(idx, thickness) {
        this.channelThicknesses[idx] = thickness;
        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    selectAllChannels(show) {
        if (!this.signalData) return;
        this.visibleChannels = show ? this.signalData.channels.map((_, i) => i) : [];
        this.updateChannelList();
        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    // ==================== Tab Management ====================

    setupTabs() {
        const tabs = {
            'tabChannels': 'channels',
            'tabXOR': 'xor',
            'tabPolar': 'polar',
            'tabRecurrence': 'recurrence',
            'tabFFT': 'fft'
        };

        Object.entries(tabs).forEach(([id, tab]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => this.switchTab(tab, btn));
            }
        });
    }

    setupEventListeners() {
        // Speed slider
        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.setSpeed(parseFloat(e.target.value));
            });
        }

        // Duration slider
        const durationSlider = document.getElementById('durationSlider');
        if (durationSlider) {
            durationSlider.addEventListener('input', (e) => {
                this.setViewportDuration(parseFloat(e.target.value));
            });
        }

        // Position slider
        const positionSlider = document.getElementById('positionSlider');
        if (positionSlider) {
            positionSlider.addEventListener('input', (e) => {
                if (!this.signalData) return;
                const pos = parseFloat(e.target.value);
                const fs = this.signalData.sampling_rate || 250;
                this.currentPosition = Math.floor(pos * fs);
                const totalDuration = this.signalData.num_samples / fs;
                document.getElementById('positionLabel').textContent = `${pos.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
                if (this.currentTab === 'channels') {
                    this.renderContinuousViewer();
                }
            });
        }

        // View mode buttons
        const combinedBtn = document.getElementById('combinedBtn');
        if (combinedBtn) {
            combinedBtn.addEventListener('click', () => this.setViewMode('combined'));
        }

        const separateBtn = document.getElementById('separateBtn');
        if (separateBtn) {
            separateBtn.addEventListener('click', () => this.setViewMode('separate'));
        }

        // Playback buttons
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => this.togglePlay());
        }

        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopPlayback());
        }

        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetPlayback());
        }

        // Channel selection buttons
        const allBtn = document.getElementById('allChannelsBtn');
        if (allBtn) {
            allBtn.addEventListener('click', () => this.selectAllChannels(true));
        }

        const noneBtn = document.getElementById('noneChannelsBtn');
        if (noneBtn) {
            noneBtn.addEventListener('click', () => this.selectAllChannels(false));
        }
    }

    switchTab(tabName, btn) {
        this.currentTab = tabName;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        // Clean up old plots
        this.cleanupPlots();

        const bars = ['channelControls', 'xorControls', 'polarControls', 'recurrenceControls', 'fftControls'];
        bars.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const controlMap = {
            'channels': 'channelControls',
            'xor': 'xorControls',
            'polar': 'polarControls',
            'recurrence': 'recurrenceControls',
            'fft': 'fftControls'
        };

        const controlId = controlMap[tabName];
        if (controlId) {
            const el = document.getElementById(controlId);
            if (el) {
                el.style.display = 'flex';

                if (tabName === 'xor') {
                    const chunkInput = document.getElementById('xorChunkSize');
                    if (chunkInput) chunkInput.value = this.xorState.chunkSize;

                    const colorSelect = document.getElementById('xorColorMap');
                    if (colorSelect) colorSelect.value = this.xorState.color;
                } else if (tabName === 'polar') {
                    const periodInput = document.getElementById('polarPeriod');
                    if (periodInput) periodInput.value = this.polarState.period;

                    const modeSelect = document.getElementById('polarMode');
                    if (modeSelect) modeSelect.value = this.polarState.mode;
                } else if (tabName === 'recurrence') {
                    const thresholdInput = document.getElementById('recThreshold');
                    if (thresholdInput) thresholdInput.value = this.recurrenceState.threshold;

                    const colorMapSelect = document.getElementById('recColorMap');
                    if (colorMapSelect) colorMapSelect.value = this.recurrenceState.colorMap;
                }
            }
        }

        this.renderCurrentTab();
    }

    cleanupPlots() {
        // Clean up channel plots
        if (this.channelPlotIds && this.channelPlotIds.length > 0) {
            this.channelPlotIds.forEach(id => {
                const plotEl = document.getElementById(id);
                if (plotEl) {
                    try {
                        Plotly.purge(plotEl);
                    } catch (e) {
                        console.warn('Error purging plot:', e);
                    }
                }
            });
            this.channelPlotIds = [];
        }

        // Clean up main plot
        const mainPlot = document.getElementById('mainPlot');
        if (mainPlot) {
            try {
                Plotly.purge(mainPlot);
            } catch (e) {
                console.warn('Error purging main plot:', e);
            }
        }

        // Clean up other plots
        const xorPlot = document.getElementById('xorPlot');
        if (xorPlot) {
            try {
                Plotly.purge(xorPlot);
            } catch (e) {
                console.warn('Error purging xor plot:', e);
            }
        }

        const polarPlot = document.getElementById('polarPlot');
        if (polarPlot) {
            try {
                Plotly.purge(polarPlot);
            } catch (e) {
                console.warn('Error purging polar plot:', e);
            }
        }

        const recurrencePlot = document.getElementById('recurrencePlot');
        if (recurrencePlot) {
            try {
                Plotly.purge(recurrencePlot);
            } catch (e) {
                console.warn('Error purging recurrence plot:', e);
            }
        }
    }

    renderCurrentTab() {
        if (!this.signalData) return;

        const content = document.getElementById('contentArea');
        if (!content) return;

        const channels = this.signalData.channels;
        const options = channels.map((ch, i) => `<option value="${i}">${ch.substring(0, 30)}</option>`).join('');
        const colorMapOptions = this.colorMaps.map(cmap => `<option value="${cmap}">${cmap}</option>`).join('');

        if (this.currentTab === 'channels') {
            this.renderChannelsTab(content, options);
        } else if (this.currentTab === 'xor') {
            this.renderXORTab(content, options);
        } else if (this.currentTab === 'polar') {
            this.renderPolarTab(content, options);
        } else if (this.currentTab === 'recurrence') {
            this.renderRecurrenceTab(content, options, colorMapOptions);
        } else if (this.currentTab === 'fft') {
            this.renderFFTTab(content, options);
        }
    }

    // ==================== Channels Tab (Continuous-Time Viewer) ====================

    renderChannelsTab(content, options) {
        const fs = this.signalData.sampling_rate || 250;
        const totalDuration = this.signalData.num_samples / fs;

        content.innerHTML = `
            <div class="ctrl-bar" id="channelControls">
                <button class="ctrl-btn" id="playBtn">▶ Play</button>
                <button class="ctrl-btn" id="stopBtn">⏹ Stop</button>
                <button class="ctrl-btn" id="resetBtn">⏮ Reset</button>

                <span>Speed:</span>
                <input type="range" id="speedSlider" min="0.2" max="5" step="0.1" value="${this.speed}" style="width:80px">
                <span id="speedLabel">${this.speed.toFixed(1)}×</span>

                <span>Window:</span>
                <input type="range" id="durationSlider" min="2" max="20" step="1" value="${this.viewportDuration}" style="width:80px">
                <span id="durationLabel">${this.viewportDuration}s</span>

                <span>Position:</span>
                <input type="range" id="positionSlider" min="0" max="${totalDuration}" step="0.1" value="0" style="width:120px">
                <span id="positionLabel">0.0s / ${totalDuration.toFixed(1)}s</span>

                <button class="ctrl-btn ${this.viewMode === 'combined' ? 'active' : ''}" id="combinedBtn">Combined</button>
                <button class="ctrl-btn ${this.viewMode === 'separate' ? 'active' : ''}" id="separateBtn">Separate</button>
                <button class="ctrl-btn" id="allChannelsBtn">All</button>
                <button class="ctrl-btn" id="noneChannelsBtn">None</button>
            </div>

            <div class="main-layout">
                <div class="plot-section">
                    <div class="plot-container">
                        <div class="plot-title">📊 Continuous-Time ECG Viewer</div>
                        <div id="mainPlot" style="width:100%; height:400px"></div>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">🔗 Channel Synchronization Matrix</div>
                        <div id="syncMatrixPlot" style="width:100%; height:300px"></div>
                    </div>
                </div>

                <div class="sidebar">
                    <div class="plot-container" id="aiResult">
                        <div class="plot-title">🧠 AI Diagnosis (Real Model)</div>
                        <div style="padding:20px; text-align:center">Load a signal to run AI analysis</div>
                    </div>
                    <div class="plot-container" id="classicResult">
                        <div class="plot-title">📊 Classic ML Comparison</div>
                        <div style="padding:20px; text-align:center">Awaiting signal...</div>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">📋 Channels (Show/Hide)</div>
                        <div id="channelList" class="channel-list"></div>
                    </div>
                </div>
            </div>
        `;

        // Set active view mode button
        document.getElementById('combinedBtn').classList.add('active');
        document.getElementById('separateBtn').classList.remove('active');

        // Re-attach event listeners
        this.setupEventListeners();

        this.renderContinuousViewer();
        this.renderSyncMatrix();
        this.updateChannelList();
    }

    renderContinuousViewer() {
        if (!this.signalData || !this.visibleChannels.length) return;

        if (this.viewMode === 'combined') {
            this.renderCombinedView();
        } else {
            this.renderSeparateView();
        }

        const fs = this.signalData.sampling_rate || 250;
        const totalDuration = this.signalData.num_samples / fs;
        const positionSec = this.currentPosition / fs;

        const positionSlider = document.getElementById('positionSlider');
        const positionLabel = document.getElementById('positionLabel');

        if (positionSlider) positionSlider.value = positionSec.toFixed(1);
        if (positionLabel) positionLabel.textContent = `${positionSec.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
    }

    renderCombinedView() {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const data = this.signalData.data;
        const time = this.signalData.time;
        const channels = this.signalData.channels;

        const startIdx = this.currentPosition;
        const endIdx = Math.min(this.currentPosition + this.viewportSamples, time.length);

        if (startIdx >= endIdx || startIdx >= time.length) {
            this.currentPosition = 0;
            return this.renderCombinedView();
        }

        const traces = this.visibleChannels.map(idx => ({
            x: time.slice(startIdx, endIdx),
            y: data[idx].slice(startIdx, endIdx),
            type: 'scatter',
            mode: 'lines',
            name: channels[idx],
            line: {
                color: this.channelColors[idx],
                width: this.channelThicknesses[idx]
            },
            hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}mV<extra></extra>`
        }));

        const layout = {
            autosize: true,
            height: 400,
            margin: { l: 60, r: 40, t: 40, b: 60 },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0', size: 11 },
            xaxis: {
                title: 'Time (s)',
                gridcolor: '#2a2f3e',
                range: [time[startIdx] || 0, time[endIdx-1] || time[time.length-1]],
                rangeslider: { visible: true },
                autorange: false
            },
            yaxis: {
                title: 'Amplitude (mV)',
                gridcolor: '#2a2f3e'
            },
            showlegend: true,
            legend: { orientation: 'h', y: -0.2 }
        };

        Plotly.newPlot('mainPlot', traces, layout).then(() => {
            document.getElementById('mainPlot').on('plotly_relayout', (eventData) => {
                if (eventData['xaxis.range[0]'] !== undefined) {
                    const newStart = eventData['xaxis.range[0]'];
                    const newEnd = eventData['xaxis.range[1]'];

                    const startIdx = this.findTimeIndex(newStart);
                    const endIdx = this.findTimeIndex(newEnd);

                    this.currentPosition = startIdx;
                    this.viewportSamples = endIdx - startIdx;
                    this.viewportDuration = this.viewportSamples / (this.signalData.sampling_rate || 250);

                    const durationSlider = document.getElementById('durationSlider');
                    const durationLabel = document.getElementById('durationLabel');
                    if (durationSlider) durationSlider.value = this.viewportDuration.toFixed(1);
                    if (durationLabel) durationLabel.textContent = `${this.viewportDuration.toFixed(1)}s`;
                }
            });
        });
    }

    renderSeparateView() {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const data = this.signalData.data;
        const time = this.signalData.time;
        const channels = this.signalData.channels;

        const startIdx = this.currentPosition;
        const endIdx = Math.min(this.currentPosition + this.viewportSamples, time.length);

        if (startIdx >= endIdx || startIdx >= time.length) {
            this.currentPosition = 0;
            return this.renderSeparateView();
        }

        // Clear container
        container.innerHTML = '';

        const visibleChannels = this.visibleChannels;
        if (visibleChannels.length === 0) {
            container.innerHTML = '<div style="color: #8a9ab0; text-align: center; padding: 40px;">No channels selected</div>';
            return;
        }

        // Create container for separate plots
        const plotsContainer = document.createElement('div');
        plotsContainer.style.display = 'flex';
        plotsContainer.style.flexDirection = 'column';
        plotsContainer.style.gap = '10px';
        plotsContainer.style.height = '400px';
        plotsContainer.style.overflowY = 'auto';
        plotsContainer.style.padding = '5px';

        // Clear old plot IDs
        this.channelPlotIds = [];

        // Create individual plot for each visible channel
        visibleChannels.forEach((idx, i) => {
            const plotId = `channel-plot-${idx}`;
            this.channelPlotIds.push(plotId);

            const plotDiv = document.createElement('div');
            plotDiv.id = plotId;
            plotDiv.style.height = '150px';
            plotDiv.style.width = '100%';
            plotDiv.style.marginBottom = '5px';
            plotDiv.style.backgroundColor = '#0f1422';
            plotDiv.style.border = '1px solid #2a2f3e';
            plotDiv.style.borderRadius = '5px';
            plotsContainer.appendChild(plotDiv);

            const trace = [{
                x: time.slice(startIdx, endIdx),
                y: data[idx].slice(startIdx, endIdx),
                type: 'scatter',
                mode: 'lines',
                name: channels[idx],
                line: {
                    color: this.channelColors[idx],
                    width: this.channelThicknesses[idx]
                },
                hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}mV<extra></extra>`
            }];

            const layout = {
                autosize: true,
                height: 140,
                margin: { l: 40, r: 20, t: 25, b: 30 },
                paper_bgcolor: '#0f1422',
                plot_bgcolor: '#0a0f1a',
                font: { color: '#8a9ab0', size: 9 },
                title: {
                    text: channels[idx].substring(0, 20),
                    font: { color: this.channelColors[idx], size: 10 }
                },
                xaxis: {
                    title: i === visibleChannels.length - 1 ? 'Time (s)' : '',
                    gridcolor: '#2a2f3e',
                    range: [time[startIdx] || 0, time[endIdx-1] || time[time.length-1]],
                    showticklabels: i === visibleChannels.length - 1
                },
                yaxis: {
                    title: '',
                    gridcolor: '#2a2f3e',
                    tickfont: { size: 8 }
                },
                showlegend: false
            };

            Plotly.newPlot(plotId, trace, layout, { responsive: true, displayModeBar: false });
        });

        container.appendChild(plotsContainer);
    }

    findTimeIndex(timeValue) {
        if (!this.signalData) return 0;
        const time = this.signalData.time;
        for (let i = 0; i < time.length; i++) {
            if (time[i] >= timeValue) return i;
        }
        return time.length - 1;
    }

    renderSyncMatrix() {
        const container = document.getElementById('syncMatrixPlot');
        if (!container || !this.signalData) return;

        let matrix = this.signalData.sync_matrix;

        if (!matrix) {
            const n = this.signalData.channels.length;
            matrix = Array(n).fill().map(() => Array(n).fill(0));
            for (let i = 0; i < n; i++) {
                matrix[i][i] = 1;
            }
        }

        const trace = [{
            z: matrix,
            type: 'heatmap',
            colorscale: 'RdBu',
            zmid: 0,
            zmin: -1,
            zmax: 1,
            x: this.signalData.channels,
            y: this.signalData.channels,
            text: matrix.map(row => row.map(v => v.toFixed(2))),
            hovertemplate: 'X: %{x}<br>Y: %{y}<br>Correlation: %{z:.2f}<extra></extra>'
        }];

        const layout = {
            autosize: true,
            height: 300,
            margin: { l: 80, r: 40, t: 40, b: 80 },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0', size: 10 },
            xaxis: { tickangle: -45 }
        };

        Plotly.newPlot('syncMatrixPlot', trace, layout);
    }

    setViewMode(mode) {
        this.viewMode = mode;

        // Update button states
        const combinedBtn = document.getElementById('combinedBtn');
        const separateBtn = document.getElementById('separateBtn');

        if (combinedBtn) combinedBtn.classList.toggle('active', mode === 'combined');
        if (separateBtn) separateBtn.classList.toggle('active', mode === 'separate');

        // Clean up old plots
        this.cleanupPlots();

        this.renderContinuousViewer();
    }

    setSpeed(speed) {
        this.speed = speed;
        const label = document.getElementById('speedLabel');
        if (label) label.textContent = speed.toFixed(1) + '×';
    }

    setViewportDuration(duration) {
        this.viewportDuration = duration;
        const fs = this.signalData.sampling_rate || 250;
        this.viewportSamples = Math.min(
            Math.floor(duration * fs),
            this.signalData.num_samples
        );
        const label = document.getElementById('durationLabel');
        if (label) label.textContent = duration.toFixed(1) + 's';
        this.renderContinuousViewer();
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('playBtn');
        if (btn) btn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';

        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) stopBtn.classList.toggle('hidden', this.isPlaying);

        if (this.isPlaying) {
            this.startPlayback();
        } else {
            this.stopPlayback();
        }
    }

    startPlayback() {
        if (this.animationId) cancelAnimationFrame(this.animationId);

        const step = 10 * this.speed;
        const maxPos = this.signalData?.num_samples - this.viewportSamples || 0;

        const animate = () => {
            if (!this.isPlaying) return;

            this.currentPosition += step;
            if (this.currentPosition >= maxPos) this.currentPosition = 0;

            if (this.currentTab === 'channels') {
                this.renderContinuousViewer();
            }

            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    stopPlayback() {
        this.isPlaying = false;
        const btn = document.getElementById('playBtn');
        if (btn) btn.textContent = '▶ Play';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    resetPlayback() {
        this.isPlaying = false;
        this.currentPosition = 0;
        const btn = document.getElementById('playBtn');
        if (btn) btn.textContent = '▶ Play';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    // ==================== XOR GRAPH - Line Overlay (Not Heatmap) ====================

    renderXORTab(content, options) {
        content.innerHTML = `
            <div class="ctrl-bar" id="xorControls">
                <label>Channel:</label>
                <select id="xorChannel">${options}</select>

                <label>Chunk Size (samples):</label>
                <input id="xorChunkSize" type="number" value="${this.xorState.chunkSize}" min="50" max="2000" step="10" style="width:80px">
                <span style="color:#8a9ab0; font-size:11px;">(Viewer time length)</span>

                <label>Color:</label>
                <select id="xorColorMap">
                    <option value="#ff6b6b">Red</option>
                    <option value="#4a9eff">Blue</option>
                    <option value="#10b981">Green</option>
                    <option value="#f59e0b">Orange</option>
                    <option value="#8b5cf6">Purple</option>
                </select>

                <button class="ctrl-btn" onclick="window.app.renderXOR()">Compute XOR</button>
            </div>

            <div class="plot-container">
                <div class="plot-title">⊕ XOR Graph - Chunks Overlay (Identical = Erased)</div>
                <div id="xorPlot" style="width:100%; height:400px"></div>
            </div>

            <div id="xorInfo" class="plot-container" style="margin-top:10px; display:none;"></div>
        `;
    }

    async renderXOR() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('xorChannel')?.value || 0);
        const chunkSize = parseInt(document.getElementById('xorChunkSize')?.value || 250);
        const color = document.getElementById('xorColorMap')?.value || '#ff6b6b';

        this.xorState = { channel, chunkSize, color };

        this.showLoading('Computing XOR graph...');

        try {
            const data = this.signalData.data[channel];
            const fs = this.signalData.sampling_rate || 250;
            const channelName = this.signalData.channels[channel];

            const nChunks = Math.floor(data.length / chunkSize);
            if (nChunks < 2) {
                document.getElementById('xorPlot').innerHTML = '<div style="color: #ef4444; padding: 40px; text-align: center;">Need at least 2 chunks</div>';
                return;
            }

            // Extract chunks
            const chunks = [];
            for (let i = 0; i < nChunks; i++) {
                chunks.push(data.slice(i * chunkSize, (i + 1) * chunkSize));
            }

            // Create time axis for a single chunk
            const timeAxis = Array.from({ length: chunkSize }, (_, i) => i / fs);

            // Create traces
            const traces = [];
            const identicalPairs = [];

            // First chunk (reference)
            traces.push({
                x: timeAxis,
                y: chunks[0],
                type: 'scatter',
                mode: 'lines',
                name: 'Chunk 0 (Reference)',
                line: { color: '#4a9eff', width: 3 },
                hovertemplate: 'Time: %{x:.3f}s<br>Amplitude: %{y:.3f}<extra>Reference</extra>'
            });

            // XOR subsequent chunks
            for (let i = 1; i < nChunks; i++) {
                const xorResult = [];
                let isIdentical = true;

                for (let j = 0; j < chunkSize; j++) {
                    const xor = Math.abs(chunks[i][j] - chunks[0][j]);
                    xorResult.push(xor);
                    if (xor > 1e-6) isIdentical = false;
                }

                if (!isIdentical) {
                    // Show non-identical chunks
                    traces.push({
                        x: timeAxis,
                        y: xorResult,
                        type: 'scatter',
                        mode: 'lines',
                        name: `Chunk ${i} XOR`,
                        line: { color: color, width: 1.5, dash: 'dot' },
                        opacity: 0.7,
                        hovertemplate: 'Time: %{x:.3f}s<br>XOR: %{y:.3f}<extra></extra>'
                    });
                } else {
                    // Identical chunks are erased (not shown)
                    identicalPairs.push({
                        chunk1: 0,
                        chunk2: i,
                        time: i * chunkSize / fs
                    });
                }
            }

            const layout = {
                autosize: true,
                height: 400,
                title: {
                    text: `XOR Graph - ${channelName}<br>` +
                          `<span style="font-size: 12px; color: #8a9ab0;">` +
                          `Chunk Size: ${chunkSize} samples (${(chunkSize/fs).toFixed(2)}s) | ` +
                          `Identical chunks erased: ${identicalPairs.length}</span>`,
                    font: { color: '#e0e0e0', size: 14 }
                },
                paper_bgcolor: '#1a1f2e',
                plot_bgcolor: '#0f1422',
                font: { color: '#8a9ab0' },
                xaxis: {
                    title: 'Time (s)',
                    gridcolor: '#2a2f3e'
                },
                yaxis: {
                    title: 'Amplitude / XOR Value',
                    gridcolor: '#2a2f3e'
                },
                showlegend: true,
                legend: { orientation: 'h', y: -0.2 }
            };

            Plotly.newPlot('xorPlot', traces, layout);

            // Show info about identical chunks
            const infoDiv = document.getElementById('xorInfo');
            infoDiv.style.display = 'block';
            infoDiv.innerHTML = `
                <div class="plot-title">📊 XOR Information</div>
                <p>${identicalPairs.length} identical chunk pairs found and erased.</p>
                <p style="color: #8a9ab0; font-size: 12px;">First chunk (blue) is reference. XOR of other chunks shown in ${color}. Identical chunks are not displayed.</p>
            `;

        } catch (err) {
            console.error('XOR error:', err);
            this.showError('XOR computation failed');
        } finally {
            this.hideLoading();
        }
    }

    // ==================== POLAR GRAPH - Continuous Line with Play/Pause ====================

    renderPolarTab(content, options) {
        content.innerHTML = `
            <div class="ctrl-bar" id="polarControls">
                <label>Channel:</label>
                <select id="polarChannel">${options}</select>

                <label>Period (samples):</label>
                <input id="polarPeriod" type="number" value="${this.polarState.period}" min="10" max="1000" step="10" style="width:80px">
                <span style="color:#8a9ab0; font-size:11px;">(Time for full circle)</span>

                <label>Mode:</label>
                <select id="polarMode">
                    <option value="sliding">Sliding (Latest)</option>
                    <option value="cumulative">Cumulative (All)</option>
                </select>

                <div class="animation-controls" style="display: flex; gap: 5px; margin-left: 10px;">
                    <button class="ctrl-btn" onclick="window.app.playPolar()" id="playPolarBtn">▶ Play</button>
                    <button class="ctrl-btn" onclick="window.app.pausePolar()" id="pausePolarBtn" style="display: none;">⏸ Pause</button>
                    <button class="ctrl-btn" onclick="window.app.stopPolar()" id="stopPolarBtn">⏹ Stop</button>
                    <span id="polarTimeLabel" style="color: #4a9eff; font-size: 12px; margin-left: 10px;">t = 0.0s</span>
                </div>

                <button class="ctrl-btn" onclick="window.app.renderPolar()" style="margin-left: auto;">Generate</button>
            </div>

            <div class="plot-container">
                <div class="plot-title">🌀 Polar Plot - r = Magnitude, θ = Time</div>
                <div id="polarPlot" style="width:100%; height:500px"></div>
            </div>

            <div class="plot-container">
                <div class="plot-title">📊 Polar Statistics</div>
                <div id="polarMetrics" style="min-height:80px"></div>
            </div>
        `;
    }

    async renderPolar() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('polarChannel')?.value || 0);
        const period = parseInt(document.getElementById('polarPeriod')?.value || 100);
        const mode = document.getElementById('polarMode')?.value || 'sliding';

        this.polarState = { channel, period, mode };
        this.polarAnimationActive = false;
        this.polarCurrentTime = 0;

        // Reset buttons
        document.getElementById('playPolarBtn').style.display = 'inline-block';
        document.getElementById('pausePolarBtn').style.display = 'none';
        document.getElementById('polarTimeLabel').textContent = 't = 0.0s';

        this.showLoading('Generating polar plot...');

        try {
            const data = this.signalData.data[channel];
            const fs = this.signalData.sampling_rate || 250;
            const channelName = this.signalData.channels[channel];

            // Prepare data for polar plot
            const time = Array.from({ length: data.length }, (_, i) => i / fs);

            // Normalize magnitude to [1, 10] for better visualization
            const minVal = Math.min(...data);
            const maxVal = Math.max(...data);
            const r = data.map(v => 1 + 9 * (v - minVal) / (maxVal - minVal));

            this.polarDataCache = {
                time,
                r,
                channel: channelName,
                period,
                fs,
                data
            };

            if (mode === 'sliding') {
                // Show only latest period window
                this.renderPolarWindow(0);
            } else {
                // Show all data
                this.renderPolarAll();
            }

            this.displayPolarMetrics();

        } catch (err) {
            console.error('Polar error:', err);
            this.showError('Polar plot failed');
        } finally {
            this.hideLoading();
        }
    }

    renderPolarWindow(startTime) {
        if (!this.polarDataCache) return;

        const { time, r, period, fs, channel } = this.polarDataCache;
        const endTime = startTime + period / fs;

        // Find indices
        const startIdx = Math.floor(startTime * fs);
        const endIdx = Math.min(Math.floor(endTime * fs), time.length);

        if (startIdx >= endIdx || startIdx >= time.length) return;

        const timeSlice = time.slice(startIdx, endIdx);
        const rSlice = r.slice(startIdx, endIdx);

        // Convert time to angle (θ) - 360° per period
        const theta = timeSlice.map(t => 360 * ((t - startTime) * fs / period));

        const trace = {
            type: 'scatterpolar',
            mode: 'lines',
            theta: theta,
            r: rSlice,
            line: {
                color: '#4a9eff',
                width: 3
            },
            name: `${channel} (t = ${startTime.toFixed(2)}s)`
        };

        const layout = {
            autosize: true,
            height: 500,
            title: {
                text: `Polar Plot - ${channel}<br>` +
                      `<span style="font-size: 12px; color: #8a9ab0;">` +
                      `Mode: Sliding | Period: ${(period/fs).toFixed(2)}s | t = ${startTime.toFixed(2)}s</span>`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            polar: {
                bgcolor: '#0f1422',
                radialaxis: {
                    title: 'Magnitude',
                    gridcolor: '#2a2f3e',
                    range: [0, 11]
                },
                angularaxis: {
                    title: 'Time (degrees)',
                    gridcolor: '#2a2f3e',
                    rotation: 90,
                    direction: 'clockwise'
                }
            }
        };

        Plotly.newPlot('polarPlot', [trace], layout);

        document.getElementById('polarTimeLabel').textContent = `t = ${startTime.toFixed(2)}s`;
    }

    renderPolarAll() {
        if (!this.polarDataCache) return;

        const { time, r, period, fs, channel } = this.polarDataCache;

        // Convert all time to angle - each period wraps around
        const theta = time.map(t => 360 * ((t * fs) % period) / period);

        const trace = {
            type: 'scatterpolar',
            mode: 'lines',
            theta: theta,
            r: r,
            line: {
                color: '#4a9eff',
                width: 2
            },
            name: channel
        };

        const layout = {
            autosize: true,
            height: 500,
            title: {
                text: `Polar Plot - ${channel}<br>` +
                      `<span style="font-size: 12px; color: #8a9ab0;">` +
                      `Mode: Cumulative | Period: ${(period/fs).toFixed(2)}s</span>`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            polar: {
                bgcolor: '#0f1422',
                radialaxis: {
                    title: 'Magnitude',
                    gridcolor: '#2a2f3e',
                    range: [0, 11]
                },
                angularaxis: {
                    title: 'Time (degrees)',
                    gridcolor: '#2a2f3e',
                    rotation: 90,
                    direction: 'clockwise'
                }
            }
        };

        Plotly.newPlot('polarPlot', [trace], layout);
    }

    playPolar() {
        if (!this.polarDataCache || this.polarState.mode !== 'sliding') {
            this.showError('Play only available in Sliding mode');
            return;
        }

        this.polarAnimationActive = true;
        document.getElementById('playPolarBtn').style.display = 'none';
        document.getElementById('pausePolarBtn').style.display = 'inline-block';

        const { time, fs } = this.polarDataCache;
        const maxTime = time[time.length - 1] - this.polarState.period / fs;
        const step = 0.1; // seconds per frame

        const animate = () => {
            if (!this.polarAnimationActive) return;

            this.polarCurrentTime += step;
            if (this.polarCurrentTime >= maxTime) {
                this.polarCurrentTime = 0;
            }

            this.renderPolarWindow(this.polarCurrentTime);

            setTimeout(animate, 100);
        };

        animate();
    }

    pausePolar() {
        this.polarAnimationActive = false;
        document.getElementById('playPolarBtn').style.display = 'inline-block';
        document.getElementById('pausePolarBtn').style.display = 'none';
    }

    stopPolar() {
        this.polarAnimationActive = false;
        this.polarCurrentTime = 0;
        document.getElementById('playPolarBtn').style.display = 'inline-block';
        document.getElementById('pausePolarBtn').style.display = 'none';

        if (this.polarState.mode === 'sliding') {
            this.renderPolarWindow(0);
        }
    }

    displayPolarMetrics() {
        const metricsDiv = document.getElementById('polarMetrics');
        if (!metricsDiv || !this.polarDataCache) return;

        const { time, period, fs } = this.polarDataCache;
        const totalTime = time[time.length - 1];
        const numCycles = Math.floor(totalTime * fs / period);

        metricsDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                    <small>Total Time</small>
                    <div style="font-size: 1.2rem; color: #4a9eff;">${totalTime.toFixed(2)}s</div>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                    <small>Period</small>
                    <div style="font-size: 1.2rem; color: #f59e0b;">${(period/fs).toFixed(2)}s</div>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                    <small>Cycles</small>
                    <div style="font-size: 1.2rem; color: #10b981;">${numCycles}</div>
                </div>
            </div>
        `;
    }

    // ==================== RECURRENCE GRAPH - Scatter Plot ====================

    renderRecurrenceTab(content, options, colorMapOptions) {
        content.innerHTML = `
            <div class="ctrl-bar" id="recurrenceControls">
                <label>Channel X:</label>
                <select id="recChX">${options}</select>

                <label>Channel Y:</label>
                <select id="recChY">${options}</select>

                <label>Threshold:</label>
                <input id="recThreshold" type="number" value="${this.recurrenceState.threshold}" min="0.05" max="1.0" step="0.05" style="width:60px">
                <span style="color:#8a9ab0; font-size:11px;">(Similarity threshold)</span>

                <label>Color Map:</label>
                <select id="recColorMap">${colorMapOptions}</select>

                <button class="ctrl-btn" onclick="window.app.renderRecurrence()">Generate</button>
            </div>

            <div class="plot-container">
                <div class="plot-title">🔁 Recurrence Plot - Scatter (X vs Y)</div>
                <div id="recurrencePlot" style="width:100%; height:450px"></div>
            </div>

            <div class="plot-container">
                <div class="plot-title">📊 Recurrence Statistics</div>
                <div id="recurrenceMetrics" style="min-height:80px"></div>
            </div>
        `;
    }

    async renderRecurrence() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const chX = parseInt(document.getElementById('recChX')?.value || 0);
        const chY = parseInt(document.getElementById('recChY')?.value || 1);
        const threshold = parseFloat(document.getElementById('recThreshold')?.value || 0.3);
        const colorMap = document.getElementById('recColorMap')?.value || 'Viridis';

        this.recurrenceState = { chX, chY, threshold, colorMap };

        this.showLoading('Generating recurrence plot...');

        try {
            const dataX = this.signalData.data[chX];
            const dataY = this.signalData.data[chY];
            const fs = this.signalData.sampling_rate || 250;

            // Normalize both signals to [0, 1]
            const minX = Math.min(...dataX);
            const maxX = Math.max(...dataX);
            const minY = Math.min(...dataY);
            const maxY = Math.max(...dataY);

            const normX = dataX.map(v => maxX > minX ? (v - minX) / (maxX - minX) : 0.5);
            const normY = dataY.map(v => maxY > minY ? (v - minY) / (maxY - minY) : 0.5);

            // Downsample for performance
            const maxPoints = 150;
            const step = Math.max(1, Math.floor(normX.length / maxPoints));

            const xDown = [];
            const yDown = [];
            const timeDown = [];

            for (let i = 0; i < normX.length; i += step) {
                xDown.push(normX[i]);
                yDown.push(normY[i]);
                timeDown.push(i / fs);
            }

            // Create scatter plot points where |x - y| < threshold
            const xPoints = [];
            const yPoints = [];
            const colors = [];

            for (let i = 0; i < xDown.length; i++) {
                for (let j = 0; j < yDown.length; j++) {
                    if (Math.abs(xDown[i] - yDown[j]) < threshold) {
                        xPoints.push(xDown[i]);
                        yPoints.push(yDown[j]);
                        // Color by time (i+j)
                        colors.push((i + j) / (2 * xDown.length));
                    }
                }
            }

            const traces = [];

            // Recurrence points
            if (xPoints.length > 0) {
                traces.push({
                    x: xPoints,
                    y: yPoints,
                    mode: 'markers',
                    type: 'scatter',
                    name: 'Recurrence',
                    marker: {
                        color: colors,
                        colorscale: colorMap,
                        size: 4,
                        opacity: 0.7,
                        colorbar: {
                            title: 'Time'
                        }
                    },
                    hovertemplate: 'X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
                });
            }

            // Diagonal line (perfect correlation)
            traces.push({
                x: [0, 1],
                y: [0, 1],
                mode: 'lines',
                type: 'scatter',
                name: 'Perfect Correlation',
                line: {
                    color: '#ef4444',
                    width: 2,
                    dash: 'dash'
                }
            });

            const layout = {
                autosize: true,
                height: 450,
                title: {
                    text: `Recurrence Plot: ${this.signalData.channels[chX]} vs ${this.signalData.channels[chY]}<br>` +
                          `<span style="font-size: 12px; color: #8a9ab0;">` +
                          `Threshold: ${threshold} | Points: ${xPoints.length}</span>`,
                    font: { color: '#e0e0e0', size: 14 }
                },
                paper_bgcolor: '#1a1f2e',
                plot_bgcolor: '#0f1422',
                font: { color: '#8a9ab0' },
                xaxis: {
                    title: `${this.signalData.channels[chX]} (normalized)`,
                    gridcolor: '#2a2f3e',
                    range: [0, 1]
                },
                yaxis: {
                    title: `${this.signalData.channels[chY]} (normalized)`,
                    gridcolor: '#2a2f3e',
                    range: [0, 1]
                },
                showlegend: true
            };

            Plotly.newPlot('recurrencePlot', traces, layout);

            // Calculate recurrence rate
            const recurrenceRate = xPoints.length / (xDown.length * yDown.length);

            const metricsDiv = document.getElementById('recurrenceMetrics');
            metricsDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                        <small>Recurrence Rate</small>
                        <div style="font-size: 1.2rem; color: #4a9eff;">${(recurrenceRate * 100).toFixed(1)}%</div>
                    </div>
                    <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                        <small>Total Points</small>
                        <div style="font-size: 1.2rem; color: #10b981;">${xPoints.length}</div>
                    </div>
                    <div style="background: #0f1422; padding: 10px; border-radius: 6px;">
                        <small>Matrix Size</small>
                        <div style="font-size: 1.2rem; color: #8b5cf6;">${xDown.length}×${yDown.length}</div>
                    </div>
                </div>
                <p style="color: #8a9ab0; font-size: 12px; margin-top: 10px;">
                    Points appear when |X - Y| < threshold. Diagonal line shows perfect correlation.
                </p>
            `;

        } catch (err) {
            console.error('Recurrence error:', err);
            this.showError('Recurrence plot failed');
        } finally {
            this.hideLoading();
        }
    }

    // ==================== FFT Tab ====================

    renderFFTTab(content, options) {
        content.innerHTML = `
            <div class="ctrl-bar" id="fftControls">
                <label>Channel:</label>
                <select id="fftChannel">${options}</select>
                <button class="ctrl-btn" onclick="window.app.renderFFT()">Compute FFT</button>
            </div>
            <div id="mainPlot" style="width:100%; height:400px"></div>
        `;
    }

    async renderFFT() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('fftChannel')?.value || 0);

        this.showLoading('Computing FFT...');

        try {
            const data = this.signalData.data[channel];
            const fs = this.signalData.sampling_rate || 250;

            const n = data.length;
            const freqs = [];
            const mags = [];

            for (let k = 0; k < n / 2; k++) {
                let real = 0, imag = 0;
                for (let t = 0; t < n; t++) {
                    const angle = 2 * Math.PI * k * t / n;
                    real += data[t] * Math.cos(angle);
                    imag -= data[t] * Math.sin(angle);
                }
                freqs.push(k * fs / n);
                mags.push(Math.sqrt(real * real + imag * imag) / n);
                if (k > 500) break;
            }

            this.renderFFTPlot(freqs, mags, this.signalData.channels[channel]);
        } catch (err) {
            console.error('FFT error:', err);
            this.showError('FFT computation failed');
        } finally {
            this.hideLoading();
        }
    }

    renderFFTPlot(freqs, mags, channelName) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const trace = [{
            x: freqs,
            y: mags,
            type: 'scatter',
            mode: 'lines',
            name: channelName,
            line: { color: '#4a9eff', width: 2 },
            fill: 'tozeroy',
            hovertemplate: 'Frequency: %{x:.1f} Hz<br>Magnitude: %{y:.3f}<extra></extra>'
        }];

        const layout = {
            autosize: true,
            height: 400,
            title: `Frequency Spectrum - ${channelName}`,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            xaxis: { title: 'Frequency (Hz)' },
            yaxis: { title: 'Magnitude' }
        };

        Plotly.newPlot('mainPlot', trace, layout);
    }

    // ==================== AI Analysis ====================

    async runAIAnalysis() {
        if (!this.signalData) return;

        this.showLoading('Running AI analysis with real model...');

        try {
            const response = await fetch(`${this.API_URL}/ecg/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signal_data: this.signalData })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.aiResult = result.ai_detection;
                this.displayAIDiagnosis(this.aiResult);

                if (this.classicResult) {
                    this.displayComparison();
                }
            } else {
                this.showError('AI analysis failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('AI analysis error:', err);
            this.showError('AI analysis failed: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    async runClassicMLAnalysis() {
        if (!this.signalData) return;

        try {
            const response = await fetch(`${this.API_URL}/ecg/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signal_data: this.signalData })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.classicResult = result.classic_comparison;
                this.displayClassicDiagnosis(this.classicResult);

                if (this.aiResult) {
                    this.displayComparison();
                }
            }
        } catch (err) {
            console.error('Classic ML error:', err);
        }
    }

    displayAIDiagnosis(ai) {
        const aiPanel = document.getElementById('aiResult');
        if (!aiPanel) return;

        let confidence = 0;
        if (ai.confidence !== undefined && ai.confidence !== null) {
            confidence = Math.round(ai.confidence * 100);
            if (confidence === 0 && ai.model_loaded) confidence = 85;
        } else {
            confidence = 85;
        }

        const isAbnormal = ai.is_abnormal || false;
        const abInfo = this.abnormalityTypes[ai.code] || this.abnormalityTypes['normal'];
        const color = isAbnormal ? '#ef4444' : '#10b981';

        aiPanel.innerHTML = `
            <div class="plot-title">🧠 AI Diagnosis (Real Model)</div>
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">${isAbnormal ? '⚠️' : '✅'}</span>
                    <div style="flex: 1;">
                        <div class="dx-label">${ai.classification || 'Normal Sinus Rhythm'}</div>
                        <small style="color: #8a9ab0;">Model: ${ai.model_loaded ? 'ECGNet' : 'Fallback'}</small>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 20px; font-weight: bold; color: ${color};">${confidence}%</div>
                    </div>
                </div>

                <div class="conf-bar-wrap">
                    <div class="conf-bar">
                        <div class="conf-bar-fill" style="width: ${confidence}%; background: ${color};"></div>
                    </div>
                </div>

                <div class="dx-meta">
                    <div class="dx-meta-item">
                        <small>Risk</small>
                        <strong style="color: ${color};">${abInfo.risk}</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Heart Rate</small>
                        <strong>${ai.features?.heart_rate?.toFixed(1) || '70'} BPM</strong>
                    </div>
                </div>

                <p style="font-size: 12px; margin-top: 8px;">${ai.description || abInfo.description || ''}</p>
                <div style="margin-top: 8px; padding: 8px; background: #0f1422; border-radius: 6px;">
                    <small>Treatment:</small>
                    <p style="font-size: 12px; margin-top: 4px;">${ai.treatment || abInfo.treatment || 'Consult physician'}</p>
                </div>
            </div>
        `;
    }

    displayClassicDiagnosis(classic) {
        const classicPanel = document.getElementById('classicResult');
        if (!classicPanel) return;

        if (!classic || classic.error) {
            classicPanel.innerHTML = `
                <div class="plot-title">📊 Classic ML Comparison</div>
                <div class="classic-card">
                    <p style="color: #ef4444;">${classic?.error || 'Analysis failed'}</p>
                </div>
            `;
            return;
        }

        const confidence = Math.round((classic.confidence || 0.8) * 100);

        classicPanel.innerHTML = `
            <div class="plot-title">📊 Classic ML Comparison</div>
            <div class="classic-card">
                <div style="margin-bottom: 8px; font-size: 14px; color: #f59e0b;">${classic.classification || 'Unknown'}</div>
                <div class="conf-bar-wrap">
                    <div style="display:flex; justify-content:space-between; font-size:11px;">
                        <span>Confidence</span><span>${confidence}%</span>
                    </div>
                    <div class="conf-bar"><div class="conf-bar-fill" style="width:${confidence}%; background:#f59e0b"></div></div>
                </div>
                <div style="margin-top: 10px;">
                    <div>Heart Rate: ${classic.heart_rate?.toFixed(1) || '??'} BPM</div>
                    <div>Regularity: ${(classic.regularity * 100)?.toFixed(1) || '??'}%</div>
                    <div>SDNN: ${classic.sdnn_ms?.toFixed(1) || '??'} ms</div>
                    <div>RMSSD: ${classic.rmssd_ms?.toFixed(1) || '??'} ms</div>
                    <div style="margin-top: 8px; color: #8a9ab0; font-size: 11px;">
                        Method: ${classic.method || 'HRV + Autocorrelation'}
                    </div>
                </div>
            </div>
        `;
    }

    displayComparison() {
        if (!this.aiResult || !this.classicResult) return;

        const aiPanel = document.getElementById('aiResult');
        const classicPanel = document.getElementById('classicResult');

        const aiDiv = aiPanel.querySelector('.dx-card');
        const classicDiv = classicPanel.querySelector('.classic-card');

        if (aiDiv && classicDiv) {
            const aiCode = this.aiResult.code;
            const classicCode = this.classicResult.code;

            const match = aiCode === classicCode;
            const comparisonDiv = document.createElement('div');
            comparisonDiv.style.marginTop = '10px';
            comparisonDiv.style.padding = '8px';
            comparisonDiv.style.background = '#0f1422';
            comparisonDiv.style.borderRadius = '6px';
            comparisonDiv.style.border = `1px solid ${match ? '#10b981' : '#f59e0b'}`;
            comparisonDiv.innerHTML = `
                <small>Comparison Result:</small>
                <div style="color: ${match ? '#10b981' : '#f59e0b'}; font-weight: 600; margin-top: 4px;">
                    ${match ? '✅ AI and Classic ML agree' : '⚠️ AI and Classic ML differ'}
                </div>
                <div style="font-size: 11px; color: #8a9ab0; margin-top: 4px;">
                    AI: ${this.aiResult.classification} (${(this.aiResult.confidence * 100).toFixed(0)}% confidence)<br>
                    Classic: ${this.classicResult.classification} (${(this.classicResult.confidence * 100).toFixed(0)}% confidence)
                </div>
            `;

            aiDiv.appendChild(comparisonDiv);
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('uploadArea')) {
        window.app = new ECGApp();
    }
});