"""도킹 오차 → 정합 보정 (가상 계산 예시)."""
import math


def docking_correction(progress):
    """도킹 진행도(0~1)에 따라 줄어드는 가상 오차[mm]. 실제 측정값으로 교체 대상."""
    return 12.0 * math.exp(-4.0 * progress)
