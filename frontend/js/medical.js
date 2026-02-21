/**
 * Medical Signal Viewer – Complete JS Application
 * Handles: file upload, demo signals, all viewer types (combined/separate,
 *          XOR, polar, recurrence, FFT), AI + classic ML results, channel
 *          controls, filter, playback.
 */

const COLORS = [
    '#4a9eff','#ff6b6b','#51cf66','#ffd43b','#ff8787',
    '#69db7e','#4dabf7','#ffa94d','#9775fa','#ff8c8c',
    '#74c0fc','#b197fc','#63e6be','#f783ac',
];

const API = 'http://127.0.0.1:5000/api';

const PLOT_CFG = {
    paper_bgcolor:'#0f1422', plot_bgcolor:'#080d18',
    font:{ color:'#e0e8ff', size:11 },
    margin:{ l:55, r:30, t:35, b:45 },
    xaxis:{ gridcolor:'#1a2535', linecolor:'#2a3550', zerolinecolor:'#2a3550' },
    yaxis:{ gridcolor:'#1a2535', linecolor:'#2a3550', zerolinecolor:'#2a3550' },
};
const PLOTLY_CFG = { responsive:true, displaylogo:false,
    modeBarButtonsToRemove:['lasso2d','select2d'] };

// ─────────────────────────────────────────────────────────────────────────────
class MedicalApp {
    constructor() {
        this.signalData    = null;
        this.origData      = null;   // pre-filter copy
        this.activeTab     = 'channels';
        this.viewMode      = 'combined';
        this.visibleCh     = {};
        this.isPlaying     = false;
        this.animId        = null;
        this.position      = 0;
        this.speed         = 1;
        this.windowSamples = 1250;   // 5 s × 250 Hz
        this._bindEvents();
    }

    // ── init ────────────────────────────────────────────────────────────────
    _bindEvents() {
        // Upload
        const box   = document.getElementById('uploadBox');
        const input = document.getElementById('fileInput');
        box.onclick  = () => input.click();
        input.onchange = e => this._loadFile(e.target.files[0]);
        box.ondragover  = e => { e.preventDefault(); box.classList.add('dragover'); };
        box.ondragleave = () => box.classList.remove('dragover');
        box.ondrop      = e => { e.preventDefault(); box.classList.remove('dragover'); this._loadFile(e.dataTransfer.files[0]); };

        // Demo buttons
        document.querySelectorAll('.demo-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.demo-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._loadDemo(btn.dataset.type);
            };
        });
    }

    // ── file upload ─────────────────────────────────────────────────────────
    async _loadFile(file) {
        if (!file) return;
        this._showLoading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res  = await fetch(`${API}/upload`, { method:'POST', body:fd });
            const json = await res.json();
            if (json.status === 'success') {
                this._onDataLoaded(json.signal_data);
            } else {
                this._notify(json.error || 'Upload failed', 'error');
            }
        } catch(e) {
            this._notify('Cannot reach backend: ' + e.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    // ── demo signal ─────────────────────────────────────────────────────────
    async _loadDemo(type) {
        this._showLoading(true);
        try {
            const res  = await fetch(`${API}/medical/simulate`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ abnormality:type, duration:20, n_channels:4 }),
            });
            const json = await res.json();
            if (json.status === 'success') {
                this._onDataLoaded(json.signal_data);
                this._notify(`Demo loaded: ${type}`, 'success');
            } else {
                this._notify(json.error || 'Demo failed', 'error');
            }
        } catch(e) {
            this._notify('Backend offline – ' + e.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    // ── data ready ──────────────────────────────────────────────────────────
    _onDataLoaded(sd) {
        this.signalData  = sd;
        this.origData    = JSON.parse(JSON.stringify(sd));  // deep copy
        this.position    = 0;
        this.isPlaying   = false;

        // default: show first 8 channels
        this.visibleCh = {};
        sd.channels.forEach((ch, i) => { this.visibleCh[ch] = i < 8; });

        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('filterBar').classList.remove('hidden');

        this._populateSelects();
        this._buildChList();
        this.switchTab('channels');
        this._runMedicalAnalysis();
        this._renderSyncMatrix();
        this._notify(`Loaded: ${sd.num_channels} channels, ${sd.num_samples} samples @ ${sd.sampling_rate} Hz`, 'success');
    }

    // ── populate channel dropdowns ───────────────────────────────────────────
    _populateSelects() {
        const chs = this.signalData.channels;
        ['xorChannel','polarChannel','fftChannel','recChX','recChY'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = chs.map((c, i) => `<option value="${i}">${c}</option>`).join('');
        });
        // default second channel for recChY
        const recY = document.getElementById('recChY');
        if (recY && chs.length > 1) recY.value = 1;
    }

    // ── channel checkbox list ────────────────────────────────────────────────
    _buildChList() {
        const list = document.getElementById('chList');
        const chs  = this.signalData.channels;
        list.innerHTML = chs.map((ch, i) => `
            <div class="ch-item">
                <span class="ch-color-dot" style="background:${COLORS[i % COLORS.length]}"></span>
                <input type="checkbox" id="ch_${i}" ${this.visibleCh[ch] ? 'checked' : ''}
                    onchange="app.toggleChannel('${ch}')">
                <label class="ch-label" for="ch_${i}" style="color:${COLORS[i % COLORS.length]}">${ch}</label>
            </div>
        `).join('');
    }

    toggleChannel(ch) {
        this.visibleCh[ch] = !this.visibleCh[ch];
        this._rerenderCurrentTab();
    }

    selectAllChannels(val) {
        this.signalData.channels.forEach(ch => { this.visibleCh[ch] = val; });
        this._buildChList();
        this._rerenderCurrentTab();
    }

    // ── tabs ─────────────────────────────────────────────────────────────────
    switchTab(tab, btnEl) {
        this.activeTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        else {
            const b = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
            if (b) b.classList.add('active');
        }
        // toggle control bars
        ['channelControls','xorControls','polarControls','recurrenceControls','fftControls'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
        const ctrlMap = { channels:'channelControls', xor:'xorControls',
                          polar:'polarControls', recurrence:'recurrenceControls', fft:'fftControls' };
        document.getElementById(ctrlMap[tab])?.classList.remove('hidden');

        this._rerenderCurrentTab();
    }

    _rerenderCurrentTab() {
        if (!this.signalData) return;
        switch(this.activeTab) {
            case 'channels':   this._renderChannels();   break;
            case 'xor':        this.renderXOR();         break;
            case 'polar':      this.renderPolar();       break;
            case 'recurrence': this.renderRecurrence();  break;
            case 'fft':        this.renderFFT();         break;
        }
    }

    // ── VIEW MODE ────────────────────────────────────────────────────────────
    setViewMode(mode, btn) {
        this.viewMode = mode;
        document.querySelectorAll('#channelControls .ctrl-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this._renderChannels();
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CHANNEL VIEW
    // ════════════════════════════════════════════════════════════════════════
    _renderChannels() {
        if (!this.signalData) return;
        const { data, time, channels } = this.signalData;
        const lo = this.position;
        const hi = Math.min(lo + this.windowSamples, this.signalData.num_samples);
        const tSlice = time.slice(lo, hi);

        const plotArea = document.getElementById('plotArea');

        if (this.viewMode === 'combined') {
            plotArea.innerHTML = '<div id="combinedPlot" class="plotly-container"></div>';
            const traces = [];
            channels.forEach((ch, i) => {
                if (!this.visibleCh[ch]) return;
                traces.push({
                    x: tSlice, y: data[i].slice(lo, hi),
                    type:'scatter', mode:'lines', name:ch,
                    line:{ color:COLORS[i % COLORS.length], width:1.5 },
                });
            });
            Plotly.newPlot('combinedPlot', traces,
                { ...PLOT_CFG, height:420, autosize:true, showlegend:true,
                  legend:{ orientation:'h', y:-0.2 },
                  xaxis:{ ...PLOT_CFG.xaxis, title:'Time (s)' },
                  yaxis:{ ...PLOT_CFG.yaxis, title:'Amplitude' } },
                PLOTLY_CFG);
        } else {
            // Separate: one plot per visible channel
            const visible = channels.filter(ch => this.visibleCh[ch]);
            plotArea.innerHTML = visible.map((ch, idx) =>
                `<div id="chPlot_${idx}" class="plotly-container" style="margin-bottom:8px"></div>`
            ).join('');
            visible.forEach((ch, idx) => {
                const ci = channels.indexOf(ch);
                Plotly.newPlot(`chPlot_${idx}`,
                    [{ x:tSlice, y:data[ci].slice(lo, hi), type:'scatter', mode:'lines',
                       name:ch, line:{ color:COLORS[ci % COLORS.length], width:1.5 } }],
                    { ...PLOT_CFG, height:160, autosize:true, showlegend:false,
                      title:{ text:ch, font:{size:12,color:'#8a9ab0'} },
                      xaxis:{ ...PLOT_CFG.xaxis, title:'Time (s)' },
                      yaxis:{ ...PLOT_CFG.yaxis } },
                    PLOTLY_CFG);
            });
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  XOR GRAPH
    // ════════════════════════════════════════════════════════════════════════
    async renderXOR() {
        if (!this.signalData) return;
        const chIdx  = parseInt(document.getElementById('xorChannel')?.value ?? 0);
        const chunks = parseInt(document.getElementById('xorChunkSize')?.value ?? 250);

        this._showLoading(true);
        try {
            const res  = await fetch(`${API}/medical/xor`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ signal_data:this.signalData, chunk_size:chunks, channel_idx:chIdx }),
            });
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.error);
            const xd = json.xor;

            const plotArea = document.getElementById('plotArea');
            plotArea.innerHTML = `
                <div id="xorOverlayPlot" class="plotly-container"></div>
                <div id="xorAvgPlot" class="plotly-container" style="margin-top:8px"></div>
                <div style="margin-top:8px;padding:10px;background:var(--bg0);border-radius:8px;border:1px solid var(--border);font-size:12px;color:var(--muted)">
                    ℹ️ ${xd.interpretation} | Chunk: ${xd.chunk_size_sec.toFixed(2)}s | N chunks: ${xd.n_chunks}
                </div>
            `;

            // Overlay of all XOR chunks
            const traces = xd.xor_series.map((chunk, i) => ({
                x: xd.time_axis, y: chunk,
                type:'scatter', mode:'lines', showlegend:false,
                line:{ color:COLORS[i % COLORS.length], width:1, opacity:0.6 },
                opacity: 0.6,
            }));
            Plotly.newPlot('xorOverlayPlot', traces,
                { ...PLOT_CFG, height:280, autosize:true,
                  title:{ text:`XOR Overlay – ${xd.channel}`, font:{size:13,color:'#e0e8ff'} },
                  xaxis:{ ...PLOT_CFG.xaxis, title:'Time within chunk (s)' },
                  yaxis:{ ...PLOT_CFG.yaxis, title:'|Δ Amplitude|' } },
                PLOTLY_CFG);

            // Average XOR per chunk
            Plotly.newPlot('xorAvgPlot',
                [{ x: Array.from({length:xd.avg_xor.length}, (_,i)=>i+1),
                   y: xd.avg_xor, type:'scatter', mode:'lines+markers',
                   line:{ color:'#ffd43b', width:2 },
                   marker:{ color:'#ffd43b', size:5 }, name:'Avg |XOR|' }],
                { ...PLOT_CFG, height:200, autosize:true,
                  title:{ text:'Mean |XOR| per chunk (change over time)', font:{size:12,color:'#8a9ab0'} },
                  xaxis:{ ...PLOT_CFG.xaxis, title:'Chunk index' },
                  yaxis:{ ...PLOT_CFG.yaxis, title:'Mean |Δ|' } },
                PLOTLY_CFG);

        } catch(e) {
            this._notify('XOR failed: ' + e.message, 'error');
            document.getElementById('plotArea').innerHTML =
                `<div class="empty-state"><p>${e.message}</p></div>`;
        } finally {
            this._showLoading(false);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  POLAR VIEW
    // ════════════════════════════════════════════════════════════════════════
    async renderPolar() {
        if (!this.signalData) return;
        const chIdx  = parseInt(document.getElementById('polarChannel')?.value ?? 0);
        const period = parseInt(document.getElementById('polarPeriod')?.value ?? 100);
        const mode   = document.getElementById('polarMode')?.value ?? 'cumulative';

        this._showLoading(true);
        try {
            const res  = await fetch(`${API}/medical/polar`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ signal_data:this.signalData, channel_idx:chIdx, period, mode }),
            });
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.error);
            const pd = json.polar;

            const thetaDeg = pd.theta.map(t => t * 180 / Math.PI);
            document.getElementById('plotArea').innerHTML =
                '<div id="polarPlot" class="plotly-container" style="min-height:420px"></div>';

            Plotly.newPlot('polarPlot',
                [{ type:'scatterpolar', mode:'lines+markers',
                   theta:thetaDeg, r:pd.r,
                   line:{ color:'#4a9eff', width:1.5 },
                   marker:{ color:thetaDeg.map(t => t), colorscale:'Viridis',
                            size:3, opacity:0.7, showscale:true,
                            colorbar:{ title:'θ (°)', titlefont:{color:'#8a9ab0'}, tickfont:{color:'#8a9ab0'} } },
                   name:pd.channel }],
                { ...PLOT_CFG, height:450, autosize:true,
                  title:{ text:`Polar – ${pd.channel} | θ=time mod ${pd.period_seconds.toFixed(2)}s, r=|amplitude|`, font:{size:13,color:'#e0e8ff'} },
                  polar:{ bgcolor:'#080d18',
                          radialaxis:{ gridcolor:'#1a2535', linecolor:'#2a3550', tickfont:{color:'#8a9ab0'} },
                          angularaxis:{ gridcolor:'#1a2535', linecolor:'#2a3550', tickfont:{color:'#8a9ab0'} } } },
                PLOTLY_CFG);
        } catch(e) {
            this._notify('Polar failed: ' + e.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  RECURRENCE PLOT (chX vs chY cumulative scatter)
    // ════════════════════════════════════════════════════════════════════════
    async renderRecurrence() {
        if (!this.signalData) return;
        const chX   = parseInt(document.getElementById('recChX')?.value ?? 0);
        const chY   = parseInt(document.getElementById('recChY')?.value ?? 1);
        const thr   = parseFloat(document.getElementById('recThreshold')?.value ?? 0.3);
        const cmap  = document.getElementById('recColormap')?.value ?? 'Blues';

        this._showLoading(true);
        try {
            const res  = await fetch(`${API}/medical/recurrence`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ signal_data:this.signalData, ch_x:chX, ch_y:chY, threshold:thr }),
            });
            const json = await res.json();
            if (json.status !== 'success') throw new Error(json.error);
            const rd = json.recurrence;

            document.getElementById('plotArea').innerHTML =
                '<div id="recPlot" class="plotly-container" style="min-height:420px"></div>';

            Plotly.newPlot('recPlot',
                [{ z:rd.recurrence_matrix, type:'heatmap', colorscale:cmap,
                   showscale:true,
                   colorbar:{ title:'Match', titlefont:{color:'#8a9ab0'}, tickfont:{color:'#8a9ab0'} } }],
                { ...PLOT_CFG, height:450, autosize:true,
                  title:{ text:`Recurrence: ${rd.x_channel} vs ${rd.y_channel}  |  RR=${(rd.recurrence_rate*100).toFixed(1)}%  |  threshold=${thr}`,
                          font:{size:13,color:'#e0e8ff'} },
                  xaxis:{ ...PLOT_CFG.xaxis, title:rd.x_channel },
                  yaxis:{ ...PLOT_CFG.yaxis, title:rd.y_channel } },
                PLOTLY_CFG);
        } catch(e) {
            this._notify('Recurrence failed: ' + e.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  FFT
    // ════════════════════════════════════════════════════════════════════════
    async renderFFT() {
        if (!this.signalData) return;
        const chIdx = parseInt(document.getElementById('fftChannel')?.value ?? 0);
        const { data, channels, sampling_rate } = this.signalData;
        const ch   = data[chIdx];
        const fs   = sampling_rate || 250;
        const n    = Math.min(ch.length, 5000);
        const sig  = ch.slice(0, n);

        // Client-side FFT via DFT (no external lib dependency)
        const freqs = [], mags = [];
        const step  = fs / n;
        for (let k = 0; k < n / 2; k++) {
            let re = 0, im = 0;
            for (let t = 0; t < n; t++) {
                const angle = 2 * Math.PI * k * t / n;
                re += sig[t] * Math.cos(angle);
                im -= sig[t] * Math.sin(angle);
            }
            freqs.push(k * step);
            mags.push(Math.sqrt(re*re + im*im) / n);
            if (k > 500) break;   // limit for speed
        }

        document.getElementById('plotArea').innerHTML =
            '<div id="fftPlot" class="plotly-container"></div>';

        Plotly.newPlot('fftPlot',
            [{ x:freqs, y:mags, type:'scatter', mode:'lines',
               line:{ color:'#4a9eff', width:1.5 }, name:channels[chIdx] }],
            { ...PLOT_CFG, height:380, autosize:true,
              title:{ text:`Frequency Spectrum – ${channels[chIdx]}`, font:{size:13,color:'#e0e8ff'} },
              xaxis:{ ...PLOT_CFG.xaxis, title:'Frequency (Hz)' },
              yaxis:{ ...PLOT_CFG.yaxis, title:'Magnitude' } },
            PLOTLY_CFG);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  SYNC MATRIX
    // ════════════════════════════════════════════════════════════════════════
    _renderSyncMatrix() {
        const sm = this.signalData?.sync_matrix;
        if (!sm || sm.length === 0) return;
        const chs = this.signalData.channels;
        Plotly.newPlot('syncMatrixPlot',
            [{ z:sm, x:chs, y:chs, type:'heatmap',
               colorscale:[['0','#ff6b6b'],['0.5','#080d18'],['1','#4a9eff']],
               zmin:-1, zmax:1, showscale:true,
               colorbar:{ title:'r', titlefont:{color:'#8a9ab0'}, tickfont:{color:'#8a9ab0'} } }],
            { ...PLOT_CFG, height:260, autosize:true, margin:{l:70,r:60,t:20,b:70},
              xaxis:{ tickangle:-40, tickfont:{size:10} },
              yaxis:{ tickfont:{size:10} } },
            PLOTLY_CFG);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  AI + CLASSIC ML ANALYSIS
    // ════════════════════════════════════════════════════════════════════════
    async _runMedicalAnalysis() {
        try {
            const res  = await fetch(`${API}/medical/analyze`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ signal_data:this.signalData }),
            });
            const json = await res.json();
            if (json.status === 'success') {
                this._showAIResult(json.ai_detection);
                this._showClassicResult(json.classic_comparison);
                this._showChStats(json.ai_detection.channel_features);
            }
        } catch(e) {
            document.getElementById('aiResult').innerHTML =
                `<p style="color:var(--danger);font-size:12px">Analysis error: ${e.message}</p>`;
        }
    }

    _showAIResult(ai) {
        const isAbn  = ai.is_abnormal;
        const cls    = isAbn ? 'dx-abnormal' : 'dx-normal';
        const conf   = Math.round(ai.confidence * 100);
        const barCol = isAbn ? '#ff6b6b' : '#51cf66';
        document.getElementById('aiResult').innerHTML = `
            <div class="dx-card ${cls}">
                <div class="dx-title">🧠 ${ai.model_used}</div>
                <div class="dx-label">${ai.classification}</div>
                <div class="conf-bar-wrap">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px">
                        <span>Confidence</span><span>${conf}%</span>
                    </div>
                    <div class="conf-bar"><div class="conf-bar-fill" style="width:${conf}%;background:${barCol}"></div></div>
                </div>
                <div class="dx-meta">
                    <div class="dx-meta-item">
                        <small>Model accuracy</small>
                        <strong>${Math.round(ai.model_accuracy*100)}%</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Channels used</small>
                        <strong>${ai.global_features?.n_channels ?? '—'}</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Mean HR</small>
                        <strong>${ai.global_features?.mean_hr ?? '—'} bpm</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Status</small>
                        <strong>${isAbn ? '⚠️ Abnormal' : '✅ Normal'}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    _showClassicResult(cl) {
        if (!cl || cl.error) {
            document.getElementById('classicResult').innerHTML =
                `<p style="color:var(--danger);font-size:12px">${cl?.error ?? 'No result'}</p>`;
            return;
        }
        const conf = Math.round((cl.confidence ?? 0) * 100);
        document.getElementById('classicResult').innerHTML = `
            <div class="classic-card">
                <h4>${cl.method}</h4>
                <div style="margin-bottom:8px;font-size:1rem;font-weight:700;color:var(--accent)">${cl.classification}</div>
                <div class="conf-bar-wrap">
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px">
                        <span>Confidence</span><span>${conf}%</span>
                    </div>
                    <div class="conf-bar"><div class="conf-bar-fill" style="width:${conf}%;background:#ffd43b"></div></div>
                </div>
                <div class="kv-grid" style="margin-top:10px">
                    <div class="kv"><small>Heart Rate</small><strong>${cl.heart_rate} bpm</strong></div>
                    <div class="kv"><small>Regularity</small><strong>${Math.round(cl.regularity*100)}%</strong></div>
                    <div class="kv"><small>SDNN</small><strong>${cl.sdnn_ms} ms</strong></div>
                    <div class="kv"><small>RMSSD</small><strong>${cl.rmssd_ms} ms</strong></div>
                    <div class="kv"><small>LF/HF Ratio</small><strong>${cl.lf_hf_ratio}</strong></div>
                    <div class="kv"><small>ZCR</small><strong>${cl.zero_crossing_rate?.toFixed(2) ?? '—'}</strong></div>
                </div>
            </div>
        `;
    }

    _showChStats(features) {
        if (!features || !features.length) return;
        const rows = features.map((f, i) => `
            <tr>
                <td style="color:${COLORS[i % COLORS.length]}">${f.channel}</td>
                <td>${f.hr_bpm ?? '—'}</td>
                <td>${f.sdnn_ms ?? '—'}</td>
                <td>${f.rmssd_ms ?? '—'}</td>
                <td>${Math.round((f.regularity ?? 0)*100)}%</td>
            </tr>
        `).join('');
        document.getElementById('chStatsTable').innerHTML = `
            <table class="ch-stats">
                <thead><tr><th>Channel</th><th>HR(bpm)</th><th>SDNN</th><th>RMSSD</th><th>Reg%</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  FILTER
    // ════════════════════════════════════════════════════════════════════════
    async applyFilter(type, cutoff, btn) {
        if (!this.signalData) return;
        this._showLoading(true);
        try {
            const results = await Promise.all(this.signalData.data.map(async (ch, i) => {
                const res  = await fetch(`${API}/filter`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ signal:ch, filter_type:type, cutoff }),
                });
                const json = await res.json();
                return json.filtered_signal ?? ch;
            }));
            this.signalData.data = results;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            this._rerenderCurrentTab();
            this._notify(`Filter applied: ${type} @ ${cutoff} Hz`, 'success');
        } catch(e) {
            this._notify('Filter failed: ' + e.message, 'error');
        } finally {
            this._showLoading(false);
        }
    }

    resetFilter(btn) {
        if (this.origData) {
            this.signalData.data = JSON.parse(JSON.stringify(this.origData.data));
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            this._rerenderCurrentTab();
            this._notify('Filter reset', 'info');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PLAYBACK
    // ════════════════════════════════════════════════════════════════════════
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        document.getElementById('playBtn').textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
        if (this.isPlaying) this._animate();
        else { if (this.animId) cancelAnimationFrame(this.animId); }
    }

    _animate() {
        if (!this.isPlaying) return;
        const step = Math.round(10 * this.speed);
        this.position += step;
        if (this.position >= this.signalData.num_samples - this.windowSamples) this.position = 0;
        document.getElementById('timeLabel').textContent =
            `${(this.position / (this.signalData.sampling_rate || 250)).toFixed(1)} s`;
        if (this.activeTab === 'channels') this._renderChannels();
        this.animId = requestAnimationFrame(() => this._animate());
    }

    resetPlayback() {
        this.isPlaying = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        this.position = 0;
        document.getElementById('playBtn').textContent = '▶ Play';
        document.getElementById('timeLabel').textContent = '0.0 s';
        this._rerenderCurrentTab();
    }

    setSpeed(v) {
        this.speed = parseFloat(v);
        document.getElementById('speedLabel').textContent = `${this.speed}×`;
    }

    // ── utils ─────────────────────────────────────────────────────────────
    _showLoading(show) {
        document.getElementById('loadingOverlay').classList.toggle('active', show);
    }

    _notify(msg, type='info') {
        const c = document.getElementById('notifContainer');
        const d = document.createElement('div');
        d.className = `notif-item notif-${type}`;
        d.textContent = msg;
        c.appendChild(d);
        setTimeout(() => {
            d.style.animation = 'slideOut .3s ease forwards';
            setTimeout(() => d.remove(), 350);
        }, 4000);
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MedicalApp();
});