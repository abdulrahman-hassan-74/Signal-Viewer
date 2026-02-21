// Visualization Engine - Uses Plotly.js

const Visualizations = {

    colors: ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#ff8787',
             '#69db7e', '#4dabf7', '#ffa94d', '#9775fa', '#ff8c8c',
             '#74c0fc', '#b197fc'],

    // Render multi-channel viewer
    renderChannels: function(containerId, signalData, state) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { data, time, channels } = signalData;
        const { visibleChannels, zoomRange } = state;

        const traces = [];
        channels.forEach((ch, idx) => {
            if (visibleChannels[ch]) {
                traces.push({
                    x: time.slice(zoomRange[0], zoomRange[1]),
                    y: data[idx].slice(zoomRange[0], zoomRange[1]),
                    type: 'scatter',
                    mode: 'lines',
                    name: ch,
                    line: {
                        color: this.colors[idx % this.colors.length],
                        width: 1.5
                    }
                });
            }
        });

        const layout = {
            autosize: true,
            height: Math.max(200, Object.values(visibleChannels).filter(Boolean).length * 80),
            margin: { l: 50, r: 30, t: 30, b: 40 },
            showlegend: true,
            legend: {
                orientation: 'h',
                y: -0.15,
                x: 0.5,
                xanchor: 'center',
                font: { color: '#8a9ab0', size: 10 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0', size: 11 },
            xaxis: {
                title: 'Time (s)',
                gridcolor: '#2a2f3e',
                linecolor: '#3a4a6b'
            },
            yaxis: {
                title: 'Amplitude',
                gridcolor: '#2a2f3e',
                linecolor: '#3a4a6b'
            }
        };

        Plotly.newPlot(containerId, traces, layout, { responsive: true, displaylogo: false });
    },

    // Render single channel (for separate view)
    renderSingleChannel: function(containerId, signalData, channelIdx, state) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { data, time, channels } = signalData;
        const { zoomRange } = state;

        const ch = channels[channelIdx];
        const color = this.colors[channelIdx % this.colors.length];

        const traces = [{
            x: time.slice(zoomRange[0], zoomRange[1]),
            y: data[channelIdx].slice(zoomRange[0], zoomRange[1]),
            type: 'scatter',
            mode: 'lines',
            name: ch,
            line: {
                color: color,
                width: 1.5
            }
        }];

        const layout = {
            autosize: true,
            height: 200,
            margin: { l: 40, r: 20, t: 20, b: 30 },
            showlegend: false,
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0', size: 10 },
            xaxis: {
                title: 'Time (s)',
                gridcolor: '#2a2f3e',
                linecolor: '#3a4a6b',
                rangeslider: { visible: false }
            },
            yaxis: {
                title: 'Amplitude',
                gridcolor: '#2a2f3e',
                linecolor: '#3a4a6b'
            }
        };

        Plotly.newPlot(containerId, traces, layout, { responsive: true, displaylogo: false });
    },

    // Render synchronization matrix
    renderSyncMatrix: function(containerId, signalData) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { channels, sync_matrix } = signalData;

        const data = [{
            z: sync_matrix,
            x: channels,
            y: channels,
            type: 'heatmap',
            colorscale: [
                [0, '#ff6b6b'],
                [0.5, '#0f1422'],
                [1, '#4a9eff']
            ],
            zmin: -1,
            zmax: 1,
            showscale: true,
            colorbar: {
                title: 'Correlation',
                titleside: 'right',
                titlefont: { color: '#e0e0e0', size: 11 },
                tickfont: { color: '#e0e0e0', size: 10 }
            }
        }];

        const layout = {
            autosize: true,
            height: 350,
            margin: { l: 80, r: 80, t: 30, b: 80 },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0', size: 10 },
            xaxis: { tickangle: -45 },
            yaxis: {}
        };

        Plotly.newPlot(containerId, data, layout, { responsive: true, displaylogo: false });
    },

    // Render recurrence plot
    renderRecurrence: function(containerId, signal1, signal2, threshold, channel1Name, channel2Name) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Compute recurrence matrix
        const n = Math.min(200, signal1.length, signal2.length);
        const step = Math.floor(signal1.length / n);

        const recurrence = Array.from({ length: n }, () => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const val1 = signal1[i * step];
                const val2 = signal2[j * step];
                if (Math.abs(val1 - val2) < threshold) {
                    recurrence[i][j] = 1;
                }
            }
        }

        const data = [{
            z: recurrence,
            type: 'heatmap',
            colorscale: [
                [0, '#0f1422'],
                [1, '#4a9eff']
            ],
            showscale: false
        }];

        const layout = {
            autosize: true,
            height: 400,
            margin: { l: 50, r: 30, t: 40, b: 50 },
            title: {
                text: `Recurrence: ${channel1Name} vs ${channel2Name}`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: { title: channel1Name },
            yaxis: { title: channel2Name }
        };

        Plotly.newPlot(containerId, data, layout, { responsive: true, displaylogo: false });
    },

    // Render polar plot
    renderPolar: function(containerId, signal, period, channelName) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const maxSamples = Math.min(800, signal.length);
        const segment = signal.slice(0, maxSamples);

        const theta = Array.from({ length: segment.length }, (_, i) =>
            (2 * Math.PI * (i % period)) / period * 180 / Math.PI
        );

        const r = segment.map(v => Math.abs(v) * 3 + 1);

        const data = [{
            type: 'scatterpolar',
            mode: 'lines+markers',
            theta: theta,
            r: r,
            line: { color: '#4a9eff', width: 1.5 },
            marker: { color: '#4a9eff', size: 2, opacity: 0.6 },
            name: channelName
        }];

        const layout = {
            autosize: true,
            height: 450,
            margin: { l: 80, r: 80, t: 60, b: 60 },
            title: {
                text: `Polar Display - ${channelName} (θ = time, r = amplitude)`,
                font: { color: '#e0e0e0', size: 14 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            polar: {
                bgcolor: '#0f1422',
                radialaxis: {
                    gridcolor: '#2a2f3e',
                    linecolor: '#3a4a6b'
                },
                angularaxis: {
                    gridcolor: '#2a2f3e',
                    linecolor: '#3a4a6b'
                }
            }
        };

        Plotly.newPlot(containerId, data, layout, { responsive: true, displaylogo: false });
    },

    // Render FFT plot
    renderFFT: function(containerId, fftData, channelName) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const data = [{
            x: fftData.frequencies,
            y: fftData.magnitudes,
            type: 'scatter',
            mode: 'lines',
            name: channelName,
            line: { color: '#4a9eff', width: 1.5 }
        }];

        const layout = {
            autosize: true,
            height: 300,
            margin: { l: 50, r: 30, t: 30, b: 40 },
            title: {
                text: `Frequency Spectrum - ${channelName}`,
                font: { color: '#e0e0e0', size: 12 }
            },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            xaxis: { title: 'Frequency (Hz)' },
            yaxis: { title: 'Magnitude' }
        };

        Plotly.newPlot(containerId, data, layout, { responsive: true, displaylogo: false });
    },

    // Render statistics bar chart
    renderStatistics: function(containerId, statsData) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const traces = [{
            x: statsData.map(s => s.channel),
            y: statsData.map(s => s.mean),
            type: 'bar',
            name: 'Mean',
            marker: { color: '#4a9eff' }
        }, {
            x: statsData.map(s => s.channel),
            y: statsData.map(s => s.std),
            type: 'bar',
            name: 'Std Dev',
            marker: { color: '#ff6b6b' }
        }, {
            x: statsData.map(s => s.channel),
            y: statsData.map(s => s.rms),
            type: 'bar',
            name: 'RMS',
            marker: { color: '#51cf66' }
        }];

        const layout = {
            autosize: true,
            height: 250,
            margin: { l: 50, r: 30, t: 30, b: 50 },
            barmode: 'group',
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#0f1422',
            font: { color: '#e0e0e0' },
            showlegend: true,
            legend: { orientation: 'h', y: 1.1 }
        };

        Plotly.newPlot(containerId, traces, layout, { responsive: true, displaylogo: false });
    }
};