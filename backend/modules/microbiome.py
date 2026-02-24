"""
Microbiome Signal Analysis Module
Bacterial profiling and disease correlation
"""

import numpy as np
import logging
import random

logger = logging.getLogger(__name__)


class MicrobiomeAnalyzer:
    """Microbiome data analysis for patient profiling"""

    def __init__(self):
        # Reference profiles for different conditions
        self.disease_profiles = {
            'healthy': {
                'Firmicutes': 0.65,
                'Bacteroidetes': 0.25,
                'Proteobacteria': 0.05,
                'Actinobacteria': 0.03,
                'Fusobacteria': 0.01,
                'Other': 0.01
            },
            'ibd': {
                'Firmicutes': 0.40,
                'Bacteroidetes': 0.20,
                'Proteobacteria': 0.25,
                'Actinobacteria': 0.05,
                'Fusobacteria': 0.05,
                'Other': 0.05
            },
            'diabetes_type2': {
                'Firmicutes': 0.55,
                'Bacteroidetes': 0.15,
                'Proteobacteria': 0.15,
                'Actinobacteria': 0.10,
                'Fusobacteria': 0.02,
                'Other': 0.03
            },
            'obesity': {
                'Firmicutes': 0.70,
                'Bacteroidetes': 0.15,
                'Proteobacteria': 0.08,
                'Actinobacteria': 0.04,
                'Fusobacteria': 0.02,
                'Other': 0.01
            },
            'covid_19': {
                'Firmicutes': 0.45,
                'Bacteroidetes': 0.30,
                'Proteobacteria': 0.15,
                'Actinobacteria': 0.05,
                'Fusobacteria': 0.03,
                'Other': 0.02
            },
            'colorectal_cancer': {
                'Firmicutes': 0.35,
                'Bacteroidetes': 0.25,
                'Proteobacteria': 0.20,
                'Actinobacteria': 0.08,
                'Fusobacteria': 0.08,
                'Other': 0.04
            }
        }

        # Bacterial phyla with descriptions
        self.bacteria_info = {
            'Firmicutes': 'Gram-positive bacteria, important for energy absorption',
            'Bacteroidetes': 'Gram-negative bacteria, key for carbohydrate metabolism',
            'Proteobacteria': 'Includes many pathogens, often elevated in inflammation',
            'Actinobacteria': 'Important for immune system regulation',
            'Fusobacteria': 'Associated with colorectal cancer and inflammatory conditions',
            'Other': 'Other bacterial phyla'
        }

    # ─────────────────────────────────────────────────────────────
    # All methods are at CLASS level (one indent = 4 spaces inside class,
    # NOT inside __init__). This is the fix for the original bug.
    # ─────────────────────────────────────────────────────────────

    def _sanitize(self, obj):
        """
        Recursively replace NaN / Infinity with safe JSON values (0.0).
        JSON does not support NaN or Infinity — this prevents the
        'Unexpected token N ... is not valid JSON' error.
        """
        if isinstance(obj, float):
            if obj != obj or obj == float('inf') or obj == float('-inf'):  # NaN or Inf check
                return 0.0
            return obj
        if isinstance(obj, dict):
            return {k: self._sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._sanitize(v) for v in obj]
        return obj

    def analyze_patient(self, bacterial_counts):
        """
        Analyze microbiome sample and estimate patient profile.
        bacterial_counts: dict with bacteria names and their relative abundances.
        """
        try:
            # Convert to relative abundances if absolute counts
            if isinstance(bacterial_counts, dict):
                total = sum(bacterial_counts.values())
                if total > 0:
                    profile = {k: v / total for k, v in bacterial_counts.items()}
                else:
                    profile = bacterial_counts
            else:
                profile = bacterial_counts

            # Ensure all major phyla are present
            all_phyla = ['Firmicutes', 'Bacteroidetes', 'Proteobacteria',
                         'Actinobacteria', 'Fusobacteria', 'Other']
            for phylum in all_phyla:
                if phylum not in profile:
                    profile[phylum] = 0.0

            # Firmicutes/Bacteroidetes ratio (important biomarker)
            f_b_ratio = (profile.get('Firmicutes', 0) / profile.get('Bacteroidetes', 1)
                         if profile.get('Bacteroidetes', 0) > 0 else 0)

            # Shannon diversity index
            diversity = self._calculate_diversity(profile)

            # Compare with disease profiles using Jensen-Shannon distance
            distances = {}
            for condition, ref_profile in self.disease_profiles.items():
                dist = self._jensen_shannon_distance(profile, ref_profile)
                distances[condition] = dist

            best_match = min(distances, key=distances.get)
            best_distance = distances[best_match]

            max_possible_distance = 1.0
            confidence = 1 - (best_distance / max_possible_distance)

            dysbiosis_index = self._calculate_dysbiosis(profile)
            risk_factors = self._identify_risk_factors(profile)

            viz_data = {
                'labels': list(profile.keys()),
                'values': list(profile.values()),
                'colors': ['#4a9eff', '#51cf66', '#ffd43b', '#ff8787', '#9775fa', '#868e96']
            }

            result = {
                'estimated_profile': best_match,
                'profile_description': self._get_profile_description(best_match),
                'confidence': float(min(confidence, 0.99)),
                'distances': {k: float(v) for k, v in distances.items()},
                'visualization': viz_data,
                'dysbiosis_index': float(dysbiosis_index),
                'firmicutes_bacteroidetes_ratio': float(f_b_ratio),
                'diversity': float(diversity),
                'risk_factors': risk_factors,
                'recommendations': self._generate_recommendations(best_match, risk_factors),
                'bacteria_info': {k: self.bacteria_info.get(k, '') for k in profile.keys()}
            }
            # Sanitize all NaN/Inf before returning — JSON does not support these values
            return self._sanitize(result)

        except Exception as e:
            logger.error(f"Microbiome analysis error: {e}")
            return None

    def _calculate_diversity(self, profile):
        """Calculate Shannon diversity index"""
        try:
            values = [v for v in profile.values() if v > 0]
            if not values:
                return 0
            diversity = -np.sum([p * np.log(p) for p in values])
            return float(diversity)
        except:
            return 0.0

    def _jensen_shannon_distance(self, p, q):
        """Calculate Jensen-Shannon distance between two probability distributions"""
        try:
            all_keys = set(p.keys()) | set(q.keys())

            p_vec = np.array([p.get(k, 0) for k in all_keys])
            q_vec = np.array([q.get(k, 0) for k in all_keys])

            p_vec = p_vec / np.sum(p_vec) if np.sum(p_vec) > 0 else p_vec
            q_vec = q_vec / np.sum(q_vec) if np.sum(q_vec) > 0 else q_vec

            m_vec = 0.5 * (p_vec + q_vec)

            kl_pm = np.sum(p_vec * np.log2(p_vec / (m_vec + 1e-10))) if np.sum(p_vec) > 0 else 0
            kl_qm = np.sum(q_vec * np.log2(q_vec / (m_vec + 1e-10))) if np.sum(q_vec) > 0 else 0

            js_div = 0.5 * (kl_pm + kl_qm)
            js_dist = np.sqrt(js_div)
            return float(js_dist)

        except Exception as e:
            logger.error(f"JS distance error: {e}")
            return 1.0

    def _calculate_dysbiosis(self, profile):
        """Calculate dysbiosis index (microbial imbalance)"""
        try:
            diversity = self._calculate_diversity(profile)
            proteobacteria = profile.get('Proteobacteria', 0)
            fusobacteria = profile.get('Fusobacteria', 0)
            f_b_ratio = profile.get('Firmicutes', 0) / max(profile.get('Bacteroidetes', 0.01), 0.01)

            diversity_score = max(0, 1 - diversity / 3)
            proteo_score = min(1, proteobacteria / 0.2)
            fusobacter_score = min(1, fusobacteria / 0.1)
            f_b_score = 0
            if f_b_ratio < 0.5 or f_b_ratio > 5:
                f_b_score = min(1, abs(f_b_ratio - 2) / 10)

            dysbiosis = (0.3 * diversity_score +
                         0.3 * proteo_score +
                         0.2 * fusobacter_score +
                         0.2 * f_b_score)
            return float(dysbiosis)

        except Exception as e:
            logger.error(f"Dysbiosis calculation error: {e}")
            return 0.5

    def _identify_risk_factors(self, profile):
        """Identify specific risk factors from microbiome profile"""
        risk_factors = []

        if profile.get('Proteobacteria', 0) > 0.15:
            risk_factors.append({
                'factor': 'Elevated Proteobacteria',
                'risk': 'High',
                'description': 'Associated with inflammation and dysbiosis',
                'suggestion': 'Consider anti-inflammatory diet'
            })

        f_b = profile.get('Firmicutes', 0) / max(profile.get('Bacteroidetes', 0.01), 0.01)
        if f_b > 5:
            risk_factors.append({
                'factor': 'High Firmicutes/Bacteroidetes ratio',
                'risk': 'Moderate',
                'description': 'Associated with obesity and metabolic syndrome',
                'suggestion': 'Increase fiber intake'
            })
        elif f_b < 0.5:
            risk_factors.append({
                'factor': 'Low Firmicutes/Bacteroidetes ratio',
                'risk': 'Moderate',
                'description': 'Associated with inflammatory bowel disease',
                'suggestion': 'Consider probiotic supplementation'
            })

        if profile.get('Fusobacteria', 0) > 0.05:
            risk_factors.append({
                'factor': 'Elevated Fusobacteria',
                'risk': 'High',
                'description': 'Associated with colorectal cancer risk',
                'suggestion': 'Consider colonoscopy screening'
            })

        diversity = self._calculate_diversity(profile)
        if diversity < 2.0:
            risk_factors.append({
                'factor': 'Low microbial diversity',
                'risk': 'Moderate',
                'description': 'Reduced resilience against pathogens',
                'suggestion': 'Diversify diet with varied plant foods'
            })

        return risk_factors

    def _get_profile_description(self, profile_name):
        """Get description of the matched profile"""
        descriptions = {
            'healthy': 'Normal, balanced gut microbiome with good diversity',
            'ibd': 'Inflammatory bowel disease pattern with reduced Firmicutes and elevated Proteobacteria',
            'diabetes_type2': 'Type 2 diabetes associated profile with altered Firmicutes/Bacteroidetes ratio',
            'obesity': 'Obesity-associated profile with high Firmicutes/Bacteroidetes ratio',
            'covid_19': 'COVID-19 associated dysbiosis with reduced diversity',
            'colorectal_cancer': 'CRC-associated profile with elevated Fusobacteria and Proteobacteria'
        }
        return descriptions.get(profile_name, 'Unknown profile')

    def _generate_recommendations(self, profile_name, risk_factors):
        """Generate personalized recommendations based on profile"""
        recommendations = []

        recommendations.append({
            'category': 'Diet',
            'advice': 'Increase dietary fiber from diverse plant sources',
            'priority': 'High'
        })

        if profile_name == 'healthy':
            recommendations.append({
                'category': 'Maintenance',
                'advice': 'Continue balanced diet rich in prebiotics and probiotics',
                'priority': 'Medium'
            })
        elif profile_name == 'ibd':
            recommendations.append({
                'category': 'Medical',
                'advice': 'Consult gastroenterologist; consider low-FODMAP diet',
                'priority': 'High'
            })
        elif profile_name == 'diabetes_type2':
            recommendations.append({
                'category': 'Lifestyle',
                'advice': 'Focus on low-glycemic foods and regular exercise',
                'priority': 'High'
            })
        elif profile_name == 'obesity':
            recommendations.append({
                'category': 'Weight Management',
                'advice': 'Calorie restriction combined with increased physical activity',
                'priority': 'High'
            })
        elif 'colorectal' in profile_name:
            recommendations.append({
                'category': 'Screening',
                'advice': 'Regular colonoscopy screening recommended',
                'priority': 'Critical'
            })

        for risk in risk_factors:
            if 'suggestion' in risk:
                recommendations.append({
                    'category': 'Targeted',
                    'advice': risk['suggestion'],
                    'priority': risk['risk']
                })

        return recommendations

    def get_available_datasets(self):
        """Get available microbiome datasets"""
        return {
            'ihmp': {
                'name': 'Integrative Human Microbiome Project',
                'description': 'Multi-omic data from IBD, prediabetes, and pregnancy',
                'samples': 3000,
                'conditions': ['IBD', 'Prediabetes', 'Pregnancy']
            },
            'ipop': {
                'name': 'International Personal Omics Project',
                'description': 'Longitudinal profiling of healthy individuals',
                'samples': 100,
                'conditions': ['Healthy', 'Viral infection']
            },
            'american_gut': {
                'name': 'American Gut Project',
                'description': 'Citizen science microbiome project',
                'samples': 15000,
                'conditions': ['Various']
            }
        }

    def get_sample_data(self, dataset='ihmp'):
        """Get sample data from dataset — all values are fixed, never random"""
        DATASETS = {
            'ihmp': {
                'Firmicutes': 0.38,
                'Bacteroidetes': 0.22,
                'Proteobacteria': 0.24,
                'Actinobacteria': 0.06,
                'Fusobacteria': 0.06,
                'Other': 0.04
            },
            'ipop': {
                'Firmicutes': 0.64,
                'Bacteroidetes': 0.26,
                'Proteobacteria': 0.04,
                'Actinobacteria': 0.03,
                'Fusobacteria': 0.01,
                'Other': 0.02
            },
            'american_gut': {
                'Firmicutes': 0.58,
                'Bacteroidetes': 0.22,
                'Proteobacteria': 0.10,
                'Actinobacteria': 0.05,
                'Fusobacteria': 0.02,
                'Other': 0.03
            }
        }
        try:
            # Normalize to lowercase so 'iHMP', 'IHMP', 'ihmp' all match
            key = str(dataset).lower().strip()
            if key in DATASETS:
                return DATASETS[key]
            # Unknown dataset — return ihmp as safe default instead of random data
            logger.warning(f"Unknown dataset '{dataset}', returning iHMP default")
            return DATASETS['ihmp']
        except Exception as e:
            logger.error(f"Sample data error: {e}")
            return None
