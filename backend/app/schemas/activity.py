from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityOut(BaseModel):
    id: uuid.UUID
    action: str
    entity: str
    entity_id: str | None
    meta: dict
    user_id: uuid.UUID | None
    user_name: str | None
    created_at: datetime
