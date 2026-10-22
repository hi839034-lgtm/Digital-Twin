"""서버 모드용 글꼴 파일 만들기:  python tools/subset_font.py  →  web/vendor/fonts/Pretendard-*.woff2

글자를 추가하거나 문구를 바꾼 뒤에 다시 실행한다 (단일 HTML 내보내기는 매번 자동으로 다시 만든다).
"""
from pathlib import Path

import fonts

OUT = Path(__file__).resolve().parent.parent / "web" / "vendor" / "fonts"

if __name__ == "__main__":
    data, chars = fonts.build_all()
    for w, b in data.items():
        p = OUT / f"Pretendard-{fonts.WEIGHTS[w]}.woff2"
        p.write_bytes(b)
        print(f"{p.name}: {len(b) / 1000:.0f} KB")
    print(f"글자 {len(chars)}개")
