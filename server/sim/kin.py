"""6축 산업용 로봇 운동학 · 경로 생성 · 도달성/충돌 여유 (원본 KIN 이식, 가상 계산).

원본 JS와 같은 값이 나오도록 연산 순서를 그대로 유지했다(순수 파이썬 float, numpy 미사용).
실제 로봇(URDF)이 정해지면 DH/OFF/LIM 과 fk/ik 를 교체한다. 좌표: 로봇 베이스 기준 [m], z 위.
"""
import math

PI = math.pi
D2R = PI / 180

# 일반 6R 산업용 로봇, 도달 약 1.6 m (H2017 URDF 미수령 상태의 근사)
DH = [[0.40, 0, PI / 2], [0, 0.80, 0], [0, 0, PI / 2], [0.70, 0, -PI / 2], [0, 0, PI / 2], [0.15, 0, 0]]
OFF = [0, PI / 2, 0, 0, 0, 0]
LIM = [[a * D2R, b * D2R] for a, b in [(-360, 360), (-125, 125), (-160, 160), (-360, 360), (-135, 135), (-360, 360)]]
I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
TOOLLEN = {"scanner": 0.22, "camera": 0.16, "probe": 0.13}
DOWN = [0, 0, -1]


def _nz(v):
    """JS 의 `v || 1e-12` (0 이나 NaN 이면 대체)"""
    return v if v and v == v else 1e-12


def mul(A, B):
    C = [0.0] * 16
    for r in range(4):
        for c in range(4):
            s = 0
            for k in range(4):
                s += A[r * 4 + k] * B[k * 4 + c]
            C[r * 4 + c] = s
    return C


def dh(t, d, a, al):
    ct, st, ca, sa = math.cos(t), math.sin(t), math.cos(al), math.sin(al)
    return [ct, -st * ca, st * sa, a * ct, st, ct * ca, -ct * sa, a * st, 0, sa, ca, d, 0, 0, 0, 1]


def fk(q, tool):
    T = I4
    pts = [[0, 0, 0]]
    for i in range(6):
        T = mul(T, dh(q[i] + OFF[i], DH[i][0], DH[i][1], DH[i][2]))
        pts.append([T[3], T[7], T[11]])
    T = mul(T, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, tool, 0, 0, 0, 1])
    pts.append([T[3], T[7], T[11]])
    return T, pts


def _sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _nrm(a):
    ln = math.hypot(a[0], a[1], a[2])
    return [a[0] / ln, a[1] / ln, a[2] / ln]


def frame(zdir, xref):
    z = _nrm(zdir)
    x = _sub(xref, [v * _dot(xref, z) for v in z])
    x = _nrm(x)
    return {"x": x, "y": _cross(z, x), "z": z}


def _err(T, tg):
    p = [T[3], T[7], T[11]]
    ep = _sub(tg["p"], p)
    R = [[T[0], T[1], T[2]], [T[4], T[5], T[6]], [T[8], T[9], T[10]]]
    Rd = tg["R"]
    D = [[Rd["x"][0], Rd["y"][0], Rd["z"][0]], [Rd["x"][1], Rd["y"][1], Rd["z"][1]], [Rd["x"][2], Rd["y"][2], Rd["z"][2]]]
    E = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for j in range(3):
            s = 0
            for k in range(3):
                s += D[i][k] * R[j][k]
            E[i][j] = s
    tr = E[0][0] + E[1][1] + E[2][2]
    c = max(-1, min(1, (tr - 1) / 2))
    ang = math.acos(c)
    w = [E[2][1] - E[1][2], E[0][2] - E[2][0], E[1][0] - E[0][1]]
    sn = math.sin(ang)
    if ang < 1e-6:
        w = [v * 0.5 for v in w]
    elif PI - ang > 1e-3:
        w = [v * ang / (2 * sn) for v in w]
    else:  # π 근처: 대각 성분에서 회전축을 구한다
        ax = [math.sqrt(max(0, (E[0][0] + 1) / 2)), math.sqrt(max(0, (E[1][1] + 1) / 2)), math.sqrt(max(0, (E[2][2] + 1) / 2))]
        if E[0][1] < 0:
            ax[1] = -ax[1]
        if E[0][2] < 0:
            ax[2] = -ax[2]
        w = [v * ang for v in ax]
    return ep + w


def _solve(A, b):
    n = len(b)
    M = [A[i][:] + [b[i]] for i in range(n)]
    for c in range(n):
        p = c
        for r in range(c + 1, n):
            if abs(M[r][c]) > abs(M[p][c]):
                p = r
        M[c], M[p] = M[p], M[c]
        pv = _nz(M[c][c])
        for r in range(c + 1, n):
            f = M[r][c] / pv
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = M[r][n]
        for k in range(r + 1, n):
            s -= M[r][k] * x[k]
        x[r] = s / _nz(M[r][r])
    return x


def limits_ok(q):
    return all(LIM[i][0] <= v <= LIM[i][1] for i, v in enumerate(q))


def ik(tg, q0, tool):
    """감쇠 최소제곱(Levenberg–Marquardt 형) 수치 역기구학, 최대 220회"""
    q = list(q0)
    lam = 0.06
    for _ in range(220):
        e = _err(fk(q, tool)[0], tg)
        ep = math.hypot(e[0], e[1], e[2])
        eo = math.hypot(e[3], e[4], e[5])
        if ep < 3e-4 and eo < 3e-3:
            return {"q": q, "ok": limits_ok(q), "conv": True, "ep": ep, "eo": eo}
        J = [[0.0] * 6 for _ in range(6)]
        h = 1e-6
        for j in range(6):
            qq = list(q)
            qq[j] += h
            e2 = _err(fk(qq, tool)[0], tg)
            for r in range(6):
                J[r][j] = (e[r] - e2[r]) / h
        JJt = []
        for r in range(6):
            row = []
            for c in range(6):
                s = 0
                for k in range(6):
                    s += J[r][k] * J[c][k]
                row.append(s + (lam * lam if r == c else 0))
            JJt.append(row)
        y = _solve(JJt, e)
        dq = []
        for k in range(6):
            s = 0
            for r in range(6):
                s += J[r][k] * y[r]
            dq.append(s)
        mx = max(abs(v) for v in dq)
        sc = 0.2 / mx if mx > 0.2 else 1
        for k in range(6):
            q[k] += dq[k] * sc
    e = _err(fk(q, tool)[0], tg)
    return {"q": q, "ok": False, "conv": False, "ep": math.hypot(e[0], e[1], e[2]), "eo": math.hypot(e[3], e[4], e[5])}


# ---------- 셀 기하 (도킹 자세별, 로봇 베이스 좌표, 부품 윗면 = 베이스 높이) ----------
AMR0 = {"min": [0.425, -0.55, -0.46], "max": [1.175, 0.55, 0]}  # AMR 몸체 + 지그 판 (공칭 도킹)


class Ctx:
    def __init__(self, pose=None):
        pose = pose or {"dx": 0, "dy": 0, "dth": 0}
        self.pose = pose
        self.c, self.s = math.cos(pose["dth"]), math.sin(pose["dth"])
        a = AMR0
        self.AMR = {"min": [a["min"][0] + pose["dx"], a["min"][1] + pose["dy"], a["min"][2]],
                    "max": [a["max"][0] + pose["dx"], a["max"][1] + pose["dy"], a["max"][2]]}
        self.PLATE = self._aabb(0, 0, 0, 300, 200, 16)
        self.FLANGE = self._aabb(0, 188, 16, 300, 200, 96)
        self.OBST = [("AMR·지그", self.AMR), ("판재", self.PLATE), ("플랜지", self.FLANGE)]

    def p2w(self, x, y, z):
        u, v = (x - 150) / 1000, (y - 100) / 1000
        return [0.80 + self.pose["dx"] + self.c * u - self.s * v, self.pose["dy"] + self.s * u + self.c * v, z / 1000]

    def rot(self, d):
        return [self.c * d[0] - self.s * d[1], self.s * d[0] + self.c * d[1], d[2]]

    def _aabb(self, x0, y0, z0, x1, y1, z1):
        p = [self.p2w(q[0], q[1], 0) for q in [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]]
        return {"min": [min(q[0] for q in p), min(q[1] for q in p), z0 / 1000],
                "max": [max(q[0] for q in p), max(q[1] for q in p), z1 / 1000]}


NOM = Ctx()


def box_dist(p, b):
    s = 0
    for k in range(3):
        v = max(b["min"][k] - p[k], 0, p[k] - b["max"][k])
        s += v * v
    return math.sqrt(s)


LINKS = [(1, 2, 0.085, "상완"), (3, 4, 0.07, "전완"), (5, 6, 0.055, "손목"), (6, 7, 0.035, "툴")]


def clearance(pts, contact, ctx=None):
    """링크(캡슐 근사)와 장애물 사이 최소 여유거리 [m]"""
    ctx = ctx or NOM
    best = {"d": 1e9, "link": "", "obj": ""}
    for a, b, r, nm in LINKS:
        for s in range(13):
            t = s / 12
            p = [pts[a][0] + (pts[b][0] - pts[a][0]) * t, pts[a][1] + (pts[b][1] - pts[a][1]) * t, pts[a][2] + (pts[b][2] - pts[a][2]) * t]
            for on, ob in ctx.OBST:
                if nm == "툴" and (contact or on != "AMR·지그") and t > 0.6:
                    continue
                d = box_dist(p, ob) - r
                if d < best["d"]:
                    best = {"d": d, "link": nm, "obj": on}
    return best


def wp(ctx, x, y, z, direction, xref=None):
    return {"p": ctx.p2w(x, y, z), "R": frame(ctx.rot(direction), ctx.rot(xref or [1, 0, 0])), "part": [x, y, z]}


def scan_passes(ctx, ids):
    out = []
    a = 30 * D2R
    d = [0, math.cos(a), -math.sin(a)]
    allp = {"P1": 32, "P2": 94, "P3": 156}
    for i in ids:
        pts = []
        if i in allp:
            for x in range(0, 301, 50):
                pts.append(wp(ctx, x, allp[i], 16 + 250, DOWN, [0, 1, 0]))
        else:
            tz = 40 if i == "P4" else 80
            for x in range(0, 301, 50):
                pts.append(wp(ctx, x, 188 - 250 * d[1], tz - 250 * d[2], d, [1, 0, 0]))
        out.append({"id": i, "pts": pts, "tool": "scanner"})
    return out


def vision_pose(ctx, cx, cy, tilt_deg, pid):
    t = tilt_deg * D2R
    return {"id": pid, "tool": "camera", "pts": [wp(ctx, cx - 285 * math.sin(t), cy, 16 + 285 * math.cos(t), [math.sin(t), 0, -math.cos(t)], [0, 1, 0])]}


def ut_path_t(ctx, y_end, pid, tilt_deg):
    t = (tilt_deg or 0) * D2R
    d = [0, math.sin(t), -math.cos(t)]
    x = 110
    pts = [wp(ctx, x, 40, 16 + 60, d, [1, 0, 0])]
    y = 40
    while y <= y_end:
        pts.append(wp(ctx, x, y, 16, d, [1, 0, 0]))
        y += 20
    pts.append(wp(ctx, x, y_end, 16 + 60, d, [1, 0, 0]))
    return {"id": pid, "tool": "probe", "pts": pts, "contact": True}


def trans_clear(qa, qb, tool, contact, ctx):
    w = {"d": 1e9, "link": "", "obj": ""}
    for s in range(1, 10):
        q = [v + (qb[i] - v) * s / 10 for i, v in enumerate(qa)]
        c = clearance(fk(q, tool)[1], bool(contact), ctx)
        if c["d"] < w["d"]:
            w = c
    return w


SEEDS = [[0, -0.4, -0.4, 0, -0.8, 0], [0, -0.2, -0.6, 0, -0.8, 0], [0.2, -0.5, -0.2, 0, -0.9, 0], [-0.2, -0.5, -0.2, 0, -0.9, 0], [0, 0.2, 1.4, 0, 1.2, 0]]


def qdist(a, b):
    return max(abs(v - b[i]) for i, v in enumerate(a))


def best_ik(w, q, tool):
    """현재 자세에서 못 풀거나 너무 멀리 가면 시드 5개로 재시도해 가장 가까운 해를 고른다"""
    r = ik(w, q, tool)
    if r["conv"] and r["ok"] and qdist(r["q"], q) < 1.2:
        return r
    best = r if (r["conv"] and r["ok"]) else None
    for sd in SEEDS:
        r2 = ik(w, sd, tool)
        if r2["conv"] and r2["ok"] and (best is None or qdist(r2["q"], q) < qdist(best["q"], q)):
            best = r2
    return best or r


HOME = best_ik({"p": NOM.p2w(150, 100, 16 + 450), "R": frame([0, 0, -1], [0, 1, 0])}, SEEDS[0], 0.22)["q"]


def shifted(w, d):
    return {"p": [w["p"][0] - w["R"]["z"][0] * d, w["p"][1] - w["R"]["z"][1] * d, w["p"][2] - w["R"]["z"][2] * d], "R": w["R"], "part": w["part"]}


def solve_path(path, qstart, ctx_act):
    """계획(ctxPlan: 로봇이 믿는 부품 위치)으로 풀고, 실제 위치(ctxAct)에 대해 도달·여유를 검사"""
    tool = TOOLLEN[path["tool"]]
    q = list(qstart)
    res = []
    pts = [shifted(path["pts"][0], 0.12)] + path["pts"] + [shifted(path["pts"][-1], 0.12)]
    for k, w in enumerate(pts):
        inner = 0 < k < len(pts) - 1
        r = best_ik(w, q, tool)
        f = fk(r["q"], tool)
        contact = bool(path.get("contact")) and inner
        cl = clearance(f[1], contact, ctx_act)
        tr = trans_clear(q, r["q"], tool, bool(path.get("contact")) and k > 0, ctx_act)
        res.append({"q": r["q"], "reach": r["conv"] and r["ok"], "conv": r["conv"], "clear": cl, "trans": tr,
                    "inner": inner, "tip": f[1][7], "target": w})
        if r["conv"]:
            q = r["q"]
    return {"id": path["id"], "tool": path["tool"], "res": res, "qEnd": q}


def summary(sp):
    inner = [x for x in sp["res"] if x["inner"]]
    ok = sum(1 for x in inner if x["reach"])
    mc = {"d": 1e9, "link": "", "obj": ""}
    for x in sp["res"]:
        if x["clear"]["d"] < mc["d"]:
            mc = x["clear"]
        if x["trans"] and x["trans"]["d"] < mc["d"]:
            mc = x["trans"]
    return {"n": len(inner), "ok": ok, "minClear": mc}


def tip_error(sp, ctx_act):
    """부품에 닿거나 보는 점에서 공구 끝의 위치 오차 [mm]"""
    mx = 0
    for x in sp["res"]:
        if not x["inner"]:
            continue
        a = ctx_act.p2w(*x["target"]["part"])
        e = math.hypot(x["tip"][0] - a[0], x["tip"][1] - a[1]) * 1000
        if e > mx:
            mx = e
    return mx
