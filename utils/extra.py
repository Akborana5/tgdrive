import mimetypes
from urllib.parse import unquote_plus
import re
import urllib.parse
from pathlib import Path
from config import WEBSITE_URL
import asyncio, aiohttp
from utils.directoryHandler import get_current_utc_time, getRandomID
from utils.logger import Logger

logger = Logger(__name__)


def convert_class_to_dict(data, isObject, showtrash=False):
    if isObject == True:
        data = data.__dict__.copy()
    new_data = {"contents": {}}

    for key in data["contents"]:
        if data["contents"][key].trash == showtrash:
            if data["contents"][key].type == "folder":
                folder = data["contents"][key]
                new_data["contents"][key] = {
                    "name": folder.name,
                    "type": folder.type,
                    "id": folder.id,
                    "path": folder.path,
                    "upload_date": folder.upload_date,
                }
            else:
                file = data["contents"][key]
                new_data["contents"][key] = {
                    "name": file.name,
                    "type": file.type,
                    "size": file.size,
                    "id": file.id,
                    "path": file.path,
                    "upload_date": file.upload_date,
                    "mime_type": getattr(file, "mime_type", "application/octet-stream"),
                }
    return new_data


async def auto_ping_website():
    if WEBSITE_URL is not None:
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.get(WEBSITE_URL) as response:
                        if response.status == 200:
                            logger.info(f"Pinged website at {get_current_utc_time()}")
                        else:
                            logger.warning(f"Failed to ping website: {response.status}")
                except Exception as e:
                    logger.warning(f"Failed to ping website: {e}")

                await asyncio.sleep(60)  # Ping website every minute


import shutil


def reset_cache_dir():
    cache_dir = Path("./cache")
    downloads_dir = Path("./downloads")
    
    # Save session files before deleting cache (but skip invalidated ones)
    session_files = {}
    if cache_dir.exists():
        for session_file in cache_dir.glob("*.session"):
            # Check if this session file was marked as invalidated
            invalidated_marker = cache_dir / f"{session_file.name}.invalidated"
            if invalidated_marker.exists():
                logger.warning(f"Skipping invalidated session file: {session_file.name} (was marked as AUTH_KEY_DUPLICATED)")
                # Delete the marker file so it can be retried on next restart
                invalidated_marker.unlink(missing_ok=True)
                continue
            session_files[session_file.name] = session_file.read_bytes()
            logger.info(f"Preserving session file: {session_file.name}")
    
    # Delete cache and downloads directories
    shutil.rmtree(cache_dir, ignore_errors=True)
    shutil.rmtree(downloads_dir, ignore_errors=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    downloads_dir.mkdir(parents=True, exist_ok=True)
    
    # Restore session files
    for session_name, session_data in session_files.items():
        (cache_dir / session_name).write_bytes(session_data)
        logger.info(f"Restored session file: {session_name}")
    
    logger.info("Cache and downloads directory reset (session files preserved)")


def parse_content_disposition(content_disposition):
    # Split the content disposition into parts
    parts = content_disposition.split(";")

    # Initialize filename variable
    filename = None

    # Loop through parts to find the filename
    for part in parts:
        part = part.strip()
        if part.startswith("filename="):
            # If filename is found
            filename = part.split("=", 1)[1]
        elif part.startswith("filename*="):
            # If filename* is found
            match = re.match(r"filename\*=(\S*)''(.*)", part)
            if match:
                encoding, value = match.groups()
                try:
                    filename = urllib.parse.unquote(value, encoding=encoding)
                except ValueError:
                    # Handle invalid encoding
                    pass

    if filename is None:
        raise Exception("Failed to get filename")
    return filename


def get_filename(headers, url):
    try:
        if headers.get("Content-Disposition"):
            filename = parse_content_disposition(headers["Content-Disposition"])
        else:
            filename = unquote_plus(url.strip("/").split("/")[-1])

        filename = filename.strip(' "')
    except:
        filename = unquote_plus(url.strip("/").split("/")[-1])

    filename = filename.strip()

    if filename == "" or "." not in filename:
        if headers.get("Content-Type"):
            extension = mimetypes.guess_extension(headers["Content-Type"])
            if extension:
                filename = f"{getRandomID()}{extension}"
            else:
                filename = getRandomID()
        else:
            filename = getRandomID()

    return filename
