
import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  Duration, 
  Aws, 
  CfnOutput,
  aws_events,
  Fn
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import { 
  FargateTaskDefinition, 
  ContainerImage, 
  LogDriver, 
  Secret, 
  FargatePlatformVersion 
} from 'aws-cdk-lib/aws-ecs';
import { 
  ScheduledFargateTask 
} from 'aws-cdk-lib/aws-ecs-patterns';
import { Secret as SecretsManagerSecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { PollPositionSharedStack } from './poll-position-shared-stack';

export class PollPositionStack extends Stack {
  constructor(scope: Construct, id: string, sharedStack: PollPositionSharedStack, props?: StackProps) {
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

    // Use shared resources
    const vpc = sharedStack.vpc;
    const cluster = sharedStack.cluster;
    const bucket = sharedStack.bucket;
    const taskRole = sharedStack.taskRole;
    const executionRole = sharedStack.executionRole;
    const logGroup = sharedStack.logGroup;

    const cfbSecret = SecretsManagerSecret.fromSecretNameV2(this, 'CfbApiKeySecret', 'CFB_API_KEY');

    const taskDef = new FargateTaskDefinition(this, 'PollPositionTaskDef', {
      family: 'poll-position-ingest-task',
      memoryLimitMiB: 256,
      cpu: 256,
      taskRole,
      executionRole,
    });
    Tags.of(taskDef).add('Component', 'compute');
    Tags.of(taskDef).add('TaskType', 'scheduled');

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
