/**
 * ecg.js - Complete ECG Signal Viewer
 * Uses real AI model only, no dummy data
 * Fixed Separate View, XOR, and Polar graphs
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
            colorMap: 'Hot'
        };

        this.polarState = {
            channel: 0,
            period: 100,
            mode: 'cumulative'
        };

        this.recurrenceState = {
            chX: 0,
            chY: 1,
            threshold: 0.5,
            colorMap: 'Viridis'
        };

        // Color palette
        this.colors = [
            '#4a9eff', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#6b7280', '#84cc16'
        ];

        // Available color maps
        this.colorMaps = [
            'Hot', 'Viridis', 'Plasma', 'Inferno', 'Magma',
            'Blues', 'RdBu', 'Portland', 'Electric', 'Greys'
        ];

        // Abnormality types - real only
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
                this.renderCurrentTab();

                this.notify(`Loaded ${this.signalData.channels.length} channels, ${this.signalData.num_samples} samples`, 'success');

                // Run real AI analysis
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

        this.currentTab = 'channels';
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const tabCh = document.getElementById('tabChannels');
        if (tabCh) tabCh.classList.add('active');
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
        const xorColorMap = document.getElementById('xorColorMap');
        if (xorColorMap) {
            xorColorMap.innerHTML = this.colorMaps.map(cmap =>
                `<option value="${cmap}" ${cmap === this.xorState.colorMap ? 'selected' : ''}>${cmap}</option>`
            ).join('');
        }

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
        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.setSpeed(parseFloat(e.target.value));
            });
        }

        const durationSlider = document.getElementById('durationSlider');
        if (durationSlider) {
            durationSlider.addEventListener('input', (e) => {
                this.setViewportDuration(parseFloat(e.target.value));
            });
        }
    }

    switchTab(tabName, btn) {
        this.currentTab = tabName;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

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

                    const colorMapSelect = document.getElementById('xorColorMap');
                    if (colorMapSelect) colorMapSelect.value = this.xorState.colorMap;
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
            this.renderXORTab(content, options, colorMapOptions);
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
                <button class="ctrl-btn" onclick="window.app.togglePlay()" id="playBtn">▶ Play</button>
                <button class="ctrl-btn" onclick="window.app.stopPlayback()" id="stopBtn">⏹ Stop</button>
                <button class="ctrl-btn" onclick="window.app.resetPlayback()">⏮ Reset</button>
                
                <span>Speed:</span>
                <input type="range" id="speedSlider" min="0.2" max="5" step="0.1" value="${this.speed}" style="width:80px">
                <span id="speedLabel">${this.speed.toFixed(1)}×</span>
                
                <span>Window:</span>
                <input type="range" id="durationSlider" min="2" max="20" step="1" value="${this.viewportDuration}" style="width:80px">
                <span id="durationLabel">${this.viewportDuration}s</span>
                
                <span>Position:</span>
                <input type="range" id="positionSlider" min="0" max="${totalDuration}" step="0.1" value="0" style="width:120px">
                <span id="positionLabel">0.0s / ${totalDuration.toFixed(1)}s</span>
                
                <button class="ctrl-btn" onclick="window.app.setViewMode('combined')" id="combinedBtn">Combined</button>
                <button class="ctrl-btn" onclick="window.app.setViewMode('separate')" id="separateBtn">Separate</button>
                <button class="ctrl-btn" onclick="window.app.selectAllChannels(true)">All</button>
                <button class="ctrl-btn" onclick="window.app.selectAllChannels(false)">None</button>
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

        const positionSlider = document.getElementById('positionSlider');
        if (positionSlider) {
            positionSlider.addEventListener('input', (e) => {
                const pos = parseFloat(e.target.value);
                const fs = this.signalData.sampling_rate || 250;
                this.currentPosition = Math.floor(pos * fs);
                document.getElementById('positionLabel').textContent = `${pos.toFixed(1)}s / ${totalDuration.toFixed(1)}s`;
                this.renderContinuousViewer();
            });
        }

        const durationSlider = document.getElementById('durationSlider');
        if (durationSlider) {
            durationSlider.addEventListener('input', (e) => {
                this.viewportDuration = parseFloat(e.target.value);
                const fs = this.signalData.sampling_rate || 250;
                this.viewportSamples = Math.min(
                    Math.floor(this.viewportDuration * fs),
                    this.signalData.num_samples
                );
                document.getElementById('durationLabel').textContent = `${this.viewportDuration}s`;
                this.renderContinuousViewer();
            });
        }

        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.setSpeed(parseFloat(e.target.value));
            });
        }

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

        if (positionSlider) positionSlider.value = positionSec;
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

                    document.getElementById('durationSlider').value = this.viewportDuration.toFixed(1);
                    document.getElementById('durationLabel').textContent = `${this.viewportDuration.toFixed(1)}s`;
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

        // Create a grid container
        const gridContainer = document.createElement('div');
        gridContainer.style.display = 'grid';
        gridContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
        gridContainer.style.gap = '15px';
        gridContainer.style.padding = '10px';
        gridContainer.style.height = `${Math.ceil(visibleChannels.length / 2) * 220}px`;
        gridContainer.style.overflowY = 'auto';

        // Create individual plots for each visible channel
        visibleChannels.forEach((idx, i) => {
            const plotDiv = document.createElement('div');
            plotDiv.id = `channel-plot-${idx}`;
            plotDiv.style.height = '200px';
            plotDiv.style.width = '100%';
            plotDiv.style.backgroundColor = '#0f1422';
            plotDiv.style.borderRadius = '8px';
            plotDiv.style.border = '1px solid #2a2f3e';
            plotDiv.style.padding = '5px';
            gridContainer.appendChild(plotDiv);

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
                height: 190,
                margin: { l: 40, r: 20, t: 30, b: 40 },
                paper_bgcolor: '#0f1422',
                plot_bgcolor: '#0a0f1a',
                font: { color: '#8a9ab0', size: 9 },
                title: {
                    text: channels[idx].substring(0, 20),
                    font: { color: this.channelColors[idx], size: 11 }
                },
                xaxis: {
                    title: i >= visibleChannels.length - 2 ? 'Time (s)' : '',
                    gridcolor: '#2a2f3e',
                    range: [time[startIdx] || 0, time[endIdx-1] || time[time.length-1]]
                },
                yaxis: {
                    title: i % 2 === 0 ? 'mV' : '',
                    gridcolor: '#2a2f3e',
                    tickfont: { size: 8 }
                },
                showlegend: false
            };

            Plotly.newPlot(`channel-plot-${idx}`, trace, layout, { responsive: true, displayModeBar: false });
        });

        container.appendChild(gridContainer);

        // Synchronize zoom/pan across all plots
        visibleChannels.forEach((idx) => {
            const plotEl = document.getElementById(`channel-plot-${idx}`);
            if (plotEl) {
                plotEl.on('plotly_relayout', (eventData) => {
                    if (eventData['xaxis.range[0]'] !== undefined) {
                        visibleChannels.forEach((otherIdx) => {
                            if (otherIdx !== idx) {
                                Plotly.relayout(`channel-plot-${otherIdx}`, {
                                    'xaxis.range[0]': eventData['xaxis.range[0]'],
                                    'xaxis.range[1]': eventData['xaxis.range[1]']
                                });
                            }
                        });

                        const newStart = eventData['xaxis.range[0]'];
                        const startIdx = this.findTimeIndex(newStart);
                        this.currentPosition = startIdx;
                    }
                });
            }
        });
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

        // Use the sync_matrix from backend if available
        let matrix = this.signalData.sync_matrix;

        if (!matrix) {
            // Fallback: create identity matrix
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
        document.getElementById('combinedBtn').classList.toggle('active', mode === 'combined');
        document.getElementById('separateBtn').classList.toggle('active', mode === 'separate');

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
        this.stopAnimation();
    }

    stopAnimation() {
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
        this.stopAnimation();

        if (this.currentTab === 'channels') {
            this.renderContinuousViewer();
        }
    }

    // ==================== XOR GRAPH - FIXED ====================

    renderXORTab(content, options, colorMapOptions) {
        content.innerHTML = `
            <div class="ctrl-bar" id="xorControls">
                <label>Channel:</label>
                <select id="xorChannel">${options}</select>
                
                <label>Chunk Size (samples):</label>
                <input id="xorChunkSize" type="number" value="${this.xorState.chunkSize}" min="50" max="2000" step="10" style="width:80px">
                <span style="color:#8a9ab0; font-size:11px;">(Time period for chunks)</span>
                
                <label>Color Map:</label>
                <select id="xorColorMap">${colorMapOptions}</select>
                
                <button class="ctrl-btn" onclick="window.app.renderXOR()">Compute XOR</button>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">⊕ XOR Graph - Differences Between Consecutive Chunks</div>
                <div id="xorPlot" style="width:100%; height:400px"></div>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">📊 XOR Statistics</div>
                <div id="xorMetrics" style="min-height:100px"></div>
            </div>
        `;
    }

    async renderXOR() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('xorChannel')?.value || 0);
        const chunkSize = parseInt(document.getElementById('xorChunkSize')?.value || 250);
        const colorMap = document.getElementById('xorColorMap')?.value || 'Hot';

        this.xorState = { channel, chunkSize, colorMap };

        this.showLoading('Computing XOR graph...');

        try {
            const response = await fetch(`${this.API_URL}/${this.signalType}/xor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData,
                    channel_idx: channel,
                    chunk_size: chunkSize,
                    colormap: colorMap
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.xor) {
                this.renderXORPlot(result.xor);
                this.displayXORMetrics(result.xor);
            } else {
                this.showError(result.xor?.error || 'XOR computation failed');
            }
        } catch (err) {
            console.error('XOR error:', err);
            this.showError('XOR computation failed: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    renderXORPlot(xorData) {
        const container = document.getElementById('xorPlot');
        if (!container) return;

        if (xorData.error || xorData.n_chunks === 0) {
            container.innerHTML = `<div style="color: #ef4444; padding: 40px; text-align: center;">${xorData.error || 'No XOR data available'}</div>`;
            return;
        }

        const xorMatrix = xorData.xor_matrix || [];
        const timeAxis = xorData.time_axis || [];
        const chunkLabels = xorData.chunk_labels || [];
        const colormap = xorData.colormap || 'Hot';

        // Create heatmap
        const heatmapTrace = {
            z: xorMatrix,
            x: timeAxis.map(t => t.toFixed(2) + 's'),
            y: chunkLabels,
            type: 'heatmap',
            colorscale: colormap,
            zsmooth: 'best',
            colorbar: {
                title: 'XOR Value',
                titleside: 'right'
            },
            hovertemplate: 'Time: %{x}<br>%{y}<br>XOR: %{z:.3f}<extra></extra>'
        };

        const layout = {
            autosize: true,
            height: 400,
            title: {
                text: `XOR Graph - ${xorData.channel}<br>` +
                      `<span style="font-size: 12px; color: #8a9ab0;">` +
                      `Chunk Size: ${xorData.chunk_size} samples (${xorData.chunk_duration?.toFixed(2)}s) | ` +
                      `Total Pairs: ${xorData.n_chunks}</span>`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: {
                title: 'Time within chunk (s)',
                gridcolor: '#2a2f3e'
            },
            yaxis: {
                title: 'Chunk Pair',
                gridcolor: '#2a2f3e',
                autorange: 'reversed'
            },
            margin: { l: 100, r: 80, t: 100, b: 60 }
        };

        Plotly.newPlot('xorPlot', [heatmapTrace], layout, { responsive: true });
    }

    displayXORMetrics(xorData) {
        const metricsDiv = document.getElementById('xorMetrics');
        if (!metricsDiv) return;

        const avgXor = xorData.avg_xor?.reduce((a, b) => a + b, 0) / xorData.avg_xor?.length || 0;
        const maxXor = Math.max(...(xorData.avg_xor || [0]));
        const minXor = Math.min(...(xorData.avg_xor || [0]));
        const identicalCount = xorData.identical_pairs?.length || 0;

        metricsDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                <div style="background: #0f1422; padding: 12px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Average XOR</small>
                    <div style="font-size: 1.2rem; color: #4a9eff;">${avgXor.toFixed(4)}</div>
                </div>
                <div style="background: #0f1422; padding: 12px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Max XOR</small>
                    <div style="font-size: 1.2rem; color: #ef4444;">${maxXor.toFixed(4)}</div>
                </div>
                <div style="background: #0f1422; padding: 12px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Min XOR</small>
                    <div style="font-size: 1.2rem; color: #10b981;">${minXor.toFixed(4)}</div>
                </div>
                <div style="background: #0f1422; padding: 12px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Identical Pairs</small>
                    <div style="font-size: 1.2rem; color: #8b5cf6;">${identicalCount}</div>
                </div>
            </div>
            <p style="color: #8a9ab0; font-size: 12px; margin-top: 10px;">
                ${xorData.interpretation || 'XOR shows differences between consecutive chunks. Zero (dark) = identical chunks (erased)'}
            </p>
        `;
    }

    // ==================== POLAR GRAPH - FIXED ====================

    renderPolarTab(content, options) {
        content.innerHTML = `
            <div class="ctrl-bar" id="polarControls">
                <label>Channel:</label>
                <select id="polarChannel">${options}</select>
                
                <label>Period (samples):</label>
                <input id="polarPeriod" type="number" value="${this.polarState.period}" min="10" max="1000" step="10" style="width:80px">
                <span style="color:#8a9ab0; font-size:11px;">(Time for one full circle)</span>
                
                <label>Mode:</label>
                <select id="polarMode">
                    <option value="sliding">Sliding (Latest Fixed Time)</option>
                    <option value="cumulative">Cumulative (Overlapping Patterns)</option>
                </select>
                
                <button class="ctrl-btn" onclick="window.app.renderPolar()">Generate Polar Plot</button>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">🌀 Polar Plot - r = Magnitude, θ = Time</div>
                <div id="polarPlot" style="width:100%; height:500px"></div>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">📊 Polar Statistics</div>
                <div id="polarMetrics" style="min-height:80px">
                    <div style="color:#8a9ab0; text-align:center; padding:20px;">
                        Generate a polar plot to see statistics
                    </div>
                </div>
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

        this.showLoading('Generating polar plot...');

        try {
            const response = await fetch(`${this.API_URL}/${this.signalType}/polar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData,
                    channel_idx: channel,
                    period: period,
                    mode: mode
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.polar) {
                this.renderPolarPlot(result.polar);
                this.displayPolarMetrics(result.polar);
            } else {
                this.showError(result.polar?.error || 'Polar plot generation failed');
            }
        } catch (err) {
            console.error('Polar error:', err);
            this.showError('Polar plot generation failed: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    renderPolarPlot(polarData) {
        const container = document.getElementById('polarPlot');
        if (!container) return;

        if (polarData.error) {
            container.innerHTML = `<div style="color: #ef4444; padding: 40px; text-align: center;">${polarData.error}</div>`;
            return;
        }

        const traces = [];

        // Main signal trace - color by time to show progression
        const colors = polarData.theta.map(t => t / 360);

        traces.push({
            type: 'scatterpolar',
            mode: 'markers',
            theta: polarData.theta,
            r: polarData.r,
            marker: {
                color: colors,
                colorscale: 'Viridis',
                size: polarData.mode === 'sliding' ? 8 : 5,
                opacity: polarData.mode === 'sliding' ? 0.9 : 0.6,
                colorbar: {
                    title: 'Time →',
                    titleside: 'right'
                },
                showscale: true
            },
            text: polarData.theta.map((t, i) =>
                `Time: ${(i * polarData.period_seconds / polarData.period).toFixed(3)}s<br>` +
                `Angle: ${t.toFixed(1)}°<br>` +
                `Magnitude: ${polarData.r[i].toFixed(2)}`
            ),
            hoverinfo: 'text',
            name: polarData.channel + (polarData.mode === 'sliding' ? ' (Moving Pulse)' : ' (Cumulative)')
        });

        // Add average pattern for cumulative mode (shows periodicity)
        if (polarData.mode === 'cumulative' && polarData.avg_pattern) {
            traces.push({
                type: 'scatterpolar',
                mode: 'lines',
                theta: polarData.avg_pattern.theta,
                r: polarData.avg_pattern.r,
                line: {
                    color: '#ef4444',
                    width: 3,
                    dash: 'dash'
                },
                name: 'Average Pattern (Periodicity)',
                opacity: 0.8
            });
        }

        // For sliding mode, add a fade effect by making later points brighter
        if (polarData.mode === 'sliding' && traces[0].marker) {
            // Adjust opacity based on recency - newer points are more opaque
            const n = polarData.theta.length;
            traces[0].marker.opacity = Array(n).fill(0).map((_, i) => 0.3 + 0.7 * (i / n));
        }

        const layout = {
            autosize: true,
            height: 500,
            title: {
                text: `Polar Plot - ${polarData.channel}<br>` +
                      `<span style="font-size: 12px; color: #8a9ab0;">` +
                      `Mode: ${polarData.mode === 'sliding' ? 'Latest Fixed Time (Moving Pulse)' : 'Cumulative (Overlapping Patterns)'} | ` +
                      `Period: ${polarData.period} samples (${polarData.period_seconds.toFixed(2)}s) | ` +
                      `Points: ${polarData.n_points}</span>`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            polar: {
                bgcolor: '#0f1422',
                radialaxis: {
                    title: 'Signal Magnitude',
                    gridcolor: '#2a2f3e',
                    linecolor: '#3a4050',
                    range: [0, polarData.mode === 'sliding' ? 12 : 11],
                    tickfont: { color: '#8a9ab0' }
                },
                angularaxis: {
                    title: 'Time (one full circle = one period)',
                    gridcolor: '#2a2f3e',
                    linecolor: '#3a4050',
                    tickfont: { color: '#8a9ab0' },
                    rotation: 90,
                    direction: 'clockwise',
                    tickmode: 'array',
                    tickvals: [0, 90, 180, 270, 360],
                    ticktext: ['0°', '90°', '180°', '270°', '360°']
                }
            },
            showlegend: true,
            legend: {
                orientation: 'h',
                y: -0.15,
                x: 0.5,
                xanchor: 'center'
            }
        };

        Plotly.newPlot('polarPlot', traces, layout, { responsive: true });
    }

    displayPolarMetrics(polarData) {
        const metricsDiv = document.getElementById('polarMetrics');
        if (!metricsDiv) return;

        const periodicityPercent = (polarData.periodicity * 100).toFixed(1);
        const periodicityColor = polarData.periodicity > 0.7 ? '#10b981' :
                                polarData.periodicity > 0.4 ? '#f59e0b' : '#ef4444';

        metricsDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Periodicity Score</small>
                    <div style="font-size: 1.5rem; color: ${periodicityColor};">${periodicityPercent}%</div>
                    <div style="font-size: 11px; color: #8a9ab0; margin-top: 5px;">
                        Higher = more periodic/repetitive signal
                    </div>
                </div>
                
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Mode Description</small>
                    <div style="font-size: 1rem; color: #4a9eff; margin-top: 5px;">
                        ${polarData.mode === 'sliding' ? 'Moving Circular Pulse' : 'Overlapping Patterns'}
                    </div>
                    <div style="font-size: 11px; color: #8a9ab0; margin-top: 5px;">
                        ${polarData.mode === 'sliding' ? 
                          'Old points fade, newest points bright - shows real-time circular motion' : 
                          'All points visible - traces show periodicity'}
                    </div>
                </div>
                
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Signal Info</small>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px;">
                        <div>
                            <div style="font-size: 0.9rem; color: #e0e0e0;">Points</div>
                            <div style="font-size: 1.2rem; color: #8b5cf6;">${polarData.n_points}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #e0e0e0;">Period</div>
                            <div style="font-size: 1.2rem; color: #f59e0b;">${polarData.period_seconds.toFixed(2)}s</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 15px; padding: 10px; background: #0f1422; border-radius: 8px; border-left: 4px solid #4a9eff;">
                <p style="color: #e0e0e0; font-size: 12px; margin: 0;">
                    <strong>Interpretation:</strong> ${polarData.interpretation}
                </p>
            </div>
        `;
    }

    // ==================== RECURRENCE GRAPH - FIXED ====================

    renderRecurrenceTab(content, options, colorMapOptions) {
        content.innerHTML = `
            <div class="ctrl-bar" id="recurrenceControls">
                <label>Channel X:</label>
                <select id="recChX">${options}</select>
                
                <label>Channel Y:</label>
                <select id="recChY">${options}</select>
                
                <label>Similarity Threshold:</label>
                <input id="recThreshold" type="number" value="${this.recurrenceState.threshold}" min="0.05" max="1.0" step="0.05" style="width:60px">
                <span style="color:#8a9ab0; font-size:11px;">(Lower = stricter similarity)</span>
                
                <label>Color Map:</label>
                <select id="recColorMap">${colorMapOptions}</select>
                
                <button class="ctrl-btn" onclick="window.app.renderRecurrence()">Generate Recurrence Plot</button>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">🔁 Recurrence Plot - Cumulative Scatter (Channel X vs Channel Y)</div>
                <div id="recurrencePlot" style="width:100%; height:500px"></div>
            </div>
            
            <div class="plot-container">
                <div class="plot-title">📊 Recurrence Statistics</div>
                <div id="recurrenceMetrics" style="min-height:80px">
                    <div style="color:#8a9ab0; text-align:center; padding:20px;">
                        Generate a recurrence plot to see statistics
                    </div>
                </div>
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
            const response = await fetch(`${this.API_URL}/${this.signalType}/recurrence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData,
                    ch_x: chX,
                    ch_y: chY,
                    threshold: threshold
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.recurrence) {
                this.renderRecurrencePlot(result.recurrence, colorMap);
                this.displayRecurrenceMetrics(result.recurrence);
            } else {
                this.showError(result.recurrence?.error || 'Recurrence plot generation failed');
            }
        } catch (err) {
            console.error('Recurrence error:', err);
            this.showError('Recurrence plot generation failed: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }

    renderRecurrencePlot(recurrenceData, colorMap) {
        const container = document.getElementById('recurrencePlot');
        if (!container) return;

        if (recurrenceData.error) {
            container.innerHTML = `<div style="color: #ef4444; padding: 40px; text-align: center;">${recurrenceData.error}</div>`;
            return;
        }

        const traces = [];

        // Recurrence scatter points - color by time to show temporal progression
        if (recurrenceData.recurrence_scatter && recurrenceData.recurrence_scatter.x.length > 0) {
            traces.push({
                x: recurrenceData.recurrence_scatter.x,
                y: recurrenceData.recurrence_scatter.y,
                mode: 'markers',
                type: 'scatter',
                name: 'Recurrence Points',
                marker: {
                    color: recurrenceData.recurrence_scatter.colors || 'rgba(74, 158, 255, 0.6)',
                    colorscale: colorMap,
                    size: 4,
                    opacity: 0.7,
                    colorbar: {
                        title: 'Time →',
                        titleside: 'right',
                        tickvals: [0, 0.5, 1],
                        ticktext: ['Start', 'Middle', 'End']
                    },
                    showscale: true
                },
                text: recurrenceData.recurrence_scatter.x.map((x, i) =>
                    `Channel X: ${x.toFixed(3)}<br>` +
                    `Channel Y: ${recurrenceData.recurrence_scatter.y[i].toFixed(3)}<br>` +
                    `Time: ${(recurrenceData.recurrence_scatter.colors[i] * 100).toFixed(0)}% through signal`
                ),
                hoverinfo: 'text'
            });
        }

        // Diagonal line (perfect correlation - x = y)
        traces.push({
            x: recurrenceData.diagonal.x,
            y: recurrenceData.diagonal.y,
            mode: 'lines',
            type: 'scatter',
            name: 'Perfect Correlation (x = y)',
            line: {
                color: '#ef4444',
                width: 2,
                dash: 'solid'
            },
            hovertemplate: 'Diagonal: x = y<extra></extra>'
        });

        // Anti-diagonal for comparison (x + y = 1)
        if (recurrenceData.anti_diagonal) {
            traces.push({
                x: recurrenceData.anti_diagonal.x,
                y: recurrenceData.anti_diagonal.y,
                mode: 'lines',
                type: 'scatter',
                name: 'Anti-Diagonal (x + y = 1)',
                line: {
                    color: '#f59e0b',
                    width: 1.5,
                    dash: 'dash'
                },
                opacity: 0.5,
                hovertemplate: 'Anti-diagonal: x + y = 1<extra></extra>'
            });
        }

        const layout = {
            autosize: true,
            height: 500,
            title: {
                text: `Recurrence Plot: ${recurrenceData.x_channel} vs ${recurrenceData.y_channel}<br>` +
                      `<span style="font-size: 12px; color: #8a9ab0;">` +
                      `Similarity Threshold: ${recurrenceData.threshold_used} | ` +
                      `Recurrence Rate: ${(recurrenceData.recurrence_rate * 100).toFixed(1)}% | ` +
                      `Points: ${recurrenceData.n_points.toLocaleString()}</span>`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            xaxis: {
                title: recurrenceData.x_channel + ' (normalized)',
                gridcolor: '#2a2f3e',
                range: [0, 1],
                tickmode: 'linear',
                tick0: 0,
                dtick: 0.1
            },
            yaxis: {
                title: recurrenceData.y_channel + ' (normalized)',
                gridcolor: '#2a2f3e',
                range: [0, 1],
                tickmode: 'linear',
                tick0: 0,
                dtick: 0.1,
                scaleanchor: 'x',
                scaleratio: 1
            },
            showlegend: true,
            legend: {
                orientation: 'h',
                y: -0.15,
                x: 0.5,
                xanchor: 'center'
            },
            annotations: [
                {
                    x: 0.05,
                    y: 0.95,
                    xref: 'paper',
                    yref: 'paper',
                    text: '← Points near diagonal = channels behave similarly',
                    showarrow: true,
                    arrowhead: 2,
                    ax: 50,
                    ay: -30,
                    font: { color: '#8a9ab0', size: 10 }
                },
                {
                    x: 0.95,
                    y: 0.05,
                    xref: 'paper',
                    yref: 'paper',
                    text: 'Diagonal lines = periodic patterns →',
                    showarrow: true,
                    arrowhead: 2,
                    ax: -50,
                    ay: 30,
                    font: { color: '#8a9ab0', size: 10 }
                }
            ]
        };

        Plotly.newPlot('recurrencePlot', traces, layout, { responsive: true });
    }

    displayRecurrenceMetrics(recData) {
        const metricsDiv = document.getElementById('recurrenceMetrics');
        if (!metricsDiv) return;

        const recurrencePercent = (recData.recurrence_rate * 100).toFixed(1);
        const diagonalDensityPercent = (recData.diagonal_density * 100).toFixed(1);

        // Determine pattern type based on diagonal density
        let patternType = 'Random/Noise';
        let patternColor = '#8a9ab0';

        if (recData.diagonal_density > 0.3) {
            patternType = 'Strong Periodic Patterns';
            patternColor = '#10b981';
        } else if (recData.diagonal_density > 0.15) {
            patternType = 'Weak Periodic Patterns';
            patternColor = '#f59e0b';
        } else if (recData.diagonal_density > 0.05) {
            patternType = 'Slight Periodic Tendency';
            patternColor = '#4a9eff';
        }

        metricsDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Recurrence Rate</small>
                    <div style="font-size: 1.5rem; color: #4a9eff;">${recurrencePercent}%</div>
                    <div style="font-size: 11px; color: #8a9ab0; margin-top: 5px;">
                        Percentage of points that are similar
                    </div>
                </div>
                
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Pattern Detection</small>
                    <div style="font-size: 1.2rem; color: ${patternColor};">${patternType}</div>
                    <div style="font-size: 11px; color: #8a9ab0; margin-top: 5px;">
                        Diagonal density: ${diagonalDensityPercent}%
                    </div>
                </div>
                
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Plot Info</small>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px;">
                        <div>
                            <div style="font-size: 0.9rem; color: #e0e0e0;">Points</div>
                            <div style="font-size: 1.2rem; color: #8b5cf6;">${recData.n_points.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #e0e0e0;">Matrix Size</div>
                            <div style="font-size: 1.2rem; color: #f59e0b;">${recData.matrix_size}×${recData.matrix_size}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 15px; padding: 15px; background: #0f1422; border-radius: 8px;">
                <p style="color: #e0e0e0; font-size: 13px; margin: 0 0 10px 0;">
                    <strong>What to look for:</strong>
                </p>
                <ul style="color: #8a9ab0; font-size: 12px; margin: 0; padding-left: 20px;">
                    <li><strong style="color:#ef4444;">Diagonal lines</strong> = Periodic patterns (e.g., regular heartbeat)</li>
                    <li><strong style="color:#4a9eff;">Points near diagonal</strong> = Channels behave similarly at those times</li>
                    <li><strong style="color:#10b981;">Clusters</strong> = Recurring states in the signals</li>
                    <li><strong style="color:#f59e0b;">Scattered points</strong> = Random/noise (less structure)</li>
                </ul>
            </div>
            
            <div style="margin-top: 10px; padding: 10px; background: #0f1422; border-radius: 8px; border-left: 4px solid #4a9eff;">
                <p style="color: #e0e0e0; font-size: 12px; margin: 0;">
                    <strong>Interpretation:</strong> ${recData.interpretation}
                </p>
            </div>
        `;
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
            const response = await fetch(`${this.API_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: {
                        data: [this.signalData.data[channel]],
                        channels: [this.signalData.channels[channel]],
                        sampling_rate: this.signalData.sampling_rate
                    }
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.results) {
                // For now, use local FFT
                this.computeFFTLocal(channel);
            } else {
                this.computeFFTLocal(channel);
            }
        } catch (err) {
            console.warn('Backend FFT failed, using local:', err);
            this.computeFFTLocal(channel);
        } finally {
            this.hideLoading();
        }
    }

    computeFFTLocal(channel) {
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

    // ==================== AI Analysis - Real Model Only ====================

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

        const confidence = Math.round(ai.confidence * 100);
        const isAbnormal = ai.is_abnormal;
        const abInfo = this.abnormalityTypes[ai.code] || this.abnormalityTypes['normal'];
        const color = isAbnormal ? '#ef4444' : '#10b981';

        aiPanel.innerHTML = `
            <div class="plot-title">🧠 AI Diagnosis (Real Model)</div>
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">${isAbnormal ? '⚠️' : '✅'}</span>
                    <div style="flex: 1;">
                        <div class="dx-label">${ai.classification}</div>
                        <small style="color: #8a9ab0;">Model: ${ai.model_loaded ? 'ECGNet' : 'Not Loaded'}</small>
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
                        <strong>${ai.features?.heart_rate?.toFixed(1) || '??'} BPM</strong>
                    </div>
                </div>
                
                <p style="font-size: 12px; margin-top: 8px;">${ai.description || ''}</p>
                <div style="margin-top: 8px; padding: 8px; background: #0f1422; border-radius: 6px;">
                    <small>Treatment:</small>
                    <p style="font-size: 12px; margin-top: 4px;">${ai.treatment || 'Consult physician'}</p>
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

        const confidence = Math.round((classic.confidence || 0.7) * 100);

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
                    AI: ${this.aiResult.classification} (${this.aiResult.confidence.toFixed(2)} confidence)<br>
                    Classic: ${this.classicResult.classification} (${(this.classicResult.confidence || 0.7).toFixed(2)} confidence)
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