from __future__ import annotations

from tests.conftest import auth_header, signup_tenant, uniq


async def _fleet(client) -> tuple[dict, dict, dict, dict]:
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
    return tokens, headers, customer, driver | {"cab": cab}


async def _get_driver(client, headers, driver_id):
    res = await client.get("/api/v1/drivers", headers=headers)
    return next(d for d in res.json()["items"] if d["id"] == driver_id)


async def _get_cab(client, headers, cab_id):
    res = await client.get("/api/v1/cabs", headers=headers)
    return next(c for c in res.json()["items"] if c["id"] == cab_id)


async def test_booking_lifecycle_assign_complete(client):
    tokens, headers, customer, driver = await _fleet(client)
    cab = driver["cab"]

    created = await client.post(
        "/api/v1/bookings",
        json={
            "customer_id": customer["id"],
            "pickup": "1 Main St",
            "dropoff": "Airport",
            "scheduled_at": "2026-10-18T10:00:00Z",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    assert booking["status"] == "pending"

    assigned = await client.post(
        f"/api/v1/bookings/{booking['id']}/assign",
        json={"driver_id": driver["id"], "cab_id": cab["id"]},
        headers=headers,
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["status"] == "assigned"

    assert (await _get_driver(client, headers, driver["id"]))["status"] == "on_trip"
    assert (await _get_cab(client, headers, cab["id"]))["status"] == "busy"

    completed = await client.post(
        f"/api/v1/bookings/{booking['id']}/complete",
        json={"fare": "42.75"},
        headers=headers,
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"
    assert float(completed.json()["fare"]) == 42.75

    assert (await _get_driver(client, headers, driver["id"]))["status"] == "active"
    assert (await _get_cab(client, headers, cab["id"]))["status"] == "available"


async def test_booking_cancel_frees_resources(client):
    tokens, headers, customer, driver = await _fleet(client)
    cab = driver["cab"]

    booking = (
        await client.post(
            "/api/v1/bookings",
            json={
                "customer_id": customer["id"],
                "pickup": "2 Oak Ave",
                "dropoff": "Station",
                "scheduled_at": "2026-10-19T08:00:00Z",
            },
            headers=headers,
        )
    ).json()

    await client.post(
        f"/api/v1/bookings/{booking['id']}/assign",
        json={"driver_id": driver["id"], "cab_id": cab["id"]},
        headers=headers,
    )
    cancelled = await client.post(
        f"/api/v1/bookings/{booking['id']}/cancel", headers=headers
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert (await _get_driver(client, headers, driver["id"]))["status"] == "active"
    assert (await _get_cab(client, headers, cab["id"]))["status"] == "available"


async def test_invalid_transitions_conflict(client):
    tokens, headers, customer, driver = await _fleet(client)
    booking = (
        await client.post(
            "/api/v1/bookings",
            json={
                "customer_id": customer["id"],
                "pickup": "3 Elm St",
                "dropoff": "Mall",
                "scheduled_at": "2026-10-20T09:00:00Z",
            },
            headers=headers,
        )
    ).json()

    # complete before assign
    early = await client.post(
        f"/api/v1/bookings/{booking['id']}/complete",
        json={"fare": "10.00"},
        headers=headers,
    )
    assert early.status_code == 409


async def test_viewer_role_cannot_write(client):
    tokens, headers, customer, driver = await _fleet(client)
    slug = tokens["tenant"]["slug"]

    created_user = await client.post(
        "/api/v1/users",
        json={
            "email": f"viewer@{slug}.io",
            "password": "password123",
            "full_name": "Vera Viewer",
            "role": "viewer",
        },
        headers=headers,
    )
    assert created_user.status_code == 201, created_user.text

    login = await client.post(
        "/api/v1/auth/login",
        json={
            "email": f"viewer@{slug}.io",
            "password": "password123",
            "tenant_slug": slug,
        },
    )
    assert login.status_code == 200
    viewer_headers = auth_header(login.json())

    assert (
        await client.get("/api/v1/bookings", headers=viewer_headers)
    ).status_code == 200

    forbidden = await client.post(
        "/api/v1/bookings",
        json={
            "customer_id": customer["id"],
            "pickup": "X",
            "dropoff": "Y",
            "scheduled_at": "2026-10-21T09:00:00Z",
        },
        headers=viewer_headers,
    )
    assert forbidden.status_code == 403
