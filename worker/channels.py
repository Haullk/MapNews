from __future__ import annotations

DEFAULT_CHANNEL = "社会"

CHANNEL_LABELS = ("国际", "冲突", "政治", "经济", "灾害", "社会")

DEFAULT_CHANNEL_BY_ROOT: dict[str, str] = {
    "01": "政治",
    "02": "政治",
    "03": "国际",
    "04": "国际",
    "05": "国际",
    "06": "经济",
    "07": "社会",
    "08": "政治",
    "09": "政治",
    "10": "政治",
    "11": "政治",
    "12": "政治",
    "13": "冲突",
    "14": "社会",
    "15": "冲突",
    "16": "国际",
    "17": "冲突",
    "18": "冲突",
    "19": "冲突",
    "20": "冲突",
}


def channel_for_event_code(event_code: str | None, configured: dict[str, str] | None = None) -> str:
    if not event_code:
        return DEFAULT_CHANNEL

    mappings = configured or DEFAULT_CHANNEL_BY_ROOT
    candidates = [event_code[:length] for length in range(min(len(event_code), 4), 0, -1)]
    for candidate in candidates:
        channel = mappings.get(candidate)
        if channel:
            return channel

    return DEFAULT_CHANNEL
