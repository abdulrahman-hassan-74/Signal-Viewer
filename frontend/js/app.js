// Main Application - Signal Viewer Hub
// Complete implementation with all features

class SignalViewerApp {
    constructor() {
        this.signalData = null;
        this.state = {
            visibleChannels: {},
            isPlaying: false,
            speed: 1,
            currentPosition: 0,
            zoomRange: [0, 1000],
            activeTab: 'channels',
            viewMode: 'combined', // 'combined' or 'separate'
            recurrenceState: {
                channel1: 0,
                channel2: 1,
                threshold: 0.5
            },
            polarState: {
                channel: 0,
                period: 100,
                animate: false
            },
            filterState: {
                type: 'none',
                cutoff: 50
            }
        };

        this.animationFrame = null;
        this.animationId = null;
        this.API_URL = 'http://127.0.0.1:5000/api';
        this.init();
    }

    init() {
        // Check backend connection
        this.checkBackend();

        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        if (uploadArea && fileInput) {
            uploadArea.onclick = () => fileInput.click();
            fileInput.onchange = (e) => this.handleFileUpload(e.target.files[0]);

            // Drag and drop
            uploadArea.ondragover = (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#4a9eff';
                uploadArea.style.background = '#1a1f30';
            };

            uploadArea.ondragleave = () => {
                uploadArea.style.borderColor = '#3a4a6b';
                uploadArea.style.background = '#0f1422';
            };

            uploadArea.ondrop = (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#3a4a6b';
                uploadArea.style.background = '#0f1422';
                const file = e.dataTransfer.files[0];
                if (file) this.handleFileUpload(file);
            };
        }

        // Tab buttons
        const tabChannels = document.getElementById('tabChannels');
        const tabRecurrence = document.getElementById('tabRecurrence');
        const tabPolar = document.getElementById('tabPolar');

        if (tabChannels) tabChannels.onclick = () => this.switchTab('channels');
        if (tabRecurrence) tabRecurrence.onclick = () => this.switchTab('recurrence');
        if (tabPolar) tabPolar.onclick = () => this.switchTab('polar');

        // Show filter controls if in medical page
        if (window.location.pathname.includes('medical.html')) {
            document.getElementById('filterControls').style.display = 'block';
        }
    }

    async checkBackend() {
        try {
            const response = await fetch(`${this.API_URL}/health`);
            const data = await response.json();

            if (data.status === 'ok') {
                console.log('✅ Backend connected');
                UIManager.showNotification('Backend connected', 'success');
            }
        } catch (err) {
            console.error('❌ Backend connection failed:', err);
            UIManager.showNotification('Cannot connect to backend. Make sure server is running on port 5000', 'error');
        }
    }

    async handleFileUpload(file) {
        UIManager.showLoading();

        try {
            this.signalData = await SignalParser.parseFile(file);

            // Initialize visible channels
            this.state.visibleChannels = {};
            this.signalData.channels.forEach((ch, i) => {
                this.state.visibleChannels[ch] = i < 8; // Show first 8 by default
            });

            // Calculate sync matrix if not present
            if (!this.signalData.sync_matrix) {
                this.signalData.sync_matrix = SignalParser.calculateSyncMatrix(this.signalData.data);
            }

            // Show tabs and content
            document.getElementById('tabsContainer').style.display = 'block';
            UIManager.hideLoading();

            // Render initial view
            this.renderChannelsView();

            // Show success message
            UIManager.showNotification(`Loaded ${this.signalData.channels.length} channels, ${this.signalData.num_samples} samples`, 'success');

            // Auto-analyze if medical page
            if (window.location.pathname.includes('medical.html')) {
                this.analyzeMedicalSignal();
            }

        } catch (err) {
            UIManager.showError('Failed to parse file: ' + err.message);
        }
    }

    async analyzeMedicalSignal() {
        try {
            const response = await fetch(`${this.API_URL}/medical/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayAIDiagnosis(result);
            }
        } catch (err) {
            console.error('Medical analysis failed:', err);
        }
    }

    displayAIDiagnosis(results) {
        const sidePanel = document.querySelector('.side-panel');
        if (!sidePanel) return;

        const aiPanel = document.createElement('div');
        aiPanel.className = 'plot-container';
        aiPanel.innerHTML = `
            <div class="plot-title">🧠 AI DIAGNOSIS (Multi-Channel)</div>
            <div class="ai-results-panel" style="margin-top: 10px;">
                <div class="diagnosis ${results.ai_detection.is_abnormal ? 'abnormal' : 'normal'}">
                    ${results.ai_detection.classification}
                </div>
                <div class="confidence" style="margin: 15px 0;">
                    Confidence: ${(results.ai_detection.confidence * 100).toFixed(1)}%
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 5px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <small style="color: #8a9ab0;">Model</small><br>
                            <strong>${results.ai_detection.model_used}</strong>
                        </div>
                        <div>
                            <small style="color: #8a9ab0;">Accuracy</small><br>
                            <strong>${(results.ai_detection.model_accuracy * 100).toFixed(1)}%</strong>
                        </div>
                    </div>
                </div>
                ${results.ai_detection.is_abnormal ? `
                <div style="margin-top: 15px; padding: 10px; background: rgba(255,107,107,0.1); border-radius: 5px;">
                    <strong style="color: #ff6b6b;">⚠️ Abnormal Detected</strong>
                </div>
                ` : ''}
                <div style="margin-top: 15px; padding: 10px; background: #0f1422; border-radius: 5px;">
                    <strong>Classic ML Comparison:</strong><br>
                    <span>${results.classic_comparison.classification}</span><br>
                    <small>HR: ${results.classic_comparison.heart_rate.toFixed(1)} BPM</small>
                </div>
            </div>
        `;

        // Insert after sync matrix
        const syncMatrix = document.getElementById('syncMatrixPlot')?.parentElement;
        if (syncMatrix) {
            syncMatrix.parentNode.insertBefore(aiPanel, syncMatrix.nextSibling);
        } else {
            sidePanel.prepend(aiPanel);
        }
    }

    switchTab(tab) {
        this.state.activeTab = tab;

        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        const activeTab = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
        if (activeTab) activeTab.classList.add('active');

        // Render selected tab
        const contentArea = document.getElementById('contentArea');

        switch(tab) {
            case 'channels':
                this.renderChannelsView();
                break;
            case 'recurrence':
                this.renderRecurrenceView();
                break;
            case 'polar':
                this.renderPolarView();
                break;
        }
    }

    renderChannelsView() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea || !this.signalData) return;

        const visibleCount = Object.values(this.state.visibleChannels).filter(Boolean).length;
        const viewMode = this.state.viewMode;

        if (viewMode === 'combined') {
            // Combined view - all channels in one plot
            contentArea.innerHTML = `
                <div class="viewer-grid">
                    <div class="channels-container">
                        <div class="plot-container">
                            <div class="plot-title">
                                <span><span class="color-dot" style="background: #4a9eff"></span>
                                MULTI-CHANNEL DISPLAY (${visibleCount}/${this.signalData.channels.length})</span>
                                <div>
                                    <button class="view-mode-btn active" onclick="app.switchViewMode('combined')">📊 Combined</button>
                                    <button class="view-mode-btn" onclick="app.switchViewMode('separate')">🔲 Separate</button>
                                </div>
                            </div>
                            <div id="channelsControls"></div>
                            <div id="channelsPlot" style="width:100%; height:${Math.max(400, visibleCount * 80)}px"></div>
                        </div>
                    </div>
                    <div class="side-panel">
                        <div class="plot-container">
                            <div class="plot-title">📊 CHANNEL SYNCHRONIZATION</div>
                            <div id="syncMatrixPlot" style="width:100%; height:350px"></div>
                        </div>
                        <div class="plot-container">
                            <div class="plot-title">📈 SIGNAL STATISTICS</div>
                            <div id="statsPlot" style="width:100%; height:250px"></div>
                        </div>
                        <div class="plot-container">
                            <div class="plot-title">ℹ️ INSTRUCTIONS</div>
                            <div style="color: #8a9ab0; font-size: 0.9rem; padding: 10px;">
                                <p>• <strong>Play/Pause:</strong> ▶/⏸ controls animation</p>
                                <p>• <strong>Speed:</strong> Adjust playback speed (0.5x - 3x)</p>
                                <p>• <strong>Channels:</strong> Check/uncheck to show/hide</p>
                                <p>• <strong>Zoom:</strong> Click and drag on plot</p>
                                <p>• <strong>Pan:</strong> Click and drag axes</p>
                                <p>• <strong>Reset:</strong> ⏮ returns to start</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Separate view - each channel in its own plot
            let plotsHtml = '';
            this.signalData.channels.forEach((ch, idx) => {
                if (this.state.visibleChannels[ch]) {
                    plotsHtml += `
                        <div class="plot-container" style="margin-bottom: 20px;">
                            <div class="plot-title">
                                <span><span class="color-dot" style="background: ${Visualizations.colors[idx % Visualizations.colors.length]}"></span>
                                ${ch}</span>
                            </div>
                            <div id="channelPlot_${idx}" style="width:100%; height:200px"></div>
                        </div>
                    `;
                }
            });

            contentArea.innerHTML = `
                <div style="display: flex; gap: 20px;">
                    <div style="flex: 3;">
                        <div class="plot-container">
                            <div class="plot-title">
                                <span>🔲 SEPARATE CHANNEL VIEW</span>
                                <div>
                                    <button class="view-mode-btn" onclick="app.switchViewMode('combined')">📊 Combined</button>
                                    <button class="view-mode-btn active" onclick="app.switchViewMode('separate')">🔲 Separate</button>
                                </div>
                            </div>
                            <div id="channelsControls"></div>
                            <div id="separateChannelsContainer">
                                ${plotsHtml}
                            </div>
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div class="plot-container">
                            <div class="plot-title">📊 CHANNEL SYNCHRONIZATION</div>
                            <div id="syncMatrixPlot" style="width:100%; height:350px"></div>
                        </div>
                        <div class="plot-container">
                            <div class="plot-title">📈 SIGNAL STATISTICS</div>
                            <div id="statsPlot" style="width:100%; height:250px"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Create controls
        const controlsContainer = document.getElementById('channelsControls');
        if (controlsContainer) {
            // Controls bar
            const controlsBar = UIManager.createControlsBar(this.state, {
                onPlayPause: () => this.togglePlayPause(),
                onReset: () => this.resetPlayback(),
                onSelectAll: () => this.toggleAllChannels(true),
                onClearAll: () => this.toggleAllChannels(false),
                onSpeedChange: (speed) => {
                    this.state.speed = speed;
                    UIManager.updateSpeedValue(speed);
                }
            });
            controlsContainer.appendChild(controlsBar);

            // Channel controls
            const channelControls = UIManager.createChannelControls(
                this.signalData.channels,
                this.state.visibleChannels,
                (ch) => this.toggleChannel(ch)
            );
            controlsContainer.appendChild(channelControls);
        }

        // Render plots based on view mode
        if (viewMode === 'combined') {
            Visualizations.renderChannels('channelsPlot', this.signalData, this.state);
        } else {
            // Render each channel separately
            this.signalData.channels.forEach((ch, idx) => {
                if (this.state.visibleChannels[ch]) {
                    const plotId = `channelPlot_${idx}`;
                    const plotElement = document.getElementById(plotId);
                    if (plotElement) {
                        Visualizations.renderSingleChannel(plotId, this.signalData, idx, this.state);
                    }
                }
            });
        }

        Visualizations.renderSyncMatrix('syncMatrixPlot', this.signalData);

        // Render statistics if available
        if (this.signalData.analysis && this.signalData.analysis.statistics) {
            Visualizations.renderStatistics('statsPlot', this.signalData.analysis.statistics);
        } else {
            this.computeAndRenderStatistics();
        }
    }

    switchViewMode(mode) {
        this.state.viewMode = mode;
        this.renderChannelsView();

        // Update play/pause button state
        if (this.state.isPlaying) {
            this.startPlayback();
        }
    }

    computeAndRenderStatistics() {
        const stats = [];
        this.signalData.channels.forEach((ch, idx) => {
            const data = this.signalData.data[idx];
            const mean = data.reduce((a, b) => a + b, 0) / data.length;
            const std = Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length);
            const rms = Math.sqrt(data.reduce((sq, n) => sq + n * n, 0) / data.length);

            stats.push({
                channel: ch,
                mean: mean,
                std: std,
                rms: rms,
                min: Math.min(...data),
                max: Math.max(...data)
            });
        });

        Visualizations.renderStatistics('statsPlot', stats);
    }

    renderRecurrenceView() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea || !this.signalData) return;

        contentArea.innerHTML = `
            <div class="plot-container">
                <div class="plot-title">🔁 RECURRENCE MAP - Phase Space Similarity</div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">X Channel:</label>
                        <select id="recurrenceCh1">
                            ${this.signalData.channels.map((ch, i) => 
                                `<option value="${i}" ${i === this.state.recurrenceState.channel1 ? 'selected' : ''}>${ch}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Y Channel:</label>
                        <select id="recurrenceCh2">
                            ${this.signalData.channels.map((ch, i) => 
                                `<option value="${i}" ${i === this.state.recurrenceState.channel2 ? 'selected' : ''}>${ch}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Threshold: <span id="thresholdValue">${this.state.recurrenceState.threshold}</span></label>
                        <input type="range" id="thresholdSlider" min="0.1" max="2.0" step="0.1" 
                               value="${this.state.recurrenceState.threshold}" class="slider" style="width: 150px;">
                    </div>
                    
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Color Map:</label>
                        <select id="colorMapSelect">
                            <option value="Viridis">Viridis</option>
                            <option value="Plasma">Plasma</option>
                            <option value="Hot">Hot</option>
                            <option value="Cool">Cool</option>
                            <option value="Blackbody">Blackbody</option>
                        </select>
                    </div>
                    
                    <button id="generateRecurrenceBtn" class="active">🔁 Generate</button>
                    <button id="computeFFTBtn">📊 FFT</button>
                </div>
                
                <div id="recurrencePlot" style="width:100%; height:400px"></div>
                <div id="fftPlot" style="width:100%; height:300px; margin-top:20px; display:none;"></div>
                
                <div id="recurrenceMetrics" class="info-panel" style="margin-top: 20px;">
                    <strong>📊 Recurrence Metrics:</strong>
                    <div id="metricsContent">Click Generate to compute</div>
                </div>
                
                <div class="info-panel" style="margin-top: 20px;">
                    <strong>📌 How to read Recurrence Plot:</strong>
                    <ul style="margin-top: 10px;">
                        <li>• <strong>White dots</strong> = Recurrent states (signal repeats itself)</li>
                        <li>• <strong>Diagonal lines</strong> = Periodic behavior</li>
                        <li>• <strong>Threshold</strong>: Lower = More sensitive, Higher = More strict</li>
                        <li>• <strong>Recurrence Rate</strong>: Percentage of recurrent points</li>
                        <li>• <strong>Determinism</strong>: Percentage of points in diagonal lines</li>
                    </ul>
                </div>
            </div>
        `;

        this.setupRecurrenceEvents();
    }

    setupRecurrenceEvents() {
        const ch1Select = document.getElementById('recurrenceCh1');
        const ch2Select = document.getElementById('recurrenceCh2');
        const thresholdSlider = document.getElementById('thresholdSlider');
        const thresholdValue = document.getElementById('thresholdValue');
        const colorMap = document.getElementById('colorMapSelect');
        const generateBtn = document.getElementById('generateRecurrenceBtn');
        const fftBtn = document.getElementById('computeFFTBtn');

        if (!generateBtn) return;

        ch1Select.onchange = (e) => {
            this.state.recurrenceState.channel1 = parseInt(e.target.value);
        };

        ch2Select.onchange = (e) => {
            this.state.recurrenceState.channel2 = parseInt(e.target.value);
        };

        thresholdSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            this.state.recurrenceState.threshold = val;
            thresholdValue.textContent = val;
        };

        generateBtn.onclick = async () => {
            await this.generateRecurrencePlot(
                parseInt(ch1Select.value),
                parseInt(ch2Select.value),
                parseFloat(thresholdSlider.value),
                colorMap.value
            );
        };

        fftBtn.onclick = async () => {
            await this.computeFFT(parseInt(ch1Select.value));
        };
    }

    async generateRecurrencePlot(chX, chY, threshold, colorMap) {
        UIManager.showLoading();

        try {
            // Try backend first
            const response = await fetch(`${this.API_URL}/recurrence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal1: this.signalData.data[chX],
                    signal2: this.signalData.data[chY],
                    threshold: threshold
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.plotRecurrence(result.recurrence, chX, chY, colorMap);
                this.calculateRecurrenceMetrics(result.recurrence);
            }
        } catch (err) {
            // Fallback to local computation
            console.warn('Backend recurrence failed, using local:', err);
            const recurrence = this.computeLocalRecurrence(chX, chY, threshold);
            this.plotRecurrence(recurrence, chX, chY, colorMap);
            this.calculateRecurrenceMetrics(recurrence);
        } finally {
            UIManager.hideLoading();
        }
    }

    computeLocalRecurrence(chX, chY, threshold) {
        const sig1 = this.signalData.data[chX];
        const sig2 = this.signalData.data[chY];

        const n = Math.min(150, sig1.length, sig2.length);
        const step = Math.floor(sig1.length / n);

        const recurrence = Array(n).fill().map(() => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const val1 = sig1[i * step];
                const val2 = sig2[j * step];
                if (Math.abs(val1 - val2) < threshold) {
                    recurrence[i][j] = 1;
                }
            }
        }

        return recurrence;
    }

    plotRecurrence(recurrenceMatrix, chX, chY, colorMap) {
        const container = document.getElementById('recurrencePlot');
        if (!container) return;

        const data = [{
            z: recurrenceMatrix,
            type: 'heatmap',
            colorscale: colorMap,
            showscale: true,
            colorbar: {
                title: 'Recurrence',
                titleside: 'right',
                titlefont: { color: '#e0e0e0' },
                tickfont: { color: '#e0e0e0' }
            }
        }];

        const layout = {
            autosize: true,
            height: 400,
            margin: { l: 60, r: 60, t: 50, b: 60 },
            title: {
                text: `Recurrence Plot: ${this.signalData.channels[chX]} vs ${this.signalData.channels[chY]}`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: {
                title: this.signalData.channels[chX],
                gridcolor: '#2a2f3e'
            },
            yaxis: {
                title: this.signalData.channels[chY],
                gridcolor: '#2a2f3e'
            }
        };

        Plotly.newPlot('recurrencePlot', data, layout, { responsive: true, displaylogo: false });
    }

    calculateRecurrenceMetrics(matrix) {
        const container = document.getElementById('metricsContent');
        if (!container) return;

        const n = matrix.length;
        let total = 0;
        let diagonal = 0;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (matrix[i][j] === 1) {
                    total++;
                    if (i === j) diagonal++;
                }
            }
        }

        const recurrenceRate = total / (n * n);
        const determinism = diagonal / total || 0;

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px;">
                <div>
                    <strong>Recurrence Rate:</strong><br>
                    <span style="color: #4a9eff;">${(recurrenceRate * 100).toFixed(2)}%</span>
                </div>
                <div>
                    <strong>Determinism:</strong><br>
                    <span style="color: ${determinism > 0.5 ? '#51cf66' : '#ff6b6b'};">${(determinism * 100).toFixed(2)}%</span>
                </div>
                <div>
                    <strong>Matrix Size:</strong><br>
                    <span>${n} x ${n}</span>
                </div>
                <div>
                    <strong>Total Points:</strong><br>
                    <span>${total}</span>
                </div>
            </div>
        `;
    }

    async computeFFT(channelIdx) {
        const fftPlot = document.getElementById('fftPlot');
        const fftBtn = document.getElementById('computeFFTBtn');

        if (!fftPlot || !fftBtn) return;

        fftPlot.style.display = 'block';
        fftBtn.textContent = '📊 Computing...';
        fftBtn.disabled = true;

        try {
            const data = this.signalData.data[channelIdx];
            const fs = this.signalData.sampling_rate || 250;

            // Try backend first
            const response = await fetch(`${this.API_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: {
                        data: [data],
                        channels: [this.signalData.channels[channelIdx]],
                        sampling_rate: fs
                    },
                    type: 'fft'
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.results.fft) {
                Visualizations.renderFFT('fftPlot', result.results.fft[0], this.signalData.channels[channelIdx]);
            } else {
                // Local FFT
                const fftData = await this.computeLocalFFT(data, fs);
                Visualizations.renderFFT('fftPlot', fftData, this.signalData.channels[channelIdx]);
            }
        } catch (err) {
            // Local FFT as fallback
            const data = this.signalData.data[channelIdx];
            const fs = this.signalData.sampling_rate || 250;
            const fftData = await this.computeLocalFFT(data, fs);
            Visualizations.renderFFT('fftPlot', fftData, this.signalData.channels[channelIdx]);
        } finally {
            fftBtn.textContent = '📊 FFT';
            fftBtn.disabled = false;
        }
    }

    async computeLocalFFT(data, fs) {
        const n = data.length;
        const fftResult = [];
        const frequencies = [];

        // Create frequency axis
        for (let i = 0; i < n/2; i++) {
            frequencies.push(i * fs / n);
        }

        // Simple DFT (for demonstration)
        for (let k = 0; k < n/2; k++) {
            let real = 0;
            let imag = 0;
            for (let j = 0; j < n; j++) {
                const angle = 2 * Math.PI * k * j / n;
                real += data[j] * Math.cos(angle);
                imag -= data[j] * Math.sin(angle);
            }
            fftResult.push(Math.sqrt(real*real + imag*imag) / n);
        }

        return {
            channel: 'Channel',
            frequencies: frequencies,
            magnitudes: fftResult
        };
    }

    renderPolarView() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea || !this.signalData) return;

        contentArea.innerHTML = `
            <div class="plot-container">
                <div class="plot-title">
                    <span>🌀 POLAR COORDINATE VIEW - Periodicity Analysis</span>
                    <span style="color: #4a9eff;">Period: <span id="periodValue">${this.state.polarState.period}</span> samples</span>
                </div>
                
                <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Channel:</label>
                        <select id="polarChannel">
                            ${this.signalData.channels.map((ch, i) => 
                                `<option value="${i}" ${i === this.state.polarState.channel ? 'selected' : ''}>${ch}</option>`
                            ).join('')}
                        </select>
                    </div>
                    
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Period (samples):</label>
                        <input type="range" id="periodSlider" min="20" max="400" step="10" 
                               value="${this.state.polarState.period}" class="slider" style="width: 200px;">
                    </div>
                    
                    <div>
                        <label style="color: #8a9ab0; margin-right: 10px;">Mode:</label>
                        <select id="polarMode">
                            <option value="cumulative">Cumulative (all history)</option>
                            <option value="sliding">Sliding Window (latest period)</option>
                        </select>
                    </div>
                    
                    <button id="animatePolarBtn">
                        ${this.state.polarState.animate ? '⏸ Stop' : '▶ Animate'}
                    </button>
                    
                    <button id="resetPeriodBtn">Reset</button>
                    <button id="waveletBtn">🌊 Wavelet</button>
                </div>
                
                <div id="polarPlot" style="width:100%; height:400px"></div>
                <div id="waveletPlot" style="width:100%; height:300px; margin-top:20px; display:none;"></div>
                
                <div class="info-panel" style="margin-top: 20px;">
                    <strong>🎯 Clinical Interpretation:</strong>
                    <ul style="margin-top: 10px;">
                        <li>• ✅ <strong>Concentric circles</strong> = Perfect periodicity (regular rhythm)</li>
                        <li>• 🔄 <strong>Spiraling pattern</strong> = Regular rhythm with trend</li>
                        <li>• ⚠️ <strong>Irregular scatter</strong> = Arrhythmia / Non-periodic</li>
                        <li>• 📊 <strong>Period</strong> = Number of samples per cycle</li>
                    </ul>
                </div>
            </div>
        `;

        this.setupPolarEvents();
        this.updatePolarPlot();
    }

    setupPolarEvents() {
        const channelSelect = document.getElementById('polarChannel');
        const periodSlider = document.getElementById('periodSlider');
        const periodValue = document.getElementById('periodValue');
        const modeSelect = document.getElementById('polarMode');
        const animateBtn = document.getElementById('animatePolarBtn');
        const resetBtn = document.getElementById('resetPeriodBtn');
        const waveletBtn = document.getElementById('waveletBtn');

        let animationInterval = null;

        channelSelect.onchange = () => {
            this.state.polarState.channel = parseInt(channelSelect.value);
            this.updatePolarPlot();
        };

        periodSlider.oninput = (e) => {
            const val = parseInt(e.target.value);
            this.state.polarState.period = val;
            periodValue.textContent = val;
            this.updatePolarPlot();
        };

        modeSelect.onchange = () => {
            this.updatePolarPlot();
        };

        animateBtn.onclick = () => {
            if (animationInterval) {
                clearInterval(animationInterval);
                animationInterval = null;
                animateBtn.innerHTML = '▶ Animate';
                this.state.polarState.animate = false;
            } else {
                animateBtn.innerHTML = '⏸ Stop';
                this.state.polarState.animate = true;

                animationInterval = setInterval(() => {
                    let currentPeriod = parseInt(periodSlider.value);
                    currentPeriod += 10;
                    if (currentPeriod > 400) currentPeriod = 50;

                    periodSlider.value = currentPeriod;
                    periodValue.textContent = currentPeriod;
                    this.state.polarState.period = currentPeriod;

                    this.updatePolarPlot();
                }, 200);
            }
        };

        resetBtn.onclick = () => {
            if (animationInterval) {
                clearInterval(animationInterval);
                animationInterval = null;
                animateBtn.innerHTML = '▶ Animate';
                this.state.polarState.animate = false;
            }

            periodSlider.value = 100;
            periodValue.textContent = '100';
            this.state.polarState.period = 100;
            this.updatePolarPlot();
        };

        waveletBtn.onclick = async () => {
            await this.computeWavelet(parseInt(channelSelect.value));
        };
    }

    updatePolarPlot() {
        const ch = this.state.polarState.channel;
        const period = this.state.polarState.period;
        const mode = document.getElementById('polarMode')?.value || 'cumulative';

        Visualizations.renderPolar(
            'polarPlot',
            this.signalData.data[ch],
            period,
            this.signalData.channels[ch]
        );
    }

    async computeWavelet(channelIdx) {
        const waveletPlot = document.getElementById('waveletPlot');
        const waveletBtn = document.getElementById('waveletBtn');

        if (!waveletPlot || !waveletBtn) return;

        waveletPlot.style.display = 'block';
        waveletBtn.textContent = '🌊 Computing...';
        waveletBtn.disabled = true;

        try {
            const response = await fetch(`${this.API_URL}/wavelet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: {
                        data: [this.signalData.data[channelIdx]],
                        channels: [this.signalData.channels[channelIdx]]
                    }
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayWavelet(result.wavelet[0]);
            } else {
                this.displayLocalWavelet(channelIdx);
            }
        } catch (err) {
            console.warn('Wavelet failed, using local:', err);
            this.displayLocalWavelet(channelIdx);
        } finally {
            waveletBtn.textContent = '🌊 Wavelet';
            waveletBtn.disabled = false;
        }
    }

    displayWavelet(waveletData) {
        const container = document.getElementById('waveletPlot');
        if (!container) return;

        const trace = [{
            x: waveletData.scales,
            y: waveletData.coefficients,
            type: 'scatter',
            mode: 'lines',
            name: waveletData.channel,
            line: { color: '#4a9eff', width: 2 }
        }];

        const layout = {
            autosize: true,
            height: 300,
            margin: { l: 50, r: 30, t: 40, b: 50 },
            title: {
                text: `Wavelet Transform - ${waveletData.channel}`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: {
                title: 'Scale',
                gridcolor: '#2a2f3e'
            },
            yaxis: {
                title: 'Coefficient',
                gridcolor: '#2a2f3e'
            }
        };

        Plotly.newPlot('waveletPlot', trace, layout, { responsive: true, displaylogo: false });
    }

    displayLocalWavelet(channelIdx) {
        const container = document.getElementById('waveletPlot');
        if (!container) return;

        const data = this.signalData.data[channelIdx];
        const scales = Array.from({ length: 100 }, (_, i) => i + 1);

        // Simple wavelet simulation using convolution
        const coefficients = scales.map(scale => {
            let sum = 0;
            const windowSize = Math.min(50, Math.floor(data.length / scale));
            for (let i = 0; i < windowSize; i++) {
                sum += Math.abs(data[i]) * Math.exp(-i/scale);
            }
            return sum / windowSize;
        });

        const trace = [{
            x: scales,
            y: coefficients,
            type: 'scatter',
            mode: 'lines',
            name: this.signalData.channels[channelIdx],
            line: { color: '#4a9eff', width: 2 }
        }];

        const layout = {
            autosize: true,
            height: 300,
            margin: { l: 50, r: 30, t: 40, b: 50 },
            title: {
                text: `Wavelet Transform (Local) - ${this.signalData.channels[channelIdx]}`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: {
                title: 'Scale',
                gridcolor: '#2a2f3e'
            },
            yaxis: {
                title: 'Coefficient',
                gridcolor: '#2a2f3e'
            }
        };

        Plotly.newPlot('waveletPlot', trace, layout, { responsive: true, displaylogo: false });
    }

    toggleChannel(ch) {
        this.state.visibleChannels[ch] = !this.state.visibleChannels[ch];
        this.renderChannelsView();
    }

    toggleAllChannels(show) {
        this.signalData.channels.forEach(ch => {
            this.state.visibleChannels[ch] = show;
        });
        this.renderChannelsView();
    }

    togglePlayPause() {
        console.log('Toggle Play/Pause - Current state:', this.state.isPlaying);
        this.state.isPlaying = !this.state.isPlaying;

        if (this.state.isPlaying) {
            this.startPlayback();
        } else {
            this.stopPlayback();
        }

        // Update play button text
        const playBtn = document.querySelector('.controls button:first-child');
        if (playBtn) {
            playBtn.textContent = this.state.isPlaying ? '⏸ Pause' : '▶ Play';
            console.log('Play button updated to:', playBtn.textContent);
        }
    }

    startPlayback() {
        console.log('Starting playback with speed:', this.state.speed);

        // Stop any existing animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        const step = 20 * this.state.speed;
        const fs = this.signalData.sampling_rate || 250;

        const animate = () => {
            if (!this.state.isPlaying) {
                console.log('Playback stopped');
                return;
            }

            // Update position
            this.state.currentPosition += step;

            // Loop back to start if reached end
            if (this.state.currentPosition >= this.signalData.num_samples - 1000) {
                this.state.currentPosition = 0;
            }

            // Update zoom range
            this.state.zoomRange = [
                this.state.currentPosition,
                Math.min(this.state.currentPosition + 1000, this.signalData.num_samples)
            ];

            // Update time display
            UIManager.updateTimeDisplay(this.state.currentPosition / fs);

            // Update plots based on current view
            if (this.state.activeTab === 'channels') {
                if (this.state.viewMode === 'combined') {
                    Visualizations.renderChannels('channelsPlot', this.signalData, this.state);
                } else {
                    // Update each separate channel plot
                    this.signalData.channels.forEach((ch, idx) => {
                        if (this.state.visibleChannels[ch]) {
                            const plotId = `channelPlot_${idx}`;
                            const plotElement = document.getElementById(plotId);
                            if (plotElement) {
                                Visualizations.renderSingleChannel(plotId, this.signalData, idx, this.state);
                            }
                        }
                    });
                }
            }

            // Continue animation
            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    stopPlayback() {
        console.log('Stopping playback');
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.state.isPlaying = false;
    }

    resetPlayback() {
        console.log('Resetting playback');
        this.state.isPlaying = false;
        this.state.currentPosition = 0;
        this.state.zoomRange = [0, 1000];

        UIManager.updateTimeDisplay(0);

        // Update plots
        if (this.state.activeTab === 'channels') {
            if (this.state.viewMode === 'combined') {
                Visualizations.renderChannels('channelsPlot', this.signalData, this.state);
            } else {
                this.signalData.channels.forEach((ch, idx) => {
                    if (this.state.visibleChannels[ch]) {
                        const plotId = `channelPlot_${idx}`;
                        const plotElement = document.getElementById(plotId);
                        if (plotElement) {
                            Visualizations.renderSingleChannel(plotId, this.signalData, idx, this.state);
                        }
                    }
                });
            }
        }

        // Update play button
        const playBtn = document.querySelector('.controls button:first-child');
        if (playBtn) playBtn.textContent = '▶ Play';
    }

    async applyFilter(filterType, cutoff) {
        if (!this.signalData) {
            UIManager.showNotification('No data loaded', 'error');
            return;
        }

        UIManager.showLoading();

        try {
            const response = await fetch(`${this.API_URL}/filter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal: this.signalData.data[0], // Apply to first channel
                    filter_type: filterType,
                    cutoff: cutoff
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                // Update signal data with filtered version
                this.signalData.data[0] = result.filtered_signal;
                this.renderChannelsView();
                UIManager.showNotification(`Applied ${filterType} filter at ${cutoff}Hz`, 'success');

                // Update active filter button
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
            }
        } catch (err) {
            UIManager.showError('Filter failed: ' + err.message);
        } finally {
            UIManager.hideLoading();
        }
    }

    async exportData() {
        if (!this.signalData) return;

        const dataStr = JSON.stringify(this.signalData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'signal_data_export.json';
        a.click();

        URL.revokeObjectURL(url);
        UIManager.showNotification('Data exported successfully', 'success');
    }

    async exportPlot(format = 'png') {
        const plotElement = document.querySelector('.js-plotly-plot');
        if (!plotElement) return;

        try {
            const plotData = await Plotly.toImage(plotElement, { format: format, width: 1200, height: 800 });
            const link = document.createElement('a');
            link.download = `plot_${Date.now()}.${format}`;
            link.href = plotData;
            link.click();
            UIManager.showNotification(`Plot exported as ${format}`, 'success');
        } catch (err) {
            UIManager.showError('Failed to export plot');
        }
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on a page with the viewer
    if (document.getElementById('uploadArea')) {
        window.app = new SignalViewerApp();
    }
});

// Export functions for buttons
function applyFilter(type, cutoff) {
    if (window.app) window.app.applyFilter(type, cutoff);
}

function exportData() {
    if (window.app) window.app.exportData();
}

function exportPlot(format) {
    if (window.app) window.app.exportPlot(format);
}

function switchViewMode(mode) {
    if (window.app) window.app.switchViewMode(mode);
}