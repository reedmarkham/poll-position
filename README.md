# poll-position

A monorepo for college football polling data ingestion, API, and visualization built on AWS infrastructure.

The system ingests data from the CollegeFootballData API, processes it with parallel JSON parsing using Python's `concurrent.futures`, and serves both raw and cleansed data through a serverless API and interactive visualization dashboard.

## Architecture

**Services-based monorepo** with serverless and containerized components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                AWS Cloud                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │   ECS Fargate    │    │     Lambda      │    │      ECS Fargate        │ │
│  │                  │    │                 │    │                         │ │
│  │  ┌─────────────┐ │    │  ┌────────────┐ │    │  ┌─────────────────────┐ │ │
│  │  │   Ingest    │ │    │  │    API     │ │    │  │   Visualization     │ │ │
│  │  │   Service   │ │    │  │  Service   │ │    │  │     Service         │ │ │
│  │  │             │ │    │  │            │ │    │  │                     │ │ │
│  │  │ Python App  │ │    │  │  FastAPI + │ │    │  │   Vite + D3.js      │ │ │
│  │  │ Scheduled   │ │    │  │   Mangum   │ │    │  │   Visualization     │ │ │
│  │  └─────────────┘ │    │  └────────────┘ │    │  └─────────────────────┘ │ │
│  └────────┬─────────┘    └─────────┬───────┘    └─────────────────────────┘ │
│           │                        │                          │             │
│           │              ┌─────────▼─────────┐                │             │
│           │              │   API Gateway     │                │             │
│           │              │                   │                │             │
│           │              │ REST Endpoints    │                │             │
│           │              │ CORS Config       │                │             │
│           │              └───────────────────┘                │             │
│           │                        │                          │             │
│           │              ┌─────────▼─────────┐                │             │
│           │              │ Application Load  │                │             │
│           │              │    Balancer       │◄───────────────┘             │
│           │              └───────────────────┘                              │
│           │                        │                                        │
│  ┌────────▼────────────────────────▼────────────────────────────────────────┤
│  │                            S3 Bucket                                     │
│  │                                                                          │
│  │  Raw Data ──► Processed Data ──► Frontend Assets                        │
│  └──────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┤
│  │                      Supporting Services                                 │
│  │                                                                          │
│  │  VPC • CloudWatch Logs • Secrets Manager • ECR                          │
│  └──────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions CI/CD                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Build Container Images → Deploy Lambda → Deploy Infrastructure            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Services directory structure**:

```
poll-position/
├── services/
│   ├── infrastructure/         # AWS CDK stacks for deployment
│   │   ├── bin/
│   │   │   ├── poll-position.ts       # Main CDK app entry
│   │   │   └── poll-position-visualization.ts    # Visualization stack entry
│   │   ├── lib/
│   │   │   ├── poll-position-stack.ts     # Main infrastructure (S3, Lambda, ECS)
│   │   │   └── poll-position-visualization-stack.ts  # Visualization infrastructure (Fargate, ALB)
│   │   ├── package.json        # CDK dependencies
│   │   └── tsconfig.json       # TypeScript configuration
│   ├── ingest/                 # Data ingestion service
│   │   ├── main.py             # Python ingestion logic
│   │   ├── Dockerfile          # Container configuration
│   │   ├── requirements.txt    # Python dependencies
│   │   └── package.json        # Service metadata
│   ├── api/                    # FastAPI Lambda service
│   │   ├── main.py             # FastAPI app with Lambda handler
│   │   ├── requirements.txt    # Python dependencies (includes mangum)
│   │   └── package.json        # Service metadata
│   └── visualization/          # Frontend visualization dashboard
│       ├── src/
│       │   ├── index.ts        # Main application entry
│       │   ├── components/     # D3.js visualization components
│       │   └── utils/          # S3 data loading utilities
│       ├── index.html          # HTML template
│       ├── Dockerfile          # Container configuration  
│       ├── package.json        # Vite and dependencies
│       └── tsconfig.json       # TypeScript configuration
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline for all services
├── package.json                # Root workspace configuration
└── README.md                   # This documentation
```

## Service Overview

### Infrastructure
AWS CDK TypeScript stacks managing:
- S3 storage for raw and processed data
- Lambda functions for serverless API
- ECS Fargate for scheduled data ingestion
- API Gateway for HTTP endpoints
- VPC networking and security

### Ingest service
Python application that:
- Fetches raw polling data from CollegeFootballData API
- Processes deeply-nested JSON with parallel parsing
- Uploads cleansed data to S3 for downstream consumption
- Runs on scheduled ECS Fargate tasks

### API
FastAPI application providing:
- RESTful endpoints for polling data access
- Serverless Lambda deployment for cost efficiency
- S3 integration for data retrieval
- CORS configuration for frontend integration

### Visualization tool  
Vite-based frontend featuring:
- Interactive D3.js visualizations of poll rankings
- Real-time data loading from API endpoint
- Containerized deployment on ECS Fargate

## Prerequisites

- An AWS IAM user with programmatic access and least-privilege permissions. Use the comprehensive IAM policy provided in [`iam-policy.json`](./iam-policy.json) which includes:
  - **CloudFormation**: Stack management for CDK deployments
  - **Lambda**: Function creation and management for serverless API
  - **API Gateway**: REST API creation and configuration
  - **ECS/ECR**: Container orchestration and registry access
  - **S3**: Bucket and object management for data storage
  - **VPC/Security**: Network infrastructure and security groups
  - **CloudWatch Logs**: Log group management
  - **Secrets Manager**: Access to CFB API key

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

Make sure to use a <=10 character `--qualifier`:
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
- **Container Images**: Build and push Docker images for ingest and visualization services
- **Lambda Packaging**: Package API service for Lambda deployment

### Deployment Process  
- **Infrastructure**: Deploy CDK stacks for main application and visualization
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
npm run build:visualization

# Deploy infrastructure
npm run deploy

# Run visualization development server
npm run dev:visualization
```