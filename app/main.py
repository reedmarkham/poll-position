# This script fetches data from the CollegeFootballData API and uploads it to an S3 bucket

# Standard library imports
import os
from datetime import datetime, timezone

# Third-party library imports
import requests
import boto3

# Get environment variables and set others for script
API_KEY = os.getenv("CFB_API_KEY")
BUCKET = os.getenv("S3_BUCKET")
YEAR = 2024

# Initialize S3 client
s3 = boto3.client("s3")

# Generate a timestamp for unique S3 keys
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")

def fetch_and_upload_data(endpoint, params, s3_key_prefix):
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
    s3_key = f"{s3_key_prefix}_{timestamp}.json"

    # Upload data to S3
    s3.put_object(Bucket=BUCKET, Key=s3_key, Body=str(data))

    print(f"Data successfully uploaded to s3://{BUCKET}/{s3_key}")

# Define the datasets to fetch and upload
datasets = [
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