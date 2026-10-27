"""
NER-SMART AI Risk Engine.

Disruption/risk prediction service.

DISCLAIMER:
The model is a Gradient Boosting classifier trained on a synthetic-but-
realistic dataset engineered from rainfall, terrain, road condition and
incident history. Predictions are AI-generated estimates and are not
certified government forecasts.

The model uses a Gradient Boosting classifier trained on synthetic but
realistic data: higher rainfall, steeper terrain and a history of landslides
are engineered to increase predicted risk.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field

import numpy as np

warnings.filterwarnings("ignore")

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import train_test_split

    _SKLEARN_OK = True
except Exception:  # pragma: no cover
    _SKLEARN_OK = False

FEATURES = [
    "rainfall",
    "temperature",
    "humidity",
    "road_condition",
    "road_slope",
    "elevation",
    "distance_from_river",
    "historical_incidents",
    "current_incidents",
    "traffic_level",
    "weather_alert",
    "previous_disruptions",
]

LEVELS = [(0, 30, "LOW"), (31, 60, "MEDIUM"), (61, 80, "HIGH"), (81, 100, "CRITICAL")]


def risk_level(probability: float) -> str:
    for lo, hi, label in LEVELS:
        if lo <= probability <= hi:
            return label
    return "LOW"


@dataclass
class RiskPredictor:
    model: object = field(default=None)
    trained: bool = field(default=False)

    def _generate_training_data(self, n: int = 3000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
        rng = np.random.default_rng(seed)
        data = rng.uniform(low=0.0, high=1.0, size=(n, len(FEATURES)))
        X = data.copy()

        # Scale to realistic ranges.
        X[:, 0] = X[:, 0] * 60        # rainfall 0-60mm/h
        X[:, 1] = 5 + X[:, 1] * 30    # temperature 5-35 C
        X[:, 2] = X[:, 2] * 100       # humidity %
        X[:, 3] = np.floor(X[:, 3] * 5) + 1   # road_condition 1-5
        X[:, 4] = np.floor(X[:, 4] * 5) + 1   # road_slope 1-5
        X[:, 5] = np.floor(X[:, 5] * 3000)    # elevation 0-3000 m
        X[:, 6] = np.floor(X[:, 6] * 1500)    # distance_from_river 0-1500 m
        X[:, 7] = np.floor(X[:, 7] * 20)      # historical_incidents 0-19
        X[:, 8] = np.floor(X[:, 8] * 8)       # current_incidents 0-7
        X[:, 9] = np.floor(X[:, 9] * 5)       # traffic_level 0-4
        X[:, 10] = np.floor(X[:, 10] * 2)     # weather_alert 0-1
        X[:, 11] = np.floor(X[:, 11] * 15)    # previous_disruptions 0-14

        # Response: linear risk score 0-100 influenced by risk factors.
        raw = (
            X[:, 0] * 1.1                  # rainfall
            + X[:, 4] * 5.5                # road_slope (steep terrain)
            + X[:, 7] * 2.6                # historical incidents (landslides)
            + X[:, 11] * 2.4               # previous disruptions
            + X[:, 8] * 4.5                # current incidents
            + X[:, 10] * 22                # weather alert
            + (np.abs(X[:, 5] - 1500) / 1500) * 5
            + (np.abs(X[:, 6] - 700) / 1500) * 3
            + (5 - X[:, 3]) * 3            # worse road condition
            - X[:, 1] * 0.3                # mild temp effect
            + X[:, 9] * 1.2
            + rng.normal(0.0, 8.0, n)
        )

        prob = np.clip(raw, 0, 100) / 100.0
        y = (prob > 0.5).astype(int)  # binary disruption label for classifier
        return X, y

    def train(self, seed: int = 42) -> "RiskPredictor":
        X, y = self._generate_training_data(seed=seed)
        if _SKLEARN_OK:
            self.model = GradientBoostingClassifier(
                n_estimators=120,
                max_depth=3,
                learning_rate=0.08,
                random_state=seed,
            )
            self.model.fit(X, y)
        else:
            self.model = None
        self.trained = True
        return self

    def predict(self, features: dict) -> dict:
        """Predict risk probability and level for a feature dict."""
        ordered = [float(features.get(f, 0.0)) for f in FEATURES]
        X = np.array([ordered])

        prob = 0.5
        if self.model is not None:
            # Use classifier probability as a base signal.
            base = float(self.model.predict_proba(X)[0][1])

            # Blend with a deterministic physical-signal score so the demo is
            # robust even if sklearn state differs across machines.
            physical = self._physical_score(ordered)
            prob = 0.6 * (base * 100) + 0.4 * physical
            prob = float(np.clip(prob, 0, 100))
        else:
            prob = self._physical_score(ordered)

        level = risk_level(prob)
        return {"risk_probability": round(prob, 1), "risk_level": level}

    def _physical_score(self, features: list[float]) -> float:
        rainfall, temp, humidity = features[0], features[1], features[2]
        road_cond, slope, elevation = features[3], features[4], features[5]
        river_dist, hist, current = features[6], features[7], features[8]
        traffic, alert, prev = features[9], features[10], features[11]

        s = (
            min(rainfall / 60.0, 1.0) * 30
            + min(slope / 5.0, 1.0) * 20
            + min(hist / 20.0, 1.0) * 15
            + min(prev / 15.0, 1.0) * 10
            + min(current / 8.0, 1.0) * 12
            + alert * 8
            + (1 - min(road_cond / 5.0, 1.0)) * 5
        )
        return float(np.clip(s, 0, 100))

    def explain(self, features: dict, prediction: dict) -> list[str]:
        reasons: list[str] = []
        rainfall = float(features.get("rainfall", 0))
        slope = float(features.get("road_slope", 0))
        hist = float(features.get("historical_incidents", 0))
        prev = float(features.get("previous_disruptions", 0))
        current = float(features.get("current_incidents", 0))
        alert = float(features.get("weather_alert", 0))
        river = float(features.get("distance_from_river", 1000))

        if rainfall > 30:
            reasons.append("Heavy rainfall")
        elif rainfall > 15:
            reasons.append("Moderate rainfall")
        if slope >= 4:
            reasons.append("Steep terrain")
        elif slope >= 3:
            reasons.append("Moderate terrain gradient")
        if hist >= 5:
            reasons.append(f"Previous landslide activity ({int(hist)} events)")
        if prev >= 5:
            reasons.append(f"Previous disruptions ({int(prev)})")
        if current >= 2:
            reasons.append(f"Active incidents in vicinity ({int(current)})")
        if alert >= 1:
            reasons.append("Active weather alert")
        if river < 300:
            reasons.append("Close to river course")

        if not reasons:
            reasons.append("Generally stable conditions")

        if prediction["risk_level"] in ("HIGH", "CRITICAL"):
            reasons.append("Conditions favour elevated disruption risk")
        return reasons


_predictor: RiskPredictor | None = None


def get_predictor() -> RiskPredictor:
    global _predictor
    if _predictor is None:
        _predictor = RiskPredictor().train()
    return _predictor
