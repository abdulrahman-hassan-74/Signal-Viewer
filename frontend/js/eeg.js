/**
 * EEG Signal Viewer Module
 * Specialized for EEG with 4 abnormality types
 */

class EEGViewer extends SignalViewerApp {
    constructor() {
        super();
        this.signalType = 'eeg';
        this.apiBase = '/api/eeg';
        this.abnormalities = [];
        this.loadAbnormalities();
    }

    async loadAbnormalities() {
        try {
            const response = await fetch(`${this.API_URL}${this.apiBase}/abnormalities`);
            const data = await response.json();
            this.abnormalities = data.abnormalities || [];
            console.log('Loaded EEG abnormalities:', this.abnormalities);
        } catch (err) {
            console.error('Failed to load abnormalities:', err);
        }
    }

    async handleFileUpload(file) {
        this.showLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${this.API_URL}/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.signalData = result.data;

                this.initializeChannels();
                document.getElementById('mainContent').classList.remove('hidden');
                this.updateChannelList();
                this.updateChannelSelectors();
                this.renderCurrentView();
                this.runAIAnalysis();

                this.showNotification(`Loaded EEG: ${this.signalData.channels.length} channels`, 'success');
            } else {
                this.showError(result.error || 'Failed to parse file');
            }
        } catch (err) {
            this.showError('Upload failed: ' + err.message);
        } finally {
            this.showLoading(false);
        }
    }

    async runAIAnalysis() {
        if (!this.signalData) return;

        this.showLoading(true);

        try {
            const response = await fetch(`${this.API_URL}${this.apiBase}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signal_data: this.signalData
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                this.displayAIDiagnosis(result.ai_detection);
                this.displayClassicML(result.classic_comparison);
            }
        } catch (err) {
            console.error('EEG analysis failed:', err);
        } finally {
            this.showLoading(false);
        }
    }

    displayAIDiagnosis(aiResult) {
        const aiDiv = document.getElementById('aiResult');
        if (!aiDiv) return;

        const isAbnormal = aiResult.is_abnormal;
        const confidence = (aiResult.confidence * 100).toFixed(1);

        let badgeClass = 'badge-normal';
        if (aiResult.code === 'epilepsy') badgeClass = 'badge-epilepsy';
        else if (aiResult.code === 'slow') badgeClass = 'badge-slow';
        else if (aiResult.code === 'asymmetry') badgeClass = 'badge-asymmetry';

        aiDiv.innerHTML = `
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div class="dx-title">EEG Multi-channel AI</div>
                <div class="dx-label">
                    <span class="abnormality-badge ${badgeClass}">${aiResult.code}</span>
                    ${aiResult.classification}
                </div>
                
                <div class="conf-bar-wrap">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--muted);">Confidence</span>
                        <span style="color: var(--accent);">${confidence}%</span>
                    </div>
                    <div class="conf-bar">
                        <div class="conf-bar-fill" style="width: ${confidence}%; background: ${isAbnormal ? '#ef4444' : '#10b981'};"></div>
                    </div>
                </div>
                
                <div class="dx-meta">
                    <div class="dx-meta-item">
                        <small>Model</small>
                        <strong>${aiResult.model}</strong>
                    </div>
                    <div class="dx-meta-item">
                        <small>Risk</small>
                        <strong style="color: ${aiResult.risk.includes('High') ? '#ef4444' : '#f59e0b'};">${aiResult.risk}</strong>
                    </div>
                </div>
                
                <div style="margin-top: 8px; font-size: 12px; color: var(--muted);">
                    ${aiResult.description}
                </div>
            </div>
        `;
    }

    displayClassicML(classicResult) {
        const classicDiv = document.getElementById('classicResult');
        if (!classicDiv || !classicResult) return;

        classicDiv.innerHTML = `
            <div class="classic-card">
                <h4>Classic ML (Spectral Analysis)</h4>
                <div style="margin-bottom: 8px;">
                    <span style="color: var(--accent); font-size: 1.1rem;">${classicResult.classification}</span>
                </div>
                <div class="kv-grid">
                    <div class="kv">
                        <small>Delta/Theta</small>
                        <strong>${classicResult.delta_theta_ratio?.toFixed(2) || 'N/A'}</strong>
                    </div>
                    <div class="kv">
                        <small>Alpha/Beta</small>
                        <strong>${classicResult.alpha_beta_ratio?.toFixed(2) || 'N/A'}</strong>
                    </div>
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">
                    Method: ${classicResult.method} | Confidence: ${(classicResult.confidence * 100).toFixed(0)}%
                </div>
            </div>
        `;
    }

    async renderXOR() {
        await super.renderXOR(this.apiBase);
    }

    async renderPolar() {
        await super.renderPolar(this.apiBase);
    }

    async renderRecurrence() {
        await super.renderRecurrence(this.apiBase);
    }

    async compareAIvsClassic() {
        await this.runAIAnalysis();
        this.showNotification('Comparison updated', 'info');
    }
}

// Initialize EEG viewer
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('title').textContent.includes('EEG')) {
        window.app = new EEGViewer();
    }
});