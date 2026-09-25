"""HTTP-kontrakt för redigering, återöppning och borttagning av aktiviteter."""

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import get_session
from app.models import Activity
from app.routers.activities import router


class MemorySession:
    def __init__(self, activity: Activity):
        self.activity: Activity | None = activity

    async def get(
        self, model: type[Activity], activity_id: int, *, with_for_update: bool = False
    ) -> Activity | None:
        if model is Activity and self.activity is not None and activity_id == self.activity.id:
            return self.activity
        return None

    async def delete(self, activity: Activity) -> None:
        self.activity = None

    async def commit(self) -> None:
        pass

    async def refresh(self, activity: Activity) -> None:
        pass


def client_with_activity(*, klar: bool = True) -> tuple[TestClient, Activity]:
    now = datetime(2026, 9, 23, tzinfo=timezone.utc)
    activity = Activity(
        id=7,
        dialogue_id=1,
        kpi_area_id=2,
        text="Följ upp",
        klar=klar,
        klar_notering="Genomfört" if klar else None,
        skapad_at=now,
        klar_at=now if klar else None,
    )
    session = MemorySession(activity)
    app = FastAPI()
    app.include_router(router)

    async def session_override():
        yield session

    app.dependency_overrides[get_session] = session_override
    return TestClient(app), activity


def test_edit_completed_activity_preserves_completion():
    client, activity = client_with_activity()
    with client:
        response = client.patch(
            "/api/activities/7",
            json={"text": "  Följ upp igen  ", "klar_notering": "  Korrigerat  "},
        )
    assert response.status_code == 200
    assert response.json()["text"] == "Följ upp igen"
    assert response.json()["klar_notering"] == "Korrigerat"
    assert response.json()["klar"] is True
    assert activity.klar_at == datetime(2026, 9, 23, tzinfo=timezone.utc)


def test_reopen_activity_clears_completion_data():
    client, activity = client_with_activity()
    with client:
        response = client.patch(
            "/api/activities/7",
            json={"klar": False, "klar_notering": "Ska inte sparas"},
        )
    assert response.status_code == 200
    assert response.json()["klar"] is False
    assert response.json()["klar_notering"] is None
    assert response.json()["klar_at"] is None
    assert activity.klar_notering is None and activity.klar_at is None


def test_complete_open_activity_sets_timestamp():
    client, _ = client_with_activity(klar=False)
    with client:
        response = client.patch("/api/activities/7", json={"klar": True, "klar_notering": "Gjort"})
    assert response.status_code == 200
    assert response.json()["klar_at"] is not None
    assert response.json()["klar_notering"] == "Gjort"


def test_missing_or_invalid_activity_is_rejected():
    client, activity = client_with_activity()
    with client:
        assert client.patch("/api/activities/8", json={"text": "Ändrat"}).status_code == 404
        assert client.patch("/api/activities/7", json={"text": "  "}).status_code == 422
        assert client.patch("/api/activities/7", json={"text": "x" * 4001}).status_code == 422
        assert client.patch("/api/activities/7", json={"klar_notering": "x" * 1001}).status_code == 422
    assert activity.text == "Följ upp"


def test_only_completed_activity_can_be_deleted():
    client, activity = client_with_activity(klar=False)
    with client:
        assert client.delete("/api/activities/7").status_code == 409
        assert client.patch("/api/activities/7", json={"klar": True}).status_code == 200
        deleted = client.delete("/api/activities/7")
        missing = client.delete("/api/activities/7")
    assert deleted.status_code == 200
    assert deleted.json() == {"id": activity.id}
    assert missing.status_code == 404
