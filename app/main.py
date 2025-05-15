# This script fetches data from the CollegeFootballData API and uploads it to an S3 bucket. 
# Then the raw files on S3 are joined using polars and the output is also uploaded to S3.

# Standard library imports
import os
from datetime import datetime, timezone
import json
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Dict, List, Optional

# Third-party library imports
import requests
import boto3
import polars as pl

# Set downstream variables
API_KEY: Optional[str] = os.getenv("CFB_API_KEY")
BUCKET: Optional[str] = os.getenv("S3_BUCKET")
YEAR: int = 2024

# Initialize S3 client
s3 = boto3.client("s3")

# Generate a timestamp for unique S3 keys
timestamp: str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")

def fetch_and_upload_data(endpoint: str, params: Dict[str, Any], s3_key_prefix: str) -> None:
    """
    Fetch data from the API and upload it to S3.

    :param endpoint: API endpoint to query
    :param params: Query parameters for the API request
    :param s3_key_prefix: Prefix for the S3 key
    """
    # Query the API
    response = requests.get(
        endpoint,
        headers={"Authorization": f"Bearer {API_KEY}"},
        params=params
    )
    response.raise_for_status()
    data = response.json()

    # Generate a unique S3 key
    s3_key: str = f"raw/{s3_key_prefix}_{timestamp}.json"

    # Upload data to S3
    s3.put_object(Bucket=BUCKET, Key=s3_key, Body=str(data))

    print(f"Data successfully uploaded to s3://{BUCKET}/raw/{s3_key}")

def get_latest_s3_key(prefix: str) -> str:
    """Get the latest S3 key for a given prefix."""
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    if "Contents" not in response:
        raise FileNotFoundError(f"No files found with prefix {prefix}")
    latest = max(response["Contents"], key=lambda x: x["LastModified"])
    return latest["Key"]

def read_json_from_s3(key: str) -> Any:
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    return json.load(obj["Body"])

def flatten_season(season: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for poll in season.get("polls", []):
        poll_name = poll.get("poll")
        for rank in poll.get("ranks", []):
            row = {
                "season": season.get("season"),
                "seasonType": season.get("seasonType"),
                "week": season.get("week"),
                "poll": poll_name,
                "school": rank.get("school"),
                "rank": rank.get("rank"),
                "conference": rank.get("conference"),
                "firstPlaceVotes": rank.get("firstPlaceVotes"),
                "points": rank.get("points"),
            }
            rows.append(row)
    return rows

def flatten_rankings(rankings_data: List[Dict[str, Any]]) -> pl.DataFrame:
    with ProcessPoolExecutor() as executor:
        results: List[List[Dict[str, Any]]] = list(executor.map(flatten_season, rankings_data))
    # Flatten the list of lists
    all_rows: List[Dict[str, Any]] = [row for sublist in results for row in sublist]
    return pl.DataFrame(all_rows)

def flatten_teams(data: Any) -> Any:
    # If teams data is a list of dicts, this will work:
    return data

def merge_and_write_polars() -> None:
    # 1. Get latest files
    rankings_key: str = get_latest_s3_key("raw/rankings_")
    teams_key: str = get_latest_s3_key("raw/teams_")

    # 2. Read and flatten
    rankings_data: List[Dict[str, Any]] = read_json_from_s3(rankings_key)
    teams_data: Any = read_json_from_s3(teams_key)
    rankings_df: pl.DataFrame = flatten_rankings(rankings_data)
    teams_df: pl.DataFrame = pl.DataFrame(flatten_teams(teams_data))

    # 3. Merge on 'school'
    merged: pl.DataFrame = rankings_df.join(teams_df, on="school", how="left")

    # 4. Write to S3 as cleansed/poll_<timestamp>.json
    out_key: str = f"cleansed/poll_{timestamp}.json"
    s3.put_object(
        Bucket=BUCKET,
        Key=out_key,
        Body=merged.write_json()
    )
    print(f"Merged data written to s3://{BUCKET}/{out_key}")

# Define the datasets to fetch and upload
datasets: List[Dict[str, Any]] = [
    {"endpoint": "https://api.collegefootballdata.com/rankings", "s3_key_prefix": "rankings"},
    {"endpoint": "https://api.collegefootballdata.com/teams", "s3_key_prefix": "teams"}
    ]

# Loop through the datasets and fetch/upload data specific to the year 2024
for dataset in datasets:
    fetch_and_upload_data(
        endpoint=dataset["endpoint"],
        params={"year": YEAR},
        s3_key_prefix=dataset["s3_key_prefix"]
    )

# Merge and write the data
merge_and_write_polars()