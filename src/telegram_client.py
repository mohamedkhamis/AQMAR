# src/telegram_client.py
import os
import asyncio
from dataclasses import dataclass
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument, DocumentAttributeVideo
from telethon.errors import FloodWaitError, SessionPasswordNeededError

@dataclass
class TgMessage:
    msg_id: int
    posted_date: str
    caption: str
    has_photo: bool
    has_video: bool
    video_w: int
    video_h: int
    video_size: int
    video_duration: float
    raw: object  # Telethon Message

class TelegramFetcher:
    def __init__(self, api_id: int, api_hash: str, phone: str,
                 two_fa: str, session_path: str, channel: str):
        os.makedirs(os.path.dirname(session_path) or ".", exist_ok=True)
        self.client = TelegramClient(session_path, api_id, api_hash)
        self.phone = phone
        self.two_fa = two_fa
        self.channel = channel

    async def connect(self) -> None:
        await self.client.connect()
        if not await self.client.is_user_authorized():
            await self.client.send_code_request(self.phone)
            code = input("Enter the Telegram code sent to your app: ")
            try:
                await self.client.sign_in(self.phone, code)
            except SessionPasswordNeededError:
                await self.client.sign_in(password=self.two_fa)

    async def disconnect(self) -> None:
        await self.client.disconnect()

    async def fetch_all_messages(self, min_id: int = 0) -> list:
        out = []
        async for msg in self.client.iter_messages(self.channel, reverse=True, min_id=min_id):
            out.append(self._to_tg_message(msg))
        return out

    def _to_tg_message(self, msg) -> TgMessage:
        caption = msg.message or ""
        has_photo = isinstance(msg.media, MessageMediaPhoto)
        has_video = False
        w = h = 0
        size = 0
        duration = 0.0
        if isinstance(msg.media, MessageMediaDocument) and msg.media.document:
            doc = msg.media.document
            for attr in doc.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    has_video = True
                    w = attr.w or 0
                    h = attr.h or 0
                    duration = attr.duration or 0.0
            size = doc.size or 0
        return TgMessage(
            msg_id=msg.id,
            posted_date=msg.date.strftime("%Y-%m-%d %H:%M"),
            caption=caption,
            has_photo=has_photo,
            has_video=has_video,
            video_w=w, video_h=h, video_size=size, video_duration=duration,
            raw=msg,
        )

    async def download_photo(self, tg_msg: TgMessage, out_path: str) -> str:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        return await self.client.download_media(tg_msg.raw, file=out_path)

    async def download_video(self, tg_msg: TgMessage, out_path: str) -> str:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        async def with_retry():
            for attempt in range(3):
                try:
                    return await self.client.download_media(tg_msg.raw, file=out_path)
                except FloodWaitError as e:
                    await asyncio.sleep(e.seconds)
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)
        return await with_retry()
