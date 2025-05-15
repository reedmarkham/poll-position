# 🏈 poll-position

This project uses AWS CDK to deploy an AWS Fargate task, S3 bucket, and other requisite infrastructure to ingest raw data from CollegeFootballData API to S3 using a containerized process. 

It also produces a "cleansed" JSON merging the raw files using `polars` to be used downstream in a dashboard app that visualizes the college football rankings alongside other team metadata.

Parsing the deeply-nested raw JSON files is done in parallelized fashion using Python's standard library `concurrent.futures`.

## 📁 Folder Structure

```
poll-position/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions workflow for CI/CD
├── bin/
│   └── poll-position.ts            # CDK entrypoint
├── lib/
│   └── poll-position-stack.ts      # CDK stack definition (S3, VPC, ECS, Fargate, Logs, Secrets, etc.)
├── app/
│   ├── main.py                     # Python app to get raw data from API and upload to S3
│   ├── Dockerfile                  # Dockerfile for containerizing the app
│   └── requirements.txt            # Python dependencies for the app
├── package.json                    # NPM dependencies for CDK
├── tsconfig.json                   # TypeScript configuration
├── cdk.json                        # CDK app configuration
└── cdk.context.json                # CDK context for environment-specific configurations (auto-generated)
```

## 🔐 Prerequisites

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

## CI/CD

On every commit to the `main` branch, the following steps are automatically performed:

1. Install dependencies.
2. Build and push the Docker image to Amazon ECR.
3. Deploy the CDK stack.

### Execution

Ensure the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) is installed and configured with credentials that have sufficient permissions.

After deployment, you'll see a `CfnOutput` that prints a full `aws ecs run-task` CLI command. Use this to run the ECS task on demand.

Example:

```bash
aws ecs run-task \
  --cluster YOUR_CLUSTER_NAME \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-abc123],securityGroups=[],assignPublicIp=ENABLED}" \
  --task-definition YOUR_TASK_DEF_ARN
```

Alternatively, use the AWS console to find the task and trigger it in the UI.

## Scheduled Execution

The task is configured to run automatically every Monday at 12:00 PM UTC (8:00 AM ET).