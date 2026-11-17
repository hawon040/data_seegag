"""과실생산량 CSV(wide) -> long 변환 + 시각화용 JSON/JS 생성.

사용: python scripts/prepare_data.py
입력: data/과실생산량_성과수미과수__*.csv  (KOSIS, 시도별 / 1985·1995·2005·2015·2025)
출력: data/processed/fruit_long.csv, docs/data.json, docs/data.js
"""
import glob
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

# 시도 대표 위도(근사값, 행정구역 중심 부근). 재배 무게중심 위도 계산용 — 정밀 좌표 아님.
LAT = {
    "서울특별시": 37.57, "부산광역시": 35.18, "대구광역시": 35.87, "인천광역시": 37.46,
    "광주광역시": 35.16, "대전광역시": 36.35, "울산광역시": 35.54, "세종특별자치시": 36.48,
    "경기도": 37.40, "강원특별자치도": 37.80, "충청북도": 36.80, "충청남도": 36.50,
    "전북특별자치도": 35.70, "전라남도": 34.90, "경상북도": 36.40, "경상남도": 35.40,
    "제주특별자치도": 33.40,
}


def load_long() -> pd.DataFrame:
    path = sorted(glob.glob(str(ROOT / "data" / "과실생산량_*.csv")))[0]
    raw = pd.read_csv(path, encoding="utf-8-sig", header=None)
    years = raw.iloc[0, 2:].astype(int).tolist()
    items = raw.iloc[1, 2:].tolist()
    rows = []
    for _, r in raw.iloc[2:].iterrows():
        sido1, sido2 = r[0], r[1]
        if sido1 == "전국":
            continue
        # 전남광주통합특별시는 광주/전남 행이 따로 있어 sido2를 지역명으로 사용
        region = sido2 if sido1 == "전남광주통합특별시" else sido1
        for y, item, v in zip(years, items, r.iloc[2:]):
            crop, metric = item.split(":", 1)
            val = pd.to_numeric(v, errors="coerce")
            rows.append((region, y, crop, metric, val))
    return pd.DataFrame(rows, columns=["region", "year", "crop", "metric", "value"])


def main() -> None:
    df = load_long()
    out_csv = ROOT / "data" / "processed"
    out_csv.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_csv / "fruit_long.csv", index=False, encoding="utf-8-sig")

    area = df[df.metric == "면적 (ha)"]
    crops = [c for c in area.crop.unique() if c not in ("합계",)]
    years = sorted(area.year.unique().tolist())
    regions = sorted(area.region.unique().tolist())

    def pivot(crop: str) -> pd.DataFrame:
        # 일부 작물은 특정 연도 열이 없으므로 전체 연도/지역 기준으로 재정렬
        return (area[area.crop == crop]
                .pivot_table(index="region", columns="year", values="value")
                .reindex(index=regions, columns=years))

    series = {}   # series[crop][region] = [연도별 재배면적(ha)]
    for c in crops + ["합계"]:
        sub = pivot(c)
        series[c] = {
            reg: [None if pd.isna(v) else float(v) for v in sub.loc[reg].tolist()]
            for reg in regions if sub.loc[reg].notna().any()
        }

    # 재배면적 가중 평균 위도 (북상 지표)
    centroid = {}
    for c in crops:
        sub = pivot(c).fillna(0)
        vals = []
        for y in years:
            tot = float(sub[y].sum())
            vals.append(round(sum(sub.loc[r, y] * LAT[r] for r in regions) / tot, 3) if tot > 0 else None)
        centroid[c] = vals

    payload = {
        "years": years, "regions": regions, "crops": crops,
        "area": series, "centroid_lat": centroid, "lat": LAT,
        "source": "KOSIS 농작물생산조사 과실생산량(성과수·미과수), 시도별",
    }
    (ROOT / "docs").mkdir(exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False)
    (ROOT / "docs" / "data.json").write_text(text, encoding="utf-8")
    # file:// 로 index.html을 바로 열어도 동작하도록 JS 형태로도 저장
    (ROOT / "docs" / "data.js").write_text("window.FRUIT_DATA = " + text + ";", encoding="utf-8")
    print("crops:", crops)
    print("apple centroid lat:", dict(zip(years, centroid["사과"])))


if __name__ == "__main__":
    main()
