from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, require_role
from app.core.csv_export import csv_response
from app.db.session import get_db
from app.schemas.report import ReportSummary
from app.services.entitlements import feature_enabled
from app.services.reports import build_summary

router = APIRouter(prefix="/reports", tags=["reports"])

REPORT_ROLES = ("owner", "admin", "manager")


def _require_reports(auth: AuthContext) -> None:
    if not feature_enabled(auth.features, "reports"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "feature_disabled",
                "message": "Reports are not enabled on your plan.",
            },
        )


def _resolve_range(
    date_from: date | None, date_to: date | None
) -> tuple[datetime, datetime, date, date]:
    today = datetime.now(timezone.utc).date()
    start_day = date_from or (today - timedelta(days=29))
    end_day = date_to or today
    if end_day < start_day:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_to must be on or after date_from",
        )
    start_dt = datetime.combine(start_day, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_day, time.max, tzinfo=timezone.utc)
    return start_dt, end_dt, start_day, end_day


@router.get("/summary", response_model=ReportSummary)
async def summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    auth: AuthContext = Depends(require_role(*REPORT_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    _require_reports(auth)
    start_dt, end_dt, _, _ = _resolve_range(date_from, date_to)
    return await build_summary(session, date_from=start_dt, date_to=end_dt)


@router.get("/export.csv")
async def export_summary_csv(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    auth: AuthContext = Depends(require_role(*REPORT_ROLES)),
    session: AsyncSession = Depends(get_db),
):
    _require_reports(auth)
    start_dt, end_dt, start_day, end_day = _resolve_range(date_from, date_to)
    report = await build_summary(session, date_from=start_dt, date_to=end_dt)
    return csv_response(
        filename=f"reports-{start_day.isoformat()}-to-{end_day.isoformat()}.csv",
        header=["day", "bookings", "revenue"],
        rows=(
            (point.day, point.bookings, point.revenue) for point in report.daily
        ),
    )
