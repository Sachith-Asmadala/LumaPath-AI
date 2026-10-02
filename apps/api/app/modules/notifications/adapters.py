from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class AdapterResult:
    delivered: bool
    provider_message_id: str | None = None
    error_code: str | None = None


class DeliveryAdapter(Protocol):
    available: bool
    def send(self, *, delivery_id: str, title: str, body: str) -> AdapterResult: ...


class InAppAdapter:
    available = True
    def send(self, *, delivery_id: str, title: str, body: str) -> AdapterResult:
        return AdapterResult(delivered=True, provider_message_id=f"inapp:{delivery_id}")


class DisabledExternalAdapter:
    available = False
    def __init__(self, channel: str): self.channel = channel
    def send(self, *, delivery_id: str, title: str, body: str) -> AdapterResult:
        return AdapterResult(delivered=False, error_code=f"{self.channel}_provider_unavailable")
