/**
 * Microbiome Signals Module - Finalized
 * Bacterial profiling and disease correlation
 */

class MicrobiomeViewer {
    constructor() {
        this.API_URL = 'http://127.0.0.1:5000/api';
        this.currentDataset = 'ihmp';
        // Default colors matching the Python backend's visualization palette
        this.colors = ['#4a9eff', '#51cf66', '#ffd43b', '#ff8787', '#9775fa', '#868e96'];

        this.bacteriaInfo = {
            'Firmicutes': 'Gram-positive bacteria, important for energy absorption',
            'Bacteroidetes': 'Gram-negative bacteria, key for carbohydrate metabolism',
            'Proteobacteria': 'Includes many pathogens, often elevated in inflammation',
            'Actinobacteria': 'Important for immune system regulation',
            'Fusobacteria': 'Associated with colorectal cancer and inflammatory conditions',
            'Other': 'Other bacterial phyla'
        };
    }

    async init() {
        await this.checkBackend();
        this.setupEventListeners();
        // Initial load for default dataset
        this.loadSampleData(this.currentDataset);
    }

    async checkBackend() {
        try {
            const response = await fetch(`${this.API_URL}/health`);
            const data = await response.json();
            if (data.status === 'ok') {
                this.showNotification('Backend connected', 'success');
            }
        } catch (err) {
            this.showNotification('Cannot connect to backend. Ensure server is on port 5000', 'error');
        }
    }

    setupEventListeners() {
        // Dataset buttons
        document.querySelectorAll('.dataset-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.dataset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const dataset = btn.dataset.dataset;
                this.currentDataset = dataset;

                const customInput = document.getElementById('customInput');
                const analyzeBtnWrapper = document.getElementById('analyzeBtnWrapper');

                if (dataset === 'custom') {
                    // Show custom fields and the Analyze button for manual entry
                    if (customInput) customInput.style.display = 'block';
                    if (analyzeBtnWrapper) analyzeBtnWrapper.style.display = 'block';
                } else {
                    // Hide custom UI and auto-load sample data for preset datasets
                    if (customInput) customInput.style.display = 'none';
                    if (analyzeBtnWrapper) analyzeBtnWrapper.style.display = 'none';
                    this.loadSampleData(dataset);
                }
            };
        });

        // Analyze button for Custom Input mode
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.onclick = () => this.analyzeSample();
        }
    }

    async loadSampleData(dataset) {
        this.showLoading();
        try {
            const response = await fetch(`${this.API_URL}/microbiome/sample/${dataset}`);
            const result = await response.json();

            if (result.status === 'success') {
                const sample = result.sample;
                // Update input values (useful for seeing the numbers even in auto-mode)
                document.getElementById('firmicutes').value = (sample.Firmicutes || 0).toFixed(2);
                document.getElementById('bacteroidetes').value = (sample.Bacteroidetes || 0).toFixed(2);
                document.getElementById('proteobacteria').value = (sample.Proteobacteria || 0).toFixed(2);
                document.getElementById('actinobacteria').value = (sample.Actinobacteria || 0).toFixed(2);
                document.getElementById('fusobacteria').value = (sample.Fusobacteria || 0).toFixed(2);
                document.getElementById('other').value = (sample.Other || 0).toFixed(2);

                this.analyzeSample();
            }
        } catch (err) {
            this.showNotification('Failed to load sample data: ' + err.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async analyzeSample() {
        const counts = {
            'Firmicutes': parseFloat(document.getElementById('firmicutes').value) || 0,
            'Bacteroidetes': parseFloat(document.getElementById('bacteroidetes').value) || 0,
            'Proteobacteria': parseFloat(document.getElementById('proteobacteria').value) || 0,
            'Actinobacteria': parseFloat(document.getElementById('actinobacteria').value) || 0,
            'Fusobacteria': parseFloat(document.getElementById('fusobacteria').value) || 0,
            'Other': parseFloat(document.getElementById('other').value) || 0
        };

        // Ensure values are normalized for the Jensen-Shannon distance calculation in backend
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total > 0 && Math.abs(total - 1.0) > 0.01) {
            Object.keys(counts).forEach(key => counts[key] = counts[key] / total);
        }

        this.showLoading();
        try {
            const response = await fetch(`${this.API_URL}/microbiome/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ counts: counts })
            });

            const result = await response.json();
            if (result.status === 'success') {
                this.displayResults(result.analysis);
            }
        } catch (err) {
            this.showNotification('Analysis failed: ' + err.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    displayResults(analysis) {
        document.getElementById('resultsGrid').style.display = 'grid';
        document.getElementById('recommendationsSection').style.display = 'block';

        this.displayAbundanceChart(analysis.visualization);
        this.displayProfileDetails(analysis);
        this.displayRiskFactors(analysis.risk_factors);
        this.displayRecommendations(analysis.recommendations);
    }

    displayAbundanceChart(vizData) {
        const container = document.getElementById('abundanceChart');
        if (!container || !window.Plotly) return;

        const data = [{
            values: vizData.values,
            labels: vizData.labels,
            type: 'pie',
            marker: { colors: vizData.colors || this.colors },
            textinfo: 'percent',
            hoverinfo: 'label+value',
            textfont: { color: '#ffffff' }
        }];

        const layout = {
            height: 350,
            margin: { l: 20, r: 20, t: 20, b: 20 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#e0e0e0' },
            showlegend: false
        };

        Plotly.newPlot('abundanceChart', data, layout, { responsive: true, displaylogo: false });

        // Update Dynamic Legend
        const legend = document.getElementById('bacteriaLegend');
        legend.innerHTML = '';
        vizData.labels.forEach((label, i) => {
            const info = this.bacteriaInfo[label] || '';
            legend.innerHTML += `
                <div class="legend-item">
                    <div class="color-box" style="background: ${vizData.colors[i]}"></div>
                    <div>
                        <strong>${label}</strong><br>
                        <small style="color: #8a9ab0;">${info}</small>
                    </div>
                </div>`;
        });
    }

    displayProfileDetails(analysis) {
        const container = document.getElementById('profileDetails');
        if (!container) return;

        const dysbiosis = (analysis.dysbiosis_index * 100).toFixed(1);
        const fbratio = analysis.firmicutes_bacteroidetes_ratio.toFixed(2);
        
        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 1.8rem; color: ${analysis.estimated_profile === 'healthy' ? '#51cf66' : '#ff6b6b'};">
                    ${analysis.estimated_profile.replace('_', ' ').toUpperCase()}
                </div>
                <div style="color: #8a9ab0;">${analysis.profile_description}</div>
            </div>
            <div class="dysbiosis-meter">
                <div class="dysbiosis-fill" style="width: ${dysbiosis}%;"></div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small>Confidence</small><br><strong>${(analysis.confidence * 100).toFixed(1)}%</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small>Dysbiosis</small><br><strong>${dysbiosis}%</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small>F/B Ratio</small><br><strong>${fbratio}</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small>Diversity</small><br><strong>${analysis.diversity.toFixed(2)}</strong>
                </div>
            </div>`;
    }

    displayRiskFactors(riskFactors) {
        const container = document.getElementById('riskFactors');
        if (!container) return;

        container.innerHTML = riskFactors.length ? '' : '<p>No significant risks detected.</p>';
        riskFactors.forEach(risk => {
            const riskClass = risk.risk.toLowerCase() === 'high' ? 'risk-high' : 'risk-moderate';
            container.innerHTML += `
                <div class="${riskClass}">
                    <strong>${risk.factor}</strong> (${risk.risk} Risk)
                    <p style="font-size: 0.9rem; margin: 5px 0;">${risk.description}</p>
                    <small style="color: #4a9eff;">Suggestion: ${risk.suggestion}</small>
                </div>`;
        });
    }

    displayRecommendations(recommendations) {
        const container = document.getElementById('recommendations');
        if (!container) return;

        container.innerHTML = '';
        recommendations.forEach(rec => {
            const priorityClass = rec.priority.toLowerCase() === 'high' || rec.priority.toLowerCase() === 'critical' 
                ? 'recommendation-high' : 'recommendation-medium';
            container.innerHTML += `
                <div class="recommendation-card ${priorityClass}">
                    <strong>${rec.category}:</strong> ${rec.advice}
                </div>`;
        });
    }

    showLoading() {
        const btn = document.getElementById('analyzeBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Analyzing...'; }
    }

    hideLoading() {
        const btn = document.getElementById('analyzeBtn');
        if (btn) { btn.disabled = false; btn.innerHTML = '🔬 Analyze Sample'; }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 12px 24px; border-radius: 8px;
            background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4a9eff'};
            color: white; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    window.microbiomeViewer = new MicrobiomeViewer();
    window.microbiomeViewer.init();
});
