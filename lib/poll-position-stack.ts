
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class PollPositionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new cdk.DefaultStackSynthesizer({
        qualifier: 'pollpstn',
      }),
      tags: {
        Project: 'poll-position',
        Environment: 'production',
        CostCenter: 'sports-analytics',
        Owner: 'poll-position-team',
        Application: 'college-football-polling',
      },
    });

    const vpc = new ec2.Vpc(this, 'PollPositionVpc', { 
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 18,
        },
      ],
    });
    cdk.Tags.of(vpc).add('Name', 'poll-position-vpc');
    cdk.Tags.of(vpc).add('Component', 'networking');
    const cluster = new ecs.Cluster(this, 'PollPositionCluster', { vpc });
    cdk.Tags.of(cluster).add('Name', 'poll-position-cluster');
    cdk.Tags.of(cluster).add('Component', 'compute');
    const cfbSecret = secretsmanager.Secret.fromSecretNameV2(this, 'CfbApiKeySecret', 'CFB_API_KEY');

    const taskRole = new iam.Role(this, 'PollPositionTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const iamUserArn = process.env.AWS_IAM_ARN;
    if (!iamUserArn) {
      throw new Error('Environment variable AWS_IAM_ARN is not defined');
    }
    const iamUser = iam.User.fromUserArn(this, 'PollPositionIamUser', iamUserArn);
    taskRole.grantAssumeRole(iamUser);
    cfbSecret.grantRead(taskRole);

    const logGroup = new logs.LogGroup(this, 'PollPositionLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    cdk.Tags.of(logGroup).add('Name', 'poll-position-logs');
    cdk.Tags.of(logGroup).add('Component', 'logging');

    const executionRole = new iam.Role(this, 'PollPositionExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      resources: ["*"],
    }));

    const taskDef = new ecs.FargateTaskDefinition(this, 'PollPositionTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole,
      executionRole,
    });
    cdk.Tags.of(taskDef).add('Name', 'poll-position-scheduled-task');
    cdk.Tags.of(taskDef).add('Component', 'compute');
    cdk.Tags.of(taskDef).add('TaskType', 'scheduled');

    const s3BucketName = process.env.S3_BUCKET;
    if (!s3BucketName) {
      throw new Error('Environment variable S3_BUCKET is not defined');
    }

    const bucket = new s3.Bucket(this, 'PollPositionBucket', {
      bucketName: s3BucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'IntelligentTieringRule',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(0),
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(180),
            },
          ],
        },
      ],
    });
    cdk.Tags.of(bucket).add('Name', 'poll-position-data-bucket');
    cdk.Tags.of(bucket).add('Component', 'storage');

    bucket.grantReadWrite(taskRole);
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
    }));

    taskDef.addContainer('PollPositionContainer', {
      image: ecs.ContainerImage.fromRegistry(`${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com/poll-position:latest`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'poll-position',
        logGroup,
      }),
      environment: {
        S3_BUCKET: bucket.bucketName,
      },
      secrets: {
        CFB_API_KEY: ecs.Secret.fromSecretsManager(cfbSecret, 'CFB_API_KEY'),
      },
    });

    new ecsPatterns.ScheduledFargateTask(this, 'ScheduledPollPositionTask', {
      cluster,
      scheduledFargateTaskDefinitionOptions: {
        taskDefinition: taskDef,
      },
      schedule: cdk.aws_events.Schedule.cron({ weekDay: 'MON', hour: '12', minute: '0' }),
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    });

    new cdk.CfnOutput(this, 'AdHocTaskCommand', {
      value: `aws ecs run-task \
        --cluster ${cluster.clusterName} \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[${vpc.publicSubnets[0].subnetId}],securityGroups=[],assignPublicIp=ENABLED}" \
        --task-definition ${taskDef.taskDefinitionArn}`,
    });

    const fastApiTaskDef = new ecs.FargateTaskDefinition(this, 'FastApiTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      taskRole,
    });
    cdk.Tags.of(fastApiTaskDef).add('Name', 'poll-position-api-task');
    cdk.Tags.of(fastApiTaskDef).add('Component', 'compute');
    cdk.Tags.of(fastApiTaskDef).add('TaskType', 'api');

    fastApiTaskDef.addContainer('FastApiContainer', {
      image: ecs.ContainerImage.fromRegistry(`${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com/poll-position-api:latest`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'poll-position-api',
        logGroup,
      }),
      environment: {
        S3_BUCKET: bucket.bucketName,
        BUILD_TIMESTAMP: new Date().toISOString(), // ✅ triggers task def change
      },
      portMappings: [{ containerPort: 80 }],
    });

    new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'PollPositionAPIService', {
      cluster,
      desiredCount: 1,
      taskDefinition: fastApiTaskDef,
      publicLoadBalancer: true,
      listenerPort: 80,
    });
  }
}
