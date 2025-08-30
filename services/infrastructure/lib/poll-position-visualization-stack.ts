import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  Duration, 
  RemovalPolicy,
  CfnOutput 
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc, IpAddresses, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, LogDrivers } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';

export class PollPositionVisualizationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new DefaultStackSynthesizer({
        qualifier: 'pollpstn',
      }),
    });

    const commonTags = {
      Project: 'poll-position',
      Application: 'poll-position-ui',
    };

    Tags.of(this).add('Project', commonTags.Project);
    Tags.of(this).add('Application', commonTags.Application);

    const vpc = new Vpc(this, 'PollPositionVisualizationVpc', {
      vpcName: 'poll-position-visualization-vpc',
      ipAddresses: IpAddresses.cidr('10.1.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: false,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'poll-position-visualization-public',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    const cluster = new Cluster(this, 'PollPositionVisualizationCluster', {
      vpc,
      clusterName: 'poll-position-visualization-cluster'
    });

    const imageUri = `${process.env.ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/poll-position-visualization:latest`;

    const fargateService = new ApplicationLoadBalancedFargateService(this, 'PollPositionVisualizationService', {
      cluster,
      serviceName: 'poll-position-visualization-service',
      memoryLimitMiB: 512,
      cpu: 256,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: true,
      loadBalancerName: 'poll-position-visualization-alb',
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        },
      ],
      taskImageOptions: {
        image: ContainerImage.fromRegistry(imageUri),
        containerPort: 3000,
        environment: {
          VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? '',
          BUILD_TIMESTAMP: process.env.BUILD_TIMESTAMP ?? '',
        },
        logDriver: LogDrivers.awsLogs({ 
          streamPrefix: 'PollPositionUI',
          logGroup: new LogGroup(this, 'PollPositionUILogGroup', {
            logGroupName: '/ecs/poll-position-ui',
            retention: RetentionDays.ONE_WEEK,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        }),
      },
    });

    fargateService.taskDefinition.obtainExecutionRole().addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly')
    );

    fargateService.targetGroup.configureHealthCheck({
      path: '/',
      port: '3000',
      healthyHttpCodes: '200',
      interval: Duration.seconds(60),
      timeout: Duration.seconds(15),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });

    const scalableTarget = fargateService.service.autoScaleTaskCount({
      minCapacity: 0,
      maxCapacity: 10,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 60,
      scaleInCooldown: Duration.seconds(600),
      scaleOutCooldown: Duration.seconds(180),
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: Duration.seconds(600),
      scaleOutCooldown: Duration.seconds(180),
    });

    scalableTarget.scaleOnSchedule('ScaleDownNightly', {
      schedule: Schedule.cron({
        minute: '0',
        hour: '2',
        day: '*',
        month: '*',
        year: '*',
      }),
      minCapacity: 0,
      maxCapacity: 0,
    });

    scalableTarget.scaleOnSchedule('ScaleUpMorning', {
      schedule: Schedule.cron({
        minute: '0',
        hour: '8',
        day: '*',
        month: '*',
        year: '*',
      }),
      minCapacity: 0,
      maxCapacity: 10,
    });

    // Output the ELB URL for use by the API
    new CfnOutput(this, 'VisualizationLoadBalancerURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'URL of the Visualization Load Balancer',
      exportName: 'PollPositionVisualizationLoadBalancerURL',
    });
  }
}
