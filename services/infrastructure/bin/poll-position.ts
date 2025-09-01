#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { PollPositionStack } from '../lib/poll-position-stack';
import { PollPositionUIStack } from '../lib/poll-position-ui-stack';

const app = new App();

const uiStack = new PollPositionUIStack(app, 'PollPositionUIStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const apiStack = new PollPositionStack(app, 'PollPositionStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

apiStack.addDependency(uiStack);
