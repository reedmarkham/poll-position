
import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  RemovalPolicy, 
  Duration, 
  Aws, 
  CfnOutput,
  aws_events,
  Fn
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  Vpc, 
  SubnetType, 
  InterfaceVpcEndpointAwsService, 
  GatewayVpcEndpointAwsService 
} from 'aws-cdk-lib/aws-ec2';
import { 
  Cluster, 
  FargateTaskDefinition, 
  ContainerImage, 
  LogDriver, 
  Secret, 
  CfnService, 
  FargatePlatformVersion 
} from 'aws-cdk-lib/aws-ecs';
import { 
  ApplicationLoadBalancedFargateService, 
  ScheduledFargateTask 
} from 'aws-cdk-lib/aws-ecs-patterns';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret as SecretsManagerSecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Role, ServicePrincipal, PolicyStatement, User } from 'aws-cdk-lib/aws-iam';
import { Bucket, StorageClass } from 'aws-cdk-lib/aws-s3';

export class PollPositionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new DefaultStackSynthesizer({
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

    const vpc = new Vpc(this, 'PollPositionVpc', { 
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 18,
        },
      ],
    });
    Tags.of(vpc).add('Name', 'poll-position-vpc');
    Tags.of(vpc).add('Component', 'networking');

    // Add VPC Endpoints for ECR connectivity
    vpc.addInterfaceEndpoint('ECRDkrEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    
    vpc.addInterfaceEndpoint('ECRApiEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR,
    });
    
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
    });
    const cluster = new Cluster(this, 'PollPositionCluster', { vpc });
    Tags.of(cluster).add('Name', 'poll-position-cluster');
    Tags.of(cluster).add('Component', 'compute');
    const cfbSecret = SecretsManagerSecret.fromSecretNameV2(this, 'CfbApiKeySecret', 'CFB_API_KEY');

    const taskRole = new Role(this, 'PollPositionTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const iamUserArn = process.env.AWS_IAM_ARN;
    if (!iamUserArn) {
      throw new Error('Environment variable AWS_IAM_ARN is not defined');
    }
    const iamUser = User.fromUserArn(this, 'PollPositionIamUser', iamUserArn);
    taskRole.grantAssumeRole(iamUser);
    cfbSecret.grantRead(taskRole);

    const logGroup = new LogGroup(this, 'PollPositionLogGroup', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    Tags.of(logGroup).add('Name', 'poll-position-logs');
    Tags.of(logGroup).add('Component', 'logging');

    const executionRole = new Role(this, 'PollPositionExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addToPolicy(new PolicyStatement({
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

    const taskDef = new FargateTaskDefinition(this, 'PollPositionTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole,
      executionRole,
    });
    Tags.of(taskDef).add('Name', 'poll-position-scheduled-task');
    Tags.of(taskDef).add('Component', 'compute');
    Tags.of(taskDef).add('TaskType', 'scheduled');

    const s3BucketName = process.env.S3_BUCKET;
    if (!s3BucketName) {
      throw new Error('Environment variable S3_BUCKET is not defined');
    }

    const bucket = new Bucket(this, 'PollPositionBucket', {
      bucketName: s3BucketName,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'IntelligentTieringRule',
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(0),
            },
            {
              storageClass: StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(180),
            },
          ],
        },
      ],
    });
    Tags.of(bucket).add('Name', 'poll-position-data-bucket');
    Tags.of(bucket).add('Component', 'storage');

    bucket.grantReadWrite(taskRole);
    taskRole.addToPolicy(new PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [bucket.bucketArn],
    }));

    taskDef.addContainer('PollPositionContainer', {
      image: ContainerImage.fromRegistry(`${Aws.ACCOUNT_ID}.dkr.ecr.${Aws.REGION}.amazonaws.com/poll-position:latest`),
      logging: LogDriver.awsLogs({
        streamPrefix: 'poll-position',
        logGroup,
      }),
      environment: {
        S3_BUCKET: bucket.bucketName,
      },
      secrets: {
        CFB_API_KEY: Secret.fromSecretsManager(cfbSecret, 'CFB_API_KEY'),
      },
    });

    new ScheduledFargateTask(this, 'ScheduledPollPositionTask', {
      cluster,
      scheduledFargateTaskDefinitionOptions: {
        taskDefinition: taskDef,
      },
      schedule: aws_events.Schedule.cron({ weekDay: 'MON', hour: '12', minute: '0' }),
      subnetSelection: { subnetType: SubnetType.PUBLIC },
      platformVersion: FargatePlatformVersion.LATEST,
    });

    new CfnOutput(this, 'AdHocTaskCommand', {
      value: `aws ecs run-task \
        --cluster ${cluster.clusterName} \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[${vpc.publicSubnets[0].subnetId}],securityGroups=[],assignPublicIp=ENABLED}" \
        --task-definition ${taskDef.taskDefinitionArn}`,
    });

    const fastApiTaskDef = new FargateTaskDefinition(this, 'FastApiTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      taskRole,
    });
    Tags.of(fastApiTaskDef).add('Name', 'poll-position-api-task');
    Tags.of(fastApiTaskDef).add('Component', 'compute');
    Tags.of(fastApiTaskDef).add('TaskType', 'api');

    fastApiTaskDef.addContainer('FastApiContainer', {
      image: ContainerImage.fromRegistry(`${Aws.ACCOUNT_ID}.dkr.ecr.${Aws.REGION}.amazonaws.com/poll-position-api:latest`),
      logging: LogDriver.awsLogs({
        streamPrefix: 'poll-position-api',
        logGroup,
      }),
      environment: {
        S3_BUCKET: bucket.bucketName,
        BUILD_TIMESTAMP: new Date().toISOString(), // ✅ triggers task def change
        UI_URL: `http://${Fn.importValue('PollPositionUILoadBalancerURL')}`,
      },
      portMappings: [{ containerPort: 80 }],
    });

    const apiService = new ApplicationLoadBalancedFargateService(this, 'PollPositionAPIService', {
      cluster,
      desiredCount: 1,
      taskDefinition: fastApiTaskDef,
      publicLoadBalancer: true,
      listenerPort: 80,
      healthCheckGracePeriod: Duration.seconds(60),
    });

    // Configure health check settings
    apiService.targetGroup.configureHealthCheck({
      path: '/health',
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Set deployment configuration
    const cfnService = apiService.service.node.defaultChild as CfnService;
    cfnService.deploymentConfiguration = {
      minimumHealthyPercent: 50,
      maximumPercent: 200,
    };

    // Output the API ELB URL for use by other services
    new CfnOutput(this, 'APILoadBalancerURL', {
      value: apiService.loadBalancer.loadBalancerDnsName,
      description: 'URL of the API Load Balancer',
      exportName: 'PollPositionAPILoadBalancerURL',
    });
  }
}
