from dataclasses import dataclass
from collections import defaultdict

@dataclass
class VideoMeta:
    msg_id: int
    name: str
    w: int
    h: int
    size_bytes: int

@dataclass
class DuplicateRecord:
    duplicate: VideoMeta
    kept_msg_id: int
    reason: str

def dedup_by_name(items: list) -> tuple:
    groups = defaultdict(list)
    for it in items:
        groups[it.name].append(it)
    keep = []
    dupes = []
    for name, group in groups.items():
        if len(group) == 1 or not name:
            keep.extend(group)
            continue
        winner = max(group, key=lambda v: (v.w * v.h, v.size_bytes))
        keep.append(winner)
        for it in group:
            if it.msg_id == winner.msg_id:
                continue
            reason = "lower_resolution" if it.w * it.h < winner.w * winner.h else "smaller_file_size"
            dupes.append(DuplicateRecord(duplicate=it, kept_msg_id=winner.msg_id, reason=reason))
    return keep, dupes
