import json
import os
from dataclasses import dataclass, field

@dataclass
class State:
    processed_msg_ids: set = field(default_factory=set)
    statuses: dict = field(default_factory=dict)
    last_processed_msg_id: int | None = None

    @classmethod
    def load(cls, path: str) -> "State":
        if not os.path.exists(path):
            return cls()
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(
            processed_msg_ids=set(data.get("processed_msg_ids", [])),
            statuses={int(k): v for k, v in data.get("statuses", {}).items()},
            last_processed_msg_id=data.get("last_processed_msg_id"),
        )

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        data = {
            "processed_msg_ids": sorted(self.processed_msg_ids),
            "statuses": {str(k): v for k, v in self.statuses.items()},
            "last_processed_msg_id": self.last_processed_msg_id,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def mark_processed(self, msg_id: int, status: str) -> None:
        self.processed_msg_ids.add(msg_id)
        self.statuses[msg_id] = status
        if self.last_processed_msg_id is None or msg_id > self.last_processed_msg_id:
            self.last_processed_msg_id = msg_id

    def is_processed(self, msg_id: int) -> bool:
        return msg_id in self.processed_msg_ids
