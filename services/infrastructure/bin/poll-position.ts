#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PollPositionStack } from '../lib/poll-position-stack';
import { PollPositionVisualizationStack } from '../lib/poll-position-visualization-stack';

const app = new cdk.App();
new PollPositionStack(app, 'PollPositionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new PollPositionVisualizationStack(app, 'PollPositionVisualizationStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
