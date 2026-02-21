/**
 * Microbiome Signals Module
 * Bacterial profiling and disease correlation
 */

class MicrobiomeViewer {
    constructor() {
        this.API_URL = 'http://127.0.0.1:5000/api';
        this.currentDataset = 'ihmp';
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
    }

    async checkBackend() {
        try {
            const response = await fetch(`${this.API_URL}/health`);
            const data = await response.json();

            if (data.status === 'ok') {
                this.showNotification('Backend connected', 'success');
            }
        } catch (err) {
            this.showNotification('Cannot connect to backend. Make sure server is running on port 5000', 'error');
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

                // Show/hide custom input
                document.getElementById('customInput').style.display =
                    dataset === 'custom' ? 'block' : 'none';

                if (dataset !== 'custom') {
                    this.loadSampleData(dataset);
                }
            };
        });

        // Analyze button
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
                // Update custom input fields with sample data
                const sample = result.sample;
                document.getElementById('firmicutes').value = sample.Firmicutes.toFixed(2);
                document.getElementById('bacteroidetes').value = sample.Bacteroidetes.toFixed(2);
                document.getElementById('proteobacteria').value = sample.Proteobacteria.toFixed(2);
                document.getElementById('actinobacteria').value = sample.Actinobacteria.toFixed(2);
                document.getElementById('fusobacteria').value = (sample.Fusobacteria || 0).toFixed(2);
                document.getElementById('other').value = (sample.Other || 0).toFixed(2);

                // Auto-analyze
                this.analyzeSample();
            }

        } catch (err) {
            this.showNotification('Failed to load sample data: ' + err.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async analyzeSample() {
        // Get values from inputs
        const counts = {
            'Firmicutes': parseFloat(document.getElementById('firmicutes').value) || 0,
            'Bacteroidetes': parseFloat(document.getElementById('bacteroidetes').value) || 0,
            'Proteobacteria': parseFloat(document.getElementById('proteobacteria').value) || 0,
            'Actinobacteria': parseFloat(document.getElementById('actinobacteria').value) || 0,
            'Fusobacteria': parseFloat(document.getElementById('fusobacteria').value) || 0,
            'Other': parseFloat(document.getElementById('other').value) || 0
        };

        // Normalize to sum to 1
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (Math.abs(total - 1.0) > 0.01) {
            this.showNotification('Warning: Values should sum to 1.0. Normalizing automatically.', 'info');
            Object.keys(counts).forEach(key => {
                counts[key] = counts[key] / total;
            });
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
        // Show results sections
        document.getElementById('resultsGrid').style.display = 'grid';
        document.getElementById('recommendationsSection').style.display = 'block';

        // Display abundance chart
        this.displayAbundanceChart(analysis.visualization);

        // Display profile details
        this.displayProfileDetails(analysis);

        // Display risk factors
        this.displayRiskFactors(analysis.risk_factors);

        // Display recommendations
        this.displayRecommendations(analysis.recommendations);
    }

    displayAbundanceChart(vizData) {
        const container = document.getElementById('abundanceChart');
        if (!container) return;

        const data = [{
            values: vizData.values,
            labels: vizData.labels,
            type: 'pie',
            marker: {
                colors: vizData.colors || this.colors
            },
            textinfo: 'label+percent',
            textposition: 'outside',
            hoverinfo: 'label+value+percent',
            textfont: { color: '#e0e0e0', size: 12 }
        }];

        const layout = {
            autosize: true,
            height: 350,
            margin: { l: 40, r: 40, t: 30, b: 80 },
            paper_bgcolor: '#1a1f2e',
            plot_bgcolor: '#1a1f2e',
            font: { color: '#e0e0e0' },
            showlegend: false
        };

        Plotly.newPlot('abundanceChart', data, layout, { responsive: true, displaylogo: false });

        // Update legend
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
                </div>
            `;
        });
    }

    displayProfileDetails(analysis) {
        const container = document.getElementById('profileDetails');
        if (!container) return;

        const profile = analysis.estimated_profile;
        const confidence = (analysis.confidence * 100).toFixed(1);
        const dysbiosis = (analysis.dysbiosis_index * 100).toFixed(1);
        const fbratio = analysis.firmicutes_bacteroidetes_ratio.toFixed(2);
        const diversity = analysis.diversity.toFixed(2);

        let profileColor = '#4a9eff';
        if (profile !== 'healthy') {
            profileColor = '#ff6b6b';
        }

        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 2rem; color: ${profileColor}; margin-bottom: 10px;">
                    ${profile.replace('_', ' ').toUpperCase()}
                </div>
                <div style="color: #8a9ab0;">${analysis.profile_description}</div>
            </div>
            
            <div class="dysbiosis-meter">
                <div class="dysbiosis-fill" style="width: ${dysbiosis}%;"></div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Confidence</small><br>
                    <strong style="font-size: 1.3rem; color: #4a9eff;">${confidence}%</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Dysbiosis Index</small><br>
                    <strong style="font-size: 1.3rem; color: ${dysbiosis > 50 ? '#ff6b6b' : '#51cf66'};">${dysbiosis}%</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">F/B Ratio</small><br>
                    <strong>${fbratio}</strong>
                </div>
                <div style="background: #0f1422; padding: 10px; border-radius: 8px;">
                    <small style="color: #8a9ab0;">Diversity</small><br>
                    <strong>${diversity}</strong>
                </div>
            </div>
        `;
    }

    displayRiskFactors(riskFactors) {
        const container = document.getElementById('riskFactors');
        if (!container) return;

        if (!riskFactors || riskFactors.length === 0) {
            container.innerHTML = '<div style="color: #8a9ab0; text-align: center;">No significant risk factors detected</div>';
            return;
        }

        container.innerHTML = '';

        riskFactors.forEach(risk => {
            const riskClass = risk.risk.toLowerCase() === 'high' ? 'risk-high' : 'risk-moderate';

            container.innerHTML += `
                <div class="${riskClass}">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong style="color: ${risk.risk === 'High' ? '#ff6b6b' : '#ffd43b'};">${risk.factor}</strong>
                        <span style="color: #8a9ab0;">Risk: ${risk.risk}</span>
                    </div>
                    <p style="color: #e0e0e0; margin-bottom: 5px;">${risk.description}</p>
                    <small style="color: #4a9eff;">💡 ${risk.suggestion}</small>
                </div>
            `;
        });
    }

    displayRecommendations(recommendations) {
        const container = document.getElementById('recommendations');
        if (!container) return;

        container.innerHTML = '';

        recommendations.forEach(rec => {
            let priorityClass = 'recommendation-medium';
            if (rec.priority.toLowerCase() === 'high' || rec.priority.toLowerCase() === 'critical') {
                priorityClass = 'recommendation-high';
            } else if (rec.priority.toLowerCase() === 'low') {
                priorityClass = 'recommendation-low';
            }

            container.innerHTML += `
                <div class="recommendation-card ${priorityClass}">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <strong style="color: #4a9eff;">${rec.category}</strong>
                        <span style="color: #8a9ab0;">Priority: ${rec.priority}</span>
                    </div>
                    <p style="color: #e0e0e0;">${rec.advice}</p>
                </div>
            `;
        });
    }

    showLoading() {
        const btn = document.getElementById('analyzeBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Analyzing...';
        }
    }

    hideLoading() {
        const btn = document.getElementById('analyzeBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔬 Analyze Sample';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : '#4a9eff'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize microbiome viewer
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('microbiomeViewer')) {
        window.microbiomeViewer = new MicrobiomeViewer();
        window.microbiomeViewer.init();
    }
});