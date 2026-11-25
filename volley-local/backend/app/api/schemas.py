from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing_extensions import Annotated

Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TagIn(Payload):
    name: Name
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    hotkey: str | None = Field(None, pattern=r"^[1-9]$")


class PlayerIn(Payload):
    label: Name
    jersey_color: str | None = None


class Attribution(Payload):
    player_id: int
    role: str | None = Field(None, max_length=64)


class Patch(Payload):
    tags: list[int] | None = None
    players: list[Attribution] | None = None
    starred: bool | None = None
    flagged: bool | None = None
    notes: str | None = Field(None, max_length=20000)


class FilterQuery(Payload):
    include: list[int] = Field(default_factory=list)
    exclude: list[int] = Field(default_factory=list)
    logic: Literal["any", "all"] = "any"
    min: float = Field(0, ge=0)
    max: float | None = Field(None, ge=0)
    low: float = Field(0, ge=0, le=100)
    high: float = Field(100, ge=0, le=100)
    star: bool = False
    player: int = Field(0, ge=0)
    search: str = Field("", max_length=20000)


class Preset(Payload):
    name: Name
    json_query: FilterQuery


class Export(Payload):
    clip_ids: list[int] = Field(default_factory=list, max_length=10000)
    mode: Literal["individual", "reel"] = "individual"
    before: float = Field(0, ge=0, le=5)
    after: float = Field(0, ge=0, le=5)


class ClipChange(Patch):
    id: int


class BulkChanges(Payload):
    changes: list[ClipChange] = Field(min_length=1, max_length=10000)


class BulkDelete(Payload):
    ids: list[int] = Field(min_length=1, max_length=10000)
