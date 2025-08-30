#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PollPositionStack } from '../lib/poll-position-stack';

const app = new cdk.App();
new PollPositionStack(app, 'PollPositionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
