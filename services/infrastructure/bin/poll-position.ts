#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { PollPositionStack } from '../lib/poll-position-stack';
import { PollPositionUIStack } from '../lib/poll-position-ui-stack';

const app = new App();
new PollPositionStack(app, 'PollPositionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new PollPositionUIStack(app, 'PollPositionUIStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
