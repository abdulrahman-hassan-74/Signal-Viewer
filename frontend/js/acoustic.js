/**
 * Acoustic Signals Module
 * Doppler effect simulation and drone detection
 */

class AcousticViewer {
    constructor() {
        this.API_URL = 'http://127.0.0.1:5000/api';
        this.audioContext = null;
        this.audioBuffer = null;
        this.isPlaying = false;
    }

    async init() {
        await this.checkBackend();
        this.setupEventListeners();
    }

    async checkBackend() {
        try {
            const response = await fetch(`${this.API_URL}/health`);
            const data = await response.json();
            if (data.status === 'ok') {
                this.showNotification('Backend connected', 'success');
            }
        } catch (err) {
            this.showNotification('Cannot connect to backend', 'error');
        }
    }

    setupEventListeners() {
        const generateBtn = document.getElementById('generateDoppler');
        if (generateBtn) generateBtn.onclick = () => this.generateDoppler();

        const estimateBtn = document.getElementById('estimateVelocity');
        if (estimateBtn) estimateBtn.onclick = () => this.estimateVelocity();

        const detectBtn = document.getElementById('detectDrone');
        if (detectBtn) detectBtn.onclick = () => this.detectDrone();

        const dopplerFile = document.getElementById('dopplerFile');
        if (dopplerFile) dopplerFile.onchange = (e) => this.handleDopplerFile(e.target.files[0]);

        const droneFile = document.getElementById('droneFile');
        if (droneFile) droneFile.onchange = (e) => this.handleDroneFile(e.target.files[0]);
    }

    async generateDoppler() {
        const frequency = parseFloat(document.getElementById('hornFreq').value);
        const velocity = parseFloat(document.getElementById('carVelocity').value);
        const duration = parseFloat(document.getElementById('duration').value || 5);

        this.showLoading('generatorLoading');
        try {
            const response = await fetch(`${this.API_URL}/acoustic/doppler/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frequency, velocity, duration })
            });
            const result = await response.json();
            if (result.status === 'success') {
                this.displayDopplerResults(result.audio_data);
                this.playDopplerSound(result.audio_data);
            }
        } catch (err) {
            this.showNotification('Failed to generate Doppler sound: ' + err.message, 'error');
        } finally {
            this.hideLoading('generatorLoading');
        }
    }

    displayDopplerResults(data) {
        const resultsDiv = document.getElementById('dopplerResults');
        if (!resultsDiv) return;
        resultsDiv.innerHTML = `
            <div style="background: #0f1422; padding: 20px; border-radius: 8px;">
                <h3 style="color: #4a9eff; margin-bottom: 15px;">Generated Doppler Sound</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div><small style="color: #8a9ab0;">Frequency Range</small><br>
                        <strong>${data.frequency_range.min.toFixed(1)} - ${data.frequency_range.max.toFixed(1)} Hz</strong></div>
                    <div><small style="color: #8a9ab0;">Doppler Shift</small><br>
                        <strong>${data.doppler_shift.toFixed(1)} Hz</strong></div>
                    <div><small style="color: #8a9ab0;">Duration</small><br>
                        <strong>${data.duration} seconds</strong></div>
                    <div><small style="color: #8a9ab0;">Sample Rate</small><br>
                        <strong>${data.sample_rate} Hz</strong></div>
                </div>
                <div style="margin-top: 20px;">
                    <button id="playAudio" class="active">▶ Play Sound</button>
                </div>
            </div>`;
        this.currentAudioData = data;
        document.getElementById('playAudio').onclick = () => this.togglePlayback();
    }

    async playDopplerSound(audioData) {
        if (!audioData.audio_base64) { this.showNotification('No audio data available', 'error'); return; }
        try {
            const binaryString = atob(audioData.audio_base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'audio/wav' });
            if (!this.audioElement) this.audioElement = new Audio();
            this.audioElement.src = URL.createObjectURL(blob);
            this.audioElement.play();
            this.isPlaying = true;
            document.getElementById('playAudio').innerHTML = '⏸ Pause';
            this.audioElement.onended = () => {
                this.isPlaying = false;
                document.getElementById('playAudio').innerHTML = '▶ Play';
            };
        } catch (err) {
            this.showNotification('Failed to play audio', 'error');
        }
    }

    togglePlayback() {
        if (!this.audioElement) return;
        if (this.isPlaying) {
            this.audioElement.pause();
            this.isPlaying = false;
            document.getElementById('playAudio').innerHTML = '▶ Play';
        } else {
            this.audioElement.play();
            this.isPlaying = true;
            document.getElementById('playAudio').innerHTML = '⏸ Pause';
        }
    }

    async estimateVelocity() {
        const file = document.getElementById('dopplerFile').files[0];
        if (!file) { this.showNotification('Please select an audio file', 'error'); return; }
        
        this.showLoading('estimationLoading');
        try {
            const formData = new FormData();
            formData.append('file', file);
            // REMOVED: formData.append('original_freq', originalFreq);

            const response = await fetch(`${this.API_URL}/acoustic/doppler/estimate`, { 
                method: 'POST', 
                body: formData 
            });
            const result = await response.json();
            if (result.status === 'success') this.displayVelocityEstimation(result.estimation);
            else this.showNotification(result.error, 'error');
        } catch (err) {
            this.showNotification('Failed to estimate velocity: ' + err.message, 'error');
        } finally {
            this.hideLoading('estimationLoading');
        }
    }   

    displayVelocityEstimation(e) {
        const resultsDiv = document.getElementById('estimationResults');
        if (!resultsDiv) return;
        resultsDiv.innerHTML = `
            <div style="background: #0f1422; padding: 20px; border-radius: 8px; margin-top: 20px;">
                <h3 style="color: #4a9eff; margin-bottom: 15px;">Velocity Estimation Results</h3>
                <div style="font-size: 2rem; text-align: center; margin-bottom: 20px; color: #4a9eff;">
                    ${Number(e.estimated_velocity_ms || 0).toFixed(1)} <span style="font-size: 1rem; color: #8a9ab0;">m/s</span>
                    <br><span style="font-size: 1.2rem; color: #51cf66;">(${Number(e.estimated_velocity_kmh || 0).toFixed(1)} km/h)</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div><small style="color: #8a9ab0;">Detected Emitted Freq</small><br>
                        <strong>${Number(e.estimated_emitted_freq || 0).toFixed(1)} Hz</strong></div>
                    <div><small style="color: #8a9ab0;">Direction</small><br>
                        <strong>${e.direction || 'N/A'}</strong></div>
                    <div><small style="color: #8a9ab0;">Peak (Approach)</small><br>
                        <strong>${Number(e.f_high_percentile || 0).toFixed(1)} Hz</strong></div>
                    <div><small style="color: #8a9ab0;">Trough (Recede)</small><br>
                        <strong>${Number(e.f_low_percentile || 0).toFixed(1)} Hz</strong></div>
                </div>
                <div style="margin-top: 15px; padding: 10px; background: rgba(74,158,255,0.1); border-radius: 5px;">
                    <small style="color: #8a9ab0;">Method: ${e.method}</small>
                    <div style="margin-top: 5px;">Confidence: ${Number((e.confidence || 0) * 100).toFixed(1)}%</div>
                </div>
            </div>`;
    }

    async detectDrone() {
        const file = document.getElementById('droneFile').files[0];
        if (!file) { this.showNotification('Please select an audio file', 'error'); return; }

        this.showLoading('droneLoading');
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${this.API_URL}/acoustic/drone/detect`, { method: 'POST', body: formData });
            const result = await response.json();

            // Log full response for debugging
            console.log('Drone detect response:', JSON.stringify(result));

            // Support both response shapes:
            //   New: { status, detection: { detected, confidence, ... } }
            //   Old: { status, detected, confidence, ... }
            const detection = (result.detection !== undefined) ? result.detection : result;

            if (detection && detection.detected !== undefined) {
                this.displayDroneDetection(detection);
            } else {
                console.error('Unexpected response shape:', result);
                this.showNotification('Unexpected server response. Check browser console for details.', 'error');
            }

        } catch (err) {
            this.showNotification('Failed to detect drone: ' + err.message, 'error');
        } finally {
            this.hideLoading('droneLoading');
        }
    }

    displayDroneDetection(detection) {
            const resultsDiv = document.getElementById('droneResults');
            if (!resultsDiv) return;

            // Determine if it's a drone based on the boolean from the backend
            const isDrone = detection.detected === true;
            
            // Styling based on detection
            const color = isDrone ? '#51cf66' : '#ff6b6b';
            const label = isDrone ? 'DRONE DETECTED' : 'NOT A DRONE';
            const icon  = isDrone ? '✅' : '❌';

            resultsDiv.innerHTML = `
                <div style="background: #0f1422; padding: 30px; border-radius: 8px; margin-top: 20px; border: 2px solid ${color};">
                    <div style="text-align: center;">
                        <div style="font-size: 4rem; margin-bottom: 10px;">${icon}</div>
                        <div style="font-size: 2rem; font-weight: bold; color: ${color}; letter-spacing: 2px;">
                            ${label}
                        </div>
                    </div>
                </div>`;
        }
    handleDopplerFile(file) {
        const label = document.querySelector('label[for="dopplerFile"]');
        if (label) label.innerHTML = `📁 Selected: ${file.name}`;
    }

    handleDroneFile(file) {
        const label = document.querySelector('label[for="droneFile"]');
        if (label) label.innerHTML = `📁 Selected: ${file.name}`;
    }

    showLoading(elementId) {
        const el = document.getElementById(elementId);
        if (el) el.style.display = 'block';
    }

    hideLoading(elementId) {
        const el = document.getElementById(elementId);
        if (el) el.style.display = 'none';
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4a9eff'};
            color: white; padding: 12px 24px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 1000;`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('acousticViewer')) {
        window.acousticViewer = new AcousticViewer();
        window.acousticViewer.init();
    }
});
