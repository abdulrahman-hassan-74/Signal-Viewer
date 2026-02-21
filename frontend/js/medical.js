/**
 * Medical Signals Module
 * ECG/EEG viewer with AI diagnosis and classic ML comparison
 */

class MedicalViewer extends SignalViewerApp {
    constructor() {
        super();
        this.abnormalityTypes = [];
    }

    async init() {
        await super.init();
        await this.loadAbnormalityTypes();
    }

    async loadAbnormalityTypes() {
        try {
            // For demo, set default types
            this.abnormalityTypes = [
                'Normal Sinus Rhythm',
                'Atrial Fibrillation',
                'Ventricular Tachycardia',
                'Premature Ventricular Contractions',
                'Bradycardia',
                'Tachycardia'
            ];
        } catch (err) {
            console.error('Failed to load abnormality types:', err);
        }
    }

    async handleFileUpload(file) {
        await super.handleFileUpload(file);

        if (this.signalData) {
            await this.analyzeWithAI();
        }
    }

    async analyzeWithAI() {
        this.showLoading();

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
                this.displayComparison(result.classic_comparison);
            }

        } catch (err) {
            this.showError('AI Analysis failed: ' + err.message);
        } finally {
            this.hideLoading();
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

    displayComparison(classicResults) {
        if (!classicResults) return;

        const sidePanel = document.querySelector('.side-panel');
        if (!sidePanel) return;

        const comparisonPanel = document.createElement('div');
        comparisonPanel.className = 'plot-container';
        comparisonPanel.innerHTML = `
            <div class="plot-title">📊 CLASSIC ML COMPARISON</div>
            <div style="margin-top: 10px;">
                <div style="background: #0f1422; padding: 15px; border-radius: 8px;">
                    <div style="margin-bottom: 10px;">
                        <span style="color: #8a9ab0;">Classification:</span><br>
                        <strong style="font-size: 1.2rem; color: #4a9eff;">${classicResults.classification}</strong>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <small style="color: #8a9ab0;">Heart Rate</small><br>
                            <strong>${classicResults.heart_rate.toFixed(1)} BPM</strong>
                        </div>
                        <div>
                            <small style="color: #8a9ab0;">Regularity</small><br>
                            <strong>${(classicResults.regularity * 100).toFixed(1)}%</strong>
                        </div>
                        <div>
                            <small style="color: #8a9ab0;">Method</small><br>
                            <strong>${classicResults.method}</strong>
                        </div>
                        <div>
                            <small style="color: #8a9ab0;">Confidence</small><br>
                            <strong>${(classicResults.confidence * 100).toFixed(1)}%</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;

        sidePanel.appendChild(comparisonPanel);
    }

    renderChannelsView() {
        super.renderChannelsView();

        // Add abnormality selector if in medical view
        const controlsBar = document.querySelector('.controls');
        if (controlsBar) {
            const abnSelect = document.createElement('select');
            abnSelect.id = 'abnormalitySelect';
            abnSelect.style.marginLeft = '10px';
            abnSelect.style.background = '#0f1422';
            abnSelect.style.color = '#e0e0e0';

            this.abnormalityTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                abnSelect.appendChild(option);
            });

            const abnLabel = document.createElement('span');
            abnLabel.style.color = '#8a9ab0';
            abnLabel.style.marginLeft = '10px';
            abnLabel.textContent = 'Test Abnormality:';

            controlsBar.appendChild(abnLabel);
            controlsBar.appendChild(abnSelect);

            const testBtn = document.createElement('button');
            testBtn.innerHTML = '🧪 Test';
            testBtn.onclick = () => this.testAbnormality(abnSelect.value);
            controlsBar.appendChild(testBtn);
        }
    }

    testAbnormality(type) {
        // Simulate different abnormality patterns
        if (!this.signalData) return;

        const channel = 0; // First channel
        const data = this.signalData.data[channel];

        let modifiedData = [...data];

        switch(type) {
            case 'Atrial Fibrillation':
                // Add irregularity
                for (let i = 0; i < modifiedData.length; i += 50) {
                    modifiedData[i] *= 1.5;
                }
                break;
            case 'Ventricular Tachycardia':
                // Increase frequency
                for (let i = 0; i < modifiedData.length; i++) {
                    modifiedData[i] *= Math.sin(i * 0.5) * 2;
                }
                break;
            case 'Premature Ventricular Contractions':
                // Add spikes
                for (let i = 100; i < modifiedData.length; i += 200) {
                    modifiedData[i] *= 3;
                }
                break;
            case 'Bradycardia':
                // Slow down (simulate by stretching)
                modifiedData = modifiedData.filter((_, i) => i % 2 === 0);
                break;
            case 'Tachycardia':
                // Speed up (simulate by compressing)
                const temp = [];
                for (let i = 0; i < modifiedData.length; i += 0.5) {
                    temp.push(modifiedData[Math.floor(i)]);
                }
                modifiedData = temp.slice(0, data.length);
                break;
        }

        this.signalData.data[channel] = modifiedData;
        this.renderChannelsPlot();
        this.analyzeWithAI();
    }
}

// Initialize medical viewer
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('medicalViewer')) {
        window.medicalViewer = new MedicalViewer();
        window.medicalViewer.init();
    }
});