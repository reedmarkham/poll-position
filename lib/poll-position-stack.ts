
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
    });

    const vpc = new ec2.Vpc(this, 'PollPositionVpc', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'PollPositionCluster', { vpc });
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

    const logGroup = new logs.LogGroup(this, 'PollPositionLogGroup');

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

    const s3BucketName = process.env.S3_BUCKET;
    if (!s3BucketName) {
      throw new Error('Environment variable S3_BUCKET is not defined');
    }

    const bucket = new s3.Bucket(this, 'PollPositionBucket', {
      bucketName: s3BucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

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

    fastApiTaskDef.addContainer('FastApiContainer', {
      image: ecs.ContainerImage.fromRegistry(`${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com/poll-position-api:latest`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'poll-position-api',
        logGroup,
      }),
      environment: {
        S3_BUCKET: bucket.bucketName,
      },
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
