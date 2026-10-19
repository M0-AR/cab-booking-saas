from __future__ import annotations

import json
import uuid

from sqlalchemy import text

from app.core.tenancy import set_rls_context
from app.db.session import SessionLocal
from tests.conftest import auth_header, signup_tenant, uniq


async def _patch_features(tenant_id: str, **features) -> None:
    async with SessionLocal() as session:
        await set_rls_context(session, uuid.UUID(tenant_id), None)
        await session.execute(
            text(
                "UPDATE tenant_settings "
                "SET features = features || cast(:patch as jsonb) "
                "WHERE tenant_id = :t"
            ),
            {"patch": json.dumps(features), "t": tenant_id},
        )
        await session.commit()


async def test_cab_quota_is_enforced_server_side(client):
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)
    tenant_id = tokens["tenant"]["id"]

    await _patch_features(tenant_id, max_cabs=2)

    for i in range(2):
        response = await client.post(
            "/api/v1/cabs",
            json={"model": "Compact", "plate": uniq("QC").upper()},
            headers=headers,
        )
        assert response.status_code == 201, response.text

    third = await client.post(
        "/api/v1/cabs",
        json={"model": "One Too Many", "plate": uniq("QC").upper()},
        headers=headers,
    )
    assert third.status_code == 403
    assert third.json()["detail"]["code"] == "quota_exceeded"


async def test_user_quota_is_enforced_server_side(client):
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)

    await _patch_features(tokens["tenant"]["id"], max_users=1)

    response = await client.post(
        "/api/v1/users",
        json={
            "email": f"extra@{tokens['tenant']['slug']}.io",
            "password": "password123",
            "full_name": "Extra Person",
            "role": "viewer",
        },
        headers=headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "quota_exceeded"


async def test_reports_feature_flag(client):
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)
    tenant_id = tokens["tenant"]["id"]

    await _patch_features(tenant_id, reports=False)
    disabled = await client.get("/api/v1/reports/summary", headers=headers)
    assert disabled.status_code == 403
    assert disabled.json()["detail"]["code"] == "feature_disabled"

    # Book + complete a trip, then enable reports and verify the math.
    customer = (
        await client.post(
            "/api/v1/customers",
            json={"name": "Alice Rider", "phone": "555-0100"},
            headers=headers,
        )
    ).json()
    driver = (
        await client.post(
            "/api/v1/drivers",
            json={"name": "Dan Driver", "phone": "555-0101"},
            headers=headers,
        )
    ).json()
    booking = (
        await client.post(
            "/api/v1/bookings",
            json={
                "customer_id": customer["id"],
                "pickup": "1 Main St",
                "dropoff": "Airport",
                "scheduled_at": "2026-10-18T10:00:00Z",
            },
            headers=headers,
        )
    ).json()
    await client.post(
        f"/api/v1/bookings/{booking['id']}/assign",
        json={"driver_id": driver["id"]},
        headers=headers,
    )
    await client.post(
        f"/api/v1/bookings/{booking['id']}/complete",
        json={"fare": "25.50"},
        headers=headers,
    )

    await _patch_features(tenant_id, reports=True)
    enabled = await client.get("/api/v1/reports/summary", headers=headers)
    assert enabled.status_code == 200, enabled.text
    summary = enabled.json()
    assert summary["total_bookings"] == 1
    assert summary["by_status"]["completed"] == 1
    assert float(summary["revenue"]) == 25.50
    assert summary["top_drivers"][0]["name"] == "Dan Driver"


async def test_custom_domain_requires_entitlement(client):
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)

    response = await client.patch(
        "/api/v1/settings",
        json={"custom_domain": "bookings.example.com"},
        headers=headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "feature_disabled"


async def test_settings_update_and_public_branding(client):
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)
    slug = tokens["tenant"]["slug"]

    updated = await client.patch(
        "/api/v1/settings",
        json={
            "brand": {
                "display_name": "Acme Cabs",
                "primary_color": "#0f766e",
                "accent_color": "#F59E0B",
            },
            "currency": "EUR",
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    brand = updated.json()["brand"]
    assert brand["primary_color"] == "#0f766e"
    assert brand["accent_color"] == "#f59e0b"

    invalid = await client.patch(
        "/api/v1/settings",
        json={"brand": {"primary_color": "javascript:alert(1)"}},
        headers=headers,
    )
    assert invalid.status_code == 422

    public = await client.get(f"/api/v1/public/branding?slug={slug}")
    assert public.status_code == 200
    body = public.json()
    assert body["display_name"] == "Acme Cabs"
    assert body["primary_color"] == "#0f766e"
    assert body["currency"] == "EUR"
