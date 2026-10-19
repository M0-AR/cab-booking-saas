"""The core promises of the multi-tenant design, proven against a real
Postgres with RLS enabled and the app connecting as the non-owner app_user.

Every isolation guarantee in docs/ARCHITECTURE.md maps to a test here.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text

from app.core.security import create_access_token
from app.core.tenancy import set_rls_context
from app.db.session import SessionLocal
from tests.conftest import auth_header, signup_tenant, uniq


async def _setup_tenant(client) -> dict:
    tokens = await signup_tenant(client)
    headers = auth_header(tokens)
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
    cab = (
        await client.post(
            "/api/v1/cabs",
            json={
                "model": "Toyota Prius",
                "plate": uniq("PL").upper(),
                "driver_id": driver["id"],
            },
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
                "fare": "30.00",
            },
            headers=headers,
        )
    ).json()
    return {
        "tokens": tokens,
        "headers": headers,
        "customer": customer,
        "driver": driver,
        "cab": cab,
        "booking": booking,
    }


async def test_list_endpoints_are_tenant_scoped(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    cabs = (
        await client.get("/api/v1/cabs", headers=acme["headers"])
    ).json()
    plates = {c["plate"] for c in cabs["items"]}
    assert acme["cab"]["plate"] in plates
    assert globex["cab"]["plate"] not in plates

    customers = (
        await client.get("/api/v1/customers", headers=acme["headers"])
    ).json()
    ids = {c["id"] for c in customers["items"]}
    assert acme["customer"]["id"] in ids
    assert globex["customer"]["id"] not in ids


async def test_cross_tenant_read_is_404(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    response = await client.get(
        f"/api/v1/bookings/{globex['booking']['id']}", headers=acme["headers"]
    )
    assert response.status_code == 404

    cab_response = await client.delete(
        f"/api/v1/cabs/{globex['cab']['id']}", headers=acme["headers"]
    )
    assert cab_response.status_code == 404

    driver_response = await client.patch(
        f"/api/v1/drivers/{globex['driver']['id']}",
        json={"name": "Hijacked"},
        headers=acme["headers"],
    )
    assert driver_response.status_code == 404


async def test_cross_tenant_mutations_rejected(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    booking_with_foreign_customer = await client.post(
        "/api/v1/bookings",
        json={
            "customer_id": globex["customer"]["id"],
            "pickup": "1 Main St",
            "dropoff": "Airport",
            "scheduled_at": "2026-10-18T10:00:00Z",
        },
        headers=acme["headers"],
    )
    assert booking_with_foreign_customer.status_code == 404

    assign_with_foreign_driver = await client.post(
        f"/api/v1/bookings/{acme['booking']['id']}/assign",
        json={"driver_id": globex["driver"]["id"]},
        headers=acme["headers"],
    )
    assert assign_with_foreign_driver.status_code == 404


async def test_forged_jwt_tenant_crossing_is_rejected(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    # Valid signature, but the claims mix tenants: acme user + globex tenant.
    forged = create_access_token(
        user_id=uuid.UUID(acme["tokens"]["user"]["id"]),
        tenant_id=uuid.UUID(globex["tokens"]["tenant"]["id"]),
        role="owner",
        email=acme["tokens"]["user"]["email"],
    )
    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert response.status_code == 401


async def test_rls_fails_closed_without_context(client):
    await _setup_tenant(client)

    async with SessionLocal() as session:
        for table in ("users", "customers", "cabs", "bookings", "audit_logs"):
            count = await session.scalar(text(f"SELECT count(*) FROM {table}"))
            assert count == 0, f"{table} leaked rows without tenant context"


async def test_rls_scopes_to_context_tenant(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    acme_tenant = uuid.UUID(acme["tokens"]["tenant"]["id"])
    globex_customer = globex["customer"]["id"]

    async with SessionLocal() as session:
        await set_rls_context(session, acme_tenant, None)
        visible = await session.scalar(
            text("SELECT count(*) FROM customers WHERE id = :id"),
            {"id": globex_customer},
        )
        assert visible == 0

        own = await session.scalar(text("SELECT count(*) FROM customers"))
        assert own == 1


async def test_rls_blocks_cross_tenant_sql_insert(client):
    acme = await _setup_tenant(client)
    globex = await _setup_tenant(client)

    acme_tenant = uuid.UUID(acme["tokens"]["tenant"]["id"])
    globex_tenant = uuid.UUID(globex["tokens"]["tenant"]["id"])

    async with SessionLocal() as session:
        await set_rls_context(session, acme_tenant, None)
        try:
            await session.execute(
                text(
                    "INSERT INTO customers (tenant_id, name, phone) "
                    "VALUES (:t, 'Smuggler', '555-0000')"
                ),
                {"t": str(globex_tenant)},
            )
            await session.commit()
            raise AssertionError("cross-tenant insert was not blocked")
        except Exception as exc:
            assert "row-level security" in str(exc).lower()
