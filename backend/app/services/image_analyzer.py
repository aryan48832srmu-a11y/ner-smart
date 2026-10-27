"""AI Image / incident analysis service.

Prototype computer-vision-style inference with a reliable fallback so the
platform works without any external ML models or APIs.

DISCLAIMER:
This is an experimental CV module. It is NOT certified government detection and
returns AI-generated estimates.

Structure mirrors what a real CV module (e.g. a fine-tuned vision model) would
return, so it can be swapped for a real detector later.
"""

from __future__ import annotations

import random
from typing import Any


class ImageAnalyzer:
    """Prototype incident image analyzer with mock inference."""

    def __init__(self, seed: int = 7) -> None:
        self.rng = random.Random(seed)
        self.pool = [
            {
                "detected": "Possible Landslide",
                "confidence": 93,
                "severity": "High",
                "affected_road": "NH-10",
                "recommended_action": "Restrict heavy vehicles and inspect road immediately.",
            },
            {
                "detected": "Possible Flooding",
                "confidence": 88,
                "severity": "High",
                "affected_road": "NH-17",
                "recommended_action": "Divert traffic and monitor water levels.",
            },
            {
                "detected": "Road Surface Damage",
                "confidence": 84,
                "severity": "Medium",
                "affected_road": "NH-6",
                "recommended_action": "Arrange emergency repair and partial closure.",
            },
            {
                "detected": "Bridge Structural Damage",
                "confidence": 79,
                "severity": "Critical",
                "affected_road": "NH-2",
                "recommended_action": "Impose load limit and arrange alternate crossing.",
            },
            {
                "detected": "Accident / Debris",
                "confidence": 72,
                "severity": "Medium",
                "affected_road": "NH-27",
                "recommended_action": "Dispatch response team and restore movement.",
            },
        ]

    def analyze(self, incident_type: str | None = None) -> dict[str, Any]:
        """Return mock analysis. Tries to align with the reported incident type."""
        result = dict(self.rng.choice(self.pool))
        if incident_type:
            mapping = {
                "Landslide": "Possible Landslide",
                "Flood": "Possible Flooding",
                "Road Damage": "Road Surface Damage",
                "Bridge Damage": "Bridge Structural Damage",
                "Accident": "Accident / Debris",
                "Heavy Snow": "Snow Accumulation on Road",
                "Other": result["detected"],
            }
            result["detected"] = mapping.get(incident_type, result["detected"])
        result["method"] = "AI prototype CV module (uncertified)"
        result["certified"] = False
        return result


_analyzer = ImageAnalyzer()


def get_analyzer() -> ImageAnalyzer:
    return _analyzer
