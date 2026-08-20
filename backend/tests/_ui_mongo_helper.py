#!/usr/bin/env python3
"""Helper for UI tests: fetch verify code or cleanup a test user."""
import sys, asyncio, os, hashlib
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

async def fetch(email, purpose):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for _ in range(25):
        u = await db.users.find_one({"email": email})
        if u:
            rec = await db.user_verification_codes.find_one(
                {"user_id": u["user_id"], "purpose": purpose, "consumed": False},
                sort=[("created_at", -1)])
            if rec:
                target = rec["code_hash"]
                for n in range(1_000_000):
                    if hashlib.sha256(f"{n:06d}".encode()).hexdigest() == target:
                        print(f"{n:06d}"); return
        await asyncio.sleep(0.3)
    print("")

async def cleanup(email):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    u = await db.users.find_one({"email": email})
    if u:
        uid = u["user_id"]
        for c in ("users","user_sessions","user_verification_codes","bookmarks","history"):
            await db[c].delete_many({"user_id": uid})
    await db.login_attempts.delete_many({"key": f"email:{email}"})
    print("OK")

if __name__ == "__main__":
    action = sys.argv[1]
    email = sys.argv[2]
    purpose = sys.argv[3] if len(sys.argv) > 3 else "verify"
    if action == "fetch":
        asyncio.run(fetch(email, purpose))
    else:
        asyncio.run(cleanup(email))
