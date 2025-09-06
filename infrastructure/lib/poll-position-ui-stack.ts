import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  Duration, 
  CfnOutput 
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ContainerImage, LogDrivers } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';
import { PollPositionSharedStack } from './poll-position-shared-stack';

export class PollPositionUIStack extends Stack {
  constructor(scope: Construct, id: string, sharedStack: PollPositionSharedStack, props?: StackProps) {
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

    // Use shared VPC and cluster
    const vpc = sharedStack.vpc;
    const cluster = sharedStack.cluster;

    const imageUri = `${process.env.ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/poll-position-ui:latest`;

    const fargateService = new ApplicationLoadBalancedFargateService(this, 'PollPositionUIService', {
      cluster,
      serviceName: 'poll-position-ui-service',
      memoryLimitMiB: 256,
      cpu: 128,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: true,
      loadBalancerName: 'poll-position-ui-alb',
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
          logGroup: sharedStack.logGroup,
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

    new CfnOutput(this, 'UILoadBalancerURL', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
      description: 'URL of the UI Load Balancer',
      exportName: 'PollPositionUILoadBalancerURL',
    });
  }
}
