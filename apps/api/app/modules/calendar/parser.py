from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil import parser as dtparser
from dateutil.rrule import rrulestr

from .schemas import CalendarItemKind


MAX_OCCURRENCES = 500
MAX_RECURRENCE_DAYS = 366


@dataclass(frozen=True, slots=True)
class ParsedCalendarItem:
    external_id: str
    recurrence_key: str
    kind: CalendarItemKind
    title: str
    description: str
    start_at: datetime
    end_at: datetime | None
    timezone: str
    confidence: float
    source_updated_at: datetime | None
    source_warning: str | None = None

    @property
    def preview_key(self) -> str:
        raw = f"{self.external_id}|{self.recurrence_key}|{self.start_at.isoformat()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    @property
    def source_hash(self) -> str:
        raw = "|".join([
            self.external_id, self.recurrence_key, self.kind.value, self.title, self.description,
            self.start_at.isoformat(), self.end_at.isoformat() if self.end_at else "", self.timezone,
            self.source_updated_at.isoformat() if self.source_updated_at else "",
        ])
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def validate_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Timezone must be a valid IANA timezone.") from exc


def detect_format(filename: str, content_type: str | None, raw: bytes) -> str:
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if len(raw) == 0:
        raise ValueError("Calendar file is empty.")
    head = raw[:4096].decode("utf-8-sig", errors="ignore").lstrip()
    if suffix == "ics" or "text/calendar" in (content_type or "").lower():
        if "BEGIN:VCALENDAR" not in head.upper():
            raise ValueError("This file does not contain a valid iCalendar header.")
        return "ics"
    if suffix == "csv" or "text/csv" in (content_type or "").lower() or "application/csv" in (content_type or "").lower():
        try:
            raw.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV calendar files must use UTF-8 text.") from exc
        return "csv"
    raise ValueError("Supported calendar formats are .ics and UTF-8 .csv.")


def parse_calendar(raw: bytes, source_format: str, default_timezone: str) -> list[ParsedCalendarItem]:
    validate_timezone(default_timezone)
    if source_format == "ics":
        return parse_ics(raw.decode("utf-8-sig"), default_timezone)
    if source_format == "csv":
        return parse_csv(raw.decode("utf-8-sig"), default_timezone)
    raise ValueError("Unsupported calendar format.")


def _unfold_ics(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _decode_ics_text(value: str) -> str:
    return value.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def _prop(line: str):
    if ":" not in line:
        return None
    left, value = line.split(":", 1)
    parts = left.split(";")
    name = parts[0].upper()
    params: dict[str, str] = {}
    for part in parts[1:]:
        if "=" in part:
            key, val = part.split("=", 1)
            params[key.upper()] = val.strip('"')
    return name, params, value


def _ics_datetime(value: str, params: dict[str, str], default_timezone: str) -> tuple[datetime, str]:
    tz_name = params.get("TZID", default_timezone)
    tz = validate_timezone(tz_name)
    if params.get("VALUE", "").upper() == "DATE" or re.fullmatch(r"\d{8}", value):
        day = datetime.strptime(value[:8], "%Y%m%d").date()
        return datetime.combine(day, time(0, 0), tzinfo=tz), tz_name
    if value.endswith("Z"):
        parsed = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return parsed, "UTC"
    formats = ["%Y%m%dT%H%M%S", "%Y%m%dT%H%M"]
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.replace(tzinfo=tz), tz_name
        except ValueError:
            continue
    raise ValueError(f"Unsupported iCalendar date value: {value}")


def parse_ics(text: str, default_timezone: str) -> list[ParsedCalendarItem]:
    lines = _unfold_ics(text)
    events: list[list[tuple[str, dict[str, str], str]]] = []
    current: list[tuple[str, dict[str, str], str]] | None = None
    for line in lines:
        upper = line.upper()
        if upper == "BEGIN:VEVENT":
            current = []
            continue
        if upper == "END:VEVENT":
            if current is not None:
                events.append(current)
            current = None
            continue
        if current is not None:
            parsed = _prop(line)
            if parsed:
                current.append(parsed)
    if not events:
        raise ValueError("No VEVENT entries were found in the iCalendar file.")

    output: list[ParsedCalendarItem] = []
    for index, props in enumerate(events, start=1):
        grouped: dict[str, list[tuple[dict[str, str], str]]] = {}
        for name, params, value in props:
            grouped.setdefault(name, []).append((params, value))
        if "DTSTART" not in grouped:
            continue
        start, tz_name = _ics_datetime(grouped["DTSTART"][0][1], grouped["DTSTART"][0][0], default_timezone)
        end: datetime | None = None
        if "DTEND" in grouped:
            end, _ = _ics_datetime(grouped["DTEND"][0][1], grouped["DTEND"][0][0], tz_name)
        elif "DURATION" in grouped:
            # Intentionally support the common PT#H#M subset without executing arbitrary content.
            match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?", grouped["DURATION"][0][1].upper())
            if match:
                end = start + timedelta(hours=int(match.group(1) or 0), minutes=int(match.group(2) or 0))
        title = _decode_ics_text(grouped.get("SUMMARY", [({}, f"Calendar item {index}")])[0][1])[:300]
        description = _decode_ics_text(grouped.get("DESCRIPTION", [({}, "")])[0][1])[:5000]
        uid = _decode_ics_text(grouped.get("UID", [({}, f"generated-{index}-{hashlib.sha256((title+start.isoformat()).encode()).hexdigest()[:16]}")])[0][1])[:300]
        explicit_kind = grouped.get("X-LUMAPATH-TYPE", [({}, "")])[0][1]
        kind, confidence = classify_kind(title, description, explicit_kind)
        source_updated = None
        for key in ("LAST-MODIFIED", "DTSTAMP"):
            if key in grouped:
                try:
                    source_updated, _ = _ics_datetime(grouped[key][0][1], grouped[key][0][0], "UTC")
                    break
                except ValueError:
                    pass
        warning = instruction_warning(description)
        base = ParsedCalendarItem(uid, "", kind, title, description, start.astimezone(timezone.utc), end.astimezone(timezone.utc) if end else None, tz_name, confidence, source_updated.astimezone(timezone.utc) if source_updated else None, warning)
        rrule_value = grouped.get("RRULE", [({}, "")])[0][1]
        if not rrule_value:
            recurrence = grouped.get("RECURRENCE-ID")
            recurrence_key = ""
            if recurrence:
                recurrence_dt, _ = _ics_datetime(recurrence[0][1], recurrence[0][0], tz_name)
                recurrence_key = recurrence_dt.astimezone(timezone.utc).isoformat()
            output.append(replace(base, recurrence_key=recurrence_key))
            continue
        duration = (end - start) if end else None
        exdates: set[str] = set()
        for params, values in grouped.get("EXDATE", []):
            for raw in values.split(","):
                try:
                    ex, _ = _ics_datetime(raw, params, tz_name)
                    exdates.add(ex.astimezone(timezone.utc).isoformat())
                except ValueError:
                    continue
        try:
            rule = rrulestr(rrule_value, dtstart=start)
        except Exception as exc:
            raise ValueError(f"Unsupported recurrence rule for {title}.") from exc
        horizon = start + timedelta(days=MAX_RECURRENCE_DAYS)
        count = 0
        for occurrence in rule:
            if occurrence > horizon or count >= MAX_OCCURRENCES:
                break
            if occurrence.tzinfo is None:
                occurrence = occurrence.replace(tzinfo=start.tzinfo)
            occ_utc = occurrence.astimezone(timezone.utc)
            if occ_utc.isoformat() in exdates:
                continue
            count += 1
            occ_end = occ_utc + duration if duration else None
            output.append(replace(base, recurrence_key=occ_utc.isoformat(), start_at=occ_utc, end_at=occ_end))
    if not output:
        raise ValueError("The calendar did not contain any importable dated events.")
    return output


def _parse_csv_datetime(value: str, timezone_name: str) -> datetime:
    if not value.strip():
        raise ValueError("A calendar row is missing its start/date value.")
    tz = validate_timezone(timezone_name)
    try:
        parsed = dtparser.isoparse(value.strip())
    except Exception:
        try:
            parsed = datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")
        except ValueError as exc:
            raise ValueError(f"Unsupported calendar date: {value}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=tz)
    return parsed.astimezone(timezone.utc)


def parse_csv(text: str, default_timezone: str) -> list[ParsedCalendarItem]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV calendar is missing a header row.")
    normalized_fields = {field.strip().lower(): field for field in reader.fieldnames if field}
    title_key = next((normalized_fields[k] for k in ("title", "summary", "name") if k in normalized_fields), None)
    start_key = next((normalized_fields[k] for k in ("start", "start_at", "date", "deadline", "due_at") if k in normalized_fields), None)
    if not title_key or not start_key:
        raise ValueError("CSV must include a title/summary column and a start/date/deadline column.")
    output: list[ParsedCalendarItem] = []
    for row_number, row in enumerate(reader, start=2):
        title = (row.get(title_key) or "").strip()[:300]
        if not title:
            continue
        timezone_name = (row.get(normalized_fields.get("timezone", "")) or default_timezone).strip() or default_timezone
        start = _parse_csv_datetime(row.get(start_key) or "", timezone_name)
        end_value = ""
        for key in ("end", "end_at"):
            if key in normalized_fields:
                end_value = (row.get(normalized_fields[key]) or "").strip()
                if end_value:
                    break
        end = _parse_csv_datetime(end_value, timezone_name) if end_value else None
        description = (row.get(normalized_fields.get("description", "")) or "").strip()[:5000]
        explicit_kind = (row.get(normalized_fields.get("type", "")) or row.get(normalized_fields.get("kind", "")) or "").strip()
        kind, confidence = classify_kind(title, description, explicit_kind)
        external_id = (row.get(normalized_fields.get("external_id", "")) or row.get(normalized_fields.get("uid", "")) or row.get(normalized_fields.get("id", "")) or "").strip()
        if not external_id:
            external_id = f"csv-{hashlib.sha256(f'{title}|{start.isoformat()}|{end.isoformat() if end else ''}'.encode()).hexdigest()[:24]}"
        source_updated = None
        for key in ("last_modified", "updated_at"):
            if key in normalized_fields and (row.get(normalized_fields[key]) or "").strip():
                source_updated = _parse_csv_datetime(row.get(normalized_fields[key]) or "", timezone_name)
                break
        output.append(ParsedCalendarItem(external_id[:300], "", kind, title, description, start, end, timezone_name, confidence, source_updated, instruction_warning(description)))
    if not output:
        raise ValueError("CSV calendar did not contain any importable rows.")
    return output


def classify_kind(title: str, description: str, explicit: str = "") -> tuple[CalendarItemKind, float]:
    raw = explicit.strip().lower().replace(" ", "_")
    aliases = {
        "lecture": CalendarItemKind.LECTURE, "class": CalendarItemKind.LECTURE,
        "exam": CalendarItemKind.EXAM, "test": CalendarItemKind.EXAM, "quiz": CalendarItemKind.EXAM,
        "deadline": CalendarItemKind.DEADLINE, "assignment": CalendarItemKind.DEADLINE, "submission": CalendarItemKind.DEADLINE,
        "workshop": CalendarItemKind.WORKSHOP, "lab": CalendarItemKind.WORKSHOP,
        "event": CalendarItemKind.EVENT,
    }
    if raw in aliases:
        return aliases[raw], 0.99
    haystack = f"{title} {description}".lower()
    if re.search(r"\b(exam|midterm|final exam|test)\b", haystack): return CalendarItemKind.EXAM, 0.82
    if re.search(r"\b(deadline|assignment due|submission|submit by|due date)\b", haystack): return CalendarItemKind.DEADLINE, 0.82
    if re.search(r"\b(lecture|class|tutorial)\b", haystack): return CalendarItemKind.LECTURE, 0.78
    if re.search(r"\b(workshop|lab session|practical)\b", haystack): return CalendarItemKind.WORKSHOP, 0.78
    return CalendarItemKind.EVENT, 0.65


def instruction_warning(description: str) -> str | None:
    text = description.lower()
    patterns = ("ignore previous", "system prompt", "follow these instructions", "click this link to", "run this command", "execute")
    if any(pattern in text for pattern in patterns):
        return "External description contains instruction-like text. LumaPath treats it only as untrusted calendar content."
    return None
