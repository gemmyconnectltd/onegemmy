"""One date-period filter for every list endpoint: `?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD`, both optional and inclusive.

Days are the business's own days: a sale made at 23:30 in the tenant's timezone belongs to that date, not the next UTC day.
Usage in a route: `period: PeriodQuery`, pass it down, then `stmt = period.apply(stmt, Model.created_at)` in the repository.
"""
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import Date as SaDate
from sqlalchemy.sql.elements import ColumnElement

from app.core.deps import CurrentUser
from app.core.exceptions import ValidationError


class DatePeriod(BaseModel):
    from_date: date | None = None
    to_date: date | None = None
    timezone: str = "UTC"

    @property
    def active(self) -> bool:
        return self.from_date is not None or self.to_date is not None

    def apply(self, stmt, column: ColumnElement):
        """Keep rows whose `column` falls inside the period. Works for both date and timestamp columns."""
        if not self.active:
            return stmt
        if isinstance(column.type, SaDate):
            if self.from_date:
                stmt = stmt.where(column >= self.from_date)
            if self.to_date:
                stmt = stmt.where(column <= self.to_date)
            return stmt
        try:
            zone = ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            zone = UTC
        if self.from_date:
            stmt = stmt.where(column >= datetime.combine(self.from_date, time.min, tzinfo=zone))
        if self.to_date:
            stmt = stmt.where(column < datetime.combine(self.to_date + timedelta(days=1), time.min, tzinfo=zone))
        return stmt


def _period(user: CurrentUser, from_date: date | None = Query(None), to_date: date | None = Query(None)) -> DatePeriod:
    if from_date and to_date and from_date > to_date:
        raise ValidationError("The start date must not be after the end date")
    tenant = getattr(user, "tenant", None)
    return DatePeriod(from_date=from_date, to_date=to_date, timezone=getattr(tenant, "timezone", None) or "UTC")


PeriodQuery = Annotated[DatePeriod, Depends(_period)]
