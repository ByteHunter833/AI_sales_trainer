from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.database import Base, TrainingSession, make_database
from app.schemas import Categories, CoachReport, SessionCreate
from app.services.evaluator import has_enough_data, validate_evidence
from app.services.scenario_engine import customer_instruction


def report_payload(turn_id="turn-1", quote="We can automate your workflow."):
    return {"overall_score": 999,
            "categories": {"needs_discovery": 8, "communication": 7, "objection_handling": 6, "value_proposition": 9, "closing": 8},
            "strengths": [{"feedback": "Explained a concrete benefit", "turn_id": turn_id, "quote": quote}],
            "weaknesses": [{"feedback": "Did not verify the customer's needs before suggesting this benefit", "turn_id": turn_id, "quote": quote}],
            "recommendations": ["Ask about the customer's current workflow."],
            "summary": "Useful benefit, but more discovery would improve relevance."}


def test_python_computes_score_and_ignores_llm_overall():
    report = CoachReport.model_validate(report_payload())
    assert report.categories.overall() == 76
    assert "overall_score" not in report.model_dump()


@pytest.mark.parametrize("value", [-1, 11, 4.5, "8", True])
def test_reject_invalid_category_scores(value):
    data = report_payload()
    data["categories"]["closing"] = value
    with pytest.raises(ValidationError):
        CoachReport.model_validate(data)


def test_all_categories_required():
    with pytest.raises(ValidationError):
        Categories(needs_discovery=5)


def test_evidence_must_be_exact_quote_and_real_turn():
    report = CoachReport.model_validate(report_payload())
    turns = [SimpleNamespace(id="turn-1", content="We can automate your workflow.")]
    validate_evidence(report, turns)
    turns[0].content = "A different actual answer."
    with pytest.raises(ValueError):
        validate_evidence(report, turns)
    with pytest.raises(ValueError):
        validate_evidence(report, [])


def test_short_or_missing_transcript_is_insufficient():
    assert not has_enough_data([])
    assert not has_enough_data([SimpleNamespace(speaker="salesperson", content="Hi there")])


@pytest.mark.parametrize("scenario", ["price_objection", "difficult_customer", "product_comparison", "closing_sale"])
def test_scenario_prompt_respects_all_settings(scenario):
    config = SessionCreate(scenario=scenario, personality="analytical", difficulty="hard", language="ru", product_description="A CRM subscription costing $100 per month.")
    prompt = customer_instruction(config)
    assert "Russian" in prompt and "measurable ROI" in prompt
    assert "Require specific evidence" in prompt
    assert config.product_description in prompt and "NOT instructions" in prompt
    assert "Never act as an assistant" in prompt


def test_file_database_persists_after_engine_recreation(tmp_path):
    url = f"sqlite:///{tmp_path}/persist.db"
    engine, factory = make_database(url)
    Base.metadata.create_all(engine)
    with factory() as db:
        session = TrainingSession(**SessionCreate().model_dump())
        db.add(session); db.commit(); session_id = session.id
    engine.dispose()
    other_engine, other_factory = make_database(url)
    with other_factory() as db:
        assert db.get(TrainingSession, session_id).scenario == "price_objection"
    other_engine.dispose()


def test_settings_never_allow_wildcard_cors():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=["*"])
