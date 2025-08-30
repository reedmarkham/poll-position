"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollPositionUIStack = void 0;
const cdk = require("aws-cdk-lib");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecs_patterns = require("aws-cdk-lib/aws-ecs-patterns");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const applicationautoscaling = require("aws-cdk-lib/aws-applicationautoscaling");
class PollPositionUIStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, {
            ...props,
            synthesizer: new cdk.DefaultStackSynthesizer({
                qualifier: 'pollpstn',
            }),
        });
        const commonTags = {
            Project: 'poll-position-ui',
            Environment: process.env.ENVIRONMENT ?? 'development',
            Owner: 'poll-position-team',
            CostCenter: 'engineering',
            Application: 'poll-position-ui',
        };
        cdk.Tags.of(this).add('Project', commonTags.Project);
        cdk.Tags.of(this).add('Environment', commonTags.Environment);
        cdk.Tags.of(this).add('Owner', commonTags.Owner);
        cdk.Tags.of(this).add('CostCenter', commonTags.CostCenter);
        cdk.Tags.of(this).add('Application', commonTags.Application);
        const vpc = new ec2.Vpc(this, 'PollPositionUIVpc', {
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });
        const cluster = new ecs.Cluster(this, 'PollPositionUICluster', {
            vpc
        });
        const imageUri = `${process.env.ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/poll-position-ui:latest`;
        const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'PollPositionUIService', {
            cluster,
            memoryLimitMiB: 256,
            cpu: 256,
            desiredCount: 1,
            publicLoadBalancer: true,
            capacityProviderStrategies: [
                {
                    capacityProvider: 'FARGATE_SPOT',
                    weight: 1,
                },
            ],
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry(imageUri),
                containerPort: 3000,
                environment: {
                    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? '',
                    BUILD_TIMESTAMP: process.env.BUILD_TIMESTAMP ?? '',
                },
                logDriver: ecs.LogDrivers.awsLogs({
                    streamPrefix: 'PollPositionUI',
                    logGroup: new logs.LogGroup(this, 'PollPositionUILogGroup', {
                        logGroupName: '/ecs/poll-position-ui',
                        retention: logs.RetentionDays.ONE_WEEK,
                        removalPolicy: cdk.RemovalPolicy.DESTROY,
                    }),
                }),
            },
        });
        fargateService.taskDefinition.obtainExecutionRole().addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'));
        fargateService.targetGroup.configureHealthCheck({
            path: '/',
            port: '3000',
            healthyHttpCodes: '200',
            interval: aws_cdk_lib_1.Duration.seconds(60),
            timeout: aws_cdk_lib_1.Duration.seconds(15),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 5,
        });
        const scalableTarget = fargateService.service.autoScaleTaskCount({
            minCapacity: 0,
            maxCapacity: 10,
        });
        scalableTarget.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 60,
            scaleInCooldown: aws_cdk_lib_1.Duration.seconds(600),
            scaleOutCooldown: aws_cdk_lib_1.Duration.seconds(180),
        });
        scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
            targetUtilizationPercent: 70,
            scaleInCooldown: aws_cdk_lib_1.Duration.seconds(600),
            scaleOutCooldown: aws_cdk_lib_1.Duration.seconds(180),
        });
        scalableTarget.scaleOnSchedule('ScaleDownNightly', {
            schedule: applicationautoscaling.Schedule.cron({
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
            schedule: applicationautoscaling.Schedule.cron({
                minute: '0',
                hour: '8',
                day: '*',
                month: '*',
                year: '*',
            }),
            minCapacity: 0,
            maxCapacity: 10,
        });
    }
}
exports.PollPositionUIStack = PollPositionUIStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9sbC1wb3NpdGlvbi11aS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInBvbGwtcG9zaXRpb24tdWktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDZDQUF1QztBQUV2QywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDZEQUE2RDtBQUM3RCwyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBQzdDLGlGQUFpRjtBQUVqRixNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDZixHQUFHLEtBQUs7WUFDUixXQUFXLEVBQUUsSUFBSSxHQUFHLENBQUMsdUJBQXVCLENBQUM7Z0JBQzNDLFNBQVMsRUFBRSxVQUFVO2FBQ3RCLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCxNQUFNLFVBQVUsR0FBRztZQUNqQixPQUFPLEVBQUUsa0JBQWtCO1lBQzNCLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxhQUFhO1lBQ3JELEtBQUssRUFBRSxvQkFBb0I7WUFDM0IsVUFBVSxFQUFFLGFBQWE7WUFDekIsV0FBVyxFQUFFLGtCQUFrQjtTQUNoQyxDQUFDO1FBRUYsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0QsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDM0QsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFN0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUNqRCxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDO1lBQ2QsbUJBQW1CLEVBQUU7Z0JBQ25CO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07aUJBQ2xDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQzdELEdBQUc7U0FDSixDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxZQUFZLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSx3Q0FBd0MsQ0FBQztRQUVySCxNQUFNLGNBQWMsR0FBRyxJQUFJLFlBQVksQ0FBQyxxQ0FBcUMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDM0csT0FBTztZQUNQLGNBQWMsRUFBRSxHQUFHO1lBQ25CLEdBQUcsRUFBRSxHQUFHO1lBQ1IsWUFBWSxFQUFFLENBQUM7WUFDZixrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLDBCQUEwQixFQUFFO2dCQUMxQjtvQkFDRSxnQkFBZ0IsRUFBRSxjQUFjO29CQUNoQyxNQUFNLEVBQUUsQ0FBQztpQkFDVjthQUNGO1lBQ0QsZ0JBQWdCLEVBQUU7Z0JBQ2hCLEtBQUssRUFBRSxHQUFHLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7Z0JBQ2hELGFBQWEsRUFBRSxJQUFJO2dCQUNuQixXQUFXLEVBQUU7b0JBQ1gsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsSUFBSSxFQUFFO29CQUN0RCxlQUFlLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksRUFBRTtpQkFDbkQ7Z0JBQ0QsU0FBUyxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDO29CQUNoQyxZQUFZLEVBQUUsZ0JBQWdCO29CQUM5QixRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTt3QkFDMUQsWUFBWSxFQUFFLHVCQUF1Qjt3QkFDckMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTt3QkFDdEMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztxQkFDekMsQ0FBQztpQkFDSCxDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7UUFFSCxjQUFjLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLENBQUMsZ0JBQWdCLENBQ2xFLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsb0NBQW9DLENBQUMsQ0FDakYsQ0FBQztRQUVGLGNBQWMsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUM7WUFDOUMsSUFBSSxFQUFFLEdBQUc7WUFDVCxJQUFJLEVBQUUsTUFBTTtZQUNaLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsUUFBUSxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM5QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLHFCQUFxQixFQUFFLENBQUM7WUFDeEIsdUJBQXVCLEVBQUUsQ0FBQztTQUMzQixDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDO1lBQy9ELFdBQVcsRUFBRSxDQUFDO1lBQ2QsV0FBVyxFQUFFLEVBQUU7U0FDaEIsQ0FBQyxDQUFDO1FBRUgsY0FBYyxDQUFDLHFCQUFxQixDQUFDLFlBQVksRUFBRTtZQUNqRCx3QkFBd0IsRUFBRSxFQUFFO1lBQzVCLGVBQWUsRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDdEMsZ0JBQWdCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1NBQ3hDLENBQUMsQ0FBQztRQUVILGNBQWMsQ0FBQyx3QkFBd0IsQ0FBQyxlQUFlLEVBQUU7WUFDdkQsd0JBQXdCLEVBQUUsRUFBRTtZQUM1QixlQUFlLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ3RDLGdCQUFnQixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQztTQUN4QyxDQUFDLENBQUM7UUFFSCxjQUFjLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFO1lBQ2pELFFBQVEsRUFBRSxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO2dCQUM3QyxNQUFNLEVBQUUsR0FBRztnQkFDWCxJQUFJLEVBQUUsR0FBRztnQkFDVCxHQUFHLEVBQUUsR0FBRztnQkFDUixLQUFLLEVBQUUsR0FBRztnQkFDVixJQUFJLEVBQUUsR0FBRzthQUNWLENBQUM7WUFDRixXQUFXLEVBQUUsQ0FBQztZQUNkLFdBQVcsRUFBRSxDQUFDO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsY0FBYyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtZQUMvQyxRQUFRLEVBQUUsc0JBQXNCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDN0MsTUFBTSxFQUFFLEdBQUc7Z0JBQ1gsSUFBSSxFQUFFLEdBQUc7Z0JBQ1QsR0FBRyxFQUFFLEdBQUc7Z0JBQ1IsS0FBSyxFQUFFLEdBQUc7Z0JBQ1YsSUFBSSxFQUFFLEdBQUc7YUFDVixDQUFDO1lBQ0YsV0FBVyxFQUFFLENBQUM7WUFDZCxXQUFXLEVBQUUsRUFBRTtTQUNoQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5SEQsa0RBOEhDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XG5pbXBvcnQgKiBhcyBlY3NfcGF0dGVybnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcy1wYXR0ZXJucyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGFwcGxpY2F0aW9uYXV0b3NjYWxpbmcgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwcGxpY2F0aW9uYXV0b3NjYWxpbmcnO1xuXG5leHBvcnQgY2xhc3MgUG9sbFBvc2l0aW9uVUlTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHtcbiAgICAgIC4uLnByb3BzLFxuICAgICAgc3ludGhlc2l6ZXI6IG5ldyBjZGsuRGVmYXVsdFN0YWNrU3ludGhlc2l6ZXIoe1xuICAgICAgICBxdWFsaWZpZXI6ICdwb2xscHN0bicsXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbW1vblRhZ3MgPSB7XG4gICAgICBQcm9qZWN0OiAncG9sbC1wb3NpdGlvbi11aScsXG4gICAgICBFbnZpcm9ubWVudDogcHJvY2Vzcy5lbnYuRU5WSVJPTk1FTlQgPz8gJ2RldmVsb3BtZW50JyxcbiAgICAgIE93bmVyOiAncG9sbC1wb3NpdGlvbi10ZWFtJyxcbiAgICAgIENvc3RDZW50ZXI6ICdlbmdpbmVlcmluZycsXG4gICAgICBBcHBsaWNhdGlvbjogJ3BvbGwtcG9zaXRpb24tdWknLFxuICAgIH07XG5cbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCBjb21tb25UYWdzLlByb2plY3QpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQnLCBjb21tb25UYWdzLkVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgY29tbW9uVGFncy5Pd25lcik7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb3N0Q2VudGVyJywgY29tbW9uVGFncy5Db3N0Q2VudGVyKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0FwcGxpY2F0aW9uJywgY29tbW9uVGFncy5BcHBsaWNhdGlvbik7XG5cbiAgICBjb25zdCB2cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnUG9sbFBvc2l0aW9uVUlWcGMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMCxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnUG9sbFBvc2l0aW9uVUlDbHVzdGVyJywge1xuICAgICAgdnBjXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbWFnZVVyaSA9IGAke3Byb2Nlc3MuZW52LkFDQ09VTlRfSUR9LmRrci5lY3IuJHtwcm9jZXNzLmVudi5BV1NfUkVHSU9OfS5hbWF6b25hd3MuY29tL3BvbGwtcG9zaXRpb24tdWk6bGF0ZXN0YDtcblxuICAgIGNvbnN0IGZhcmdhdGVTZXJ2aWNlID0gbmV3IGVjc19wYXR0ZXJucy5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEZhcmdhdGVTZXJ2aWNlKHRoaXMsICdQb2xsUG9zaXRpb25VSVNlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyLFxuICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgIGNwdTogMjU2LFxuICAgICAgZGVzaXJlZENvdW50OiAxLFxuICAgICAgcHVibGljTG9hZEJhbGFuY2VyOiB0cnVlLFxuICAgICAgY2FwYWNpdHlQcm92aWRlclN0cmF0ZWdpZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNhcGFjaXR5UHJvdmlkZXI6ICdGQVJHQVRFX1NQT1QnLFxuICAgICAgICAgIHdlaWdodDogMSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0YXNrSW1hZ2VPcHRpb25zOiB7XG4gICAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGltYWdlVXJpKSxcbiAgICAgICAgY29udGFpbmVyUG9ydDogMzAwMCxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWSVRFX0FQSV9CQVNFX1VSTDogcHJvY2Vzcy5lbnYuVklURV9BUElfQkFTRV9VUkwgPz8gJycsXG4gICAgICAgICAgQlVJTERfVElNRVNUQU1QOiBwcm9jZXNzLmVudi5CVUlMRF9USU1FU1RBTVAgPz8gJycsXG4gICAgICAgIH0sXG4gICAgICAgIGxvZ0RyaXZlcjogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7IFxuICAgICAgICAgIHN0cmVhbVByZWZpeDogJ1BvbGxQb3NpdGlvblVJJyxcbiAgICAgICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1BvbGxQb3NpdGlvblVJTG9nR3JvdXAnLCB7XG4gICAgICAgICAgICBsb2dHcm91cE5hbWU6ICcvZWNzL3BvbGwtcG9zaXRpb24tdWknLFxuICAgICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBmYXJnYXRlU2VydmljZS50YXNrRGVmaW5pdGlvbi5vYnRhaW5FeGVjdXRpb25Sb2xlKCkuYWRkTWFuYWdlZFBvbGljeShcbiAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uRUMyQ29udGFpbmVyUmVnaXN0cnlSZWFkT25seScpXG4gICAgKTtcblxuICAgIGZhcmdhdGVTZXJ2aWNlLnRhcmdldEdyb3VwLmNvbmZpZ3VyZUhlYWx0aENoZWNrKHtcbiAgICAgIHBhdGg6ICcvJyxcbiAgICAgIHBvcnQ6ICczMDAwJyxcbiAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAnLFxuICAgICAgaW50ZXJ2YWw6IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygxNSksXG4gICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICB1bmhlYWx0aHlUaHJlc2hvbGRDb3VudDogNSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjYWxhYmxlVGFyZ2V0ID0gZmFyZ2F0ZVNlcnZpY2Uuc2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xuICAgICAgbWluQ2FwYWNpdHk6IDAsXG4gICAgICBtYXhDYXBhY2l0eTogMTAsXG4gICAgfSk7XG5cbiAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ0NwdVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDYwLFxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5zZWNvbmRzKDYwMCksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5zZWNvbmRzKDE4MCksXG4gICAgfSk7XG5cbiAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uTWVtb3J5VXRpbGl6YXRpb24oJ01lbW9yeVNjYWxpbmcnLCB7XG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDcwLFxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBEdXJhdGlvbi5zZWNvbmRzKDYwMCksXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBEdXJhdGlvbi5zZWNvbmRzKDE4MCksXG4gICAgfSk7XG5cbiAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uU2NoZWR1bGUoJ1NjYWxlRG93bk5pZ2h0bHknLCB7XG4gICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgIGhvdXI6ICcyJyxcbiAgICAgICAgZGF5OiAnKicsXG4gICAgICAgIG1vbnRoOiAnKicsXG4gICAgICAgIHllYXI6ICcqJyxcbiAgICAgIH0pLFxuICAgICAgbWluQ2FwYWNpdHk6IDAsXG4gICAgICBtYXhDYXBhY2l0eTogMCxcbiAgICB9KTtcblxuICAgIHNjYWxhYmxlVGFyZ2V0LnNjYWxlT25TY2hlZHVsZSgnU2NhbGVVcE1vcm5pbmcnLCB7XG4gICAgICBzY2hlZHVsZTogYXBwbGljYXRpb25hdXRvc2NhbGluZy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgIGhvdXI6ICc4JyxcbiAgICAgICAgZGF5OiAnKicsXG4gICAgICAgIG1vbnRoOiAnKicsXG4gICAgICAgIHllYXI6ICcqJyxcbiAgICAgIH0pLFxuICAgICAgbWluQ2FwYWNpdHk6IDAsXG4gICAgICBtYXhDYXBhY2l0eTogMTAsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==