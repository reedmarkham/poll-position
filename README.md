# poll-position

A monorepo for college football polling data ingestion, API, and visualization built on AWS infrastructure.

The system ingests data from the CollegeFootballData API, processes it with parallel JSON parsing using Python's `concurrent.futures`, and serves both raw and cleansed data through a serverless API and interactive visualization dashboard.

## Architecture

**Services-based monorepo** with individual packages for each component:

```
poll-position/
├── services/
│   ├── infrastructure/         # AWS CDK stacks for deployment
│   ├── ingest/                 # Data ingestion from CollegeFootballData API  
│   ├── api/                    # FastAPI backend with Lambda + API Gateway
│   └── ui/                     # Frontend visualization dashboard
├── .github/workflows/          # CI/CD automation
└── package.json                # Root workspace configuration
```

## Service Overview

### Infrastructure
AWS CDK TypeScript stacks managing:
- S3 storage for raw and processed data
- Lambda functions for serverless API
- ECS Fargate for scheduled data ingestion
- API Gateway for HTTP endpoints
- VPC networking and security

### Ingest Service
Python application that:
- Fetches raw polling data from CollegeFootballData API
- Processes deeply-nested JSON with parallel parsing
- Uploads cleansed data to S3 for downstream consumption
- Runs on scheduled ECS Fargate tasks

### API Service
FastAPI application providing:
- RESTful endpoints for polling data access
- Serverless Lambda deployment for cost efficiency
- S3 integration for data retrieval
- CORS configuration for frontend integration

### UI Service  
Vite-based frontend featuring:
- Interactive D3.js visualizations of poll rankings
- Real-time data loading from API endpoints
- Responsive design for college football analytics
- Containerized deployment on ECS Fargate

## Prerequisites

- The access key for a previously-created (i.e. via console or other stack) AWS IAM user, with a minimal policy like:
```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "iam:DeleteRole",
        "iam:DetachRolePolicy",
        "s3:*",
        "ecs:*",
        "ecr:*",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "logs:*",
        "events:*",
        "ec2:DescribeAvailabilityZones",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeRouteTables",
        "ec2:DescribeInternetGateways",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "*"
    }
  ]
}
```

- A secret in AWS Secrets Manager named `CFB_API_KEY` with JSON value:
  - `{ "CFB_API_KEY": "your-api-key" }`
- Before the GitHub Actions workflow can run, you need to add the following secrets to your repository:
1. Go to your GitHub repository.
2. Navigate to **Settings > Secrets and variables > Actions**.
3. Add the following **repository secrets**:

| Secret Name           | Description                                      |
|-----------------------|--------------------------------------------------|
| `AWS_REGION`          | The AWS region where the resources will be deployed. |
| `AWS_ACCOUNT_ID`      | Your AWS account ID.                             |
| `S3_BUCKET`           | The name of the S3 bucket where the application will upload data. |
| `AWS_ACCESS_KEY_ID`   | Your AWS access key ID (for the existing IAM user with policy above). |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret access key (also for the user above). |
| `AWS_IAM_ARN`         | The ARN for the previously-created IAM user with minimal policy. |

**Bootstrap the environment outside of CI/CD**

Make sure to use a <=10 chracter `--qualifier`:
```
export AWS_IAM_ARN = <the ARN of the IAM user with minimal policy from above>;
export S3_BUCKET = <whatever bucket name you will like>;

npx cdk bootstrap \
  --toolkit-stack-name CDKToolkit-poll-position \
  --qualifier pollpstn \
  aws://<AWS_ACCOUNT_ID>/<AWS_REGION>
```
Then update the `cdk.json` accordingly:

```
{
  "app": "npx ts-node --prefer-ts-exts bin/poll-position.ts",
  "context": {
    "aws:cdk:bootstrap-qualifier": "pollpstn"
  }
}
```

## CI/CD Pipeline

GitHub Actions workflow automatically handles:

### Build Process
- **Workspace Dependencies**: Install npm workspace dependencies
- **Service Building**: Build all services in parallel
- **Container Images**: Build and push Docker images for ingest and UI services
- **Lambda Packaging**: Package API service for Lambda deployment

### Deployment Process  
- **Infrastructure**: Deploy CDK stacks for main application and UI
- **API Gateway**: Deploy serverless API endpoints
- **ECS Services**: Deploy containerized ingest and visualization services
- **Cross-service Integration**: Configure service discovery via CDK outputs

### Execution

The ingest service runs automatically every Monday at 12:00 PM UTC via ECS scheduled tasks. Manual execution available through AWS CLI or console using the provided CloudFormation outputs.

## Development

```bash
# Install dependencies
npm install

# Build specific service
npm run build:api
npm run build:infrastructure  
npm run build:ui

# Deploy infrastructure
npm run deploy

# Run UI development server
npm run dev:ui
```