"""가상 3D 편차 맵과 가상 2D 국부 영상 (원본 GEOM.devGrid / GEOM.shade 이식).

실제 3D 스캐너 · 카메라가 붙으면 이 모듈의 결과를 실제 점군 편차 · 영상으로 교체한다.
2D 영상은 높이맵에 Blinn-Phong 조명을 적용한 가상 영상이며, 픽셀 노이즈의 난수열(LCG)까지
원본과 같다(JS 의 double 반올림 동작을 float 로 그대로 재현).
"""
import math

from . import geom

# 2D 촬영 지점별 조명 [입사각°, 강도%] — 원본 spotImg 와 같다
def light_for(part, sat):
    if sat:
        return 15, 100
    return {"A": (15, 30), "B": (25, 90)}.get(part, (25, 50))


def dev_grid(part, step=2):
    """부품 윗면의 CAD 대비 편차 격자 [mm]. 행 j = y 방향, 열 i = x 방향"""
    nx, ny = round(300 / step), round(188 / step)
    v = [geom.dev(part, (i + 0.5) * step, (j + 0.5) * step) for j in range(ny) for i in range(nx)]
    return {"nx": nx, "ny": ny, "step": step, "v": v}


def shade(part, sp, th, intensity, W, H):
    """한 촬영 지점의 가상 영상 (그레이, 길이 W*H, 행 우선)"""
    t = th * math.pi / 180
    l = [-math.sin(t), 0, math.cos(t)]
    hv = [l[0], 0, l[2] + 1]
    hl = math.hypot(*hv)
    hv[0] /= hl
    hv[2] /= hl
    wy, wx = sp["y"][1] - sp["y"][0], sp["x"][1] - sp["x"][0]
    e = min(wy / W, wx / H) * 0.6
    seed = 3
    out = [0] * (W * H)
    top_z, ripple = geom.top_z, geom.ripple

    def h(x, y):
        return top_z(part, x, y) + ripple(x, y)

    for v in range(H):
        x = sp["x"][0] + (v + 0.5) * wx / H
        for u in range(W):
            y = sp["y"][0] + (u + 0.5) * wy / W
            dzx = (h(x + e, y) - h(x - e, y)) / (2 * e)
            dzy = (h(x, y + e) - h(x, y - e)) / (2 * e)
            L = math.hypot(dzx, dzy, 1)
            n0, n2 = -dzx / L, 1 / L
            nl = n0 * l[0] + n2 * l[2]
            nh = n0 * hv[0] + n2 * hv[2]
            # JS: seed = (seed * 1103515245 + 12345) & 0x7fffffff  (곱셈은 double 로 반올림된다)
            seed = int(float(seed) * 1103515245.0 + 12345.0) & 0x7FFFFFFF
            noise = (seed / 0x7FFFFFFF - 0.5) * 0.03
            val = 1.5 * (intensity / 100) * (0.35 * max(nl, 0) + 0.9 * math.pow(max(nh, 0), 40))
            g = math.pow(min(1, val), 1 / 2.2) + noise
            out[v * W + u] = math.floor(255 * min(1, max(0, g)) + 0.5)
    return out


def spot_image(spot, sat=False):
    """(PNG 바이트, 폭, 높이). OpenCV 로 그레이 PNG 를 만든다."""
    import cv2
    import numpy as np
    sp = geom.SPOTS[spot]
    W = 200
    H = round(200 * (sp["x"][1] - sp["x"][0]) / (sp["y"][1] - sp["y"][0]))
    th, inten = light_for(sp["part"], sat)
    px = shade(sp["part"], sp, th, inten, W, H)
    img = np.array(px, dtype=np.uint8).reshape(H, W)
    ok, buf = cv2.imencode(".png", img)
    return buf.tobytes(), W, H
