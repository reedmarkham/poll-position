#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { PollPositionSharedStack } from '../lib/poll-position-shared-stack';
import { PollPositionStack } from '../lib/poll-position-stack';
import { PollPositionUIStack } from '../lib/poll-position-ui-stack';

const app = new App();

// Create shared infrastructure first
const sharedStack = new PollPositionSharedStack(app, 'PollPositionSharedStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create application stacks that depend on shared resources
const uiStack = new PollPositionUIStack(app, 'PollPositionUIStack', sharedStack, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const apiStack = new PollPositionStack(app, 'PollPositionStack', sharedStack, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Set dependencies
uiStack.addDependency(sharedStack);
apiStack.addDependency(sharedStack);
