/**
 * Signal Parser Module
 * Handles communication with backend for file parsing
 */

var SignalParser = (function() {
    var API_BASE = 'http://127.0.0.1:5000';
    var API_URL = API_BASE + '/api';

    var SUPPORTED_FORMATS = ['csv', 'txt', 'edf', 'bdf', 'mat', 'hea', 'dat', 'wav', 'mp3'];

    async function uploadFile(file) {
        var formData = new FormData();
        formData.append('file', file);

        var response = await fetch(API_BASE + '/api/upload', {
            method: 'POST',
            body: formData,
            mode: 'cors'
        });

        if (!response.ok) {
            var errorText = await response.text();
            var errorMsg;
            try {
                var errorJson = JSON.parse(errorText);
                errorMsg = errorJson.error || 'HTTP ' + response.status;
            } catch (e) {
                errorMsg = 'HTTP ' + response.status + ': ' + errorText.substring(0, 100);
            }
            throw new Error(errorMsg);
        }

        var result = await response.json();

        if (result.status === 'success' && result.signal_data) {
            return result.signal_data;
        } else {
            throw new Error(result.error || 'Parse failed');
        }
    }

    async function analyzeSignal(signalData, analysisType) {
        if (analysisType === undefined) analysisType = 'full';

        var response = await fetch(API_URL + '/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signal_data: signalData, type: analysisType }),
            mode: 'cors'
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);

        var result = await response.json();

        if (result.status === 'success') {
            return result.results;
        } else {
            throw new Error(result.error || 'Analysis failed');
        }
    }

    async function filterSignal(signal, filterType, cutoff, order) {
        if (order === undefined) order = 4;

        var response = await fetch(API_URL + '/filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signal: signal, filter_type: filterType, cutoff: cutoff, order: order }),
            mode: 'cors'
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);

        var result = await response.json();
        return result.filtered_signal;
    }

    async function computeWavelet(signalData) {
        var response = await fetch(API_URL + '/wavelet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signal_data: signalData }),
            mode: 'cors'
        });

        if (!response.ok) throw new Error('HTTP ' + response.status);

        var result = await response.json();
        return result.wavelet;
    }

    async function checkBackendHealth() {
        try {
            var response = await fetch(API_URL + '/health', { mode: 'cors' });
            if (!response.ok) return false;
            var data = await response.json();
            return data.status === 'ok';
        } catch (err) {
            return false;
        }
    }

    return {
        uploadFile: uploadFile,
        analyzeSignal: analyzeSignal,
        filterSignal: filterSignal,
        computeWavelet: computeWavelet,
        checkBackendHealth: checkBackendHealth,
        SUPPORTED_FORMATS: SUPPORTED_FORMATS,
        API_URL: API_URL,
        API_BASE: API_BASE
    };
})();

if (typeof window !== 'undefined' && !window.SignalParser) {
    window.SignalParser = SignalParser;
    console.log('✅ SignalParser loaded');
}