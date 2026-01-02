import asyncio, config
import traceback
from pathlib import Path
from pyrogram import Client
from pyrogram.errors import AuthKeyDuplicated
from utils.directoryHandler import backup_drive_data, loadDriveData
from utils.logger import Logger

logger = Logger(__name__)

multi_clients = {}
premium_clients = {}
work_loads = {}
premium_work_loads = {}
main_bot = None


async def initialize_clients():
    global multi_clients, work_loads, premium_clients, premium_work_loads
    logger.info("Initializing Clients")

    session_cache_path = Path(f"./cache")
    session_cache_path.parent.mkdir(parents=True, exist_ok=True)

    # Log configuration for debugging
    logger.info(f"BOT_SESSIONS configured: {len(config.BOT_SESSIONS)} session(s)")
    logger.info(f"BOT_TOKENS configured: {len(config.BOT_TOKENS)} token(s)")
    if config.BOT_SESSIONS:
        logger.info(f"BOT_SESSIONS: {config.BOT_SESSIONS}")
    if config.BOT_TOKENS:
        logger.info(f"BOT_TOKENS: {len(config.BOT_TOKENS[0]) if config.BOT_TOKENS else 0} chars (hidden)")

    # Use BOT_SESSIONS as Client names (if provided), otherwise use client_id
    # Match BOT_SESSIONS with BOT_TOKENS
    all_bot_sessions = dict((i, s) for i, s in enumerate(config.BOT_SESSIONS, start=1))
    all_tokens = dict((i, t) for i, t in enumerate(config.BOT_TOKENS, start=1))
    
    # Check if BOT_TOKENS is empty
    if not all_tokens:
        logger.error("BOT_TOKENS is empty! You must provide BOT_TOKENS in environment variables.")
        logger.error("BOT_SESSIONS alone cannot work - Pyrogram requires bot_token for bot clients.")
        return False
    
    # Match sessions with tokens
    if all_bot_sessions:
        if len(all_bot_sessions) != len(all_tokens):
            logger.warning(f"BOT_SESSIONS count ({len(all_bot_sessions)}) doesn't match BOT_TOKENS count ({len(all_tokens)})")
            min_len = min(len(all_bot_sessions), len(all_tokens))
            all_bot_sessions = dict(list(all_bot_sessions.items())[:min_len])
            all_tokens = dict(list(all_tokens.items())[:min_len])
        # Zip sessions and tokens
        bot_configs = dict((i, (session, token)) for i, (session, token) in 
                          enumerate(zip(all_bot_sessions.values(), all_tokens.values()), start=1))
    else:
        # No BOT_SESSIONS, use client_id as name
        bot_configs = dict((i, (None, token)) for i, token in all_tokens.items())
    
    all_string_sessions = dict(
        (i, s) for i, s in enumerate(config.STRING_SESSIONS, start=len(bot_configs) + 1)
    )

    async def start_client(client_id, session_name_and_token, type):
        try:
            logger.info(f"Starting - {type.title()} Client {client_id}")

            if type == "bot":
                # Get session name and token
                session_name, token = session_name_and_token
                
                # Use session name as Client name (remove .session extension if present)
                # If no session name, use client_id
                if session_name:
                    client_name = session_name.replace(".session", "")
                else:
                    client_name = str(client_id)
                
                # Pyrogram will use existing session file if it exists in cache/, or create new one
                client = Client(
                    name=client_name,
                    api_id=config.API_ID,
                    api_hash=config.API_HASH,
                    bot_token=token,
                    workdir=session_cache_path,
                )
                client.loop = asyncio.get_running_loop()
                try:
                    await client.start()
                    await client.send_message(
                        config.STORAGE_CHANNEL,
                        f"Started - Bot Client {client_id}",
                    )
                    multi_clients[client_id] = client
                    work_loads[client_id] = 0
                except AuthKeyDuplicated as e:
                    # Delete the invalidated session file and mark it as invalidated
                    session_file = None
                    try:
                        session_file = session_cache_path / f"{client_name}.session"
                        if session_file.exists():
                            session_file.unlink()
                            logger.info(f"Deleted invalidated session file: {session_file}")
                            # Create a marker file so we don't restore this session on next restart
                            invalidated_marker = session_cache_path / f"{client_name}.session.invalidated"
                            invalidated_marker.touch()
                            logger.info(f"Marked session file as invalidated: {invalidated_marker}")
                    except Exception as cleanup_error:
                        logger.error(f"Failed to delete session file: {cleanup_error}")
                    
                    error_msg = (
                        f"\n{'='*60}\n"
                        f"AUTH_KEY_DUPLICATED for Bot Client {client_id}\n"
                        f"{'='*60}\n"
                        f"CRITICAL: The same bot token is being used in MULTIPLE places simultaneously.\n"
                        f"Telegram has invalidated the session file for security reasons.\n\n"
                        f"✅ Session file has been deleted: {session_file if session_file else 'N/A'}\n\n"
                        f"⚠️  TO FIX THIS:\n"
                        f"   1. STOP using this bot token in ALL other locations (local servers, other Spaces, etc.)\n"
                        f"   2. Wait a few seconds for the other instance to disconnect\n"
                        f"   3. Restart this application (the session file will be recreated automatically)\n\n"
                        f"📌 REMEMBER: Each bot token can only be used in ONE place at a time!\n"
                        f"{'='*60}"
                    )
                    logger.error(error_msg)
                    logger.error(f"Error details: {e}")
                    
                    # Don't re-raise - let the client fail gracefully and app continue in offline mode
                    return
            elif type == "string_session":
                # Use string session (user account)
                session_string = session_name_and_token  # For string sessions, it's just the string
                client = await Client(
                    name=str(client_id),
                    api_id=config.API_ID,
                    api_hash=config.API_HASH,
                    session_string=session_string,
                    sleep_threshold=config.SLEEP_THRESHOLD,
                    workdir=session_cache_path,
                    no_updates=True,
                ).start()
                await client.send_message(
                    config.STORAGE_CHANNEL,
                    f"Started - String Session Client {client_id}",
                )
                premium_clients[client_id] = client
                premium_work_loads[client_id] = 0

            logger.info(f"Started - {type.title()} Client {client_id}")
        except Exception as e:
            error_msg = str(e) if str(e) else repr(e)
            error_trace = traceback.format_exc()
            logger.error(
                f"Failed To Start {type.title()} Client - {client_id} Error: {error_msg}"
            )
            logger.error(f"Traceback: {error_trace}")

    # Start bot clients and string session clients
    await asyncio.gather(
        *(
            [
                start_client(client_id, (session_name, token), "bot")
                for client_id, (session_name, token) in bot_configs.items()
            ]
            + [
                start_client(client_id, session, "string_session")
                for client_id, session in all_string_sessions.items()
            ]
        )
    )
    
    clients_initialized = len(multi_clients) > 0
    
    if not clients_initialized:
        logger.warning("No Clients Were Initialized - Website will run in offline mode")
        logger.warning("Please configure BOT_TOKENS (and optionally BOT_SESSIONS) in your environment variables")
        return False

    logger.info("Clients Initialized")

    # Load the drive data
    await loadDriveData()

    # Start the backup drive data task
    asyncio.create_task(backup_drive_data())
    
    return True


def has_clients():
    """Check if any clients are available"""
    global multi_clients
    return len(multi_clients) > 0


def get_client(premium_required=False) -> Client:
    global multi_clients, work_loads, premium_clients, premium_work_loads

    if premium_required:
        if not premium_work_loads:
            raise RuntimeError("No Premium Clients Available")
        index = min(premium_work_loads, key=premium_work_loads.get)
        premium_work_loads[index] += 1
        return premium_clients[index]

    if not work_loads:
        raise RuntimeError("No Clients Available - Check BOT_TOKENS/BOT_SESSIONS configuration")
    index = min(work_loads, key=work_loads.get)
    work_loads[index] += 1
    return multi_clients[index]
