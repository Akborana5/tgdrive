from utils.clients import get_client
from pyrogram import Client
from pyrogram.types import Message
from pyrogram.errors import AuthKeyDuplicated
from config import STORAGE_CHANNEL
import asyncio
import os
from pathlib import Path
from utils.logger import Logger
from urllib.parse import unquote_plus

logger = Logger(__name__)
PROGRESS_CACHE = {}
STOP_TRANSMISSION = []

# Thumbnail refresh progress tracker
THUMBNAIL_REFRESH_PROGRESS = {"status": "idle", "processed": 0, "total": 0, "succeeded": 0, "failed": 0}

# Persistent thumbnail directory (outside cache/ so it survives cache resets)
THUMBNAIL_DIR = Path("./thumbnails")
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

# Delay between Telegram requests during thumbnail refresh (seconds)
_THUMBNAIL_REFRESH_DELAY = 0.5


async def extract_thumbnail(client: Client, message: Message, file_msg_id: int) -> bool:
    """Try to extract a thumbnail from a Telegram message and save to disk.
    Returns True if thumbnail was saved, False otherwise."""
    thumb_path = THUMBNAIL_DIR / f"{file_msg_id}.jpg"
    if thumb_path.exists():
        return True
    try:
        # thumb=-1 requests the last (largest available) thumbnail in pyrogram's API
        downloaded = await client.download_media(message, file_name=str(thumb_path), thumb=-1)
        if downloaded and Path(downloaded).exists():
            return True
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
        return False
    except Exception as e:
        logger.info(f"No thumbnail available for message {file_msg_id}: {e}")
        if thumb_path.exists():
            thumb_path.unlink(missing_ok=True)
        return False


async def progress_callback(current, total, id, client: Client, file_path):
    global PROGRESS_CACHE, STOP_TRANSMISSION

    PROGRESS_CACHE[id] = ("running", current, total)
    if id in STOP_TRANSMISSION:
        logger.info(f"Stopping transmission {id}")
        client.stop_transmission()
        try:
            os.remove(file_path)
        except:
            pass


async def start_file_uploader(
    file_path, id, directory_path, filename, file_size, delete=True
):
    global PROGRESS_CACHE
    from utils.directoryHandler import DRIVE_DATA

    logger.info(f"Uploading file {file_path} {id}")

    if file_size > 1.98 * 1024 * 1024 * 1024:
        # Use premium client for files larger than 2 GB
        client: Client = get_client(premium_required=True)
    else:
        client: Client = get_client()

    PROGRESS_CACHE[id] = ("running", 0, 0)

    try:
        message: Message = await client.send_document(
            STORAGE_CHANNEL,
            file_path,
            progress=progress_callback,
            progress_args=(id, client, file_path),
            disable_notification=True,
        )
    except AuthKeyDuplicated as e:
        error_msg = (
            "AUTH_KEY_DUPLICATED: The same bot token is being used in multiple places simultaneously. "
            "The session file has been invalidated by Telegram. "
            "Please ensure you're not running the same bot token locally and on Hugging Face Spaces at the same time. "
            "Delete the session file and restart the application."
        )
        logger.error(error_msg)
        logger.error(f"Error details: {e}")
        
        # Try to delete the session file if possible
        try:
            session_cache_path = Path("./cache")
            session_file = session_cache_path / f"{client.name}.session"
            if session_file.exists():
                session_file.unlink()
                logger.info(f"Deleted invalidated session file: {session_file}")
        except Exception as cleanup_error:
            logger.error(f"Failed to delete session file: {cleanup_error}")
        
        PROGRESS_CACHE[id] = ("failed", 0, 0)
        if delete:
            try:
                os.remove(file_path)
            except:
                pass
        return
    size = (
        message.photo
        or message.document
        or message.video
        or message.audio
        or message.sticker
    ).file_size

    filename = unquote_plus(filename)

    DRIVE_DATA.new_file(directory_path, filename, message.id, size)
    PROGRESS_CACHE[id] = ("completed", size, size)

    logger.info(f"Uploaded file {file_path} {id}")

    # Try to extract and cache thumbnail in background (best-effort)
    try:
        await extract_thumbnail(client, message, message.id)
    except Exception as e:
        logger.info(f"Thumbnail extraction skipped for {filename}: {e}")

    if delete:
        try:
            os.remove(file_path)
        except Exception as e:
            pass


async def refresh_all_thumbnails():
    """Backfill thumbnails for all video files that don't have a cached thumbnail."""
    global THUMBNAIL_REFRESH_PROGRESS
    import config
    from utils.directoryHandler import DRIVE_DATA

    THUMBNAIL_REFRESH_PROGRESS = {"status": "running", "processed": 0, "total": 0, "succeeded": 0, "failed": 0}

    # Collect all video files that are missing thumbnails
    video_files = []

    def collect_files(folder):
        for item in folder.contents.values():
            if item.type == "folder":
                collect_files(item)
            elif item.type == "file":
                mime = getattr(item, "mime_type", "") or ""
                if mime.startswith("video/"):
                    thumb_path = THUMBNAIL_DIR / f"{item.file_id}.jpg"
                    if not thumb_path.exists():
                        video_files.append(item)

    try:
        root = DRIVE_DATA.get_directory("/")
        collect_files(root)
    except Exception as e:
        logger.error(f"Error collecting files for thumbnail refresh: {e}")
        THUMBNAIL_REFRESH_PROGRESS["status"] = "failed"
        return

    THUMBNAIL_REFRESH_PROGRESS["total"] = len(video_files)
    logger.info(f"Refreshing thumbnails for {len(video_files)} video files...")

    try:
        client = get_client()
    except Exception as e:
        logger.error(f"No client available for thumbnail refresh: {e}")
        THUMBNAIL_REFRESH_PROGRESS["status"] = "failed"
        return

    for file in video_files:
        try:
            msg = await client.get_messages(config.STORAGE_CHANNEL, file.file_id)
            if msg and not msg.empty:
                success = await extract_thumbnail(client, msg, file.file_id)
                if success:
                    THUMBNAIL_REFRESH_PROGRESS["succeeded"] += 1
                else:
                    THUMBNAIL_REFRESH_PROGRESS["failed"] += 1
            else:
                THUMBNAIL_REFRESH_PROGRESS["failed"] += 1
        except Exception as e:
            logger.warning(f"Failed to refresh thumbnail for file_id {file.file_id}: {e}")
            THUMBNAIL_REFRESH_PROGRESS["failed"] += 1
        finally:
            THUMBNAIL_REFRESH_PROGRESS["processed"] += 1

        # Small delay between requests to avoid Telegram rate limits
        await asyncio.sleep(_THUMBNAIL_REFRESH_DELAY)

    THUMBNAIL_REFRESH_PROGRESS["status"] = "completed"
    logger.info(
        f"Thumbnail refresh completed: {THUMBNAIL_REFRESH_PROGRESS['succeeded']} succeeded, "
        f"{THUMBNAIL_REFRESH_PROGRESS['failed']} failed out of {len(video_files)} total"
    )
