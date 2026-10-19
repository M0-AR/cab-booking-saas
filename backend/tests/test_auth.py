from __future__ import annotations

from tests.conftest import auth_header, signup_tenant, uniq


async def test_signup_creates_tenant_owner_and_tokens(client):
    data = await signup_tenant(client)
    assert data["user"]["role"] == "owner"
    assert data["token_type"] == "bearer"

    me = await client.get("/api/v1/auth/me", headers=auth_header(data))
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == data["user"]["email"]
    assert body["tenant"]["slug"] == data["tenant"]["slug"]


async def test_signup_duplicate_slug_conflicts(client):
    slug = uniq()
    await signup_tenant(client, slug=slug)
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "tenant_name": "Copycat Cab Co",
            "slug": slug,
            "email": f"other@{slug}.io",
            "password": "password123",
            "full_name": "Other Person",
        },
    )
    assert response.status_code == 409


async def test_login_wrong_password_and_unknown_tenant(client):
    data = await signup_tenant(client)
    bad = await client.post(
        "/api/v1/auth/login",
        json={
            "email": data["user"]["email"],
            "password": "wrong-password",
            "tenant_slug": data["tenant"]["slug"],
        },
    )
    assert bad.status_code == 401

    unknown = await client.post(
        "/api/v1/auth/login",
        json={
            "email": data["user"]["email"],
            "password": "password123",
            "tenant_slug": uniq("nope"),
        },
    )
    assert unknown.status_code == 401


async def test_login_is_tenant_scoped(client):
    acme = await signup_tenant(client)
    globex = await signup_tenant(client)

    stolen = await client.post(
        "/api/v1/auth/login",
        json={
            "email": acme["user"]["email"],
            "password": "password123",
            "tenant_slug": globex["tenant"]["slug"],
        },
    )
    assert stolen.status_code == 401

    ok = await client.post(
        "/api/v1/auth/login",
        json={
            "email": acme["user"]["email"],
            "password": "password123",
            "tenant_slug": acme["tenant"]["slug"],
        },
    )
    assert ok.status_code == 200


async def test_refresh_rotation_and_reuse_detection(client):
    data = await signup_tenant(client)
    first_refresh = data["refresh_token"]

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert rotated.status_code == 200, rotated.text
    second = rotated.json()
    assert second["refresh_token"] != first_refresh

    me = await client.get("/api/v1/auth/me", headers=auth_header(second))
    assert me.status_code == 200

    reuse = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_refresh}
    )
    assert reuse.status_code == 401

    family_revoked = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]}
    )
    assert family_revoked.status_code == 401


async def test_logout_revokes_refresh_token(client):
    data = await signup_tenant(client)
    response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": data["refresh_token"]}
    )
    assert response.status_code == 204

    after = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]}
    )
    assert after.status_code == 401
