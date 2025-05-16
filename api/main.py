from fastapi import FastAPI
import boto3
import os
import json

app = FastAPI()
s3 = boto3.client("s3", region_name="us-east-1")

BUCKET = os.getenv("S3_BUCKET")
PREFIX = "cleansed/poll_"
SUFFIX = ".json"

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/api/latest-poll")
def latest_poll():
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
    rows = []
    for i in range(len(columns[0]["values"])):
        row = {col["name"]: col["values"][i] for col in columns}
        rows.append(row)

    return rows
