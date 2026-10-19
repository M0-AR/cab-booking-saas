"""Seed the demo tenants with a rich, realistic dataset.

Usage (inside the backend container or venv, with DATABASE_URL pointing at the
database the app uses):

    python -m scripts.seed_demo            # create the demo tenants if missing
    python -m scripts.seed_demo --reset    # delete them first, then reseed

Two tenants are provisioned:

* ``demo-cabs`` — the flagship "pro" workspace used for demos, screenshots and
  end-to-end tests: 5 users (one per role), a 13-driver / 15-cab fleet with
  compliance edge cases (expired, expiring and missing documents), 27
  customers, ~230 bookings spread over 90 days so every reports preset has
  data, an attention queue with overdue trips, deletion-safe records and 12
  days of activity log entries.
* ``zenith-cabs`` — a "free" plan workspace used to exercise paywalls and plan
  quotas: reports / custom domain / API access disabled, fleet capped at
  5 cabs and 3 users, with a small isolated dataset.

All timestamps are relative to the moment the script runs so the demo never
goes stale, and generation is deterministic for a fixed clock (RNG seed 42).
"""

from __future__ import annotations

import argparse
import asyncio
import random
import re
import unicodedata
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.core.tenancy import set_rls_context
from app.models import (
    DEFAULT_FARE,
    AuditLog,
    Booking,
    BookingStatus,
    Cab,
    Customer,
    Driver,
    Tenant,
    TenantDomain,
    TenantSettings,
    User,
    UserRole,
)

DEMO_SLUG = "demo-cabs"
ZENITH_SLUG = "zenith-cabs"
ALL_SLUGS = [DEMO_SLUG, ZENITH_SLUG]

DEMO_PASSWORD = "DemoPass123!"
ZENITH_PASSWORD = "ZenithPass123!"

DEMO_USERS = [
    ("Demo Owner", f"owner@{DEMO_SLUG}.io", UserRole.owner),
    ("Nadia Farah", f"admin@{DEMO_SLUG}.io", UserRole.admin),
    ("Sami Khoury", f"manager@{DEMO_SLUG}.io", UserRole.manager),
    ("Elie Sarkis", f"viewer@{DEMO_SLUG}.io", UserRole.viewer),
    ("Karim Saleh", f"driver@{DEMO_SLUG}.io", UserRole.driver),
]

DEMO_BRAND = {
    "primary_color": "#0f766e",
    "accent_color": "#f59e0b",
    "display_name": "Demo Cabs",
    "logo_url": None,
}
DEMO_FEATURES = {
    "reports": True,
    "api_access": True,
    "custom_domain": True,
    "max_cabs": 50,
    "max_users": 10,
}
DEMO_DOMAIN = "demo.cabdesk.test"

# name, license expiry (days from today; None = not on file)
DEMO_DRIVERS = [
    ("Omar Haddad", -3),  # expired -> attention
    ("Lina Kassab", 6),  # expires this week -> attention
    ("Youssef Nasser", -20),  # expired -> attention
    ("Rana Aziz", 29),  # attention-window edge
    ("Karim Saleh", 14),  # fixture driver (kept across docs)
    ("Dana Rahal", 120),
    ("Wael Chahine", None),  # missing document
    ("Maya Saad", 240),
    ("Fadi Rahme", 180),
    ("Nadia Chalhoub", 365),
    ("Hassan Mroueh", None),  # missing document
    ("Rita Boulos", 90),
    ("Sami Rizk", None),  # inactive, zero bookings -> safe to delete
]

# model, plate, capacity, insurance expiry, registration expiry (day offsets)
DEMO_CABS = [
    ("Toyota Corolla 2022", "CAB-1000", 4, 6, 300),  # fixture: insurance soon
    ("Hyundai Elantra 2023", "CAB-1001", 4, -5, 120),  # insurance expired
    ("Kia Sportage 2021", "CAB-1002", 4, None, 12),  # registration soon
    ("Toyota Camry 2023", "CAB-1003", 4, None, None),  # nothing on file
    ("Nissan Sunny 2022", "CAB-1004", 4, 210, 240),
    ("Renault Megane 2021", "CAB-1005", 4, 150, None),
    ("Hyundai Tucson 2022", "CAB-1006", 4, None, 330),
    ("Toyota Prius 2023", "CAB-1007", 4, 400, 365),
    ("Kia Cerato 2022", "CAB-1008", 4, 75, 90),
    ("Mercedes E-Class 2021", "CAB-1009", 4, 30, 275),
    ("BMW 5 Series 2022", "CAB-1010", 4, 60, 45),
    ("Toyota Hiace 2021", "CAB-1011", 7, 180, 200),
    ("Peugeot 3008 2023", "CAB-1012", 4, 90, 150),
    ("Kia Sportage 2022", "CAB-1013", 4, 25, 2),  # both documents squeaky
    ("Hyundai Staria 2022", "CAB-9999", 6, None, None),  # spare -> deletable
]

DEMO_CUSTOMERS = [
    "Maya Khoury",
    "Ali Mansour",
    "Sara Ibrahim",
    "Hadi Fares",
    "Nour Sleiman",
    "Tarek Ghazal",
    "Rita Chami",
    "Jad Hamdan",
    "Rami Aoun",
    "Layla Nassif",
    "Georges Saliba",
    "Hala Turk",
    "José Álvarez",  # unicode + non-Lebanese phone
    "Zoë Bakker",
    "Amira Daoud",
    "Walid Sabbagh",
    "Dina Fakhoury",
    "Marc Eid",
    "Roula Hanna",
    "Fouad Chehab",
    "Lea Sassine",
    "Omar Itani",
    "Carla Bitar",
    "Nabil Zgheib",
    "Yara Habib",
    "Tanya Rizk",
    "Zainab Qassem",  # zero bookings -> safe to delete
]

ROUTES = [
    ("Downtown Terminal", "Airport Terminal 2"),
    ("Marina Mall", "City Hospital"),
    ("University Gate", "Central Station"),
    ("Hotel Meridian", "Old Souk"),
    ("Business Bay", "Seaside Promenade"),
    ("Grand Mosque", "National Museum"),
    ("Riverside Park", "Tech Campus"),
    ("Harbor Point", "Convention Center"),
    ("Cedar Avenue", "Sunset Boulevard"),
    ("Old Market", "Beirut Airport"),
    ("Mountain View Hotel", "Railway Station"),
    ("Lakeside Plaza", "Arts District"),
]

NOTES = [
    "Extra stop: pharmacy, then hotel.",  # comma -> CSV quoting
    'Guest said "call on arrival".',  # quotes -> CSV quoting
    "Child seat requested",
    "Airport pickup — meet at arrivals gate 3",
    "== VIP transfer ==",  # leading "=" -> CSV formula sanitizer
    "Wheelchair accessible needed",
    "Oversized luggage",
    "Pay by card on arrival",
]

# status, offset minutes from now, fare, (driver, cab) pair index or None
DEMO_OPEN_BOOKINGS = [
    (BookingStatus.pending, -180, "22.50", None),  # overdue 3h -> attention
    (BookingStatus.pending, -300, None, None),  # overdue 5h -> attention
    (BookingStatus.pending, 45, "18.00", None),
    (BookingStatus.pending, 190, "26.00", None),
    (BookingStatus.pending, 1560, None, None),
    (BookingStatus.pending, 4440, "14.75", None),
    (BookingStatus.assigned, -75, "31.00", 0),  # overdue 1h15 -> attention
    (BookingStatus.assigned, 25, "12.50", 1),
    (BookingStatus.assigned, 70, "27.25", 2),
    (BookingStatus.assigned, 150, "9.00", 3),
]

ZENITH_USERS = [
    ("Zara Mansour", f"zara@{ZENITH_SLUG}.io", UserRole.owner),
    ("Vince Karam", f"viewer@{ZENITH_SLUG}.io", UserRole.viewer),
]
ZENITH_BRAND = {
    "primary_color": "#1d4ed8",
    "accent_color": "#f97316",
    "display_name": "Zenith Rides",
    "logo_url": None,
}
ZENITH_FEATURES = {
    "reports": False,
    "api_access": False,
    "custom_domain": False,
    "max_cabs": 5,
    "max_users": 3,
}
ZENITH_FARE = {"base": 3.0, "per_km": 1.5, "per_min": 0.35, "currency": "EUR"}
ZENITH_DRIVERS = [
    ("Pierre Lambert", -1),  # expired -> attention even on the free plan
    ("Aya Karim", 5),
    ("Jean Aziz", 60),
    ("Mona Fares", None),
]
ZENITH_CABS = [
    ("Tesla Model 3 2023", "ZEN-100", 4, 5, 200),
    ("Skoda Octavia 2022", "ZEN-200", 4, None, 30),
    ("Renault Clio 2021", "ZEN-300", 4, 150, None),
    ("Mercedes Vito 2022", "ZEN-400", 7, 90, 300),
]
ZENITH_CUSTOMERS = [
    "Chloe Martin",
    "Lucas Bernard",
    "Emma Dubois",
    "Hugo Laurent",
    "Inès Moreau",
]

# action, relative weight for the activity feed
DEMO_AUDIT_ACTIONS = [
    ("booking.created", 20),
    ("booking.assigned", 8),
    ("booking.completed", 12),
    ("booking.cancelled", 4),
    ("driver.created", 5),
    ("driver.updated", 4),
    ("driver.deleted", 2),
    ("cab.created", 4),
    ("cab.updated", 4),
    ("cab.deleted", 2),
    ("customer.created", 6),
    ("customer.updated", 4),
    ("customer.deleted", 2),
    ("user.created", 2),
    ("user.updated", 2),
    ("settings.updated", 5),
    ("tenant.created", 1),
    ("auth.login", 9),
    ("auth.logout", 4),
]

# weekday (Mon=0) -> base number of completed trips that day
WEEKDAY_BOOKINGS = {0: 2, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3}
HISTORY_DAYS = 90


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed the demo tenants.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete the existing demo tenants (cascades) before seeding.",
    )
    return parser.parse_args()


def _phone(rng: random.Random, i: int) -> str:
    return f"+961 71 {100 + i:03d} {rng.randint(100, 999)}"


def _customer_phone(rng: random.Random, i: int) -> str:
    if i == 12:  # José Álvarez — country code prefixes the "+" sanitizer case
        return "+34 600 123 456"
    style = i % 4
    if style == 0:
        return f"+961 3 {rng.randint(100, 999)} {rng.randint(100, 999)}"
    if style == 1:
        return f"+961 71 {100 + i:03d} {rng.randint(100, 999)}"
    if style == 2:
        return f"03 {rng.randint(100, 999)} {rng.randint(100, 999)}"
    return f"01-{rng.randint(200, 999)}{rng.randint(1000, 9999)}"


def _slugify(name: str) -> str:
    folded = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"[^a-z0-9]+", ".", folded.lower()).strip(".")


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time(0, 0), tzinfo=timezone.utc)


def _action_payload(
    rng: random.Random,
    action: str,
    users: list[User],
    drivers: list[Driver],
    cabs: list[Cab],
    customers: list[Customer],
    bookings: list[Booking],
) -> tuple[str, str | None, dict]:
    """Build (entity, entity_id, meta) for one audit action."""
    if action.startswith("booking."):
        booking = rng.choice(bookings)
        meta: dict = {
            "name": next(
                c.name for c in customers if c.id == booking.customer_id
            ),
            "pickup": booking.pickup,
            "dropoff": booking.dropoff,
        }
        if action == "booking.assigned" and booking.driver_id is not None:
            meta["driver"] = next(
                d.name for d in drivers if d.id == booking.driver_id
            )
            if booking.cab_id is not None:
                meta["plate"] = next(c.plate for c in cabs if c.id == booking.cab_id)
        if action == "booking.completed":
            meta["fare"] = str(booking.fare) if booking.fare is not None else "—"
        return "booking", str(booking.id), meta
    if action.startswith("driver."):
        driver = rng.choice(drivers)
        return "driver", str(driver.id), {"name": driver.name, "phone": driver.phone}
    if action.startswith("cab."):
        cab = rng.choice(cabs)
        return "cab", str(cab.id), {"plate": cab.plate, "model": cab.model}
    if action.startswith("customer."):
        customer = rng.choice(customers)
        return (
            "customer",
            str(customer.id),
            {"name": customer.name, "phone": customer.phone},
        )
    if action.startswith("user."):
        user = rng.choice(users)
        return (
            "user",
            str(user.id),
            {"name": user.full_name, "email": user.email, "role": user.role.value},
        )
    if action == "settings.updated":
        return "settings", None, {"currency": "USD", "timezone": "UTC"}
    if action == "tenant.created":
        return "tenant", None, {"display_name": "Demo Cabs", "slug": DEMO_SLUG}
    user = rng.choice(users)  # auth.login / auth.logout and other fallbacks
    return "user", str(user.id), {"name": user.full_name}


def _demo_audit_rows(
    rng: random.Random,
    now: datetime,
    tenant_id,
    users: list[User],
    drivers: list[Driver],
    cabs: list[Cab],
    customers: list[Customer],
    bookings: list[Booking],
) -> list[AuditLog]:
    """~100 entries over 12 days: Today/Yesterday groups, older pages, live names."""
    per_day = [9, 14] + [rng.randint(6, 9) for _ in range(10)]
    actions = [a for a, _ in DEMO_AUDIT_ACTIONS]
    weights = [w for _, w in DEMO_AUDIT_ACTIONS]
    actors = [users[0], users[1], users[2]]
    rows: list[AuditLog] = []
    for day_offset, count in enumerate(per_day):
        day = now.date() - timedelta(days=day_offset)
        for _ in range(count):
            if day_offset == 0:
                created = now - timedelta(minutes=rng.randint(5, 600))
            else:
                created = _day_start(day) + timedelta(
                    hours=rng.randint(7, 21), minutes=rng.randint(0, 59)
                )
            action = rng.choices(actions, weights=weights, k=1)[0]
            entity, entity_id, meta = _action_payload(
                rng, action, users, drivers, cabs, customers, bookings
            )
            actor = None if rng.random() < 0.12 else rng.choice(actors)
            rows.append(
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=actor.id if actor else None,
                    action=action,
                    entity=entity,
                    entity_id=entity_id,
                    meta=meta,
                    created_at=created,
                )
            )
    return rows


async def _seed_demo(session_factory, rng: random.Random, now: datetime) -> dict:
    today = now.date()

    async with session_factory() as session:
        async with session.begin():
            tenant = Tenant(slug=DEMO_SLUG, name="Demo Cabs", plan="pro")
            session.add(tenant)
            await session.flush()

            # Tenant exists: arm the RLS context for all following writes.
            await set_rls_context(session, tenant.id, None)

            session.add(
                TenantSettings(
                    tenant_id=tenant.id,
                    currency="USD",
                    timezone="UTC",
                    brand=dict(DEMO_BRAND),
                    features=dict(DEMO_FEATURES),
                    fare=dict(DEFAULT_FARE),
                )
            )
            session.add(
                TenantDomain(domain=DEMO_DOMAIN, tenant_id=tenant.id)
            )

            users: list[User] = []
            for full_name, email, role in DEMO_USERS:
                user = User(
                    tenant_id=tenant.id,
                    email=email,
                    password_hash=hash_password(DEMO_PASSWORD),
                    full_name=full_name,
                    role=role,
                )
                session.add(user)
                users.append(user)
            await session.flush()

            drivers: list[Driver] = []
            for i, (name, expiry_offset) in enumerate(DEMO_DRIVERS):
                driver = Driver(
                    tenant_id=tenant.id,
                    name=name,
                    phone=_phone(rng, i),
                    license_no=f"DL-{410000 + i * 137}",
                    license_expiry=(
                        None
                        if expiry_offset is None
                        else today + timedelta(days=expiry_offset)
                    ),
                    status="active",
                )
                session.add(driver)
                drivers.append(driver)

            customers: list[Customer] = []
            for i, name in enumerate(DEMO_CUSTOMERS):
                customer = Customer(
                    tenant_id=tenant.id,
                    name=name,
                    phone=_customer_phone(rng, i),
                    email=(
                        None
                        if i % 6 == 4
                        else f"{_slugify(name)}@example.com"
                    ),
                )
                session.add(customer)
                customers.append(customer)

            await session.flush()

            cabs: list[Cab] = []
            for i, (model, plate, capacity, ins_offset, reg_offset) in enumerate(
                DEMO_CABS
            ):
                cab = Cab(
                    tenant_id=tenant.id,
                    model=model,
                    plate=plate,
                    capacity=capacity,
                    status="available",
                    driver_id=drivers[i].id if i < 12 else None,
                    insurance_expiry=(
                        None
                        if ins_offset is None
                        else today + timedelta(days=ins_offset)
                    ),
                    registration_expiry=(
                        None
                        if reg_offset is None
                        else today + timedelta(days=reg_offset)
                    ),
                )
                session.add(cab)
                cabs.append(cab)

            await session.flush()

            # Bookings: ~90 days of history so the 7/30/90-day report presets
            # each tell a different story, plus the live queue below.
            bookings: list[Booking] = []
            creators = [users[0], users[1], users[2]]

            def add_history_booking(day_offset: int, day: date) -> None:
                customer = customers[rng.randrange(len(customers) - 1)]
                pickup, dropoff = ROUTES[rng.randrange(len(ROUTES))]
                if day_offset == 0:
                    created = now - timedelta(minutes=rng.randint(90, 480))
                    scheduled = min(
                        created + timedelta(minutes=rng.randint(25, 180)),
                        now - timedelta(minutes=12),
                    )
                else:
                    created = _day_start(day) + timedelta(
                        hours=rng.randint(6, 21), minutes=rng.randint(0, 59)
                    )
                    lead = rng.choice(
                        [rng.randint(25, 120), rng.randint(120, 1440)]
                    )
                    scheduled = created + timedelta(minutes=lead)
                    if day_offset <= 1:  # never schedule a finished trip ahead
                        scheduled = min(scheduled, now - timedelta(minutes=12))
                fare = Decimal(f"{rng.uniform(6.0, 85.0):.2f}")
                if len(bookings) % 37 == 11:  # a few completed trips lost their fare
                    fare = None
                notes = None
                if rng.random() < 0.18:
                    notes = NOTES[rng.randrange(len(NOTES))]
                idx = rng.randrange(12)  # active drivers only
                booking = Booking(
                    tenant_id=tenant.id,
                    created_by=rng.choice(creators).id,
                    customer_id=customer.id,
                    driver_id=drivers[idx].id,
                    cab_id=cabs[idx].id,
                    pickup=pickup,
                    dropoff=dropoff,
                    scheduled_at=scheduled,
                    status=BookingStatus.completed,
                    fare=fare,
                    notes=notes,
                    created_at=created,
                )
                session.add(booking)
                bookings.append(booking)

            def add_cancelled_booking(day_offset: int, day: date) -> None:
                if day_offset == 0:
                    created = now - timedelta(minutes=rng.randint(60, 420))
                    scheduled = min(
                        created + timedelta(minutes=rng.randint(20, 180)),
                        now - timedelta(minutes=10),
                    )
                else:
                    created = _day_start(day) + timedelta(
                        hours=rng.randint(6, 21), minutes=rng.randint(0, 59)
                    )
                    scheduled = created + timedelta(
                        minutes=rng.randint(25, 1440)
                    )
                    if day_offset <= 1:  # never schedule a finished trip ahead
                        scheduled = min(scheduled, now - timedelta(minutes=10))
                customer = customers[rng.randrange(len(customers) - 1)]
                pickup, dropoff = ROUTES[rng.randrange(len(ROUTES))]
                booking = Booking(
                    tenant_id=tenant.id,
                    created_by=rng.choice(creators).id,
                    customer_id=customer.id,
                    pickup=pickup,
                    dropoff=dropoff,
                    scheduled_at=scheduled,
                    status=BookingStatus.cancelled,
                    fare=None,
                    notes=None,
                    created_at=created,
                )
                session.add(booking)
                bookings.append(booking)

            for day_offset in range(HISTORY_DAYS - 1, -1, -1):
                day = today - timedelta(days=day_offset)
                count = WEEKDAY_BOOKINGS[day.weekday()] + rng.choice(
                    [-1, 0, 0, 0, 1]
                )
                if day_offset < 7:
                    count = max(count, 2)  # keep the 7-day report populated
                if day_offset == 0:
                    count = max(count, 4)
                for _ in range(max(0, count)):
                    add_history_booking(day_offset, day)
                if (
                    day_offset == 0
                    or (day.weekday() in (5, 6) and rng.random() < 0.22)
                    or rng.random() < 0.07
                ):
                    add_cancelled_booking(day_offset, day)

            # Live queue: overdue + upcoming pending trips, then assigned trips
            # whose drivers are on duty (pairs 0-3 get on_trip/busy below).
            for status, offset_min, fare, pair in DEMO_OPEN_BOOKINGS:
                customer = customers[rng.randrange(len(customers) - 1)]
                pickup, dropoff = ROUTES[rng.randrange(len(ROUTES))]
                driver = cab = None
                if pair is not None:
                    driver, cab = drivers[pair], cabs[pair]
                booking = Booking(
                    tenant_id=tenant.id,
                    created_by=rng.choice(creators).id,
                    customer_id=customer.id,
                    driver_id=driver.id if driver else None,
                    cab_id=cab.id if cab else None,
                    pickup=pickup,
                    dropoff=dropoff,
                    scheduled_at=now + timedelta(minutes=offset_min),
                    status=status,
                    fare=Decimal(fare) if fare else None,
                    notes="Customer asked for a quiet driver"
                    if pair == 1
                    else None,
                    created_at=now - timedelta(hours=rng.randint(2, 30)),
                )
                session.add(booking)
                bookings.append(booking)

            await session.flush()

            # Fleet state: keep it coherent with the queue above, flag the
            # inactive driver and the two workshop cabs.
            for i, driver in enumerate(drivers):
                driver.status = "inactive" if i == 12 else "active"
            for i, cab in enumerate(cabs):
                cab.status = "available"
            for pair in range(4):
                drivers[pair].status = "on_trip"
                cabs[pair].status = "busy"
            cabs[13].status = "maintenance"  # CAB-1013 — inspection due
            cabs[14].status = "maintenance"  # CAB-9999 — spare in the workshop

            audit_rows = _demo_audit_rows(
                rng, now, tenant.id, users, drivers, cabs, customers, bookings
            )
            session.add_all(audit_rows)

    return {
        "users": len(users),
        "drivers": len(drivers),
        "cabs": len(cabs),
        "customers": len(customers),
        "bookings": len(bookings),
        "audit": len(audit_rows),
        "overdue": sum(
            1
            for b in bookings
            if b.status in (BookingStatus.pending, BookingStatus.assigned)
            and b.scheduled_at < now - timedelta(minutes=30)
        ),
    }


async def _seed_zenith(session_factory, rng: random.Random, now: datetime) -> dict:
    today = now.date()

    async with session_factory() as session:
        async with session.begin():
            tenant = Tenant(slug=ZENITH_SLUG, name="Zenith Cabs", plan="free")
            session.add(tenant)
            await session.flush()

            await set_rls_context(session, tenant.id, None)

            session.add(
                TenantSettings(
                    tenant_id=tenant.id,
                    currency="EUR",
                    timezone="Europe/Paris",
                    brand=dict(ZENITH_BRAND),
                    features=dict(ZENITH_FEATURES),
                    fare=dict(ZENITH_FARE),
                )
            )

            users: list[User] = []
            for full_name, email, role in ZENITH_USERS:
                user = User(
                    tenant_id=tenant.id,
                    email=email,
                    password_hash=hash_password(ZENITH_PASSWORD),
                    full_name=full_name,
                    role=role,
                )
                session.add(user)
                users.append(user)
            await session.flush()

            drivers: list[Driver] = []
            for i, (name, expiry_offset) in enumerate(ZENITH_DRIVERS):
                driver = Driver(
                    tenant_id=tenant.id,
                    name=name,
                    phone=_phone(rng, 40 + i),
                    license_no=f"FR-{220000 + i * 311}",
                    license_expiry=(
                        None
                        if expiry_offset is None
                        else today + timedelta(days=expiry_offset)
                    ),
                    status="active",
                )
                session.add(driver)
                drivers.append(driver)

            customers: list[Customer] = []
            for i, name in enumerate(ZENITH_CUSTOMERS):
                customer = Customer(
                    tenant_id=tenant.id,
                    name=name,
                    phone=f"+33 6 {rng.randint(10, 99)} {rng.randint(10, 99)} "
                    f"{rng.randint(10, 99)} {rng.randint(10, 99)}",
                    email=f"{_slugify(name)}@example.fr",
                )
                session.add(customer)
                customers.append(customer)

            await session.flush()

            cabs: list[Cab] = []
            for i, (model, plate, capacity, ins_offset, reg_offset) in enumerate(
                ZENITH_CABS
            ):
                cab = Cab(
                    tenant_id=tenant.id,
                    model=model,
                    plate=plate,
                    capacity=capacity,
                    status="available",
                    driver_id=drivers[i].id,
                    insurance_expiry=(
                        None
                        if ins_offset is None
                        else today + timedelta(days=ins_offset)
                    ),
                    registration_expiry=(
                        None
                        if reg_offset is None
                        else today + timedelta(days=reg_offset)
                    ),
                )
                session.add(cab)
                cabs.append(cab)

            await session.flush()

            bookings: list[Booking] = []
            for i in range(9):
                day = today - timedelta(days=rng.randint(2, 21))
                created = _day_start(day) + timedelta(
                    hours=rng.randint(7, 20), minutes=rng.randint(0, 59)
                )
                idx = i % 4
                booking = Booking(
                    tenant_id=tenant.id,
                    created_by=users[0].id if i % 2 == 0 else None,
                    customer_id=customers[rng.randrange(len(customers))].id,
                    driver_id=drivers[idx].id,
                    cab_id=cabs[idx].id,
                    pickup="Paris Center" if i % 2 == 0 else "Orly Airport",
                    dropoff="Orly Airport" if i % 2 == 0 else "Paris Center",
                    scheduled_at=created + timedelta(minutes=rng.randint(25, 720)),
                    status=BookingStatus.completed,
                    fare=Decimal(f"{rng.uniform(9.0, 42.0):.2f}"),
                    notes=None,
                    created_at=created,
                )
                session.add(booking)
                bookings.append(booking)

            for i in range(2):
                day = today - timedelta(days=rng.randint(2, 18))
                created = _day_start(day) + timedelta(
                    hours=rng.randint(7, 20), minutes=rng.randint(0, 59)
                )
                booking = Booking(
                    tenant_id=tenant.id,
                    created_by=users[0].id,
                    customer_id=customers[rng.randrange(len(customers))].id,
                    pickup="Gare du Nord",
                    dropoff="La Défense",
                    scheduled_at=created + timedelta(minutes=rng.randint(25, 600)),
                    status=BookingStatus.cancelled,
                    fare=None,
                    notes=None,
                    created_at=created,
                )
                session.add(booking)
                bookings.append(booking)

            pending = Booking(
                tenant_id=tenant.id,
                created_by=users[0].id,
                customer_id=customers[0].id,
                pickup="Charles de Gaulle",
                dropoff="Montmartre",
                scheduled_at=now + timedelta(hours=30),
                status=BookingStatus.pending,
                fare=None,
                notes=None,
                created_at=now - timedelta(hours=6),
            )
            session.add(pending)
            bookings.append(pending)

            assigned = Booking(
                tenant_id=tenant.id,
                created_by=users[0].id,
                customer_id=customers[1].id,
                driver_id=drivers[0].id,
                cab_id=cabs[0].id,
                pickup="Eiffel Tower",
                dropoff="Versailles",
                scheduled_at=now + timedelta(minutes=40),
                status=BookingStatus.assigned,
                fare=Decimal("15.90"),
                notes=None,
                created_at=now - timedelta(hours=3),
            )
            session.add(assigned)
            bookings.append(assigned)

            await session.flush()

            drivers[0].status = "on_trip"
            cabs[0].status = "busy"

            session.add_all(
                [
                    AuditLog(
                        tenant_id=tenant.id,
                        user_id=users[0].id,
                        action="tenant.created",
                        entity="tenant",
                        entity_id=None,
                        meta={"display_name": "Zenith Rides", "slug": ZENITH_SLUG},
                        created_at=now - timedelta(days=2),
                    ),
                    AuditLog(
                        tenant_id=tenant.id,
                        user_id=users[0].id,
                        action="user.created",
                        entity="user",
                        entity_id=str(users[1].id),
                        meta={
                            "name": users[1].full_name,
                            "email": users[1].email,
                            "role": "viewer",
                        },
                        created_at=now - timedelta(days=2) + timedelta(minutes=30),
                    ),
                    AuditLog(
                        tenant_id=tenant.id,
                        user_id=users[0].id,
                        action="booking.created",
                        entity="booking",
                        entity_id=str(assigned.id),
                        meta={
                            "name": customers[1].name,
                            "pickup": assigned.pickup,
                            "dropoff": assigned.dropoff,
                        },
                        created_at=now - timedelta(hours=3),
                    ),
                    AuditLog(
                        tenant_id=tenant.id,
                        user_id=None,
                        action="auth.login",
                        entity="user",
                        entity_id=str(users[0].id),
                        meta={"name": users[0].full_name},
                        created_at=now - timedelta(hours=2),
                    ),
                ]
            )

    return {
        "users": len(users),
        "drivers": len(drivers),
        "cabs": len(cabs),
        "customers": len(customers),
        "bookings": len(bookings),
        "audit": 4,
    }


async def seed(reset: bool = False) -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    rng = random.Random(42)
    now = datetime.now(timezone.utc)

    async with session_factory() as session:
        async with session.begin():
            existing = set(
                (
                    await session.execute(
                        select(Tenant.slug).where(Tenant.slug.in_(ALL_SLUGS))
                    )
                ).scalars()
            )
            if existing and not reset:
                print(
                    "Tenants already present: "
                    f"{', '.join(sorted(existing))}. Pass --reset to reseed."
                )
                await engine.dispose()
                return
            if existing:
                # One statement: DB-level FK cascades (bypassing RLS) remove
                # settings, users, fleet, bookings, domains and audit logs.
                await session.execute(
                    delete(Tenant).where(Tenant.slug.in_(sorted(existing)))
                )
                print(f"Deleted existing tenant(s): {', '.join(sorted(existing))} (--reset).")

    demo = await _seed_demo(session_factory, rng, now)
    zenith = await _seed_zenith(session_factory, rng, now)
    await engine.dispose()

    print(f"Seeded tenant '{DEMO_SLUG}' (Demo Cabs, pro)")
    print(f"  owner login   owner@{DEMO_SLUG}.io / {DEMO_PASSWORD}")
    print(f"  team logins   admin@ / manager@ / viewer@ / driver@{DEMO_SLUG}.io (same password)")
    print(
        f"  data          {demo['drivers']} drivers · {demo['cabs']} cabs · "
        f"{demo['customers']} customers · {demo['bookings']} bookings · "
        f"{demo['audit']} activity rows"
    )
    print(
        f"  attention     {demo['overdue']} overdue bookings · 10 expiring "
        "documents (dashboard)"
    )
    print("  bulk-delete   cab 'CAB-9999' · driver 'Sami Rizk' · customer 'Zainab Qassem'")
    print(f"  custom domain {DEMO_DOMAIN}")
    print(f"Seeded tenant '{ZENITH_SLUG}' (Zenith Rides, free)")
    print(f"  owner login   zara@{ZENITH_SLUG}.io / {ZENITH_PASSWORD}")
    print(
        f"  data          {zenith['drivers']} drivers · {zenith['cabs']} cabs · "
        f"{zenith['customers']} customers · {zenith['bookings']} bookings "
        "(reports paywalled; caps: 5 cabs / 3 users)"
    )
    print("Done. Log in at http://localhost:9080")


if __name__ == "__main__":
    args = _parse_args()
    asyncio.run(seed(reset=args.reset))
