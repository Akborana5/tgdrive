from utils.clients import get_client
from pyrogram import Client
from pyrogram.types import Message
from pyrogram.errors import AuthKeyDuplicated
from config import STORAGE_CHANNEL
import os
from pathlib import Path
from utils.logger import Logger
from urllib.parse import unquote_plus

logger = Logger(__name__)
PROGRESS_CACHE = {}
STOP_TRANSMISSION = []

# Persistent thumbnail directory (outside cache/ so it survives cache resets)
THUMBNAIL_DIR = Path("./thumbnails")
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)


async def extract_thumbnail(client: Client, message: Message, file_msg_id: int) -> bool:
    """Try to extract a thumbnail from a Telegram message and save to disk.
    Returns True if thumbnail was saved, False otherwise."""
    thumb_path = THUMBNAIL_DIR / f"{file_msg_id}.jpg"
    if thumb_path.exists():
        return True
    try:
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
