import { Construct } from 'constructs';

import { PollPositionSharedStack } from './poll-position-shared-stack';

import { 
  Stack, 
  StackProps, 
  DefaultStackSynthesizer, 
  Tags, 
  CfnOutput 
} from 'aws-cdk-lib';
import { 
  CfnService, 
  CfnVpcConnector 
} from 'aws-cdk-lib/aws-apprunner';

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

    const imageUri = `${process.env.ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/poll-position-ui:latest`;

    // Create VPC Connector for App Runner to access VPC resources if needed
    const vpcConnector = new CfnVpcConnector(this, 'PollPositionUIVpcConnector', {
      vpcConnectorName: 'poll-position-ui-vpc-connector',
      subnets: sharedStack.vpc.publicSubnets.map(subnet => subnet.subnetId),
      securityGroups: [sharedStack.vpc.vpcDefaultSecurityGroup],
    });

    // Create App Runner service
    const appRunnerService = new CfnService(this, 'PollPositionUIService', {
      serviceName: 'poll-position-ui-service',
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageIdentifier: imageUri,
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              {
                name: 'VITE_API_BASE_URL',
                value: process.env.VITE_API_BASE_URL ?? '',
              },
              {
                name: 'BUILD_TIMESTAMP',
                value: process.env.BUILD_TIMESTAMP ?? '',
              },
            ],
          },
          imageRepositoryType: 'ECR',
        },
        authenticationConfiguration: {
          accessRoleArn: sharedStack.appRunnerAccessRole.roleArn,
        },
      },
      instanceConfiguration: {
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
        instanceRoleArn: sharedStack.taskRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: 'arn:aws:apprunner:' + 
        this.region + 
        ':' + 
        this.account + 
        ':autoscalingconfiguration/DefaultConfiguration/1/00000000000000000000000000000001',
    });

    // Add dependency on VPC connector
    appRunnerService.addDependency(vpcConnector);

    // Output the service URL
    new CfnOutput(this, 'UIServiceURL', {
      value: `https://${appRunnerService.attrServiceUrl}`,
      description: 'URL of the UI App Runner Service',
      exportName: 'PollPositionUIServiceURL',
    });

    new CfnOutput(this, 'AppRunnerServiceArn', {
      value: appRunnerService.attrServiceArn,
      description: 'ARN of the App Runner Service',
      exportName: 'PollPositionUIServiceArn',
    });
  }
}
