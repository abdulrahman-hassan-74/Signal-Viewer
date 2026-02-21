/**
 * ECG Signal Viewer Module
 * Specialized for ECG with 4 abnormality types
 */

class ECGViewer extends SignalViewerApp {
    constructor() {
        super();
        this.signalType = 'ecg';
        this.apiBase = '/api/ecg';
        this.abnormalities = [];
        this.loadAbnormalities();
    }

    async loadAbnormalities() {
        try {
            const response = await fetch(`${this.API_URL}${this.apiBase}/abnormalities`);
            const data = await response.json();
            this.abnormalities = data.abnormalities || [];
            console.log('Loaded ECG abnormalities:', this.abnormalities);
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

                // Initialize channel properties
                this.initializeChannels();

                // Show main content
                document.getElementById('mainContent').classList.remove('hidden');

                // Update UI
                this.updateChannelList();
                this.updateChannelSelectors();

                // Render initial view
                this.renderCurrentView();

                // Run ECG AI analysis
                this.runAIAnalysis();

                this.showNotification(`Loaded ECG: ${this.signalData.channels.length} channels`, 'success');
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
            console.error('ECG analysis failed:', err);
        } finally {
            this.showLoading(false);
        }
    }

    displayAIDiagnosis(aiResult) {
        const aiDiv = document.getElementById('aiResult');
        if (!aiDiv) return;

        const isAbnormal = aiResult.is_abnormal;
        const confidence = (aiResult.confidence * 100).toFixed(1);

        // Get badge class based on abnormality code
        let badgeClass = 'badge-normal';
        if (aiResult.code === 'afib') badgeClass = 'badge-afib';
        else if (aiResult.code === 'vtach') badgeClass = 'badge-vtach';
        else if (aiResult.code === 'pvc') badgeClass = 'badge-pvc';

        aiDiv.innerHTML = `
            <div class="dx-card ${isAbnormal ? 'dx-abnormal' : 'dx-normal'}">
                <div class="dx-title">ECG Multi-channel AI</div>
                <div class="dx-label">
                    <span class="abnormality-badge ${badgeClass}">${aiResult.code}</span>
                    ${aiResult.classification}
                </div>
                
                <div class="conf-bar-wrap">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
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
                
                <div style="margin-top: 12px; padding: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 6px; font-size: 12px;">
                    <strong>Treatment:</strong> ${aiResult.treatment}
                </div>
            </div>
        `;
    }

    displayClassicML(classicResult) {
        const classicDiv = document.getElementById('classicResult');
        if (!classicDiv || !classicResult) return;

        classicDiv.innerHTML = `
            <div class="classic-card">
                <h4>Classic ML (Autocorrelation + Statistics)</h4>
                <div style="margin-bottom: 8px;">
                    <span style="color: var(--accent); font-size: 1.1rem;">${classicResult.classification}</span>
                </div>
                <div class="kv-grid">
                    <div class="kv">
                        <small>Heart Rate</small>
                        <strong>${classicResult.heart_rate?.toFixed(1) || 'N/A'} BPM</strong>
                    </div>
                    <div class="kv">
                        <small>Regularity</small>
                        <strong>${(classicResult.regularity * 100).toFixed(1) || 'N/A'}%</strong>
                    </div>
                    <div class="kv">
                        <small>HR Variability</small>
                        <strong>${classicResult.hr_std?.toFixed(1) || 'N/A'}</strong>
                    </div>
                    <div class="kv">
                        <small>QRS Width</small>
                        <strong>${(classicResult.qrs_width * 1000).toFixed(0) || 'N/A'} ms</strong>
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

// Initialize ECG viewer
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('title').textContent.includes('ECG')) {
        window.app = new ECGViewer();
    }
});