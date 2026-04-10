from dotenv import load_dotenv
import os

# Load environment variables from the .env file, if present
load_dotenv()

# Telegram API credentials obtained from https://my.telegram.org/auth
API_ID = int(os.getenv("API_ID"))  # Your Telegram API ID
API_HASH = os.getenv("API_HASH")  # Your Telegram API Hash

# List of Telegram bot session file names (e.g., "bot.session,bot2.session")
# Session files should be in cache directory. Pyrogram will use them if they exist.
BOT_SESSIONS = os.getenv("BOT_SESSIONS", "").strip(", ").split(",")
BOT_SESSIONS = [session.strip() for session in BOT_SESSIONS if session.strip() != ""]

# List of Telegram bot tokens - used with session files (if session file doesn't exist, token creates it)
# If BOT_SESSIONS is empty, BOT_TOKENS will be used directly
BOT_TOKENS = os.getenv("BOT_TOKENS", "").strip(", ").split(",")
BOT_TOKENS = [token.strip() for token in BOT_TOKENS if token.strip() != ""]

# List of Telegram Account Pyrogram String Sessions used for file upload/download operations (optional)
STRING_SESSIONS = os.getenv("STRING_SESSIONS", "").strip(", ").split(",")
STRING_SESSIONS = [
    session.strip() for session in STRING_SESSIONS if session.strip() != ""
]

# Chat ID of the Telegram storage channel where files will be stored
STORAGE_CHANNEL = int(os.getenv("STORAGE_CHANNEL"))  # Your storage channel's chat ID

# Message ID of a file in the storage channel used for storing database backups
# Telegram message IDs are 32-bit signed integers (max 2,147,483,647)
DATABASE_BACKUP_MSG_ID_STR = os.getenv("DATABASE_BACKUP_MSG_ID", "").strip()
if DATABASE_BACKUP_MSG_ID_STR:
    try:
        DATABASE_BACKUP_MSG_ID = int(DATABASE_BACKUP_MSG_ID_STR)
        # Validate message ID is within Telegram's valid range (1 to 2^31-1)
        if DATABASE_BACKUP_MSG_ID < 1:
            raise ValueError(f"DATABASE_BACKUP_MSG_ID ({DATABASE_BACKUP_MSG_ID}) must be >= 1")
        if DATABASE_BACKUP_MSG_ID > 2147483647:
            raise ValueError(f"DATABASE_BACKUP_MSG_ID ({DATABASE_BACKUP_MSG_ID}) exceeds maximum (2147483647). Telegram message IDs are 32-bit signed integers.")
    except ValueError as e:
        if "invalid literal" in str(e) or "could not convert" in str(e):
            raise ValueError(f"Invalid DATABASE_BACKUP_MSG_ID: '{DATABASE_BACKUP_MSG_ID_STR}'. Must be a valid integer.")
        raise
else:
    # Default to 1 if not set (will create new backup message on first upload)
    DATABASE_BACKUP_MSG_ID = 1

# Password used to access the website's admin panel
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")  # Default to "admin" if not set

# Determine the maximum file size (in bytes) allowed for uploading to Telegram
# String sessions support up to 4GB (if Premium), bot sessions/tokens limited to 2GB
if len(STRING_SESSIONS) > 0:
    MAX_FILE_SIZE = 3.98 * 1024 * 1024 * 1024  # 4 GB in bytes (with Premium)
else:
    MAX_FILE_SIZE = 1.98 * 1024 * 1024 * 1024  # 2 GB in bytes (bot sessions/tokens)

# Database backup interval in seconds. Backups will be sent to the storage channel at this interval
DATABASE_BACKUP_TIME = int(
    os.getenv("DATABASE_BACKUP_TIME", 60)
)  # Default to 60 seconds

# Time delay in seconds before retrying after a Telegram API floodwait error
SLEEP_THRESHOLD = int(os.getenv("SLEEP_THRESHOLD", 60))  # Default to 60 seconds

# Domain to auto-ping and keep the website active
WEBSITE_URL = os.getenv("WEBSITE_URL", None)


# TMDB API Key for the Movies/TV browser feature
# Get your free API key from https://www.themoviedb.org/settings/api
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")

# For Using TG Drive's Bot Mode

# Main Bot Token for TG Drive's Bot Mode
MAIN_BOT_TOKEN = os.getenv("MAIN_BOT_TOKEN", "")
if MAIN_BOT_TOKEN.strip() == "":
    MAIN_BOT_TOKEN = None

# List of Telegram User IDs who have admin access to the bot mode
TELEGRAM_ADMIN_IDS = os.getenv("TELEGRAM_ADMIN_IDS", "").strip(", ").split(",")
TELEGRAM_ADMIN_IDS = [int(id) for id in TELEGRAM_ADMIN_IDS if id.strip() != ""]
