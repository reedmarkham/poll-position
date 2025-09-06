import { Construct } from 'constructs';

import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  RemovalPolicy, 
  Duration, 
  CfnOutput 
} from 'aws-cdk-lib';
import { 
  Vpc, 
  SubnetType, 
  InterfaceVpcEndpointAwsService, 
  GatewayVpcEndpointAwsService,
  IpAddresses 
} from 'aws-cdk-lib/aws-ec2';
import { Cluster } from 'aws-cdk-lib/aws-ecs';
import { Role, ServicePrincipal, PolicyStatement, User } from 'aws-cdk-lib/aws-iam';
import { Bucket, StorageClass } from 'aws-cdk-lib/aws-s3';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret as SecretsManagerSecret } from 'aws-cdk-lib/aws-secretsmanager';

export class PollPositionSharedStack extends Stack {
  public readonly vpc: Vpc;
  public readonly cluster: Cluster;
  public readonly bucket: Bucket;
  public readonly taskRole: Role;
  public readonly executionRole: Role;
  public readonly appRunnerInstanceRole: Role;
  public readonly appRunnerAccessRole: Role;
  public readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new DefaultStackSynthesizer({
        qualifier: 'pollpstn',
      }),
      tags: {
        Project: 'poll-position',
        Application: 'poll-position-shared',
      },
    });

    // Shared VPC - public subnets only
    this.vpc = new Vpc(this, 'PollPositionVpc', { 
      vpcName: 'poll-position-shared-vpc',
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'poll-position-public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });
    Tags.of(this.vpc).add('Component', 'networking');

    // VPC Endpoints for ECR connectivity
    this.vpc.addInterfaceEndpoint('ECRDkrEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    
    this.vpc.addInterfaceEndpoint('ECRApiEndpoint', {
      service: InterfaceVpcEndpointAwsService.ECR,
    });
    
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
    });

    // Shared ECS Cluster
    this.cluster = new Cluster(this, 'PollPositionCluster', { 
      vpc: this.vpc,
      clusterName: 'poll-position-shared-cluster'
    });
    Tags.of(this.cluster).add('Component', 'compute');

    // Shared S3 Bucket
    const s3BucketName = process.env.S3_BUCKET;
    if (!s3BucketName) {
      throw new Error('Environment variable S3_BUCKET is not defined');
    }

    this.bucket = new Bucket(this, 'PollPositionBucket', {
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
    Tags.of(this.bucket).add('Name', 'poll-position-data-bucket');
    Tags.of(this.bucket).add('Component', 'storage');

    // Shared IAM Roles
    const iamUserArn = process.env.AWS_IAM_ARN;
    if (!iamUserArn) {
      throw new Error('Environment variable AWS_IAM_ARN is not defined');
    }
    const iamUser = User.fromUserArn(this, 'PollPositionIamUser', iamUserArn);

    this.taskRole = new Role(this, 'PollPositionTaskRole', {
      roleName: 'poll-position-shared-task-role',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.taskRole.grantAssumeRole(iamUser);

    this.executionRole = new Role(this, 'PollPositionExecutionRole', {
      roleName: 'poll-position-shared-execution-role',
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    this.executionRole.addToPolicy(new PolicyStatement({
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

    // App Runner Access Role for ECR authentication
    this.appRunnerAccessRole = new Role(this, 'PollPositionAppRunnerAccessRole', {
      roleName: 'poll-position-apprunner-access-role',
      assumedBy: new ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    this.appRunnerAccessRole.addToPolicy(new PolicyStatement({
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      resources: ["*"],
    }));

    // App Runner Instance Role for running tasks
    this.appRunnerInstanceRole = new Role(this, 'PollPositionAppRunnerInstanceRole', {
      roleName: 'poll-position-apprunner-instance-role',
      assumedBy: new ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    // Grant S3 permissions to shared task role
    this.bucket.grantReadWrite(this.taskRole);
    this.taskRole.addToPolicy(new PolicyStatement({
      actions: ["s3:ListBucket"],
      resources: [this.bucket.bucketArn],
    }));

    // Grant secrets access
    const cfbSecret = SecretsManagerSecret.fromSecretNameV2(this, 'CfbApiKeySecret', 'CFB_API_KEY');
    cfbSecret.grantRead(this.taskRole);

    // Shared Log Group
    this.logGroup = new LogGroup(this, 'PollPositionLogGroup', {
      logGroupName: '/ecs/poll-position-shared',
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    Tags.of(this.logGroup).add('Component', 'logging');

    // Outputs for other stacks to reference
    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'Shared VPC ID',
      exportName: 'PollPositionSharedVpcId',
    });

    new CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'Shared ECS Cluster ARN',
      exportName: 'PollPositionSharedClusterArn',
    });

    new CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'Shared ECS Cluster Name',
      exportName: 'PollPositionSharedClusterName',
    });

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Shared S3 Bucket Name',
      exportName: 'PollPositionSharedBucketName',
    });

    new CfnOutput(this, 'TaskRoleArn', {
      value: this.taskRole.roleArn,
      description: 'Shared Task Role ARN',
      exportName: 'PollPositionSharedTaskRoleArn',
    });

    new CfnOutput(this, 'ExecutionRoleArn', {
      value: this.executionRole.roleArn,
      description: 'Shared Execution Role ARN',
      exportName: 'PollPositionSharedExecutionRoleArn',
    });

    new CfnOutput(this, 'LogGroupName', {
      value: this.logGroup.logGroupName,
      description: 'Shared Log Group Name',
      exportName: 'PollPositionSharedLogGroupName',
    });

    new CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Shared VPC Public Subnet IDs',
      exportName: 'PollPositionSharedPublicSubnetIds',
    });

    new CfnOutput(this, 'AppRunnerInstanceRoleArn', {
      value: this.appRunnerInstanceRole.roleArn,
      description: 'App Runner Instance Role ARN',
      exportName: 'PollPositionSharedAppRunnerInstanceRoleArn',
    });

    new CfnOutput(this, 'AppRunnerAccessRoleArn', {
      value: this.appRunnerAccessRole.roleArn,
      description: 'App Runner Access Role ARN for ECR',
      exportName: 'PollPositionSharedAppRunnerAccessRoleArn',
    });
  }
}