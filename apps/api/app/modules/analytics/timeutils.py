from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status


def zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown analytics timezone.") from exc


def aware(value: datetime, timezone_name: str) -> datetime:
    tz = zone(timezone_name)
    if value.tzinfo is None:
        return value.replace(tzinfo=tz)
    return value.astimezone(tz)


def utc_iso(value: datetime, timezone_name: str) -> str:
    return aware(value, timezone_name).astimezone(timezone.utc).isoformat()


def local_date(value: datetime, timezone_name: str) -> date:
    return aware(value, timezone_name).date()


def range_utc(start: date, end: date, timezone_name: str) -> tuple[datetime, datetime]:
    if end < start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="End date must be on or after start date.")
    if (end - start).days > 366:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Analytics range cannot exceed 367 days.")
    tz = zone(timezone_name)
    start_local = datetime.combine(start, time.min, tzinfo=tz)
    end_local = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())
