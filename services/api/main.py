import os, json
from typing import Optional

import boto3
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

app = FastAPI()
s3 = boto3.client("s3", region_name="us-east-1")

BUCKET = os.getenv("S3_BUCKET")
PREFIX = "cleansed"
SUFFIX = ".json"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("UI_URL", "http://localhost:3000")
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/api/latest-poll")
def latest_poll(season: Optional[int] = Query(None, description="Season year to filter by")):
    try:
        if not BUCKET:
            return {"error": "S3_BUCKET environment variable not set"}

        # Use season-specific path if provided, otherwise search all seasons
        path_to_poll_data = f"{PREFIX}/{season}/poll_" if season else f"{PREFIX}/"
        files = s3.list_objects_v2(Bucket=BUCKET, Prefix=path_to_poll_data).get("Contents", [])
        poll_files = [f for f in files if "poll_" in f["Key"] and f["Key"].endswith(SUFFIX)]

        if not poll_files:
            return {"error": "No poll data found"}

        latest_file = sorted(poll_files, key=lambda f: f["LastModified"], reverse=True)[0]["Key"]
        obj = s3.get_object(Bucket=BUCKET, Key=latest_file)
        raw_data = json.loads(obj["Body"].read().decode("utf-8"))

        if "columns" not in raw_data:
            return raw_data

        columns = raw_data["columns"]
        num_rows = max(len(col["values"]) for col in columns)

        rows = []
        for i in range(num_rows):
            row = {}
            for col in columns:
                name = col["name"]
                values = col["values"]
                row[name] = values[i] if i < len(values) else None
            rows.append(row)
        
        return {"season": season, "data": rows} if season else rows

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/api/polls/{season}")
def get_season_polls(season: int):
    """Get all polls for a specific season"""
    try:
        if not BUCKET:
            return {"error": "S3_BUCKET environment variable not set"}

        path_to_poll_data = f"{PREFIX}/{season}/poll_"
        files = s3.list_objects_v2(Bucket=BUCKET, Prefix=path_to_poll_data).get("Contents", [])
        poll_files = [f for f in files if f["Key"].endswith(SUFFIX)]

        if not poll_files:
            return {"error": f"No poll data found for season {season}"}

        # Return metadata about available files
        file_info = [{
            "key": f["Key"],
            "lastModified": f["LastModified"].isoformat(),
            "size": f["Size"]
        } for f in poll_files]
        
        return {"season": season, "files": file_info}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/api/seasons")
def get_available_seasons():
    """Get list of available seasons"""
    try:
        if not BUCKET:
            return {"error": "S3_BUCKET environment variable not set"}

        response = s3.list_objects_v2(Bucket=BUCKET, Prefix=f"{PREFIX}/", Delimiter="/")
        
        seasons = []
        for prefix in response.get('CommonPrefixes', []):
            # Extract year from prefix like "cleansed/2024/"
            path_parts = prefix['Prefix'].strip('/').split('/')
            if len(path_parts) >= 2 and path_parts[1].isdigit():
                seasons.append(int(path_parts[1]))
        
        return {"seasons": sorted(seasons, reverse=True)}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

# Lambda handler
handler = Mangum(app)
