"""평면 2링크 로봇 역기구학 (가상 계산 예시). 실제 로봇은 ikpy 등으로 교체."""
import math


def two_link_ik(x, y, l1, l2):
    d2 = x * x + y * y
    c2 = (d2 - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    c2 = max(-1.0, min(1.0, c2))
    q2 = math.acos(c2)
    q1 = math.atan2(y, x) - math.atan2(l2 * math.sin(q2), l1 + l2 * math.cos(q2))
    return {"q1": q1, "q2": q2, "l1": l1, "l2": l2, "target": {"x": x, "y": y}}
