/**
 * eeg.js - EEG Signal Viewer
 * Extends SignalApp class
 */

class EEGApp extends SignalApp {
    constructor() {
        super('eeg');

        this.abnormalityTypes = {
            'normal': { name: 'Normal EEG', risk: 'None', color: '#10b981' },
            'epilepsy': { name: 'Epileptiform Activity', risk: 'Moderate-High', color: '#ef4444' },
            'slow': { name: 'Slow Wave Activity', risk: 'Moderate', color: '#f59e0b' },
            'asymmetry': { name: 'Asymmetry', risk: 'Moderate', color: '#8b5cf6' }
        };

        this.init();
    }

    init() {
        this.checkBackend().then(connected => {
            if (connected) this.checkModelStatus();
        });
        this.setupFileUpload();
        this.setupTabs();
        this.setupEventListeners();
    }

    async checkModelStatus() {
        try {
            const response = await fetch(`${API_URL}/eeg/info`);
            const data = await response.json();

            const statusEl = document.getElementById('modelStatus');
            if (statusEl) {
                if (data.model_loaded) {
                    statusEl.textContent = '✅ Real EEG Model Active';
                    statusEl.className = 'model-badge badge-loaded';
                } else {
                    statusEl.textContent = '⚠️ Using Fallback Mode';
                    statusEl.className = 'model-badge badge-fallback';
                }
            }
        } catch (err) {
            console.error('Model check error:', err);
        }
    }

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
                        <button class="ctrl-btn" onclick="window.app.setViewMode('combined')">Combined</button>
                        <button class="ctrl-btn" onclick="window.app.setViewMode('separate')">Separate</button>
                        <button class="ctrl-btn" onclick="window.app.selectAllChannels(true)">All</button>
                        <button class="ctrl-btn" onclick="window.app.selectAllChannels(false)">None</button>
                    </div>
                    <div class="plot-container">
                        <div class="plot-title">📊 EEG SIGNAL VIEWER</div>
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

        const container = document.getElementById('mainPlot');
        if (!container) return;

        const data = this.signalData.data;
        const time = this.signalData.time;
        const channels = this.signalData.channels;

        const startIdx = this.currentPosition;
        const endIdx = Math.min(this.currentPosition + this.viewportLength, time.length);

        if (startIdx >= endIdx) return;

        if (this.viewMode === 'combined') {
            this.renderCombinedView(data, time, channels, startIdx, endIdx);
        } else {
            this.renderSeparateView(data, time, channels, startIdx, endIdx);
        }
    }

    renderCombinedView(data, time, channels, startIdx, endIdx) {
        const container = document.getElementById('mainPlot');

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
            hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}µV<extra></extra>`
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
                range: [time[startIdx] || 0, time[endIdx-1] || time[time.length-1]]
            },
            yaxis: {
                title: 'Amplitude (µV)',
                gridcolor: '#2a2f3e'
            },
            showlegend: true,
            legend: { orientation: 'h', y: -0.2 }
        };

        Plotly.newPlot('mainPlot', traces, layout);
    }

    renderSeparateView(data, time, channels, startIdx, endIdx) {
        const container = document.getElementById('mainPlot');

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
                hovertemplate: `${channels[idx]}<br>Time: %{x:.3f}s<br>Amplitude: %{y:.3f}µV<extra></extra>`
            });
        });

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

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    matrix[i][j] = 1;
                } else {
                    matrix[i][j] = 0.5;
                }
            }
        }

        const trace = [{
            z: matrix,
            type: 'heatmap',
            colorscale: 'RdBu',
            zmid: 0,
            x: this.signalData.channels,
            y: this.signalData.channels
        }];

        const layout = {
            autosize: true,
            height: 300,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0', size: 10 }
        };

        Plotly.newPlot('syncMatrixPlot', trace, layout);
    }

    renderXORTab() {
        const content = document.getElementById('contentArea');
        if (!content || !this.signalData) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="xorControls" style="display: flex;">
                <label>Channel:</label>
                <select id="xorChannel">${options}</select>
                <label>Chunk size:</label>
                <input id="xorChunkSize" type="number" value="${this.xorChunkSize}" min="50" max="2000" style="width:80px">
                <button class="ctrl-btn" onclick="window.app.computeXOR()">Compute XOR</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">⊕ XOR Graph</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
        `;
    }

    async computeXOR() {
        if (!this.signalData) {
            this.showError('No signal loaded');
            return;
        }

        const channel = parseInt(document.getElementById('xorChannel')?.value || 0);
        const chunkSize = parseInt(document.getElementById('xorChunkSize')?.value || 250);

        this.showLoading('Computing XOR graph...');

        try {
            const response = await fetch(`${API_URL}/eeg/xor`, {
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
                this.renderXORPlot(result.xor);
            } else {
                this.computeXORLocal(channel, chunkSize);
            }
        } catch (err) {
            console.warn('Backend XOR failed, using local:', err);
            this.computeXORLocal(channel, chunkSize);
        } finally {
            this.hideLoading();
        }
    }

    computeXORLocal(channelIdx, chunkSize) {
        const data = this.signalData.data[channelIdx];
        const fs = this.signalData.sampling_rate || 250;

        const nChunks = Math.floor(data.length / chunkSize);
        if (nChunks < 2) {
            document.getElementById('mainPlot').innerHTML = '<div style="color: #ef4444; padding: 40px; text-align: center;">Not enough data for XOR</div>';
            return;
        }

        const xorResults = [];
        const timeIndices = [];

        for (let i = 1; i < nChunks; i++) {
            const xorDiff = [];
            for (let j = 0; j < chunkSize; j++) {
                const diff = Math.abs(data[(i-1)*chunkSize + j] - data[i*chunkSize + j]);
                xorDiff.push(diff);
            }
            xorResults.push(xorDiff);
            timeIndices.push(i * chunkSize / fs);
        }

        const xorData = {
            xor_data: xorResults,
            time_indices: timeIndices,
            channel: this.signalData.channels[channelIdx]
        };

        this.renderXORPlot(xorData);
    }

    renderXORPlot(xorData) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const trace = [{
            z: xorData.xor_data || [],
            type: 'heatmap',
            colorscale: 'Hot',
            y: xorData.time_indices?.map(t => t.toFixed(2)) || [],
            colorbar: { title: 'Difference' }
        }];

        const layout = {
            autosize: true,
            height: 400,
            title: `XOR Graph - ${xorData.channel || 'Channel'}`,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#8a9ab0' },
            xaxis: { title: 'Sample Index' },
            yaxis: { title: 'Time (s)', autorange: 'reversed' }
        };

        Plotly.newPlot('mainPlot', trace, layout);
    }

    renderPolarTab() {
        const content = document.getElementById('contentArea');
        if (!content || !this.signalData) return;

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

        this.showLoading('Computing polar plot...');

        try {
            const response = await fetch(`${API_URL}/eeg/polar`, {
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

        let signal = data;
        if (mode === 'sliding') {
            signal = data.slice(-period * 5);
        }

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
            channel: this.signalData.channels[channelIdx]
        };

        this.renderPolarPlot(polarData);
    }

    renderPolarPlot(polarData) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const trace = [{
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

        Plotly.newPlot('mainPlot', trace, layout);
    }

    renderRecurrenceTab() {
        const content = document.getElementById('contentArea');
        if (!content || !this.signalData) return;

        const options = this.signalData.channels.map((ch, i) =>
            `<option value="${i}">${ch.substring(0, 30)}</option>`
        ).join('');

        content.innerHTML = `
            <div class="ctrl-bar" id="recurrenceControls" style="display: flex;">
                <label>Channel X:</label>
                <select id="recChX">${options}</select>
                <label>Channel Y:</label>
                <select id="recChY">${options}</select>
                <label>Threshold:</label>
                <input id="recThreshold" type="number" value="${this.recurrenceThreshold}" min="0.1" max="2" step="0.1" style="width:60px">
                <button class="ctrl-btn" onclick="window.app.computeRecurrence()">Compute</button>
            </div>
            <div class="plot-container">
                <div class="plot-title">🔁 Recurrence Plot</div>
                <div id="mainPlot" style="width:100%; height:400px"></div>
            </div>
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

        this.showLoading('Computing recurrence plot...');

        try {
            const response = await fetch(`${API_URL}/eeg/recurrence`, {
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
                this.renderRecurrencePlot(result.recurrence);
            } else {
                this.computeRecurrenceLocal(chX, chY, threshold);
            }
        } catch (err) {
            console.warn('Backend recurrence failed, using local:', err);
            this.computeRecurrenceLocal(chX, chY, threshold);
        } finally {
            this.hideLoading();
        }
    }

    computeRecurrenceLocal(chX, chY, threshold) {
        const sigX = this.signalData.data[chX];
        const sigY = this.signalData.data[chY];

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

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (Math.abs(xDs[i] - yDs[j]) < threshold) {
                    matrix[i][j] = 1;
                }
            }
        }

        const recurrenceData = {
            recurrence_matrix: matrix,
            x_channel: this.signalData.channels[chX],
            y_channel: this.signalData.channels[chY]
        };

        this.renderRecurrencePlot(recurrenceData);
    }

    renderRecurrencePlot(recurrenceData) {
        const container = document.getElementById('mainPlot');
        if (!container) return;

        const matrix = recurrenceData.recurrence_matrix || [];

        const trace = [{
            z: matrix,
            type: 'heatmap',
            colorscale: 'Viridis',
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

    renderFFTTab() {
        const content = document.getElementById('contentArea');
        if (!content || !this.signalData) return;

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

    async runAIAnalysis() {
        if (!this.signalData) return;

        this.showLoading('Running AI analysis...');

        try {
            const response = await fetch(`${API_URL}/eeg/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signal_data: this.signalData })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayDiagnosis(result.ai_detection, result.classic_comparison);
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
        const abInfo = this.abnormalityTypes[ai.code] || this.abnormalityTypes['normal'];

        aiPanel.innerHTML = `
            <div class="plot-title">🧠 AI Diagnosis</div>
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px;">${isAbnormal ? '⚠️' : '✅'}</span>
                    <div style="flex: 1;">
                        <div class="dx-label">${ai.classification || 'Normal EEG'}</div>
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
                        <small>Model</small>
                        <strong>${ai.model_loaded ? '✅ Real' : '⚠️ Fallback'}</strong>
                    </div>
                </div>

                <p style="font-size: 12px; margin-top: 8px;">${ai.description || abInfo.description || ''}</p>
            </div>
        `;

        if (classic && !classic.error) {
            let classicHtml = `
                <div class="plot-title">📊 Classic ML Comparison</div>
                <div class="classic-card">
                    <div style="margin-bottom: 8px; font-size: 14px; color: #f59e0b;">${classic.classification || 'Unknown'}</div>
            `;

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
    }

    async loadDemoSignal(type) {
        this.showLoading('Loading demo signal...');

        try {
            const response = await fetch(`${API_URL}/eeg/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    abnormality: type,
                    duration: 10,
                    fs: 250,
                    n_channels: 19
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.signal_data) {
                this.signalData = result.signal_data;
                this.displayData = { ...this.signalData };

                this.initializeChannels();
                this.showContent();
                this.updateChannelList();
                this.updateSelectors();
                this.renderCurrentTab();
                this.renderSyncMatrix();

                this.notify(`Loaded ${type} demo signal`, 'success');
                setTimeout(() => this.runAIAnalysis(), 500);
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
    if (document.getElementById('uploadArea')) {
        window.app = new EEGApp();
    }
});

// Make app globally available
window.EEGApp = EEGApp;