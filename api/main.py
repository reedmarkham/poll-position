from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import boto3
import os
import json

app = FastAPI()
s3 = boto3.client("s3", region_name="us-east-1")

BUCKET = os.getenv("S3_BUCKET")
PREFIX = "cleansed/poll_"
SUFFIX = ".json"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://pollpo-pollp-2ndyfzh7dezn-2006059404.us-east-1.elb.amazonaws.com"
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/api/latest-poll")
def latest_poll():
    try:
        if not BUCKET:
            return {"error": "S3_BUCKET environment variable not set"}

        files = s3.list_objects_v2(Bucket=BUCKET, Prefix=PREFIX).get("Contents", [])
        poll_files = [f for f in files if f["Key"].endswith(SUFFIX)]

        if not poll_files:
            return {"error": "No poll data found"}

        latest_file = sorted(poll_files, key=lambda f: f["LastModified"], reverse=True)[0]["Key"]
        obj = s3.get_object(Bucket=BUCKET, Key=latest_file)
        raw_data = json.loads(obj["Body"].read().decode("utf-8"))

        if "columns" not in raw_data:
            return raw_data

        columns = raw_data["columns"]
        num_rows = min(len(col["values"]) for col in columns)
        rows = [
            {col["name"]: col["values"][i] for col in columns if i < len(col["values"])}
            for i in range(num_rows)
        ]

        return rows

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
