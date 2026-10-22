from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Scenario = Literal["price_objection", "difficult_customer", "product_comparison", "closing_sale"]
Personality = Literal["skeptical", "friendly", "impatient", "analytical"]


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    scenario: Scenario = "price_objection"
    personality: Personality = "skeptical"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    language: Literal["en", "ru"] = "en"
    product_description: str = Field(default="CRM software subscription for small businesses.", min_length=10, max_length=3000)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageOut(ORMModel):
    id: str
    sequence: int
    speaker: Literal["customer", "salesperson"]
    content: str
    timestamp: str


class SessionOut(SessionCreate, ORMModel):
    id: str
    created_at: str
    started_at: str | None
    ended_at: str | None
    duration_seconds: int
    status: str
    overall_score: int | None
    error: str | None
    transcript_warning: str | None


Score = Annotated[int, Field(strict=True, ge=0, le=10)]


class Categories(BaseModel):
    model_config = ConfigDict(extra="forbid")
    needs_discovery: Score
    communication: Score
    objection_handling: Score
    value_proposition: Score
    closing: Score

    def overall(self) -> int:
        return sum(self.model_dump().values()) * 2


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(min_length=5, max_length=1500)
    turn_id: str = Field(min_length=1)
    quote: str = Field(min_length=1, max_length=3000)


class CoachReport(BaseModel):
    # An LLM-supplied overall_score is deliberately ignored. Python computes it.
    model_config = ConfigDict(extra="ignore")
    categories: Categories
    strengths: list[Evidence] = Field(min_length=1, max_length=5)
    weaknesses: list[Evidence] = Field(min_length=1, max_length=5)
    recommendations: list[str] = Field(min_length=1, max_length=5)
    summary: str = Field(min_length=10, max_length=3000)


class EvaluationOut(ORMModel):
    overall_score: int
    categories: Categories
    strengths: list[Evidence]
    weaknesses: list[Evidence]
    recommendations: list[str]
    summary: str
    created_at: str


class SessionDetail(SessionOut):
    messages: list[MessageOut]
    evaluation: EvaluationOut | None
