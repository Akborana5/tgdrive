from utils.downloader import (
    download_file,
    get_file_info_from_url,
)
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
import aiofiles
import aiohttp
from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form, Response
from fastapi.responses import FileResponse, JSONResponse
from config import ADMIN_PASSWORD, MAX_FILE_SIZE, STORAGE_CHANNEL, TMDB_API_KEY
from utils.clients import initialize_clients
from utils.directoryHandler import getRandomID
from utils.extra import auto_ping_website, convert_class_to_dict, reset_cache_dir
from utils.streamer import media_streamer
from utils.uploader import start_file_uploader, THUMBNAIL_DIR
from utils.logger import Logger
import urllib.parse


# Startup Event
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset the cache directory, delete cache files
    reset_cache_dir()

    # Initialize the clients
    clients_initialized = await initialize_clients()
    
    # If clients failed to initialize, initialize DRIVE_DATA in offline mode
    if not clients_initialized:
        logger.warning("No Telegram clients available - Initializing in OFFLINE MODE")
        from utils.directoryHandler import initDriveDataWithoutClients
        await initDriveDataWithoutClients()
        logger.warning("✅ Website is running in OFFLINE MODE - Telegram features are disabled")
        logger.info("✅ Website UI is available - File operations requiring Telegram will show errors")
    else:
        # Start background thumbnail refresh for files uploaded before thumbnail support
        asyncio.create_task(refresh_missing_thumbnails())

    # Start the website auto ping task
    asyncio.create_task(auto_ping_website())

    yield


app = FastAPI(docs_url=None, redoc_url=None, lifespan=lifespan)
logger = Logger(__name__)


@app.get("/")
async def home_page():
    return FileResponse("website/home.html")


@app.get("/stream")
async def home_page():
    return FileResponse("website/VideoPlayer.html")


@app.get("/static/{file_path:path}")
async def static_files(file_path):
    if "apiHandler.js" in file_path:
        with open(Path("website/static/js/apiHandler.js")) as f:
            content = f.read()
            content = content.replace("MAX_FILE_SIZE__SDGJDG", str(MAX_FILE_SIZE))
        return Response(content=content, media_type="application/javascript")
    return FileResponse(f"website/static/{file_path}")


@app.get("/file")
async def dl_file(request: Request):
    from utils.directoryHandler import DRIVE_DATA
    from utils.clients import has_clients

    if not has_clients():
        raise HTTPException(status_code=503, detail="Telegram clients not available - Service running in offline mode")
    
    path = request.query_params["path"]
    file = DRIVE_DATA.get_file(path)
    return await media_streamer(STORAGE_CHANNEL, file.file_id, file.name, request)


# Api Routes


@app.post("/api/checkPassword")
async def check_password(request: Request):
    data = await request.json()
    if data["pass"] == ADMIN_PASSWORD:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "Invalid password"})


@app.post("/api/createNewFolder")
async def api_new_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"createNewFolder {data}")
    folder_data = DRIVE_DATA.get_directory(data["path"]).contents
    for id in folder_data:
        f = folder_data[id]
        if f.type == "folder":
            if f.name == data["name"]:
                return JSONResponse(
                    {
                        "status": "Folder with the name already exist in current directory"
                    }
                )

    DRIVE_DATA.new_folder(data["path"], data["name"])
    return JSONResponse({"status": "ok"})


@app.post("/api/getDirectory")
async def api_get_directory(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] == ADMIN_PASSWORD:
        is_admin = True
    else:
        is_admin = False

    auth = data.get("auth")

    logger.info(f"getFolder {data}")

    if data["path"] == "/trash":
        data = {"contents": DRIVE_DATA.get_trashed_files_folders()}
        folder_data = convert_class_to_dict(data, isObject=False, showtrash=True)

    elif "/search_" in data["path"]:
        query = urllib.parse.unquote(data["path"].split("_", 1)[1])
        print(query)
        data = {"contents": DRIVE_DATA.search_file_folder(query)}
        print(data)
        folder_data = convert_class_to_dict(data, isObject=False, showtrash=False)
        print(folder_data)

    elif "/share_" in data["path"]:
        path = data["path"].split("_", 1)[1]
        folder_data, auth_home_path = DRIVE_DATA.get_directory(path, is_admin, auth)
        auth_home_path= auth_home_path.replace("//", "/") if auth_home_path else None
        folder_data = convert_class_to_dict(folder_data, isObject=True, showtrash=False)
        return JSONResponse(
            {"status": "ok", "data": folder_data, "auth_home_path": auth_home_path}
        )

    else:
        folder_data = DRIVE_DATA.get_directory(data["path"])
        folder_data = convert_class_to_dict(folder_data, isObject=True, showtrash=False)
    return JSONResponse({"status": "ok", "data": folder_data, "auth_home_path": None})


SAVE_PROGRESS = {}


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form(...),
    password: str = Form(...),
    id: str = Form(...),
    total_size: str = Form(...),
):
    global SAVE_PROGRESS
    from utils.clients import has_clients

    if password != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    if not has_clients():
        return JSONResponse({"status": "Telegram clients not available - Service running in offline mode"})

    total_size = int(total_size)
    SAVE_PROGRESS[id] = ("running", 0, total_size)

    ext = file.filename.lower().split(".")[-1]

    cache_dir = Path("./cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    file_location = cache_dir / f"{id}.{ext}"

    file_size = 0

    async with aiofiles.open(file_location, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):  # Read file in chunks of 1MB
            SAVE_PROGRESS[id] = ("running", file_size, total_size)
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                await buffer.close()
                file_location.unlink()  # Delete the partially written file
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds {MAX_FILE_SIZE} bytes limit",
                )
            await buffer.write(chunk)

    SAVE_PROGRESS[id] = ("completed", file_size, file_size)

    asyncio.create_task(
        start_file_uploader(file_location, id, path, file.filename, file_size)
    )

    return JSONResponse({"id": id, "status": "ok"})


@app.post("/api/getSaveProgress")
async def get_save_progress(request: Request):
    global SAVE_PROGRESS

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getUploadProgress {data}")
    try:
        progress = SAVE_PROGRESS[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/getUploadProgress")
async def get_upload_progress(request: Request):
    from utils.uploader import PROGRESS_CACHE

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getUploadProgress {data}")

    try:
        progress = PROGRESS_CACHE[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/cancelUpload")
async def cancel_upload(request: Request):
    from utils.uploader import STOP_TRANSMISSION
    from utils.downloader import STOP_DOWNLOAD

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"cancelUpload {data}")
    STOP_TRANSMISSION.append(data["id"])
    STOP_DOWNLOAD.append(data["id"])
    return JSONResponse({"status": "ok"})


@app.post("/api/renameFileFolder")
async def rename_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"renameFileFolder {data}")
    DRIVE_DATA.rename_file_folder(data["path"], data["name"])
    return JSONResponse({"status": "ok"})


@app.post("/api/trashFileFolder")
async def trash_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"trashFileFolder {data}")
    DRIVE_DATA.trash_file_folder(data["path"], data["trash"])
    return JSONResponse({"status": "ok"})


@app.post("/api/deleteFileFolder")
async def delete_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"deleteFileFolder {data}")
    DRIVE_DATA.delete_file_folder(data["path"])
    return JSONResponse({"status": "ok"})


@app.post("/api/getFileInfoFromUrl")
async def getFileInfoFromUrl(request: Request):

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFileInfoFromUrl {data}")
    try:
        file_info = await get_file_info_from_url(data["url"])
        return JSONResponse({"status": "ok", "data": file_info})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/startFileDownloadFromUrl")
async def startFileDownloadFromUrl(request: Request):
    from utils.clients import has_clients
    
    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    if not has_clients():
        return JSONResponse({"status": "Telegram clients not available - Service running in offline mode"})

    logger.info(f"startFileDownloadFromUrl {data}")
    try:
        id = getRandomID()
        asyncio.create_task(
            download_file(data["url"], id, data["path"], data["filename"], data["singleThreaded"])
        )
        return JSONResponse({"status": "ok", "id": id})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/getFileDownloadProgress")
async def getFileDownloadProgress(request: Request):
    from utils.downloader import DOWNLOAD_PROGRESS

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFileDownloadProgress {data}")

    try:
        progress = DOWNLOAD_PROGRESS[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/getFolderShareAuth")
async def getFolderShareAuth(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFolderShareAuth {data}")

    try:
        auth = DRIVE_DATA.get_folder_auth(data["path"])
        return JSONResponse({"status": "ok", "auth": auth})
    except:
        return JSONResponse({"status": "not found"})


# ── Thumbnail Refresh ───────────────────────────────────────────────────────

async def refresh_missing_thumbnails():
    """Background task: iterate all drive files and fetch thumbnails that are not yet cached."""
    # Small delay so the app finishes startup before we start crawling
    await asyncio.sleep(10)

    from utils.directoryHandler import DRIVE_DATA
    from utils.clients import get_client
    from utils.uploader import extract_thumbnail

    if DRIVE_DATA is None:
        logger.warning("refresh_missing_thumbnails: DRIVE_DATA not ready, skipping.")
        return

    def collect_files(folder):
        files = []
        for item in folder.contents.values():
            if item.type == "file":
                files.append(item)
            elif item.type == "folder":
                files.extend(collect_files(item))
        return files

    try:
        root_dir = DRIVE_DATA.get_directory("/")
        all_files = collect_files(root_dir)
    except Exception as e:
        logger.error(f"refresh_missing_thumbnails: failed to traverse drive data: {e}")
        return

    missing = [f for f in all_files if not (THUMBNAIL_DIR / f"{f.file_id}.jpg").exists()]

    if not missing:
        logger.info("refresh_missing_thumbnails: all files already have thumbnails cached.")
        return

    logger.info(f"refresh_missing_thumbnails: fetching thumbnails for {len(missing)} file(s).")

    try:
        client = get_client()
    except Exception as e:
        logger.error(f"refresh_missing_thumbnails: no client available: {e}")
        return

    refreshed = 0
    for file in missing:
        try:
            msg = await client.get_messages(STORAGE_CHANNEL, file.file_id)
            if msg and not msg.empty:
                success = await extract_thumbnail(client, msg, file.file_id)
                if success:
                    refreshed += 1
        except Exception as e:
            logger.info(f"refresh_missing_thumbnails: skipped file_id {file.file_id}: {e}")
        # Small delay to avoid hitting Telegram rate limits
        await asyncio.sleep(0.3)

    logger.info(
        f"refresh_missing_thumbnails: done. {refreshed}/{len(missing)} thumbnails refreshed."
    )


@app.post("/api/refreshThumbnails")
async def api_refresh_thumbnails(request: Request):
    """Admin endpoint to manually trigger a background thumbnail refresh."""
    from utils.clients import has_clients

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    if not has_clients():
        return JSONResponse({"status": "Telegram clients not available - Service running in offline mode"})

    asyncio.create_task(refresh_missing_thumbnails())
    return JSONResponse({"status": "ok", "message": "Thumbnail refresh started in background"})


# ── Thumbnail Endpoint ──────────────────────────────────────────────────────

@app.get("/thumbnail")
async def get_thumbnail(file_id: int):
    """Serve a cached thumbnail by Telegram message ID.
    file_id must be a positive integer (Telegram message ID)."""
    if file_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid file_id")
    # Use a safe integer-only filename to prevent path traversal
    thumb_path = (THUMBNAIL_DIR / f"{int(file_id)}.jpg").resolve()
    # Ensure the resolved path is still inside THUMBNAIL_DIR
    if not str(thumb_path).startswith(str(THUMBNAIL_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid file_id")
    if thumb_path.exists():
        return FileResponse(str(thumb_path), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Thumbnail not available")


# ── TMDB Proxy Endpoints ────────────────────────────────────────────────────

TMDB_BASE = "https://api.themoviedb.org/3"


@app.get("/api/tmdb/search")
async def tmdb_search(query: str, page: int = 1):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=503, detail="TMDB_API_KEY not configured")
    if not query or len(query) > 200:
        raise HTTPException(status_code=400, detail="Invalid query")
    url = f"{TMDB_BASE}/search/multi"
    params = {"api_key": TMDB_API_KEY, "query": query[:200], "page": page, "include_adult": "false"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="TMDB request failed")
            return JSONResponse(await resp.json())


@app.get("/api/tmdb/trending")
async def tmdb_trending(media_type: str = "all", time_window: str = "week"):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=503, detail="TMDB_API_KEY not configured")
    url = f"{TMDB_BASE}/trending/{media_type}/{time_window}"
    params = {"api_key": TMDB_API_KEY}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="TMDB request failed")
            return JSONResponse(await resp.json())


@app.get("/api/tmdb/movie/{movie_id}")
async def tmdb_movie_details(movie_id: int):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=503, detail="TMDB_API_KEY not configured")
    url = f"{TMDB_BASE}/movie/{movie_id}"
    params = {"api_key": TMDB_API_KEY, "append_to_response": "videos,credits"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="TMDB request failed")
            return JSONResponse(await resp.json())


@app.get("/api/tmdb/tv/{tv_id}")
async def tmdb_tv_details(tv_id: int):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=503, detail="TMDB_API_KEY not configured")
    url = f"{TMDB_BASE}/tv/{tv_id}"
    params = {"api_key": TMDB_API_KEY, "append_to_response": "videos,credits"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                raise HTTPException(status_code=resp.status, detail="TMDB request failed")
            return JSONResponse(await resp.json())
