
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
  FargatePlatformVersion 
} from 'aws-cdk-lib/aws-ecs';
import { 
  ScheduledFargateTask 
} from 'aws-cdk-lib/aws-ecs-patterns';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret as SecretsManagerSecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Role, ServicePrincipal, PolicyStatement, User } from 'aws-cdk-lib/aws-iam';
import { Bucket, StorageClass } from 'aws-cdk-lib/aws-s3';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

export class PollPositionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new DefaultStackSynthesizer({
        qualifier: 'pollpstn',
      }),
      tags: {
        Project: 'poll-position',
        Application: 'poll-position',
      },
    });

    const vpc = new Vpc(this, 'PollPositionVpc', { 
      vpcName: 'poll-position-vpc',
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'poll-position-public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 18,
        },
      ],
    });
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
    const cluster = new Cluster(this, 'PollPositionCluster', { 
      vpc,
      clusterName: 'poll-position-cluster'
    });
    Tags.of(cluster).add('Component', 'compute');
    const cfbSecret = SecretsManagerSecret.fromSecretNameV2(this, 'CfbApiKeySecret', 'CFB_API_KEY');

    const taskRole = new Role(this, 'PollPositionTaskRole', {
      roleName: 'poll-position-task-role',
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
      logGroupName: '/ecs/poll-position',
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    Tags.of(logGroup).add('Component', 'logging');

    const executionRole = new Role(this, 'PollPositionExecutionRole', {
      roleName: 'poll-position-execution-role',
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
      family: 'poll-position-ingest-task',
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole,
      executionRole,
    });
    Tags.of(taskDef).add('Component', 'compute');
    Tags.of(taskDef).add('TaskType', 'scheduled');

    const s3BucketName = process.env.S3_BUCKET;
    if (!s3BucketName) {
      throw new Error('Environment variable S3_BUCKET is not defined');
    }

    const bucket = new Bucket(this, 'PollPositionBucket', {
      bucketName: s3BucketName, // Already deterministic from env var
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
        SEASON_START_YEAR: new Date().getFullYear().toString(),
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

    // Lambda function for API

    const apiLambda = new Function(this, 'PollPositionAPILambda', {
      functionName: 'poll-position-api',
      runtime: Runtime.PYTHON_3_10,
      handler: 'main.handler',
      code: Code.fromAsset('../services/api'),
      environment: {
        S3_BUCKET: bucket.bucketName,
        UI_URL: `http://${Fn.importValue('PollPositionUILoadBalancerURL')}`,
      },
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: taskRole,
    });

    Tags.of(apiLambda).add('Component', 'compute');
    Tags.of(apiLambda).add('TaskType', 'api');

    // API Gateway
    const api = new RestApi(this, 'PollPositionAPI', {
      restApiName: 'poll-position-api',
      description: 'API for Poll Position application',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [`http://${Fn.importValue('PollPositionUILoadBalancerURL')}`],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Lambda integration
    const integration = new LambdaIntegration(apiLambda);
    
    // Add routes
    api.root.addMethod('GET', integration); // For health check
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', integration);
    
    const apiResource = api.root.addResource('api');
    const latestPollResource = apiResource.addResource('latest-poll');
    latestPollResource.addMethod('GET', integration);

    // Output the API Gateway URL for use by other services
    new CfnOutput(this, 'APIGatewayURL', {
      value: api.url,
      description: 'URL of the API Gateway',
      exportName: 'PollPositionAPIGatewayURL',
    });
  }
}
