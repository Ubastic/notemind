from datetime import datetime
import pytz

# Beijing timezone
BEIJING_TZ = pytz.timezone("Asia/Shanghai")


def now_beijing() -> datetime:
    """Get current datetime in Beijing timezone."""
    return datetime.now(BEIJING_TZ)


def ensure_beijing_tz(value: datetime) -> datetime:
    """Ensure a datetime is timezone-aware in Beijing time."""
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return BEIJING_TZ.localize(value)
    return value.astimezone(BEIJING_TZ)
