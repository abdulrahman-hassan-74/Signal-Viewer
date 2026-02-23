/**
 * Visualizations Module
 * All Plotly.js chart rendering for ECG/EEG viewers
 */

window.Visualizations = {

    COLORS: [
        '#00ff88', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24',
        '#ff9ff3', '#54a0ff', '#5f27cd', '#ff9f43', '#10ac84',
        '#ee5a24', '#0652DD', '#9b59b6', '#1abc9c', '#f39c12'
    ],

    darkLayout: {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#0d1117',
        font: { color: '#8a9ab0', family: 'Inter, sans-serif', size: 11 },
        margin: { l: 60, r: 20, t: 40, b: 50 },
        xaxis: {
            gridcolor: '#1e2633',
            zerolinecolor: '#1e2633',
            tickfont: { color: '#8a9ab0' }
        },
        yaxis: {
            gridcolor: '#1e2633',
            zerolinecolor: '#1e2633',
            tickfont: { color: '#8a9ab0' }
        }
    },

    config: {
        displayModeBar: true,
        modeBarButtonsToRemove: ['select2d', 'lasso2d'],
        displaylogo: false,
        responsive: true
    },

    /**
     * Render multi-channel signal viewer (stacked)
     */
    renderMultiChannel(containerId, signalData, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { data, channels, time, num_channels } = signalData;
        const visibleChannels = options.visibleChannels || channels.map((_, i) => i);
        const colors = options.colors || {};
        const thicknesses = options.thicknesses || {};

        const n = visibleChannels.length;
        if (n === 0) { container.innerHTML = '<p style="color:#8a9ab0;text-align:center;padding:40px">No channels selected</p>'; return; }

        // Downsample for performance
        const maxPts = 3000;
        const step = Math.max(1, Math.floor(time.length / maxPts));
        const t = time.filter((_, i) => i % step === 0);

        const traces = visibleChannels.map((chIdx, plotIdx) => {
            const chData = data[chIdx].filter((_, i) => i % step === 0);
            return {
                x: t,
                y: chData,
                type: 'scatter',
                mode: 'lines',
                name: channels[chIdx],
                line: {
                    color: colors[chIdx] || this.COLORS[chIdx % this.COLORS.length],
                    width: thicknesses[chIdx] || 1.5
                }
            };
        });

        const layout = {
            ...this.darkLayout,
            title: { text: `${n} Channel(s) — ${UI.formatDuration(time[time.length - 1] || 0)} total`, font: { color: '#4a9eff', size: 13 } },
            xaxis: { ...this.darkLayout.xaxis, title: 'Time (s)', rangeslider: { visible: false } },
            yaxis: { ...this.darkLayout.yaxis, title: 'Amplitude' },
            showlegend: true,
            legend: { bgcolor: 'rgba(0,0,0,0)', font: { color: '#8a9ab0', size: 10 } },
            height: Math.max(300, Math.min(600, n * 80 + 100))
        };

        Plotly.react(containerId, traces, layout, this.config);
    },

    /**
     * Render N small viewers (one per channel) - synchronized
     */
    renderSplitChannels(containerId, signalData, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { data, channels, time } = signalData;
        const visibleChannels = options.visibleChannels || channels.map((_, i) => i);
        const colors = options.colors || {};

        const maxPts = 2000;
        const step = Math.max(1, Math.floor(time.length / maxPts));
        const t = time.filter((_, i) => i % step === 0);

        container.innerHTML = '';

        visibleChannels.forEach((chIdx) => {
            const div = document.createElement('div');
            div.className = 'split-channel-plot';
            div.style.cssText = 'margin-bottom:10px; border: 1px solid #2a2f3e; border-radius: 8px; overflow:hidden;';
            const plotId = `plot-ch-${chIdx}`;
            div.innerHTML = `<div id="${plotId}"></div>`;
            container.appendChild(div);

            const chData = data[chIdx].filter((_, i) => i % step === 0);
            const trace = [{
                x: t, y: chData,
                type: 'scatter', mode: 'lines',
                name: channels[chIdx],
                line: { color: colors[chIdx] || this.COLORS[chIdx % this.COLORS.length], width: 1.5 }
            }];

            const layout = {
                ...this.darkLayout,
                height: 160,
                margin: { l: 50, r: 15, t: 30, b: 35 },
                title: { text: channels[chIdx], font: { color: colors[chIdx] || this.COLORS[chIdx % this.COLORS.length], size: 12 } },
                showlegend: false,
                xaxis: { ...this.darkLayout.xaxis, title: '' },
                yaxis: { ...this.darkLayout.yaxis, title: '' }
            };

            Plotly.newPlot(plotId, trace, layout, { ...this.config, displayModeBar: false });
        });

        // Sync zoom/pan across all plots
        visibleChannels.forEach((chIdx) => {
            const plotEl = document.getElementById(`plot-ch-${chIdx}`);
            if (!plotEl) return;
            plotEl.on('plotly_relayout', (eventData) => {
                visibleChannels.forEach((otherIdx) => {
                    if (otherIdx === chIdx) return;
                    const otherEl = document.getElementById(`plot-ch-${otherIdx}`);
                    if (otherEl && eventData['xaxis.range[0]'] !== undefined) {
                        Plotly.relayout(otherEl, {
                            'xaxis.range[0]': eventData['xaxis.range[0]'],
                            'xaxis.range[1]': eventData['xaxis.range[1]']
                        });
                    }
                });
            });
        });
    },

    /**
     * Render XOR graph
     */
    renderXOR(containerId, xorData) {
        const container = document.getElementById(containerId);
        if (!container || !xorData || xorData.error) {
            if (container) container.innerHTML = `<p style="color:#ef4444;padding:20px">XOR Error: ${xorData?.error || 'Unknown'}</p>`;
            return;
        }

        const timeAxis = xorData.time_axis || xorData.time_indices || [];
        const avgXor = xorData.avg_xor || [];

        // Average XOR over time (scalar per chunk)
        const traces = [];

        if (avgXor.length > 0) {
            traces.push({
                x: Array.from({ length: avgXor.length }, (_, i) => i),
                y: avgXor,
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Avg XOR per Chunk',
                line: { color: '#ff6b6b', width: 2 },
                marker: { size: 5, color: '#ff6b6b' },
                fill: 'tozeroy',
                fillcolor: 'rgba(255,107,107,0.1)'
            });
        }

        // Also plot the XOR overlay waveform (last chunk)
        const xorSeries = xorData.xor_series || xorData.xor_data || [];
        if (xorSeries.length > 0) {
            const lastChunk = xorSeries[xorSeries.length - 1];
            traces.push({
                x: Array.from({ length: lastChunk.length }, (_, i) => i),
                y: lastChunk,
                type: 'scatter',
                mode: 'lines',
                name: 'XOR Waveform (cumulative)',
                yaxis: 'y2',
                line: { color: '#4ecdc4', width: 1.5 },
                opacity: 0.8
            });
        }

        const layout = {
            ...this.darkLayout,
            title: { text: `⊕ XOR Graph — ${xorData.channel || 'CH1'} (${xorData.n_chunks || 0} chunks)`, font: { color: '#ff6b6b', size: 13 } },
            xaxis: { ...this.darkLayout.xaxis, title: 'Chunk Index' },
            yaxis: { ...this.darkLayout.yaxis, title: 'Average XOR Energy' },
            yaxis2: {
                ...this.darkLayout.yaxis,
                overlaying: 'y',
                side: 'right',
                title: 'XOR Amplitude',
                showgrid: false
            },
            showlegend: true,
            height: 400,
            annotations: [{
                x: 0.5, y: 1.05,
                xref: 'paper', yref: 'paper',
                text: '→ Zero = identical chunks (erased) | Spikes = signal changes',
                showarrow: false,
                font: { color: '#8a9ab0', size: 10 }
            }]
        };

        Plotly.react(containerId, traces, layout, this.config);
    },

    /**
     * Render Polar plot
     */
    renderPolar(containerId, polarData) {
        const container = document.getElementById(containerId);
        if (!container || !polarData || polarData.error) {
            if (container) container.innerHTML = `<p style="color:#ef4444;padding:20px">Polar Error: ${polarData?.error || 'Unknown'}</p>`;
            return;
        }

        // Convert theta from radians to degrees for Plotly
        const thetaDeg = (polarData.theta || []).map(t => {
            // Already in degrees if > 2*pi range, else convert
            return typeof t === 'number' ? (t > 7 ? t : t * 180 / Math.PI) : t;
        });

        const r = polarData.r || [];
        const n = thetaDeg.length;

        // Color based on time (fade from blue to red)
        const colors = Array.from({ length: n }, (_, i) => {
            const ratio = i / n;
            const r_ = Math.round(255 * ratio);
            const b = Math.round(255 * (1 - ratio));
            return `rgb(${r_}, 80, ${b})`;
        });

        const trace = {
            type: 'scatterpolar',
            r: r,
            theta: thetaDeg,
            mode: 'markers',
            marker: {
                color: Array.from({ length: n }, (_, i) => i / n),
                colorscale: 'Viridis',
                size: 3,
                opacity: 0.7,
                showscale: true,
                colorbar: { title: 'Time Progress', tickfont: { color: '#8a9ab0' } }
            },
            name: polarData.channel || 'Signal'
        };

        const layout = {
            ...this.darkLayout,
            polar: {
                bgcolor: '#0d1117',
                angularaxis: { gridcolor: '#1e2633', tickcolor: '#8a9ab0', tickfont: { color: '#8a9ab0' } },
                radialaxis: { gridcolor: '#1e2633', tickcolor: '#8a9ab0', tickfont: { color: '#8a9ab0' } }
            },
            title: {
                text: `🌀 Polar Plot — ${polarData.channel || 'CH1'} | Period: ${polarData.period_seconds || '?'}s | Mode: ${polarData.mode || 'cumulative'}`,
                font: { color: '#45b7d1', size: 13 }
            },
            height: 500,
            annotations: [{
                x: 0.5, y: -0.08,
                xref: 'paper', yref: 'paper',
                text: 'Concentric circles = periodic signal | Scatter = irregular',
                showarrow: false,
                font: { color: '#8a9ab0', size: 10 }
            }]
        };

        Plotly.react(containerId, [trace], layout, this.config);
    },

    /**
     * Render Recurrence plot (heatmap)
     */
    renderRecurrence(containerId, recData) {
        const container = document.getElementById(containerId);
        if (!container || !recData || recData.error) {
            if (container) container.innerHTML = `<p style="color:#ef4444;padding:20px">Recurrence Error: ${recData?.error || 'Unknown'}</p>`;
            return;
        }

        const matrix = recData.recurrence_matrix || [];
        if (!matrix.length) {
            container.innerHTML = '<p style="color:#8a9ab0;padding:20px">No recurrence data</p>';
            return;
        }

        const trace = {
            z: matrix,
            type: 'heatmap',
            colorscale: [
                [0, '#0d1117'],
                [1, '#4ecdc4']
            ],
            showscale: true,
            colorbar: {
                title: 'Recurrence',
                tickfont: { color: '#8a9ab0' }
            }
        };

        const layout = {
            ...this.darkLayout,
            title: {
                text: `🔁 Recurrence Plot — ${recData.x_channel || 'CH1'} vs ${recData.y_channel || 'CH2'} (Rate: ${(recData.recurrence_rate * 100).toFixed(1)}%)`,
                font: { color: '#4ecdc4', size: 13 }
            },
            xaxis: { ...this.darkLayout.xaxis, title: recData.x_channel || 'Channel X' },
            yaxis: { ...this.darkLayout.yaxis, title: recData.y_channel || 'Channel Y' },
            height: 500
        };

        Plotly.react(containerId, [trace], layout, this.config);
    },

    /**
     * Render correlation/sync matrix
     */
    renderSyncMatrix(containerId, matrix, channels) {
        if (!matrix || !matrix.length) return;
        const container = document.getElementById(containerId);
        if (!container) return;

        const trace = {
            z: matrix,
            x: channels,
            y: channels,
            type: 'heatmap',
            colorscale: 'RdBu',
            zmid: 0,
            zmin: -1, zmax: 1,
            showscale: true,
            text: matrix.map(row => row.map(v => v.toFixed(2))),
            texttemplate: '%{text}',
            colorbar: { title: 'Correlation', tickfont: { color: '#8a9ab0' } }
        };

        const layout = {
            ...this.darkLayout,
            title: { text: '📊 Channel Correlation Matrix', font: { color: '#f9ca24', size: 13 } },
            height: 350,
            margin: { l: 80, r: 20, t: 50, b: 80 }
        };

        Plotly.react(containerId, [trace], layout, this.config);
    },

    /**
     * Render PSD (Power Spectral Density)
     */
    renderPSD(containerId, signalData) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { data, channels, sampling_rate } = signalData;
        const fs = sampling_rate || 250;
        const traces = [];

        data.slice(0, 8).forEach((ch, i) => {
            // Simple PSD via FFT
            const n = Math.min(ch.length, 2048);
            const seg = ch.slice(0, n);
            const freqRes = fs / n;
            const freqs = Array.from({ length: n / 2 }, (_, j) => j * freqRes);

            // FFT magnitude
            const psd = this._simplePSD(seg, fs);

            traces.push({
                x: freqs.slice(0, psd.length),
                y: psd,
                type: 'scatter',
                mode: 'lines',
                name: channels[i],
                line: { color: this.COLORS[i % this.COLORS.length], width: 1.5 }
            });
        });

        const layout = {
            ...this.darkLayout,
            title: { text: '📈 Power Spectral Density', font: { color: '#f9ca24', size: 13 } },
            xaxis: { ...this.darkLayout.xaxis, title: 'Frequency (Hz)', range: [0, fs / 2] },
            yaxis: { ...this.darkLayout.yaxis, title: 'Power (log)', type: 'log' },
            showlegend: true,
            height: 300
        };

        Plotly.react(containerId, traces, layout, this.config);
    },

    _simplePSD(signal, fs) {
        // Simple periodogram
        const n = signal.length;
        const mean = signal.reduce((a, b) => a + b, 0) / n;
        const centered = signal.map(x => x - mean);
        // Apply Hann window
        const windowed = centered.map((x, i) => x * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)));
        // FFT via DFT (simplified)
        const psd = [];
        const halfN = Math.floor(n / 2);
        for (let k = 0; k < halfN; k++) {
            let re = 0, im = 0;
            for (let j = 0; j < n; j++) {
                const angle = -2 * Math.PI * k * j / n;
                re += windowed[j] * Math.cos(angle);
                im += windowed[j] * Math.sin(angle);
            }
            psd.push((re * re + im * im) / n);
            if (psd.length > 512) break; // limit for performance
        }
        return psd;
    }
};
