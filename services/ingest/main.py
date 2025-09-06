# This script fetches data from the CollegeFootballData API and uploads it to an S3 bucket. 
# Then the raw files on S3 are joined using polars and the output is also uploaded to S3.

import os, json
from datetime import datetime, timezone
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Dict, List, Optional, TypedDict

import requests, boto3, polars as pl

API_KEY: Optional[str] = os.getenv("CFB_API_KEY")
BUCKET: Optional[str] = os.getenv("S3_BUCKET")
YEAR: int = int(os.getenv("SEASON_START_YEAR", "2024"))
TIMESTAMP: str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")

s3 = boto3.client("s3")

# Type definitions for API responses
class RankDict(TypedDict, total=False):
    school: str
    rank: int
    conference: str
    firstPlaceVotes: int
    points: int

class PollDict(TypedDict, total=False):
    poll: str
    ranks: List[RankDict]

class SeasonDict(TypedDict, total=False):
    season: int
    seasonType: str
    week: int
    polls: List[PollDict]

class TeamDict(TypedDict, total=False):
    id: int
    school: str
    mascot: str
    abbreviation: str
    alt_name1: str
    alt_name2: str
    alt_name3: str
    conference: str
    division: str
    classification: str
    color: str
    alt_color: str
    logos: List[str]

class FlattenedRow(TypedDict, total=False):
    season: int
    seasonType: str
    week: int
    poll: str
    school: str
    rank: int
    conference: str
    firstPlaceVotes: int
    points: int

def fetch_and_upload_data(endpoint: str, params: Dict[str, int], s3_key_prefix: str, year: int) -> None:
    """
    :param endpoint: API endpoint to query
    :param params: Query parameters for the API request
    :param s3_key_prefix: Prefix for the S3 key
    """
    response = requests.get(
        endpoint,
        headers={"Authorization": f"Bearer {API_KEY}"},
        params=params
    )
    response.raise_for_status()
    data = response.json()
    s3_key: str = f"{year}/{s3_key_prefix}_{TIMESTAMP}.json"
    s3.put_object(Bucket=BUCKET, Key=s3_key, Body=json.dumps(data))
    print(f"Data successfully uploaded to s3://{BUCKET}/{s3_key}")

def get_latest_s3_key(prefix: str, year: int) -> str:
    """Get the latest S3 key for a given prefix."""
    full_prefix = f"{year}/{prefix}"
    response = s3.list_objects_v2(Bucket=BUCKET, Prefix=full_prefix)
    if "Contents" not in response:
        raise FileNotFoundError(f"No files found with prefix {full_prefix}")
    latest = max(response["Contents"], key=lambda x: x["LastModified"])
    return latest["Key"]

def read_json_from_s3(key: str) -> List[Dict[str, Any]]:
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    return json.load(obj["Body"])

def flatten_season(season: SeasonDict) -> List[FlattenedRow]:
    rows: List[FlattenedRow] = []
    for poll in season.get("polls", []):
        poll_name = poll.get("poll")
        for rank in poll.get("ranks", []):
            row: FlattenedRow = {
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

def flatten_rankings(rankings_data: List[SeasonDict]) -> pl.DataFrame:
    with ProcessPoolExecutor() as executor:
        results: List[List[FlattenedRow]] = list(executor.map(flatten_season, rankings_data))
    # Flatten the list of lists
    all_rows: List[FlattenedRow] = [row for sublist in results for row in sublist]
    return pl.DataFrame(all_rows)


def merge_and_write(s3_key_prefix: str, year: int) -> None:
    rankings_key: str = get_latest_s3_key("raw/rankings_", year)
    teams_key: str = get_latest_s3_key("raw/teams_", year)
    rankings_data: List[SeasonDict] = read_json_from_s3(rankings_key)
    teams_data: List[TeamDict] = read_json_from_s3(teams_key)
    rankings_df: pl.DataFrame = flatten_rankings(rankings_data)
    teams_df: pl.DataFrame = pl.DataFrame(teams_data)
    merged: pl.DataFrame = rankings_df.join(teams_df, on="school", how="left")
    out_key: str = f"{year}/{s3_key_prefix}_{TIMESTAMP}.json"
    s3.put_object(
        Bucket=BUCKET,
        Key=out_key,
        Body=merged.write_json()
    )
    print(f"Merged data written to s3://{BUCKET}/{out_key}")

def main() -> None:
    datasets: List[Dict[str, str]] = [
        {"endpoint": "https://api.collegefootballdata.com/rankings", "s3_key_prefix": "raw/rankings"},
        {"endpoint": "https://api.collegefootballdata.com/teams", "s3_key_prefix": "raw/teams"}
    ]

    for dataset in datasets:
        fetch_and_upload_data(
            endpoint=dataset["endpoint"],
            params={"year": YEAR},
            s3_key_prefix=dataset["s3_key_prefix"],
            year=YEAR
        )

    merge_and_write('cleansed/poll', YEAR)

if __name__ == "__main__":
    main()