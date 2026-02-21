// Signal Parser - Uses Backend API

const SignalParser = {

    // Use the correct backend URL on port 5000
    API_URL: 'http://127.0.0.1:5000/api',

    // Parse file by uploading to backend
    parseFile: async function(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);

            console.log('Uploading to:', this.API_URL + '/upload');

            const response = await fetch(`${this.API_URL}/upload`, {
                method: 'POST',
                body: formData,
                mode: 'cors'
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const result = await response.json();
            console.log('Parse successful:', result);

            if (result.status === 'success') {
                return result.signal_data;
            } else {
                throw new Error(result.error || 'Parse failed');
            }

        } catch (err) {
            console.error('Parse error:', err);
            throw err;
        }
    },

    // Analyze signal
    analyzeSignal: async function(signalData, analysisType = 'full') {
        try {
            const response = await fetch(`${this.API_URL}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    signal_data: signalData,
                    type: analysisType
                }),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const result = await response.json();
            return result.results;

        } catch (err) {
            console.error('Analysis error:', err);
            throw err;
        }
    },

    // Compute recurrence plot
    computeRecurrence: async function(signal1, signal2, threshold) {
        try {
            const response = await fetch(`${this.API_URL}/recurrence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    signal1: signal1,
                    signal2: signal2,
                    threshold: threshold
                }),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('Recurrence computation failed');
            }

            const result = await response.json();
            return result.recurrence;

        } catch (err) {
            console.error('Recurrence error:', err);
            throw err;
        }
    },

    // Apply filter
    filterSignal: async function(signal, filterType, cutoff, order) {
        try {
            const response = await fetch(`${this.API_URL}/filter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    signal: signal,
                    filter_type: filterType,
                    cutoff: cutoff,
                    order: order
                }),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('Filter failed');
            }

            const result = await response.json();
            return result.filtered_signal;

        } catch (err) {
            console.error('Filter error:', err);
            throw err;
        }
    },

    // Compute wavelet transform
    computeWavelet: async function(signalData) {
        try {
            const response = await fetch(`${this.API_URL}/wavelet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    signal_data: signalData
                }),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error('Wavelet computation failed');
            }

            const result = await response.json();
            return result.wavelet;

        } catch (err) {
            console.error('Wavelet error:', err);
            throw err;
        }
    },

    // Calculate sync matrix locally (fallback)
    calculateSyncMatrix: function(data) {
        try {
            // Simple correlation calculation
            const numChannels = data.length;
            const matrix = Array(numChannels).fill().map(() => Array(numChannels).fill(0));

            for (let i = 0; i < numChannels; i++) {
                for (let j = 0; j < numChannels; j++) {
                    if (i === j) {
                        matrix[i][j] = 1.0;
                    } else {
                        // Simplified correlation
                        const len = Math.min(data[i].length, data[j].length, 1000);
                        let sum = 0;
                        for (let k = 0; k < len; k++) {
                            sum += data[i][k] * data[j][k];
                        }
                        matrix[i][j] = sum / len;
                    }
                }
            }

            return matrix;

        } catch (err) {
            console.error('Sync matrix error:', err);
            return [];
        }
    },

    // Get supported formats
    getSupportedFormats: async function() {
        try {
            const response = await fetch(`${this.API_URL}/supported-formats`);
            const result = await response.json();
            return result;
        } catch (err) {
            console.error('Error fetching formats:', err);
            return null;
        }
    }
};