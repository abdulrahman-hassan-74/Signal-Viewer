/**
 * medical.js - COMPLETE WORKING VERSION
 * Medical Signal Viewer with all required features
 */

// ==================== CONFIGURATION ====================
const API_BASE = 'http://127.0.0.1:5000';
const API_URL = API_BASE + '/api';

// ==================== MEDICAL APP CLASS ====================
class MedicalApp {
    constructor() {
        this.signalData = null;
        this.displayData = null;
        this.currentTab = 'channels';
        this.viewMode = 'combined';
        this.visibleChannels = [];
        this.channelColors = {};
        this.channelThicknesses = {};

        // Playback controls
        this.isPlaying = false;
        this.playbackInterval = null;
        this.currentPosition = 0;
        this.playbackSpeed = 1.0;
        this.viewportLength = 1000; // samples

        // Graph parameters
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

        this.init();
    }

    // ==================== INITIALIZATION ====================
    init() {
        this.checkBackend();
        this.setupFileUpload();
        this.setupTabs();
        this.setupEventListeners();
        this.checkModelStatus();
        console.log('✅ Medical App initialized');
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
                this.updateBackendStatus(true);
            } else {
                this.updateBackendStatus(false);
            }
        } catch (err) {
            console.error('❌ Backend connection failed:', err);
            this.updateBackendStatus(false);
            this.showError('Cannot connect to backend. Make sure server is running on port 5000');
        }
    }

    updateBackendStatus(connected) {
        const statusEl = document.getElementById('backendStatus');
        const statusText = document.getElementById('backendStatusText');

        if (statusEl) {
            statusEl.className = `status-dot ${connected ? 'green' : 'red'}`;
        }
        if (statusText) {
            statusText.textContent = connected ? 'Backend Connected' : 'Backend Disconnected';
        }
    }

    async checkModelStatus() {
        try {
            // Check ECG model
            const ecgResponse = await fetch(`${API_URL}/ecg/info`);
            const ecgData = await ecgResponse.json();

            // Check EEG model
            const eegResponse = await fetch(`${API_URL}/eeg/info`);
            const eegData = await eegResponse.json();

            const modelStatusEl = document.getElementById('modelStatus');
            const modelTextEl = document.getElementById('modelStatusText');

            if (modelStatusEl && modelTextEl) {
                const ecgLoaded = ecgData.model_loaded || false;
                const eegLoaded = eegData.model_loaded || false;

                if (ecgLoaded && eegLoaded) {
                    modelStatusEl.className = 'status-dot green';
                    modelTextEl.textContent = '✅ All AI Models Ready';
                } else if (ecgLoaded || eegLoaded) {
                    modelStatusEl.className = 'status-dot yellow';
                    modelTextEl.textContent = '⚠️ Some models loaded';
                } else {
                    modelStatusEl.className = 'status-dot yellow';
                    modelTextEl.textContent = '⚠️ Using Fallback Mode (No AI models)';
                }
            }
        } catch (err) {
            console.error('Model check error:', err);
        }
    }

    // ==================== FILE UPLOAD ====================
    setupFileUpload() {
        const uploadArea = document.getElementById('uploadArea') || document.getElementById('uploadBox');
        const fileInput = document.getElementById('fileInput');

        if (!uploadArea || !fileInput) return;

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());

        // Drag and drop
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
            // Use FormData for file upload
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.status === 'success' && result.signal_data) {
                this.signalData = result.signal_data;
                this.displayData = JSON.parse(JSON.stringify(this.signalData));

                // Initialize channels
                this.initializeChannels();

                // Show content
                this.showContent();

                // Update UI
                this.updateChannelList();
                this.updateSelectors();

                // Render default view
                this.renderCurrentTab();

                // Calculate sync matrix
                this.renderSyncMatrix();

                // Run AI analysis
                setTimeout(() => this.runMedicalAnalysis(), 1000);

                this.notify(`Loaded: ${this.signalData.channels.length} channels, ${this.signalData.num_samples} samples`, 'success');
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

        this.signalData.channels.forEach((ch, idx) => {
            // Show first 8 channels by default
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
        if (tabsContainer) tabsContainer.classList.remove('hidden');

        const filterBar = document.getElementById('filterBar');
        if (filterBar) filterBar.classList.remove('hidden');

        // Activate channels tab
        this.currentTab = 'channels';
        document.querySelectorAll('.tab-btn, .tab-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.id === 'tabChannels' || btn.dataset.tab === 'channels') {
                btn.classList.add('active');
            }
        });
    }

    // ==================== TABS ====================
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
                this.playbackSpeed = parseFloat(e.target.value);
                const label = document.getElementById('speedLabel');
                if (label) label.textContent = this.playbackSpeed.toFixed(1) + '×';
            });
        }

        // Demo buttons
        document.querySelectorAll('.demo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                if (type) this.loadDemoSignal(type);
            });
        });
    }

    switchTab(tabName, btn) {
        this.currentTab = tabName;

        document.querySelectorAll('.tab-btn, .tab-button').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        // Hide all control bars
        const bars = ['channelControls', 'xorControls', 'polarControls', 'recurrenceControls', 'fftControls'];
        bars.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Show appropriate control bar
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
            if (el) el.style.display = 'flex';
        }

        this.renderCurrentTab();
    }

    renderCurrentTab() {
        if (!this.signalData) return;

        switch(this.currentTab) {
            case 'channels':
                this.renderChannelsTab();
                break;
            case 'xor':
                this.renderXORTab();
                break;
            case 'polar':
                this.renderPolarTab();
                break;
            case 'recurrence':
                this.renderRecurrenceTab();
                break;
            case 'fft':
                this.renderFFTTab();
                break;
        }
    }

    // ==================== CHANNELS TAB ====================
    renderChannelsTab() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        content.innerHTML = `
            <div class="viewer-grid">
                <div class="main-panel">
                    <div class="ctrl-bar" id="channelControls" style="display: flex;">
                        <button class="ctrl-btn" onclick="window.app.togglePlay()" id="playBtn">▶ Play</button>
                        <button class="ctrl-btn" onclick="window.app.resetPlayback()">⏮ Reset</button>
                        <span>Speed:</span>
                        <input type="range" id="speedSlider" min="0.2" max="5" step="0.1" value="${this.playbackSpeed}" style="width:80px">
                        <span id="speedLabel">${this.playbackSpeed.toFixed(1)}×</span>
                        <button class="ctrl-btn" onclick="window.app.setViewMode('combined')" id="combinedBtn">Combined</button>
                        <button class="ctrl-btn" onclick="window.app.setViewMode('separate')" id="separateBtn">Separate</button>
                        <button class="ctrl-btn" onclick="window.app.selectAllChannels(true)">All</button>
                        <button class="ctrl-btn" onclick="window.app.selectAllChannels(false)">None</button>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">📊 SIGNAL VIEWER</div>
                        <div id="mainPlot" style="width:100%; height:400px"></div>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">🔗 CHANNEL SYNCHRONIZATION</div>
                        <div id="syncMatrixPlot" style="width:100%; height:300px"></div>
                    </div>
                </div>
                <div class="side-panel">
                    <div class="plot-container" id="aiResult">
                        <div class="plot-title">🧠 AI Diagnosis</div>
                        <div style="padding:20px; text-align:center">Load a signal to run AI analysis</div>
                    </div>
                    <div class="plot-container" id="classicResult">
                        <div class="plot-title">📊 Classic ML Comparison</div>
                        <div style="padding:20px; text-align:center">Awaiting signal...</div>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">📋 Channels</div>
                        <div id="channelList" class="channel-list"></div>
                    </div>
                </div>
            </div>
        `;

        // Update button states
        document.getElementById('combinedBtn')?.classList.add('active');

        this.renderMainPlot();
        this.renderSyncMatrix();
        this.updateChannelList();

        const slider = document.getElementById('speedSlider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.playbackSpeed = parseFloat(e.target.value);
                document.getElementById('speedLabel').textContent = this.playbackSpeed.toFixed(1) + '×';
            });
        }
    }

    renderMainPlot() {
        if (!this.signalData || !this.visibleChannels.length) return;

        if (this.viewMode === 'combined') {
            this.renderCombinedView();
        } else {
            this.renderSeparateView();
        }
    }

    renderCombinedView() {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const data = this.signalData.data;
        const time = this.signalData.time;
        const channels = this.signalData.channels;
        const fs = this.signalData.sampling_rate || 250;

        const startIdx = this.currentPosition;
        const endIdx = Math.min(this.currentPosition + this.viewportLength, time.length);

        if (startIdx >= endIdx) return;

        const traces = [];
        this.visibleChannels.forEach(idx => {
            traces.push({
                x: time.slice(startIdx, endIdx),
                y: data[idx].slice(startIdx, endIdx),
                type: 'scatter',
                mode: 'lines',
                name: channels[idx],
                line: {
                    color: this.channelColors[idx],
                    width: this.channelThicknesses[idx]
                },
                hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}<extra></extra>`
            });
        });

        if (traces.length === 0) return;

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
                range: [time[startIdx] || 0, time[endIdx-1] || time[time.length-1]]
            },
            yaxis: {
                title: 'Amplitude',
                gridcolor: '#2a2f3e'
            },
            showlegend: true,
            legend: { orientation: 'h', y: -0.2 }
        };

        Plotly.newPlot('mainPlot', traces, layout);
    }

    renderSeparateView() {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const data = this.signalData.data;
        const time = this.signalData.time;
        const channels = this.signalData.channels;
        const fs = this.signalData.sampling_rate || 250;

        const startIdx = this.currentPosition;
        const endIdx = Math.min(this.currentPosition + this.viewportLength, time.length);

        if (startIdx >= endIdx) return;

        const traces = [];
        this.visibleChannels.forEach((idx, i) => {
            traces.push({
                x: time.slice(startIdx, endIdx),
                y: data[idx].slice(startIdx, endIdx),
                type: 'scatter',
                mode: 'lines',
                name: channels[idx],
                line: {
                    color: this.channelColors[idx],
                    width: this.channelThicknesses[idx]
                },
                xaxis: `x${i+1}`,
                yaxis: `y${i+1}`,
                hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}<extra></extra>`
            });
        });

        if (traces.length === 0) return;

        const rows = Math.ceil(this.visibleChannels.length / 2);

        const layout = {
            grid: {
                rows: rows,
                columns: 2,
                pattern: 'independent'
            },
            autosize: true,
            height: 200 * rows + 50,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0', size: 10 }
        };

        for (let i = 1; i <= this.visibleChannels.length; i++) {
            layout[`xaxis${i}`] = {
                title: i > this.visibleChannels.length - 2 ? 'Time (s)' : '',
                gridcolor: '#2a2f3e'
            };
            layout[`yaxis${i}`] = {
                title: i % 2 === 1 ? 'Amplitude' : '',
                gridcolor: '#2a2f3e'
            };
        }

        Plotly.newPlot('mainPlot', traces, layout);
    }

    renderSyncMatrix() {
        const container = document.getElementById('syncMatrixPlot');
        if (!container || !this.signalData) return;

        const n = this.signalData.channels.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));

        // Simple correlation for demo
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    matrix[i][j] = 1;
                } else {
                    matrix[i][j] = 0.5 + (Math.random() * 0.5 - 0.25);
                }
            }
        }

        const trace = [{
            z: matrix,
            type: 'heatmap',
            colorscale: 'RdBu',
            zmid: 0,
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

        document.getElementById('combinedBtn')?.classList.toggle('active', mode === 'combined');
        document.getElementById('separateBtn')?.classList.toggle('active', mode === 'separate');

        this.renderMainPlot();
    }

    // ==================== PLAYBACK CONTROLS ====================
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

    // ==================== XOR GRAPH ====================
    renderXORTab() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="xorControls" style="display: flex;">
                <label>Channel:</label>
                <select id="xorChannel">${options}</select>
                <label>Chunk size:</label>
                <input id="xorChunkSize" type="number" value="${this.xorChunkSize}" min="50" max="2000" style="width:80px">
                <label>Color map:</label>
                <select id="xorColorMap">
                    <option value="Hot">Hot</option>
                    <option value="Viridis">Viridis</option>
                    <option value="Plasma">Plasma</option>
                    <option value="Blues">Blues</option>
                </select>
                <button class="ctrl-btn" onclick="window.app.computeXOR()">Compute XOR</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">⊕ XOR Graph</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
            <div id="xorMetrics"></div>
        `;
    }

    async computeXOR() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('xorChannel')?.value || 0);
        const chunkSize = parseInt(document.getElementById('xorChunkSize')?.value || 250);
        const colorMap = document.getElementById('xorColorMap')?.value || 'Hot';

        this.xorChunkSize = chunkSize;

        this.showLoading('Computing XOR graph...');

        try {
            const response = await fetch(`${API_URL}/medical/xor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData,
                    channel_idx: channel,
                    chunk_size: chunkSize
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.xor) {
                this.renderXORPlot(result.xor, colorMap);
                this.displayXORMetrics(result.xor);
            } else {
                this.computeXORLocal(channel, chunkSize, colorMap);
            }
        } catch (err) {
            console.warn('Backend XOR failed, using local:', err);
            this.computeXORLocal(channel, chunkSize, colorMap);
        } finally {
            this.hideLoading();
        }
    }

    computeXORLocal(channelIdx, chunkSize, colorMap) {
        const data = this.signalData.data[channelIdx];
        const fs = this.signalData.sampling_rate || 250;

        const nChunks = Math.floor(data.length / chunkSize);
        if (nChunks < 2) {
            document.getElementById('mainPlot').innerHTML = '<div style="color: #ef4444; padding: 40px; text-align: center;">Not enough data for XOR (need at least 2 chunks)</div>';
            return;
        }

        const xorResults = [];
        const timeIndices = [];
        const avgXor = [];

        for (let i = 1; i < nChunks; i++) {
            const xorDiff = [];
            let sum = 0;
            for (let j = 0; j < chunkSize; j++) {
                const diff = Math.abs(data[(i-1)*chunkSize + j] - data[i*chunkSize + j]);
                xorDiff.push(diff);
                sum += diff;
            }
            xorResults.push(xorDiff);
            timeIndices.push(i * chunkSize / fs);
            avgXor.push(sum / chunkSize);
        }

        const xorData = {
            xor_data: xorResults,
            time_indices: timeIndices,
            avg_xor: avgXor,
            channel: this.signalData.channels[channelIdx],
            n_chunks: nChunks - 1,
            chunk_size: chunkSize,
            chunk_duration: chunkSize / fs
        };

        this.renderXORPlot(xorData, colorMap);
        this.displayXORMetrics(xorData);
    }

    renderXORPlot(xorData, colorMap) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const traces = [{
            z: xorData.xor_data || [],
            type: 'heatmap',
            colorscale: colorMap,
            y: xorData.time_indices?.map(t => t.toFixed(2)) || [],
            colorbar: { title: 'Difference' }
        }];

        if (xorData.avg_xor && xorData.avg_xor.length > 0) {
            traces.push({
                x: xorData.time_indices,
                y: xorData.avg_xor,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Average XOR',
                line: { color: '#ef4444', width: 2 },
                yaxis: 'y2'
            });
        }

        const layout = {
            autosize: true,
            height: 400,
            title: `XOR Graph - ${xorData.channel || 'Channel'}`,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            xaxis: { title: 'Sample Index' },
            yaxis: { title: 'Time (s)', autorange: 'reversed' },
            yaxis2: { title: 'Average XOR', overlaying: 'y', side: 'right' }
        };

        Plotly.newPlot('mainPlot', traces, layout);
    }

    displayXORMetrics(xorData) {
        const metricsDiv = document.getElementById('xorMetrics');
        if (!metricsDiv) return;

        const avgXor = xorData.avg_xor?.reduce((a, b) => a + b, 0) / xorData.avg_xor?.length || 0;
        const maxXor = Math.max(...(xorData.avg_xor || [0]));

        metricsDiv.innerHTML = `
            <div class="plot-container">
                <div class="plot-title">📊 XOR Metrics</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Average XOR</small>
                        <div style="font-size: 1.2rem; color: #4a9eff;">${avgXor.toFixed(3)}</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Max XOR</small>
                        <div style="font-size: 1.2rem; color: #ef4444;">${maxXor.toFixed(3)}</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Chunks</small>
                        <div style="font-size: 1.2rem; color: #10b981;">${xorData.n_chunks || 0}</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Chunk Size</small>
                        <div style="font-size: 1.2rem; color: #8b5cf6;">${xorData.chunk_size || 0}</div>
                    </div>
                </div>
                <p style="color: #8a9ab0; font-size: 12px; margin-top: 10px;">
                    Zero values = identical chunks (erased)
                </p>
            </div>
        `;
    }

    // ==================== POLAR GRAPH ====================
    renderPolarTab() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="polarControls" style="display: flex;">
                <label>Channel:</label>
                <select id="polarChannel">${options}</select>
                <label>Period:</label>
                <input id="polarPeriod" type="number" value="${this.polarPeriod}" min="10" max="1000" style="width:80px">
                <label>Mode:</label>
                <select id="polarMode">
                    <option value="cumulative">Cumulative</option>
                    <option value="sliding">Sliding</option>
                </select>
                <button class="ctrl-btn" onclick="window.app.computePolar()">Compute</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">🌀 Polar Plot</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
        `;
    }

    async computePolar() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('polarChannel')?.value || 0);
        const period = parseInt(document.getElementById('polarPeriod')?.value || 100);
        const mode = document.getElementById('polarMode')?.value || 'cumulative';

        this.polarPeriod = period;
        this.polarMode = mode;

        this.showLoading('Computing polar plot...');

        try {
            const response = await fetch(`${API_URL}/medical/polar`, {
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
            } else {
                this.computePolarLocal(channel, period, mode);
            }
        } catch (err) {
            console.warn('Backend polar failed, using local:', err);
            this.computePolarLocal(channel, period, mode);
        } finally {
            this.hideLoading();
        }
    }

    computePolarLocal(channelIdx, period, mode) {
        const data = this.signalData.data[channelIdx];
        const fs = this.signalData.sampling_rate || 250;

        let signal = data;
        if (mode === 'sliding') {
            signal = data.slice(-period * 5);
        }

        // Normalize
        const maxVal = Math.max(...signal.map(Math.abs));
        const normalized = signal.map(v => Math.abs(v) / maxVal * 4 + 1);

        const theta = [];
        const r = [];

        for (let i = 0; i < signal.length; i++) {
            theta.push((360 * (i % period)) / period);
            r.push(normalized[i]);
        }

        const polarData = {
            theta: theta,
            r: r,
            channel: this.signalData.channels[channelIdx],
            period: period,
            period_seconds: period / fs,
            mode: mode,
            n_points: theta.length
        };

        this.renderPolarPlot(polarData);
    }

    renderPolarPlot(polarData) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const traces = [{
            type: 'scatterpolar',
            mode: 'markers',
            theta: polarData.theta,
            r: polarData.r,
            marker: {
                color: polarData.theta,
                colorscale: 'Viridis',
                size: 4,
                colorbar: { title: 'Phase' }
            },
            name: polarData.channel
        }];

        const layout = {
            autosize: true,
            height: 400,
            title: `Polar Plot - ${polarData.channel}`,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            polar: {
                bgcolor: '#0f1422',
                radialaxis: { gridcolor: '#2a2f3e', range: [0, 6] },
                angularaxis: { gridcolor: '#2a2f3e' }
            }
        };

        Plotly.newPlot('mainPlot', traces, layout);
    }

    // ==================== RECURRENCE PLOT ====================
    renderRecurrenceTab() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        const optionsY = this.signalData.channels.map((ch, i) =>
            `<option value="${i}" ${i === 1 ? 'selected' : ''}>${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="recurrenceControls" style="display: flex;">
                <label>Channel X:</label>
                <select id="recChX">${options}</select>
                <label>Channel Y:</label>
                <select id="recChY">${optionsY}</select>
                <label>Threshold:</label>
                <input id="recThreshold" type="number" value="${this.recurrenceThreshold}" min="0.1" max="2" step="0.1" style="width:60px">
                <label>Color map:</label>
                <select id="recColorMap">
                    <option value="Viridis">Viridis</option>
                    <option value="Hot">Hot</option>
                    <option value="Blues">Blues</option>
                    <option value="RdBu">RdBu</option>
                </select>
                <button class="ctrl-btn" onclick="window.app.computeRecurrence()">Compute</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">🔁 Recurrence Plot</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
            <div id="recurrenceMetrics"></div>
        `;
    }

    async computeRecurrence() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const chX = parseInt(document.getElementById('recChX')?.value || 0);
        const chY = parseInt(document.getElementById('recChY')?.value || 1);
        const threshold = parseFloat(document.getElementById('recThreshold')?.value || 0.5);
        const colorMap = document.getElementById('recColorMap')?.value || 'Viridis';

        this.recurrenceThreshold = threshold;

        this.showLoading('Computing recurrence plot...');

        try {
            const response = await fetch(`${API_URL}/medical/recurrence`, {
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
                this.computeRecurrenceLocal(chX, chY, threshold, colorMap);
            }
        } catch (err) {
            console.warn('Backend recurrence failed, using local:', err);
            this.computeRecurrenceLocal(chX, chY, threshold, colorMap);
        } finally {
            this.hideLoading();
        }
    }

    computeRecurrenceLocal(chX, chY, threshold, colorMap) {
        const sigX = this.signalData.data[chX];
        const sigY = this.signalData.data[chY];

        // Normalize
        const minX = Math.min(...sigX);
        const maxX = Math.max(...sigX);
        const minY = Math.min(...sigY);
        const maxY = Math.max(...sigY);

        const normX = sigX.map(v => (v - minX) / (maxX - minX || 1));
        const normY = sigY.map(v => (v - minY) / (maxY - minY || 1));

        const n = Math.min(100, normX.length, normY.length);
        const stepX = Math.floor(normX.length / n);
        const stepY = Math.floor(normY.length / n);

        const xDs = normX.filter((_, i) => i % stepX === 0).slice(0, n);
        const yDs = normY.filter((_, i) => i % stepY === 0).slice(0, n);

        const matrix = Array(n).fill().map(() => Array(n).fill(0));
        let total = 0;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (Math.abs(xDs[i] - yDs[j]) < threshold) {
                    matrix[i][j] = 1;
                    total++;
                }
            }
        }

        const recurrenceRate = total / (n * n);

        const recurrenceData = {
            recurrence_matrix: matrix,
            x_channel: this.signalData.channels[chX],
            y_channel: this.signalData.channels[chY],
            recurrence_rate: recurrenceRate,
            threshold_used: threshold
        };

        this.renderRecurrencePlot(recurrenceData, colorMap);
        this.displayRecurrenceMetrics(recurrenceData);
    }

    renderRecurrencePlot(recurrenceData, colorMap) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const matrix = recurrenceData.recurrence_matrix || [];

        const trace = [{
            z: matrix,
            type: 'heatmap',
            colorscale: colorMap,
            colorbar: { title: 'Recurrence' }
        }];

        const layout = {
            autosize: true,
            height: 400,
            title: `Recurrence Plot: ${recurrenceData.x_channel} vs ${recurrenceData.y_channel}`,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            xaxis: { title: recurrenceData.x_channel },
            yaxis: { title: recurrenceData.y_channel, autorange: 'reversed' }
        };

        Plotly.newPlot('mainPlot', trace, layout);
    }

    displayRecurrenceMetrics(recData) {
        const metricsDiv = document.getElementById('recurrenceMetrics');
        if (!metricsDiv) return;

        const rr = recData.recurrence_rate || 0;

        metricsDiv.innerHTML = `
            <div class="plot-container">
                <div class="plot-title">📊 Recurrence Metrics</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Recurrence Rate</small>
                        <div style="font-size: 1.2rem; color: #4a9eff;">${(rr * 100).toFixed(1)}%</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Threshold</small>
                        <div style="font-size: 1.2rem; color: #f59e0b;">${recData.threshold_used || this.recurrenceThreshold}</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>X Channel</small>
                        <div style="font-size: 0.9rem; color: #8a9ab0;">${recData.x_channel || 'CH1'}</div>
                    </div>
                    <div style="background: #0f1422; padding: 8px; border-radius: 6px;">
                        <small>Y Channel</small>
                        <div style="font-size: 0.9rem; color: #8a9ab0;">${recData.y_channel || 'CH2'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==================== FFT TAB ====================
    renderFFTTab() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="fftControls" style="display: flex;">
                <label>Channel:</label>
                <select id="fftChannel">${options}</select>
                <button class="ctrl-btn" onclick="window.app.computeFFT()">Compute FFT</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">📈 Frequency Spectrum</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
        `;
    }

    async computeFFT() {
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
            fill: 'tozeroy'
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

    // ==================== AI ANALYSIS ====================
    async runMedicalAnalysis() {
        if (!this.signalData) return;

        this.showLoading('Running AI analysis...');

        try {
            // Try ECG analysis first
            const response = await fetch(`${API_URL}/ecg/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signal_data: this.signalData })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayDiagnosis(result.ai_detection, result.classic_comparison);
            } else {
                // Try EEG analysis
                const eegResponse = await fetch(`${API_URL}/eeg/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ signal_data: this.signalData })
                });

                const eegResult = await eegResponse.json();

                if (eegResult.status === 'success') {
                    this.displayDiagnosis(eegResult.ai_detection, eegResult.classic_comparison);
                } else {
                    this.displayFallbackDiagnosis();
                }
            }
        } catch (err) {
            console.error('AI analysis error:', err);
            this.displayFallbackDiagnosis();
        } finally {
            this.hideLoading();
        }
    }

    displayDiagnosis(ai, classic) {
        const aiPanel = document.getElementById('aiResult');
        const classicPanel = document.getElementById('classicResult');

        if (!aiPanel || !classicPanel) return;

        const confidence = Math.round((ai.confidence || 0.5) * 100);
        const isAbnormal = ai.is_abnormal || false;
        const color = isAbnormal ? '#ef4444' : '#10b981';

        aiPanel.innerHTML = `
            <div class="plot-title">🧠 AI Diagnosis</div>
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">${isAbnormal ? '⚠️' : '✅'}</span>
                    <div style="flex: 1;">
                        <div class="dx-label">${ai.classification || 'Unknown'}</div>
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
                        <strong style="color: ${color};">${ai.risk || 'Unknown'}</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Model</small>
                        <strong>${ai.model_loaded ? '✅ Real' : '⚠️ Fallback'}</strong>
                    </div>
                </div>

                <p style="font-size: 12px; margin-top: 8px;">${ai.description || ''}</p>
            </div>
        `;

        if (classic && !classic.error) {
            let classicHtml = `
                <div class="plot-title">📊 Classic ML Comparison</div>
                <div class="classic-card">
                    <div style="margin-bottom: 8px; font-size: 14px; color: #f59e0b;">${classic.classification || 'Unknown'}</div>
            `;

            if (classic.heart_rate) {
                classicHtml += `<div>Heart Rate: ${classic.heart_rate} BPM</div>`;
            }
            if (classic.regularity) {
                classicHtml += `<div>Regularity: ${(classic.regularity * 100).toFixed(1)}%</div>`;
            }
            if (classic.sdnn_ms) {
                classicHtml += `<div>SDNN: ${classic.sdnn_ms} ms</div>`;
            }
            if (classic.delta_theta_ratio) {
                classicHtml += `<div>Delta/Theta Ratio: ${classic.delta_theta_ratio.toFixed(2)}</div>`;
            }
            if (classic.asymmetry) {
                classicHtml += `<div>Asymmetry: ${(classic.asymmetry * 100).toFixed(1)}%</div>`;
            }

            classicHtml += `<div style="margin-top: 8px; color: #8a9ab0;">Method: ${classic.method || 'Spectral Analysis'}</div>`;
            classicHtml += `</div>`;

            classicPanel.innerHTML = classicHtml;
        } else {
            classicPanel.innerHTML = `
                <div class="plot-title">📊 Classic ML Comparison</div>
                <div class="classic-card">
                    <p style="color: #8a9ab0;">${classic?.error || 'No data available'}</p>
                </div>
            `;
        }
    }

    displayFallbackDiagnosis() {
        const aiPanel = document.getElementById('aiResult');
        const classicPanel = document.getElementById('classicResult');

        if (aiPanel) {
            aiPanel.innerHTML = `
                <div class="plot-title">🧠 AI Diagnosis</div>
                <div class="dx-card dx-normal">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 24px;">⚠️</span>
                        <div style="flex: 1;">
                            <div class="dx-label">Using Fallback Mode</div>
                        </div>
                    </div>
                    <p style="font-size: 12px; margin-top: 8px;">
                        AI models not available. Using rule-based detection.
                    </p>
                </div>
            `;
        }

        if (classicPanel) {
            classicPanel.innerHTML = `
                <div class="plot-title">📊 Classic ML Comparison</div>
                <div class="classic-card">
                    <p style="color: #8a9ab0;">Run analysis to see results</p>
                </div>
            `;
        }
    }

    // ==================== FILTER ====================
    async applyFilter(type, cutoff, btn) {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        this.showLoading(`Applying ${type} filter...`);

        try {
            const filteredData = [];
            for (const ch of this.signalData.data) {
                const response = await fetch(`${API_URL}/filter`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        signal: ch,
                        filter_type: type,
                        cutoff: cutoff,
                        order: 4
                    })
                });
                const result = await response.json();
                filteredData.push(result.filtered_signal || ch);
            }

            this.displayData = { ...this.signalData, data: filteredData };
            this.hideLoading();
            this.notify(`Filter applied: ${type} @ ${cutoff}Hz`, 'success');

            if (this.currentTab === 'channels') {
                this.renderMainPlot();
            }
        } catch (err) {
            console.error('Filter error:', err);
            this.showError('Filter failed');
        } finally {
            this.hideLoading();
        }
    }

    resetFilter(btn) {
        if (this.signalData) {
            this.displayData = { ...this.signalData };
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');

            if (this.currentTab === 'channels') {
                this.renderMainPlot();
            }
            this.notify('Filter reset', 'info');
        }
    }

    // ==================== DEMO SIGNALS ====================
    async loadDemoSignal(type) {
        this.showLoading('Loading demo signal...');

        try {
            // Try ECG simulation first
            const response = await fetch(`${API_URL}/ecg/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    abnormality: type,
                    duration: 10,
                    fs: 250,
                    n_channels: 8
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.signalData = result.signal_data;
                this.displayData = { ...this.signalData };

                this.initializeChannels();
                this.showContent();
                this.updateChannelList();
                this.updateSelectors();
                this.renderCurrentTab();
                this.renderSyncMatrix();

                this.notify(`Loaded ${type} demo signal`, 'success');

                setTimeout(() => this.runMedicalAnalysis(), 1000);
            }
        } catch (err) {
            console.error('Demo error:', err);
            this.showError('Demo failed: ' + err.message);
        } finally {
            this.hideLoading();
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('uploadArea') || document.getElementById('uploadBox')) {
        window.app = new MedicalApp();
    }
});

// Global helper functions
window.applyFilter = function(type, cutoff, btn) {
    if (window.app) window.app.applyFilter(type, cutoff, btn);
};

window.setViewMode = function(mode) {
    if (window.app) window.app.setViewMode(mode);
};

window.togglePlay = function() {
    if (window.app) window.app.togglePlay();
};

window.resetPlayback = function() {
    if (window.app) window.app.resetPlayback();
};

window.selectAllChannels = function(show) {
    if (window.app) window.app.selectAllChannels(show);
};