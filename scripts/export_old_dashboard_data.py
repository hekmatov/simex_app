from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

OLD_APP_ROOT = Path(__file__).resolve().parents[2] / "pdpcDashApp" / "src"
if str(OLD_APP_ROOT) not in sys.path:
    sys.path.insert(0, str(OLD_APP_ROOT))

from pdpcdashapp.biomedical.model import BiomedicalModel, daily_new_cases
from pdpcdashapp.socio_economic.model import SocioEconomicModel

try:
    from pdpcdashapp.socio_economic.data_input.loaders.trust import (
        build_institution_trust_frame,
    )
except Exception:  # pragma: no cover - exporter helper fallback
    build_institution_trust_frame = None

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "public" / "data"
BRAND = {
    "blue": "#043BCB",
    "green": "#00A676",
    "sky": "#4496D1",
    "cobalt": "#2456A6",
    "teal": "#007C89",
    "navy": "#08224A",
    "seafoam": "#7FDEC1",
    "maroon": "#8F1D2C",
    "amber": "#C98700",
}


def clean_frame(frame: pd.DataFrame) -> pd.DataFrame:
    cleaned = frame.copy()
    for column in cleaned.columns:
        if pd.api.types.is_datetime64_any_dtype(cleaned[column]):
            cleaned[column] = cleaned[column].dt.strftime("%Y-%m-%d")
    return cleaned.replace({pd.NA: ""})


def write_csv(relative_path: str, frame: pd.DataFrame) -> str:
    path = DATA_ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    clean_frame(frame).to_csv(path, index=False)
    normalized = relative_path.replace("\\", "/")
    return f"data/{normalized}"


def write_json(relative_path: str, payload: dict) -> str:
    path = DATA_ROOT / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    normalized = relative_path.replace("\\", "/")
    return f"data/{normalized}"


def pct(numerator: float, denominator: float) -> float:
    if not denominator or math.isnan(float(denominator)):
        return 0.0
    return round(float(numerator) / float(denominator) * 100, 1)


def add_daily_cases(frame: pd.DataFrame) -> pd.DataFrame:
    output = frame.sort_values("date").copy()
    output["daily_new_cases"] = daily_new_cases(output)
    output["new_deaths"] = output["total_deaths"]
    return output


def latest_by_date(frame: pd.DataFrame, date_column: str = "date") -> pd.DataFrame:
    latest_date = frame[date_column].max()
    return frame.loc[frame[date_column] == latest_date].copy()


def province_deltas(model: BiomedicalModel) -> pd.DataFrame:
    frames = []
    for date in sorted(model.province_cases_frame["date"].drop_duplicates()):
        snapshot = model.province_delta_snapshot(date.strftime("%Y-%m-%d"))
        snapshot["date"] = date
        frames.append(snapshot)
    return pd.concat(frames, ignore_index=True)


def occupancy_frame(frame: pd.DataFrame, level: str) -> pd.DataFrame:
    if level == "icu":
        covid = "covid_icu_occupancy"
        noncovid = "noncovid_icu_occupancy"
        capacity = "icu_capacity_total"
    else:
        covid = "covid_clinic_occupancy"
        noncovid = "noncovid_clinic_occupancy"
        capacity = "clinic_capacity_total"
    output = frame[["date", covid, noncovid, capacity]].copy()
    output = output.rename(
        columns={
            covid: "HeV-A26 occupancy",
            noncovid: "Other occupancy",
            capacity: "Capacity",
        }
    )
    output["Total occupancy"] = output["HeV-A26 occupancy"] + output["Other occupancy"]
    return output


def gauge_rows(bio: BiomedicalModel) -> pd.DataFrame:
    latest = bio.hospitalization_frame.sort_values("date").iloc[-1]
    icu_total = latest["covid_icu_occupancy"] + latest["noncovid_icu_occupancy"]
    hospital_total = latest["covid_clinic_occupancy"] + latest["noncovid_clinic_occupancy"]
    return pd.DataFrame(
        [
            {
                "id": "current_icu_occupancy",
                "title": "Current ICU Occupancy",
                "value": pct(icu_total, latest["icu_capacity_total"]),
                "color": BRAND["maroon"] if pct(icu_total, latest["icu_capacity_total"]) >= 80 else BRAND["green"],
            },
            {
                "id": "current_hospital_occupancy",
                "title": "Current Hospital Occupancy",
                "value": pct(hospital_total, latest["clinic_capacity_total"]),
                "color": BRAND["maroon"] if pct(hospital_total, latest["clinic_capacity_total"]) >= 80 else BRAND["green"],
            },
        ]
    )


def behaviour_deltas(model: SocioEconomicModel, behaviour_type: str, keys: list[int]) -> pd.DataFrame:
    rows = []
    for date_value in model.behaviour_date_options():
        delta = model.behaviour_delta_snapshot(date_value, behaviour_type, keys)
        delta["selected_date"] = date_value
        rows.append(delta)
    return pd.concat(rows, ignore_index=True)


def values_deltas(model: SocioEconomicModel) -> pd.DataFrame:
    rows = []
    for date_value in model.behaviour_date_options():
        if date_value in model.values_frame["date_value"].tolist():
            delta = model.values_delta_snapshot(date_value)
            delta["selected_date"] = date_value
            rows.append(delta)
    return pd.concat(rows, ignore_index=True)


def approximate_nl_geojson() -> dict:
    centers = {
        "Groningen": (6.57, 53.22),
        "Friesland": (5.78, 53.16),
        "Drenthe": (6.55, 52.95),
        "Overijssel": (6.44, 52.44),
        "Flevoland": (5.53, 52.52),
        "Gelderland": (5.91, 52.05),
        "Utrecht": (5.16, 52.09),
        "Noord-Holland": (4.89, 52.52),
        "Zuid-Holland": (4.48, 52.00),
        "Zeeland": (3.77, 51.49),
        "Noord-Brabant": (5.23, 51.59),
        "Limburg": (5.94, 51.25),
    }
    features = []
    for province, (lon, lat) in centers.items():
        dx = 0.26
        dy = 0.18
        features.append(
            {
                "type": "Feature",
                "properties": {"name": province},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [lon - dx, lat - dy],
                        [lon + dx, lat - dy],
                        [lon + dx, lat + dy],
                        [lon - dx, lat + dy],
                        [lon - dx, lat - dy],
                    ]],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    bio = BiomedicalModel()
    socio = SocioEconomicModel()

    data_sources = {}

    cases = add_daily_cases(bio.cases_frame)
    data_sources["bio_cases"] = write_csv("biomedical/cases.csv", cases)
    data_sources["bio_province_cases"] = write_csv("biomedical/province_cases.csv", bio.province_cases_frame)
    data_sources["bio_province_cases_latest"] = write_csv("biomedical/province_cases_latest.csv", latest_by_date(bio.province_cases_frame))
    data_sources["bio_province_deltas"] = write_csv("biomedical/province_case_deltas.csv", province_deltas(bio))
    data_sources["bio_r_values"] = write_csv("biomedical/r_values.csv", bio.r_values_frame)
    data_sources["bio_mortality"] = write_csv("biomedical/mortality_by_age.csv", bio.mortality_frame)
    data_sources["bio_testing"] = write_csv("biomedical/testing.csv", bio.testing_frame)
    data_sources["bio_icu_occupancy"] = write_csv("biomedical/icu_occupancy.csv", occupancy_frame(bio.hospitalization_frame, "icu"))
    data_sources["bio_hospital_occupancy"] = write_csv("biomedical/hospital_occupancy.csv", occupancy_frame(bio.hospitalization_frame, "hospital"))
    data_sources["bio_admissions"] = write_csv("biomedical/admissions.csv", bio.hospitalization_frame[["date", "new_icu_admissions", "new_clinic_admissions"]])
    data_sources["bio_occupancy_gauges"] = write_csv("biomedical/occupancy_gauges.csv", gauge_rows(bio))
    data_sources["bio_healthcare_cases"] = write_csv("biomedical/healthcare_cases.csv", bio.healthcare_frame)
    data_sources["bio_wastewater"] = write_csv("biomedical/wastewater.csv", bio.wastewater_frame)
    data_sources["bio_wastewater_latest"] = write_csv("biomedical/wastewater_latest.csv", latest_by_date(bio.wastewater_frame))
    data_sources["bio_vaccination_current"] = write_csv("biomedical/vaccination_current.csv", bio.vaccination_current_frame)
    data_sources["bio_vaccination_timeseries"] = write_csv("biomedical/vaccination_timeseries.csv", bio.vaccination_timeseries_frame)

    data_sources["socio_behaviour"] = write_csv("socio-economic/behaviour.csv", socio.behaviour_frame)
    data_sources["socio_risk_deltas"] = write_csv("socio-economic/risk_perception_deltas.csv", behaviour_deltas(socio, "risk_perception", [1, 2, 3, 4, 5, 6]))
    data_sources["socio_adherence_deltas"] = write_csv("socio-economic/adherence_deltas.csv", behaviour_deltas(socio, "adherence", [1, 2, 3, 4, 5, 6]))
    data_sources["socio_values"] = write_csv("socio-economic/values.csv", socio.values_frame)
    data_sources["socio_values_deltas"] = write_csv("socio-economic/values_deltas.csv", values_deltas(socio))
    data_sources["socio_trust"] = write_csv("socio-economic/trust.csv", socio.trust_frame)
    data_sources["socio_business_closures"] = write_csv("socio-economic/business_closures.csv", socio.business_closures_frame)
    data_sources["socio_unemployment"] = write_csv("socio-economic/unemployment_rate.csv", socio.unemployment_rate_frame)
    data_sources["socio_loneliness"] = write_csv("socio-economic/loneliness.csv", socio.loneliness_frame)
    data_sources["socio_mental_wellbeing"] = write_csv("socio-economic/mental_wellbeing.csv", socio.mental_wellbeing_frame)
    data_sources["socio_lifestyle"] = write_csv("socio-economic/lifestyle.csv", socio.lifestyle_frame)
    data_sources["socio_resilience"] = write_csv("socio-economic/resilience.csv", socio.resilience_frame)
    data_sources["socio_education_absenteeism"] = write_csv("socio-economic/education_absenteeism.csv", socio.education_absenteeism_frame)
    data_sources["socio_healthcare_absenteeism"] = write_csv("socio-economic/healthcare_absenteeism.csv", socio.healthcare_absenteeism_frame)
    data_sources["geo_netherlands_provinces"] = "data/geo/netherlands-provinces.geojson"

    (DATA_ROOT / "data-sources.generated.json").write_text(
        json.dumps(data_sources, indent=2), encoding="utf-8"
    )
    print(f"Exported {len(data_sources)} dashboard data sources to {DATA_ROOT}")


if __name__ == "__main__":
    main()
