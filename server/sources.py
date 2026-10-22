"""데이터 공급원(source). 화면과 서버는 '상태 dict'만 주고받는다.

지금은 ScenarioSource(시나리오 재생)만 쓰고, 센서가 붙으면 SensorSource를
구현해서 main.py에서 바꿔 끼우면 된다. (화면 코드는 바꿀 필요 없음)
"""
import json
from pathlib import Path

from sim.docking import docking_correction
from sim.kinematics import two_link_ik

SCENARIO_DIR = Path(__file__).parent / "scenarios"


def list_scenarios():
    out = []
    for p in sorted(SCENARIO_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out.append({"id": d["id"], "name": d["name"], "duration": d["duration"]})
    return out


def load_scenario(sid):
    for p in SCENARIO_DIR.glob("*.json"):
        d = json.loads(p.read_text(encoding="utf-8"))
        if d["id"] == sid:
            return d
    raise KeyError(sid)


class ScenarioSource:
    """시간 t(초)를 받아 그 순간의 상태를 돌려준다."""

    def __init__(self, scenario):
        self.sc = scenario
        self.duration = scenario["duration"]

    def state_at(self, t):
        t = max(0.0, min(t, self.duration))
        return {
            "t": t,
            "duration": self.duration,
            "amr": self._amr(t),
            "robot": self._robot(t),
            "events": [e for e in self.sc["events"] if e["t"] <= t],
            "active": [e for e in self.sc["events"] if e["t"] <= t < e["t"] + e.get("dur", 2)],
        }

    def _amr(self, t):
        wp = self.sc["amr_path"]  # [{t,x,z}, ...]
        for a, b in zip(wp, wp[1:]):
            if a["t"] <= t <= b["t"]:
                k = (t - a["t"]) / max(b["t"] - a["t"], 1e-9)
                x = a["x"] + (b["x"] - a["x"]) * k
                z = a["z"] + (b["z"] - a["z"]) * k
                return {"x": x, "z": z, "dock_error": docking_correction(k)}
        last = wp[-1]
        return {"x": last["x"], "z": last["z"], "dock_error": 0.0}

    def _robot(self, t):
        import math
        # 가상 목표점: 셀 앞에서 원을 그리듯 움직인다 (실제 경로 생성 자리)
        tx = 1.2 + 0.3 * math.cos(t * 0.6)
        ty = 0.8 + 0.2 * math.sin(t * 0.6)
        return two_link_ik(tx, ty, l1=1.0, l2=0.9)


class SensorSource:
    """TODO: 실제 센서/로봇 값을 받아 같은 모양의 dict를 돌려준다.

    예) asyncua(OPC UA), paho-mqtt, pyserial, rclpy(ROS2)
    state_at(t)와 같은 키(amr, robot, events, active)를 채워서 반환하면 된다.
    """

    def state_at(self, t):
        raise NotImplementedError
